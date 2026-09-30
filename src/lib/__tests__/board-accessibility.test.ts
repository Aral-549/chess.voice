// ============================================================
// Regression: BUGLOG 2026-09-30 — the chessboard was 32 anonymous tab stops.
//
// react-chessboard wraps every piece in `role="button" tabindex="0"` with no
// accessible name. axe-core flagged it as `aria-command-name` (serious) in
// every state of the app. The lived consequence was worse than the rule: a
// screen reader announced thirty-two anonymous "button"s, and a keyboard user
// crossing the board hit thirty-two dead stops.
//
// In an app whose claim is "no screen, no mouse, no sighted help", the board
// was the least accessible thing on the page.
//
// Source guard, like live-region-wiring.test.ts: the markup is created by a
// third-party component at runtime and this project has no jsdom, so the
// browser-level proof lives in BUGLOG (axe: 0 violations across five states).
// What is pinned here is that the correcting code still exists and still says
// what it must.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(process.cwd(), 'src/components/board/ChessBoardPanel.tsx'),
  'utf8',
);

describe('board pieces are named and out of the tab order', () => {
  it('REGRESSION: the drag layer is removed from the tab order', () => {
    expect(src).toMatch(/setAttribute\(\s*["']tabindex["']\s*,\s*["']-1["']\s*\)/);
  });

  it('REGRESSION: every piece gets an accessible name', () => {
    expect(src).toMatch(/setAttribute\(\s*["']aria-label["']/);
    expect(src).toContain('aria-roledescription="draggable"');
  });

  it('names are spoken in IBCA, matching the rest of the app', () => {
    // "White pawn on Eva 4", not "White pawn on e4". A board that names squares
    // one way while the coach names them another is two systems, not one.
    expect(src).toContain('squareToIBCA');
  });

  it('names name the piece, not only the square', () => {
    for (const piece of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
      expect(src, `no name for ${piece}`).toContain(piece);
    }
    expect(src).toMatch(/White|Black/);
  });

  it('the labels are refreshed when the position changes', () => {
    // A name that does not follow its piece is worse than no name: it is a
    // confident lie about where things are.
    const start = src.indexOf('const boardRef');
    expect(start, 'the labelling effect is gone').toBeGreaterThan(-1);
    const effect = src.slice(start);
    const end = effect.search(/\}, \[fen\]\)/);
    expect(end, 'the labelling effect is not keyed on fen').toBeGreaterThan(-1);
    // and the observer is set up inside it, not in some unrelated effect
    expect(effect.slice(0, end)).toContain('MutationObserver');
  });

  it('re-labelling survives the library re-rendering its own drag layer', () => {
    // react-chessboard rebuilds these nodes on drag and hover, which restores
    // the unnamed originals. Without the observer the fix silently lapses the
    // first time anyone touches a piece.
    expect(src).toContain('MutationObserver');
    expect(src).toContain('observer.disconnect()');
  });
});
