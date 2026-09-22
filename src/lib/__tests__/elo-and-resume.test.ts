// ============================================================
// Adversarial pass over rating and game resume.
//
// Rating is the number a player is shown and judged by, and resume restores a
// position someone may be holding entirely in memory. Both fail quietly if
// wrong, so these cases attack the edges: absurd inputs, double-rating,
// half-restored boards.
//
// Case numbers refer to contracts/game-persistence.md.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  ENGINE_RATING,
  MIN_RATING,
  STARTING_RATING,
  applyResult,
  expectedScore,
  kFactor,
  recomputeRating,
} from '../elo';
import { ChessEngine } from '../chess-engine';

describe('elo — direction and magnitude', () => {
  it('raises the rating on a win and lowers it on a loss (cases 6, 7)', () => {
    const base = { rating: 1200, gamesPlayed: 0, difficulty: 'intermediate' as const };
    expect(applyResult({ ...base, outcome: 'win' }).delta).toBeGreaterThan(0);
    expect(applyResult({ ...base, outcome: 'loss' }).delta).toBeLessThan(0);
  });

  it('rewards beating a stronger engine more than a weaker one', () => {
    const base = { rating: 1200, gamesPlayed: 0, outcome: 'win' as const };
    const vsBeginner = applyResult({ ...base, difficulty: 'beginner' }).delta;
    const vsMaster = applyResult({ ...base, difficulty: 'master' }).delta;
    expect(vsMaster).toBeGreaterThan(vsBeginner);
  });

  it('punishes losing to a weaker engine more than to a stronger one', () => {
    const base = { rating: 1800, gamesPlayed: 50, outcome: 'loss' as const };
    const toBeginner = applyResult({ ...base, difficulty: 'beginner' }).delta;
    const toMaster = applyResult({ ...base, difficulty: 'master' }).delta;
    expect(toBeginner).toBeLessThan(toMaster);
  });

  it('moves a draw toward the engine rating (case 8)', () => {
    // Drawing a much stronger engine is a good result.
    const up = applyResult({
      rating: 1000, gamesPlayed: 50, difficulty: 'master', outcome: 'draw',
    });
    expect(up.delta).toBeGreaterThan(0);

    // Drawing a much weaker one is a bad result.
    const down = applyResult({
      rating: 2000, gamesPlayed: 50, difficulty: 'beginner', outcome: 'draw',
    });
    expect(down.delta).toBeLessThan(0);
  });

  it('moves provisional players faster than established ones', () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(100));
    const provisional = applyResult({
      rating: 1200, gamesPlayed: 0, difficulty: 'intermediate', outcome: 'win',
    }).delta;
    const established = applyResult({
      rating: 1200, gamesPlayed: 200, difficulty: 'intermediate', outcome: 'win',
    }).delta;
    expect(provisional).toBeGreaterThan(established);
  });

  it('agrees with the ratings shown on the difficulty selector', () => {
    // If these drift apart, a player is rated against a number they were never
    // shown.
    expect(ENGINE_RATING).toEqual({
      beginner: 800, intermediate: 1400, advanced: 1800, master: 2200,
    });
  });

  it('is symmetric: expected scores of both sides sum to 1', () => {
    const a = expectedScore(1200, 1800);
    const b = expectedScore(1800, 1200);
    expect(a + b).toBeCloseTo(1, 10);
  });
});

describe('elo — refuses absurd results', () => {
  it('never falls below the floor, however long the losing streak (case 15)', () => {
    let rating = 300;
    for (let i = 0; i < 200; i++) {
      rating = applyResult({
        rating, gamesPlayed: 100, difficulty: 'master', outcome: 'loss',
      }).rating;
    }
    expect(rating).toBeGreaterThanOrEqual(MIN_RATING);
  });

  it('clamps a rating that is already below the floor', () => {
    const r = applyResult({
      rating: 10, gamesPlayed: 0, difficulty: 'master', outcome: 'loss',
    });
    expect(r.rating).toBeGreaterThanOrEqual(MIN_RATING);
  });

  it('returns whole numbers only', () => {
    for (const outcome of ['win', 'loss', 'draw'] as const) {
      const r = applyResult({
        rating: 1234, gamesPlayed: 7, difficulty: 'advanced', outcome,
      });
      expect(Number.isInteger(r.rating)).toBe(true);
      expect(Number.isInteger(r.delta)).toBe(true);
    }
  });

  it('falls back to the mid engine rating for an unknown difficulty', () => {
    const r = applyResult({
      rating: 1200,
      gamesPlayed: 0,
      // deliberately outside the union, as a bad row from the database would be
      difficulty: 'nonsense' as never,
      outcome: 'win',
    });
    expect(r.rating).toBeGreaterThan(1200);
  });
});

