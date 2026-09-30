// ============================================================
// Regression: BUGLOG 2026-09-30 — the conversation had 51px to live in.
//
// Reported from real use while recording the demo. The transcript's own
// scrolling was correct (measured: only the <ol> scrolls, it follows the
// bottom, and it stays put when scrolled up). The problem was height. The
// microphone holds a fixed 176px whether or not a game is under way, and at
// 1366x768 that left the conversation 51px: one line, scrolling itself out of
// view on every message.
//
// Also pinned here: partial transcripts with no letter in them are not shown.
//
// Source guards, per this project's pattern for layout that no unit test
// renders. The measurements are in BUGLOG.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (r: string) => readFileSync(resolve(process.cwd(), r), 'utf8');
const listen = read('src/components/voice/ListenButton.tsx');
const caption = read('src/components/voice/CaptionBar.tsx');
const page = read('src/app/page.tsx');
const hook = read('src/hooks/useVoiceChessCoach.ts');

describe('the microphone gives space back once play starts', () => {
  it('REGRESSION: ListenButton has a compact size', () => {
    expect(listen).toMatch(/compact\s*\?/);
    expect(listen).toContain('h-24 w-24');
    expect(listen, 'the large size must still exist for the idle state').toContain('h-36 w-36');
  });

  it('REGRESSION: the caption bar tightens too', () => {
    expect(caption).toContain('compact');
    expect(caption).toMatch(/min-h-10/);
  });

  it('both are driven by whether a game is under way', () => {
    // Not by viewport. A narrow window before the first move should still get
    // the full-size microphone; it is the hero on arrival.
    expect(page).toMatch(/compact=\{inPlay\}/);
    expect((page.match(/compact=\{inPlay\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('partial transcripts do not show recogniser noise', () => {
  it('REGRESSION: a fragment with no letter is not displayed', () => {
    expect(hook).toContain('meaningfulPartial');
    expect(hook).toMatch(/\/\[a-z\]\/i\.test/);
  });

  it('the filter is display-only, never applied to the final transcript', () => {
    // Dropping a final transcript would lose a real move. The guard must sit
    // on partial-transcript alone.
    expect(hook).toMatch(/partial-transcript".*meaningfulPartial/s);
    const finalHandler = hook.slice(hook.indexOf('engine.on("final-transcript"'), hook.indexOf('engine.on("agent-speaking-start"'));
    expect(finalHandler).not.toContain('meaningfulPartial');
  });
});
