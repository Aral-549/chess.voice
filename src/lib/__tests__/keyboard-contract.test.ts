// ============================================================
// Regression: BUGLOG 2026-09-24 — four advertised shortcuts did nothing.
//
// `ShortcutsModal` promised H (hint), F (flip), I (IBCA guide) and 1-4
// (difficulty). None were bound. The hotkey map in `page.tsx` even carried the
// comment "1-4 are difficulty, 5-9 are the clock" directly above code that
// bound only 5-9 — the comment described behaviour that had never existed.
//
// In an app whose premise is that everything is reachable by keyboard, the
// shortcuts list IS the contract. A judge or a blind player who presses H and
// gets silence has been told something untrue by the product itself.
//
// This is a source-level guard, like `live-region-wiring.test.ts`: the binding
// lives in a client component inside the App Router and the promise lives in a
// different file, so no render test covers the *relationship* between them.
// Asserting one side alone is exactly how they drifted apart.
//
// The direction that matters is "everything advertised is bound". The reverse
// is also checked, so an undocumented key has to be either documented or
// deliberately listed as an alias.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const modalSrc = read('src/components/a11y/ShortcutsModal.tsx');
const pageSrc = read('src/app/page.tsx');

/**
 * Keys bound but intentionally not advertised.
 * `=` is the same physical key as `+` unshifted — a convenience alias, not a
 * separate feature. Anything else added here needs a reason.
 */
const UNDOCUMENTED_BY_DESIGN = new Set(['=']);

/**
 * Keys the shortcuts list mentions that are not single-key bindings at all.
 * The panel splitter is an ARIA separator: you Tab to it and use arrows, which
 * `PanelSplitter.tsx` handles on the focused element, not via the global map.
 */
const NOT_GLOBAL_HOTKEYS = new Set(['tab to divider, ← →']);

/** "J" -> ["j"], "1 - 4" -> ["1","2","3","4"], "+ / -" -> ["+","-"] */
function expandAdvertised(label: string): string[] {
  const raw = label.trim();
  if (NOT_GLOBAL_HOTKEYS.has(raw.toLowerCase())) return [];

  // Ranges: "1 - 4", "5 - 9"
  const range = raw.match(/^(\d)\s*-\s*(\d)$/);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    return Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
  }

  // Alternatives: "+ / -"
  if (raw.includes('/')) return raw.split('/').map((k) => k.trim().toLowerCase()).filter(Boolean);

  if (raw.toLowerCase() === 'esc') return ['escape'];
  return [raw.toLowerCase()];
}

/** Remove // line comments and block comments, so prose cannot look like code. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Every key the shortcuts modal advertises to the user. */
function advertisedKeys(): string[] {
  const rows = [...modalSrc.matchAll(/\[\s*"([^"]+)"\s*,\s*"/g)].map((m) => m[1]);
  expect(rows.length, 'failed to parse the SHORTCUTS table').toBeGreaterThan(10);
  return [...new Set(rows.flatMap(expandAdvertised))];
}

/** Every key actually bound in the useHotkeys map in page.tsx. */
function boundKeys(): string[] {
  const start = pageSrc.indexOf('useHotkeys(');
  expect(start, 'useHotkeys( not found in page.tsx').toBeGreaterThan(-1);
  // The map ends at the closing of the hotkeys call; the enabled-flag argument
  // follows it, so slice to there rather than guessing a brace depth.
  const end = pageSrc.indexOf('!shortcutsOpen', start);
  expect(end, 'could not find the end of the hotkey map').toBeGreaterThan(start);
  // Comments must go first: a line like "Shift is not required: 1-4 are
  // difficulty" parses as a binding for a key named "required" otherwise.
  const body = stripComments(pageSrc.slice(start, end));

  // Matches both `j: {` / `r: () =>` and quoted `"5": () =>` / `"?": () =>`
  const keys = [...body.matchAll(/(?:^|[\s{,])(?:"([^"]+)"|([a-z]+))\s*:/gm)]
    .map((m) => (m[1] ?? m[2]).toLowerCase())
    // Nested object keys inside the `j` binding, not hotkeys themselves.
    .filter((k) => !['ondown', 'onup'].includes(k));
  return [...new Set(keys)];
}

describe('keyboard contract — the shortcuts list is a promise', () => {
  it('REGRESSION: every advertised shortcut is actually bound', () => {
    const bound = new Set(boundKeys());
    const missing = advertisedKeys().filter((k) => !bound.has(k));
    expect(
      missing,
      `ShortcutsModal advertises ${missing.join(', ')} but page.tsx binds nothing for ` +
        `${missing.length === 1 ? 'it' : 'them'}. Either bind the key or stop promising it.`,
    ).toEqual([]);
  });

  it('every bound shortcut is documented (or a listed alias)', () => {
    const advertised = new Set(advertisedKeys());
    const undocumented = boundKeys().filter(
      (k) => !advertised.has(k) && !UNDOCUMENTED_BY_DESIGN.has(k),
    );
    expect(
      undocumented,
      `page.tsx binds ${undocumented.join(', ')} but ShortcutsModal never mentions ` +
        `${undocumented.length === 1 ? 'it' : 'them'} — a feature nobody can discover.`,
    ).toEqual([]);
  });

  it('the four keys from the bug are specifically bound', () => {
    // Named explicitly so the regression is legible even if the parsers above
    // are ever loosened.
    const bound = new Set(boundKeys());
    for (const key of ['h', 'f', 'i', '1', '2', '3', '4']) {
      expect(bound.has(key), `${key} is not bound`).toBe(true);
    }
  });

  it('the difficulty keys map to the four real difficulty levels', () => {
    // Binding 1-4 to the wrong levels would pass the test above while still
    // lying to the user, since the modal names which level each key selects.
    for (const level of ['beginner', 'intermediate', 'advanced', 'master']) {
      expect(pageSrc, `no difficulty binding sets "${level}"`).toContain(
        `setDifficulty("${level}")`,
      );
    }
  });

  it('the IBCA guide is reachable from every route that advertises it', () => {
    // The guide existed, finished, with zero importers. Three routes pointed at
    // nothing: the I key, the Settings item, and the shortcuts list.
    expect(pageSrc, 'page.tsx does not import IBCAGuideModal').toContain('IBCAGuideModal');
    expect(pageSrc, 'no I hotkey opens the guide').toMatch(/\bi:\s*\(\)\s*=>\s*setIbcaOpen/);
    expect(pageSrc, 'SettingsMenu is not given onOpenIBCAGuide').toContain('onOpenIBCAGuide');
  });

  it('opening a modal suspends the global hotkeys', () => {
    // Otherwise typing inside a dialog fires game actions behind it.
    expect(pageSrc).toMatch(/!shortcutsOpen\s*&&\s*!ibcaOpen/);
  });
});