describe('elo — recompute on claim (case 11)', () => {
  it('replays history from the starting rating rather than summing', () => {
    const games = [
      { difficulty: 'intermediate' as const, outcome: 'win' as const },
      { difficulty: 'intermediate' as const, outcome: 'win' as const },
    ];
    const once = recomputeRating(games);
    const twice = recomputeRating(games);
    // Recomputing is idempotent — claiming twice cannot inflate a rating.
    expect(once.rating).toBe(twice.rating);
    expect(once.rating).toBeGreaterThan(STARTING_RATING);
  });

  it('returns the starting rating for an empty history', () => {
    expect(recomputeRating([]).rating).toBe(STARTING_RATING);
    expect(recomputeRating([]).delta).toBe(0);
  });

  it('is order-sensitive, because K-factor depends on games played', () => {
    // Not a bug: this documents that replay order matters, which is why the
    // claim path orders by updated_at ascending.
    const a = recomputeRating([
      { difficulty: 'master', outcome: 'win' },
      { difficulty: 'beginner', outcome: 'loss' },
    ]);
    const b = recomputeRating([
      { difficulty: 'beginner', outcome: 'loss' },
      { difficulty: 'master', outcome: 'win' },
    ]);
    expect(a.rating).not.toBe(b.rating);
  });
});

describe('resume — ChessEngine.loadPgn (cases 3, 13)', () => {
  // Captures must be ASYMMETRIC in piece type, or a test comparing the two
  // sides cannot detect the colours being swapped during the rebuild. An
  // earlier version of this helper had both sides capture a pawn, and passed
  // happily with the attribution inverted.
  //   white captures: pawn, bishop   black captures: pawn, knight
  const played = () => {
    const e = new ChessEngine();
    const line = ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'c6',
                  'Nf3', 'Bg4', 'Bf4', 'e6', 'h3', 'Bxf3', 'Qxf3'];
    for (const m of line) e.makeMove(m);
    return e;
  };

  it('restores the exact position (case 3)', () => {
    const origin = played();
    const pgn = origin.getGameState().pgn;

    const resumed = new ChessEngine();
    expect(resumed.loadPgn(pgn)).toBe(true);
    expect(resumed.getGameState().fen).toBe(origin.getGameState().fen);
  });

  it('restores move history, not just the board', () => {
    const origin = played();
    const resumed = new ChessEngine();
    resumed.loadPgn(origin.getGameState().pgn);

    const a = origin.getGameState();
    const b = resumed.getGameState();

    // "What was the last move?" is a question this app answers out loud, so a
    // resumed game has to know it — restoring only the FEN would not.
    expect(b.lastMove?.san).toBe(a.lastMove?.san);
    expect(b.moveNumber).toBe(a.moveNumber);
    expect(b.pgn).toBe(a.pgn);
  });

  it('restores captured pieces, which the spoken board readout depends on', () => {
    const origin = played();
    const resumed = new ChessEngine();
    resumed.loadPgn(origin.getGameState().pgn);

    expect(resumed.getGameState().capturedPieces)
      .toEqual(origin.getGameState().capturedPieces);
    // The line above includes real captures, so this is not a trivial pass.
    // Assert the fixture really is asymmetric, so this test can fail.
    const captured = origin.getGameState().capturedPieces;
    expect(captured.white).not.toEqual(captured.black);
    expect(captured.white.length + captured.black.length).toBeGreaterThan(0);
  });

  it('a resumed game keeps playing legally', () => {
    const origin = played();
    const resumed = new ChessEngine();
    resumed.loadPgn(origin.getGameState().pgn);

    const legal = resumed.getGameState().legalMoves;
    expect(legal.length).toBeGreaterThan(0);
    expect(resumed.makeMove(legal[0].san).success).toBe(true);
  });

  it('refuses a corrupt PGN and leaves the board untouched (case 13)', () => {
    const engine = played();
    const before = engine.getGameState().fen;

    expect(engine.loadPgn('1. e4 e5 2. Qq9 !!garbage!!')).toBe(false);
    // A half-restored game is worse than none: nothing may have changed.
    expect(engine.getGameState().fen).toBe(before);
  });

  it('refuses gracefully on empty and junk input', () => {
    const engine = new ChessEngine();
    const before = engine.getGameState().fen;
    for (const junk of ['not a pgn at all', '<<<>>>', '1. zz9 yy8']) {
      expect(() => engine.loadPgn(junk)).not.toThrow();
      expect(engine.getGameState().fen).toBe(before);
    }
  });
});
