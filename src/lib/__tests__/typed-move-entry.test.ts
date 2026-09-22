import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../chess-engine';
import { fuzzyMatchMove } from '../tool-handlers';

// Typed notation goes straight to engine.makeMove(). These lock in the property
// that matters: an exact string either plays exactly that move, or plays nothing.
describe('typed move entry is exact', () => {
  it('plays the move that was typed, verbatim', () => {
    for (const [san, fenPart] of [['e4', '/4P3/'], ['Nf3', ''], ['d4', '/3P4/']] as const) {
      const e = new ChessEngine();
      const res = e.makeMove(san);
      expect(res.success, `${san} should be legal from the start`).toBe(true);
      expect(e.getGameState().pgn).toContain(san);
      if (fenPart) expect(e.getGameState().fen).toContain(fenPart);
    }
  });

  it('rejects an illegal move and leaves the board untouched', () => {
    const e = new ChessEngine();
    const before = e.getGameState().fen;
    for (const bad of ['e5', 'Ke2', 'Qh5xf7', 'O-O', 'Nf6']) {
      const res = e.makeMove(bad);
      expect(res.success, `${bad} must be rejected from the start position`).toBe(false);
      expect(e.getGameState().fen, `${bad} must not mutate the board`).toBe(before);
    }
  });

  it('rejects junk rather than guessing at it', () => {
    const e = new ChessEngine();
    const before = e.getGameState().fen;
    for (const junk of ['', '   ', 'xyzzy', '99', 'e', 'pawn to king four']) {
      expect(e.makeMove(junk).success, `"${junk}" must not play`).toBe(false);
      expect(e.getGameState().fen).toBe(before);
    }
  });

  it('is strictly safer than the speech path for the same input', () => {
    // fuzzyMatchMove exists to salvage messy SPEECH. Given an ambiguous string it
    // still returns a move — which is exactly why typed input must not use it.
    const e = new ChessEngine();
    const fuzzy = fuzzyMatchMove('pawn to king four', e);
    expect(fuzzy.move).not.toBe(''); // fuzzy guesses...
    expect(e.makeMove('pawn to king four').success).toBe(false); // ...typed does not
  });
});
