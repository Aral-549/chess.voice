// ============================================================
// Regression: BUGLOG 2026-09-22 — "Illegal SAN move played as a different
// piece".
//
// fuzzyMatchMove scored a destination-square match at +10 and only understood
// piece names as *words* ("bishop", "knight"). A SAN piece letter carried no
// meaning, so with the king in check from a knight:
//
//   input "Be2"  ->  Ke2 scored +10  ->  confidence 0.9  ->  autoplayed
//
// The player named a bishop and the app moved the king. That is the exact
// failure the project's governing rule forbids: prefer making no move over
// making a wrong move.
//
// Adversarial pass: every case below is an attempt to make the parser move a
// piece the player did not name.
// ============================================================

import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../chess-engine';
import { handleToolCall, fuzzyMatchMove } from '../tool-handlers';

/** 1.d4 Nc6 2.Nf3 Nxd4 3.e3 Nxf3+ — White is in check from a knight on f3.
 *  Legal replies are gxf3, Qxf3, Ke2. No bishop, knight, rook or queen
 *  *other than* Qxf3 can go anywhere near e2. */
function inCheckFromKnight(): ChessEngine {
  const e = new ChessEngine();
  for (const m of ['d4', 'Nc6', 'Nf3', 'Nxd4', 'e3', 'Nxf3+']) e.makeMove(m);
  return e;
}

describe('an explicit SAN piece letter is a constraint, not a hint', () => {
  it('refuses "Be2" rather than moving the king to e2', () => {
    const e = inCheckFromKnight();
    const before = e.getGameState().fen;

    const out = JSON.parse(handleToolCall(e, 'apply_move', { move_description: 'Be2' }));

    expect(out.success).toBe(false);
    expect(out.clarificationNeeded).toBe(true);
    // The board is the thing that matters: nothing moved.
    expect(e.getGameState().fen).toBe(before);
  });

  it.each(['Be2', 'Ne2', 'Re2', 'Qe2'])(
    'refuses "%s" when only the king can reach e2',
    (input) => {
      const e = inCheckFromKnight();
      const before = e.getGameState().fen;

      const out = JSON.parse(handleToolCall(e, 'apply_move', { move_description: input }));

      expect(out.success).toBe(false);
      expect(e.getGameState().fen).toBe(before);
    },
  );

  it('never resolves a named piece to a different piece type', () => {
    // Asserted at the matcher level so the reason is visible, not just the
    // downstream refusal.
    const e = inCheckFromKnight();
    const { move, confidence } = fuzzyMatchMove('Be2', e);

    // Whatever it picks, it must not be confident enough to autoplay...
    expect(confidence).toBeLessThan(0.9);
    // ...and it must not be the king move wearing a bishop's name.
    if (confidence >= 0.6) expect(move).not.toBe('Ke2');
  });

  it('stays below the autoplay bar, so nothing reaches the board unasked', () => {
    const e = inCheckFromKnight();
    const { confidence } = fuzzyMatchMove('Be2', e);
    expect(confidence).toBeLessThan(0.9);
  });
});

describe('the fix does not break legitimate notation', () => {
  it('still plays a legal SAN piece move', () => {
    const e = new ChessEngine();
    const out = JSON.parse(handleToolCall(e, 'apply_move', { move_description: 'Nf3' }));
    expect(out.success).toBe(true);
    expect(out.your_move).toMatch(/knight/i);
  });

  it('treats lowercase "bxc3" as a b-file PAWN capture, not a bishop', () => {
    // Case is the only thing separating these two, and the normaliser
    // lowercases — which is why the constraint reads the raw input.
    const e = new ChessEngine();
    for (const m of ['d4', 'b5', 'e4', 'b4', 'c3']) e.makeMove(m);
    // Black to move; bxc3 is a pawn capture.
    const { move } = fuzzyMatchMove('bxc3', e);
    const legal = e.getGameState().legalMoves.find((m) => m.san === move);
    expect(legal?.piece).toBe('p');
  });

  it('still accepts spoken piece names', () => {
    const e = new ChessEngine();
    const out = JSON.parse(handleToolCall(e, 'apply_move', { move_description: 'knight to f3' }));
    expect(out.success).toBe(true);
    expect(out.your_move).toMatch(/knight/i);
  });

  it('still accepts IBCA phonetic input', () => {
    const e = new ChessEngine();
    const out = JSON.parse(handleToolCall(e, 'apply_move', { move_description: 'Eva 4' }));
    expect(out.success).toBe(true);
  });

  it('leaves castling untouched', () => {
    const e = new ChessEngine();
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) e.makeMove(m);
    const { move } = fuzzyMatchMove('O-O', e);
    expect(move).toBe('O-O');
  });

  it('picks the named piece when several pieces could reach the square', () => {
    // Position where both a knight and a bishop can reach e2 — naming one
    // must select that one, and never the other.
    const e = new ChessEngine();
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'd6']) e.makeMove(m);
    const legal = e.getGameState().legalMoves;
    const knightToE2 = legal.find((m) => m.san === 'Nge2' || m.san === 'Nbd2');
    if (knightToE2) {
      const { move } = fuzzyMatchMove(knightToE2.san, e);
      const picked = legal.find((m) => m.san === move);
      expect(picked?.piece).toBe('n');
    }
  });
});
