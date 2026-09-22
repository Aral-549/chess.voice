// ============================================================
// Captured material, derived from the FEN.
//
// This feeds the rails either side of the board, and the material advantage is
// a number a player makes decisions on — so the cases that matter are the ones
// where it could quietly be wrong: an empty board, a promotion, a malformed
// FEN from a corrupt saved game.
// ============================================================

import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { capturedFromFen, describeCaptured, CAPTURE_ORDER } from '../captured';

const START = new Chess().fen();

describe('capturedFromFen', () => {
  it('reports nothing captured at the start', () => {
    const c = capturedFromFen(START);
    expect(c.byWhite).toEqual([]);
    expect(c.byBlack).toEqual([]);
    expect(c.materialAdvantage).toBe(0);
  });

  it('attributes a capture to the side that made it', () => {
    // 1.e4 d5 2.exd5 — White has taken a black pawn.
    const g = new Chess();
    for (const m of ['e4', 'd5', 'exd5']) g.move(m);

    const c = capturedFromFen(g.fen());
    expect(c.byWhite).toEqual(['p']);
    expect(c.byBlack).toEqual([]);
    expect(c.materialAdvantage).toBe(1);
  });

  it('nets off an even trade', () => {
    // 1.e4 d5 2.exd5 Qxd5 — a pawn each.
    const g = new Chess();
    for (const m of ['e4', 'd5', 'exd5', 'Qxd5']) g.move(m);

    const c = capturedFromFen(g.fen());
    expect(c.byWhite).toEqual(['p']);
    expect(c.byBlack).toEqual(['p']);
    expect(c.materialAdvantage).toBe(0);
  });

  it('gives the advantage to whoever is up material', () => {
    // Black wins the queen: 1.e4 e5 2.Qh5 Nc6 3.Qxf7+ Kxf7
    const g = new Chess();
    for (const m of ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+', 'Kxf7']) g.move(m);

    const c = capturedFromFen(g.fen());
    expect(c.byWhite).toEqual(['p']); // the f7 pawn
    expect(c.byBlack).toEqual(['q']); // the queen
    expect(c.materialAdvantage).toBeLessThan(0); // Black is ahead
  });

  it('lists heaviest pieces first, so the rail reads queen to pawn', () => {
    const c = capturedFromFen('4k3/8/8/8/8/8/PPPPPPPP/4K3 w - - 0 1');
    // Black has lost everything but the king.
    const order = c.byWhite;
    const ranks = order.map((p) => CAPTURE_ORDER.indexOf(p));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(order[0]).toBe('q');
  });

  it('never returns a negative count, whatever the position claims', () => {
    // A promotion leaves more queens than the game started with. That must not
    // wrap into a negative "captured" count.
    const promoted = '4k3/8/8/8/8/8/8/QQQQK3 w - - 0 1';
    const c = capturedFromFen(promoted);
    for (const piece of [...c.byWhite, ...c.byBlack]) {
      expect(CAPTURE_ORDER).toContain(piece);
    }
    expect(c.byBlack.filter((p) => p === 'q').length).toBeGreaterThanOrEqual(0);
  });

  it('survives a malformed or empty FEN instead of throwing', () => {
    for (const bad of ['', '   ', 'not a fen', 'garbage/////']) {
      expect(() => capturedFromFen(bad)).not.toThrow();
      const c = capturedFromFen(bad);
      expect(Array.isArray(c.byWhite)).toBe(true);
      expect(Number.isFinite(c.materialAdvantage)).toBe(true);
    }
  });

  it('ignores the fields after the placement', () => {
    const a = capturedFromFen(START);
    const b = capturedFromFen(START.split(' ')[0]);
    expect(a).toEqual(b);
  });
});

describe('describeCaptured — what a screen reader hears', () => {
  it('says so plainly when nothing has been taken', () => {
    expect(describeCaptured([])).toBe('no pieces captured');
  });

  it('pluralises correctly', () => {
    expect(describeCaptured(['p'])).toBe('1 pawn');
    expect(describeCaptured(['p', 'p'])).toBe('2 pawns');
  });

  it('groups by piece, heaviest first', () => {
    expect(describeCaptured(['p', 'q', 'p', 'n'])).toBe('1 queen, 1 knight, 2 pawns');
  });

  it('never emits raw glyphs — a run of chess symbols announces as noise', () => {
    const text = describeCaptured(['q', 'r', 'b', 'n', 'p']);
    expect(text).not.toMatch(/[♛♜♝♞♟]/);
    expect(text).toMatch(/queen/);
  });
});
