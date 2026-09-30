// ============================================================
// chess.voice — rating
//
// Pure Elo. The opponent's rating is the difficulty the player already sees in
// the UI, so the number on screen and the number that moves their rating are
// the same number.
//
// See contracts/game-persistence.md
// ============================================================

import type { Difficulty } from '@/types';

export const STARTING_RATING = 1200;
export const MIN_RATING = 100;

/** Matches the ratings shown on the difficulty selector. */
export const ENGINE_RATING: Record<Difficulty, number> = {
  beginner: 800,
  intermediate: 1400,
  advanced: 1800,
  master: 2200,
};

export type Outcome = 'win' | 'loss' | 'draw';

const SCORE: Record<Outcome, number> = { win: 1, draw: 0.5, loss: 0 };

/** Provisional players move faster. */
export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < 30 ? 32 : 16;
}

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export interface RatingChange {
  rating: number;
  delta: number;
}

/**
 * New rating after one game.
 *
 * Case 15 of the contract: clamped at MIN_RATING, so a long losing streak
 * cannot drive a rating negative or absurd.
 */
export function applyResult(params: {
  rating: number;
  gamesPlayed: number;
  difficulty: Difficulty;
  outcome: Outcome;
}): RatingChange {
  const opponent = ENGINE_RATING[params.difficulty] ?? ENGINE_RATING.intermediate;
  const k = kFactor(params.gamesPlayed);
  const expected = expectedScore(params.rating, opponent);
  const raw = params.rating + k * (SCORE[params.outcome] - expected);

  const rating = Math.max(MIN_RATING, Math.round(raw));
  return { rating, delta: rating - params.rating };
}

/**
 * Recompute a rating from scratch over a sequence of games.
 *
 * Case 11: when an anonymous player signs in and their device games are
 * claimed, the account rating is *recomputed* from the full history rather
 * than summed with whatever it already held.
 */
export function recomputeRating(
  games: { difficulty: Difficulty; outcome: Outcome }[],
): RatingChange {
  let rating = STARTING_RATING;
  games.forEach((game, i) => {
    rating = applyResult({
      rating,
      gamesPlayed: i,
      difficulty: game.difficulty,
      outcome: game.outcome,
    }).rating;
  });
  return { rating, delta: rating - STARTING_RATING };
}
