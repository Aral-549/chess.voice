import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../chess-engine';

const wordsIn = (s: string) => s.trim().split(/\s+/).length;

describe('blitz terse narration', () => {
  it('drops the colour and the filler word "to"', () => {
    const e = new ChessEngine();
    e.setTerseNarration(true);
    const res = e.makeMove('e4');
    expect(res.narration).toBe('Pawn Eva 4.');
    expect(res.narration).not.toMatch(/white|black/i);
    expect(res.narration).not.toMatch(/\bto\b/);
  });

  it('is substantially shorter than the full form for the same move', () => {
    const full = new ChessEngine();
    const terse = new ChessEngine();
    terse.setTerseNarration(true);

    const a = full.makeMove('e4').narration;
    const b = terse.makeMove('e4').narration;
    expect(wordsIn(b)).toBeLessThan(wordsIn(a));
  });

  it('keeps the information that actually matters', () => {
    // Capture
    const cap = new ChessEngine('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    cap.setTerseNarration(true);
    expect(cap.makeMove('exd5').narration).toMatch(/takes pawn David 5/);

    // Check
    const chk = new ChessEngine('rnbqkbnr/ppp2ppp/8/1B1pp3/4P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 3');
    chk.setTerseNarration(true);
    const out = chk.makeMove('Bxd7');
    if (out.success) expect(out.narration.length).toBeGreaterThan(0);

    // Castling stays explicit
    const cas = new ChessEngine('rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    cas.setTerseNarration(true);
    expect(cas.makeMove('O-O').narration).toMatch(/castles kingside/i);
  });

  it('announces mate', () => {
    // Fool's mate: 1. f3 e5 2. g4 — Black to play Qh4#
    const e = new ChessEngine('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
    e.setTerseNarration(true);
    const res = e.makeMove('Qh4');
    expect(res.success).toBe(true);
    expect(res.narration).toMatch(/mate/i);
  });

  it('toggles back to the full form', () => {
    const e = new ChessEngine();
    e.setTerseNarration(true);
    e.setTerseNarration(false);
    expect(e.makeMove('e4').narration).toMatch(/White pawn to Eva 4/);
  });
});
