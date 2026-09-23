// ============================================================
// Regression: BUGLOG 2026-09-23 — announce() announced nothing, app-wide.
//
// `lib/announce.ts` resolves its target with `getElementById` and returns
// silently when the element is missing. Nothing rendered `#sr-polite` or
// `#sr-assertive`, so all 20 call sites were no-ops: an app whose entire
// purpose is speaking the board to people who cannot see it announced nothing
// to a screen reader. It typechecked, linted and passed 532 tests throughout.
//
// This is the failure mode that source-level guards exist for. The elements
// live in a server component in the App Router, so no unit test renders them
// in the arrangement that actually ships — the only thing worth asserting is
// the *link* between the ids announce() looks up and the ids the layout
// renders. Assert one side only and the two drift apart again.
//
// The second half pins the fallback: with the voice agent offline, `speak()`
// must reach the live region, because `engine.speak` reaches nobody.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const announceSrc = read('src/lib/announce.ts');
const layoutSrc = read('src/app/layout.tsx');
const hookSrc = read('src/hooks/useVoiceChessCoach.ts');

/** Every id announce() can target, taken from the source rather than assumed. */
function idsAnnounceTargets(): string[] {
  // Matches the string literals in: id = priority === "assertive" ? "sr-assertive" : "sr-polite"
  const ids = [...announceSrc.matchAll(/["'](sr-[a-z-]+)["']/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

describe('announce() has somewhere to announce into', () => {
  it('announce() targets at least the polite and assertive regions', () => {
    const ids = idsAnnounceTargets();
    expect(ids).toContain('sr-polite');
    expect(ids).toContain('sr-assertive');
  });

  it('REGRESSION: every id announce() targets is rendered by the root layout', () => {
    // The actual bug. Neither id existed anywhere in the app.
    for (const id of idsAnnounceTargets()) {
      expect(
        layoutSrc,
        `announce() writes to #${id}, but the root layout never renders it — ` +
          `announcements to that region are silently dropped`,
      ).toContain(`id="${id}"`);
    }
  });

  it('the regions carry the ARIA that makes them announce', () => {
    // An element with the right id but no aria-live is still silent, which
    // would reproduce the bug while passing the test above.
    expect(layoutSrc).toMatch(/id="sr-polite"[\s\S]{0,200}aria-live="polite"/);
    expect(layoutSrc).toMatch(/id="sr-assertive"[\s\S]{0,200}aria-live="assertive"/);
  });

  it('polite and assertive are separate elements', () => {
    // Sharing one node makes urgent and routine messages overwrite each other,
    // and an assertive message written into a polite region is not urgent.
    expect(layoutSrc.match(/id="sr-polite"/g)).toHaveLength(1);
    expect(layoutSrc.match(/id="sr-assertive"/g)).toHaveLength(1);
  });

  it('the regions are hidden visually, not from assistive tech', () => {
    // `hidden` or `display:none` would remove them from the accessibility tree
    // and reintroduce the silence. sr-only clips them instead.
    expect(layoutSrc).toMatch(/id="sr-polite"[\s\S]{0,260}className="sr-only"/);
    expect(layoutSrc).not.toMatch(/id="sr-(polite|assertive)"[\s\S]{0,200}\bhidden\b/);
  });
});

describe('spoken feedback survives the voice agent being offline', () => {
  it('REGRESSION: speak() falls back to the live region when the agent is not live', () => {
    // BUGLOG 2026-09-23. `speak()` called only `engine.speak()`, which needs a
    // connected session. With a denied mic or an exhausted quota, K (clock),
    // D (describe board) and every other spoken keyboard command produced
    // nothing at all for a screen reader — while the UI still showed a
    // transcript entry, so it looked fine.
    expect(hookSrc).toMatch(/if \(engine\.isLive\)/);
    // The else branch must reach announce(), not just skip speaking.
    const speakBody = hookSrc.slice(
      hookSrc.indexOf('const speak = useCallback'),
      hookSrc.indexOf('const setDifficulty = useCallback'),
    );
    expect(speakBody).toContain('engine.isLive');
    expect(speakBody).toMatch(/}\s*else\s*{\s*announce\(text\);/);
  });

  it('the fallback is conditional, so the agent is never doubled by a live region', () => {
    // Announcing unconditionally would make a screen reader read over the TTS.
    const speakBody = hookSrc.slice(
      hookSrc.indexOf('const speak = useCallback'),
      hookSrc.indexOf('const setDifficulty = useCallback'),
    );
    expect(speakBody).toMatch(/engine\.speak\(/);
    // announce() appears exactly once in speak(): in the offline branch only.
    expect(speakBody.match(/announce\(/g)).toHaveLength(1);
  });
});
