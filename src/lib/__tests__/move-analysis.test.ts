// ============================================================
// Adversarial pass over move analysis.
//
// This is the feature that talks back to a player about their own game, so the
// failure that matters is not "wrong number" — it is the coach saying something
// confident and wrong, or criticising a move the player had no choice about.
// These cases attack that.
//
// Case numbers refer to contracts/coaching-and-modes.md.
// ============================================================

import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { analyseMove, classify, BANDS, materialSwing } from '../move-analysis';
import { ChessEngine } from '../chess-engine';
import { handleToolCall } from '../tool-handlers';

/** 1.e4 e5 2.Qh5 Nc6 — white to move, Qxf7+ throws the queen away. */
function queenHangPosition(): string {
  const g = new Chess();
  for (const m of ['e4', 'e5', 'Qh5', 'Nc6']) g.move(m);
  return g.fen();
}

describe('classification bands', () => {
  it.each([
    [0, 'best'],
    [1, 'good'],
    [49, 'good'],
    [50, 'inaccuracy'],
    [149, 'inaccuracy'],
    [150, 'mistake'],
    [299, 'mistake'],
    [300, 'blunder'],
    [5000, 'blunder'],
  ])('%i centipawns is %s', (loss, label) => {
    expect(classify(loss as number)).toBe(label);
  });

  it('treats a negative loss as best, never as a blunder', () => {
    // A shallow search can score the played move above its own "best". The
    // coach must not insult a move it simply did not see.
    expect(classify(-500)).toBe('best');
    expect(classify(-1)).toBe('best');
  });

  it('has bands ordered high to low, or the lookup silently mislabels', () => {
    const mins = BANDS.map((b) => b.min);
    expect([...mins].sort((a, b) => b - a)).toEqual(mins);
  });
});

describe('analysis — the headline cases', () => {
  it('calls a hung queen a blunder and names a better move (case 1)', () => {
    const result = analyseMove(queenHangPosition(), 'Qxf7+');

    expect(result).not.toBeNull();
    expect(result!.classification).toBe('blunder');
    expect(result!.centipawnLoss).toBeGreaterThanOrEqual(300);
    expect(result!.bestMove).not.toBe('Qxf7+');
    expect(result!.spoken).toMatch(/blunder/i);
  });

  it('does not manufacture criticism of its own top choice (case 2)', () => {
    const fen = queenHangPosition();
    // Ask it for its best move, then analyse exactly that move.
    const probe = analyseMove(fen, 'Qxf7+')!;
    const best = probe.bestMove!;

    const result = analyseMove(fen, best)!;
    expect(result.centipawnLoss).toBe(0);
    expect(result.classification).toBe('best');
    expect(result.spoken).not.toMatch(/blunder|mistake|inaccurate/i);
  });

  it('never reports a negative loss, across a sample of legal moves', () => {
    // Sampled, not exhaustive: each analysis searches every legal reply, so
    // analysing every move is quadratic and turns this file into a minute of
    // CPU for no extra signal.
    const fen = queenHangPosition();
    for (const move of new Chess(fen).moves().slice(0, 6)) {
      const r = analyseMove(fen, move);
      expect(r!.centipawnLoss).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('analysis — forced moves are not mistakes (case 3)', () => {
  // Black king h8, white queen f6 giving check, white king g6.
  // g7 and h7 are covered, so Kg8 is the only legal reply.
  const FORCED = '7k/8/5QK1/8/8/8/8/8 b - - 0 1';

  it('the fixture really does have exactly one legal move', () => {
    // Self-checking: if this ever stops being true the test below is vacuous.
    expect(new Chess(FORCED).moves()).toHaveLength(1);
  });

  it('classifies the only legal move as best, with zero loss', () => {
    const only = new Chess(FORCED).moves()[0];
    const result = analyseMove(FORCED, only)!;

    expect(result.forced).toBe(true);
    expect(result.classification).toBe('best');
    expect(result.centipawnLoss).toBe(0);
  });

  it('says it was forced rather than praising the player for it', () => {
    const only = new Chess(FORCED).moves()[0];
    expect(analyseMove(FORCED, only)!.spoken).toMatch(/forced|only legal/i);
  });
});

describe('analysis — mate (cases 4, 5)', () => {
  // White: Ra1, Kg1, pawns f2 g2 h2. Black: Kg8, pawns f7 g7 h7. Ra8 is mate.
  const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';

  it('the fixture really does contain a mate in one', () => {
    expect(new Chess(MATE_IN_ONE).moves().filter((m) => m.endsWith('#'))).toHaveLength(1);
  });

  it('finding mate is never an error (case 4)', () => {
    const mate = new Chess(MATE_IN_ONE).moves().find((m) => m.endsWith('#'))!;
    const result = analyseMove(MATE_IN_ONE, mate)!;

    expect(result.classification).toBe('best');
    expect(result.centipawnLoss).toBe(0);
  });

  it('missing an available mate is a real error (case 5)', () => {
    const quiet = new Chess(MATE_IN_ONE)
      .moves()
      .find((m) => !m.endsWith('#') && !m.endsWith('+'))!;
    const result = analyseMove(MATE_IN_ONE, quiet)!;

    expect(result.classification).toBe('blunder');
    expect(result.bestMove).toMatch(/#$/);
  });
});

describe('analysis — refuses to guess (cases 8, 9)', () => {
  it('returns null for a move that is not legal in the position', () => {
    expect(analyseMove(new Chess().fen(), 'Qxf7#')).toBeNull();
    expect(analyseMove(new Chess().fen(), 'e5')).toBeNull();
  });

  it('returns null for junk instead of throwing', () => {
    for (const junk of ['', 'not-a-move', '!!!', 'O-O-O-O']) {
      expect(() => analyseMove(new Chess().fen(), junk)).not.toThrow();
      expect(analyseMove(new Chess().fen(), junk)).toBeNull();
    }
  });

  it('returns null for a malformed FEN instead of throwing', () => {
    for (const bad of ['', 'not a fen', '8/8/8/8/8/8/8/8 w - - 0 1']) {
      expect(() => analyseMove(bad, 'e4')).not.toThrow();
      expect(analyseMove(bad, 'e4')).toBeNull();
    }
  });

  it('returns null when the side to move has no legal moves at all', () => {
    // Fool's mate: black has just mated, white cannot move.
    const mated = new Chess();
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) mated.move(m);
    expect(mated.moves()).toHaveLength(0);
    expect(analyseMove(mated.fen(), 'Kf2')).toBeNull();
  });
});

describe('analysis — what it is allowed to say', () => {
  it('quantifies the loss in pawns, the unit players think in', () => {
    const r = analyseMove(queenHangPosition(), 'Qxf7+')!;
    expect(r.spoken).toMatch(/pawns? of advantage/);
  });

  it('never claims a tactical motif it has not demonstrated', () => {
    // The coach may say what was lost and what was better. It must not assert
    // a fork/pin/skewer it cannot verify at this depth.
    const fen = queenHangPosition();
    for (const move of new Chess(fen).moves().slice(0, 6)) {
      const spoken = analyseMove(fen, move)!.spoken;
      expect(spoken).not.toMatch(/\b(fork|pin|skewer|discovered|zugzwang)\b/i);
    }
  });

  it('speaks square names in IBCA phonetics, like the rest of the app', () => {
    const r = analyseMove(queenHangPosition(), 'Qxf7+')!;
    // f7 -> "Felix 7"
    expect(r.spoken).toMatch(/Felix 7/);
    expect(r.spoken).not.toMatch(/\bto f7\b/);
  });

  it('always produces non-empty speech for a legal move', () => {
    const fen = queenHangPosition();
    for (const move of new Chess(fen).moves().slice(0, 6)) {
      expect(analyseMove(fen, move)!.spoken.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('materialSwing', () => {
  it('is zero for a quiet move', () => {
    expect(materialSwing(undefined)).toBe(0);
  });

  it('ranks captured pieces the way chess does', () => {
    expect(materialSwing('q')).toBeGreaterThan(materialSwing('r'));
    expect(materialSwing('r')).toBeGreaterThan(materialSwing('b'));
    expect(materialSwing('b')).toBeGreaterThanOrEqual(materialSwing('n'));
    expect(materialSwing('n')).toBeGreaterThan(materialSwing('p'));
    expect(materialSwing('p')).toBeGreaterThan(0);
  });
});

describe('explain_last_move answers about the right move', () => {
  // Found by pressing W in the running app: it explained the engine's reply,
  // not the player's blunder. `whose` was declared in the tool schema and
  // never read, so it always analysed whatever move was most recent — which,
  // by the time a player asks "why was that bad?", is always the opponent's.
  const afterBlunder = () => {
    const e = new ChessEngine();
    // 1.e4 e5 2.Qh5 Nc6 3.Qxf7+?? Kxf7 — the engine's reply is forced.
    for (const m of ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+', 'Kxf7']) e.makeMove(m);
    return e;
  };

  it('defaults to the player’s move, not the opponent’s reply', () => {
    const out = JSON.parse(handleToolCall(afterBlunder(), 'explain_last_move', {}));

    expect(out.success).toBe(true);
    expect(out.whose).toBe('mine');
    expect(out.move).toBe('Qxf7+');
    expect(out.classification).toBe('blunder');
    // The regression: "King to Felix 7 was forced" answered nobody's question.
    expect(out.narration).not.toMatch(/forced/i);
  });

  it('explains the opponent’s move when asked for it', () => {
    const out = JSON.parse(
      handleToolCall(afterBlunder(), 'explain_last_move', { whose: 'opponent' }),
    );

    expect(out.success).toBe(true);
    expect(out.whose).toBe('opponent');
    expect(out.move).toBe('Kxf7');
  });

  it('says nothing useful is available before the player has moved', () => {
    const out = JSON.parse(handleToolCall(new ChessEngine(), 'explain_last_move', {}));
    expect(out.success).toBe(false);
    expect(out.narration).toMatch(/not made a move/i);
  });
});
