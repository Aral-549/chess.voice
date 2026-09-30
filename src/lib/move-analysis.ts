// ============================================================
// chess.voice — "why was that bad?"
//
// The feature a click interface cannot really have. On a board, analysis is a
// wall of arrows and numbers nobody reads. In a conversation it is the whole
// point: you ask, and you get an answer grounded in the engine's actual
// evaluation rather than a language model's impression of the position.
//
// The rule that shapes this file: the coach may say *what* was lost and *what*
// was better, because both are computed. It may not invent a reason it cannot
// verify. See contracts/coaching-and-modes.md.
// ============================================================

import { Chess } from 'chess.js';
import {
  PIECE_VALUES,
  PIECE_NAMES,
  squareToIBCA,
  evaluatePositionForColor,
  minimaxAlphaBeta,
} from './chess-engine';
import type { Color, PieceSymbol } from '@/types';

export type Classification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Centipawn-loss bands. A pawn is 100. These match the vocabulary mainstream
 *  analysis tools use, so "blunder" means to a player what they expect. */
export const BANDS: { min: number; label: Classification }[] = [
  { min: 300, label: 'blunder' },
  { min: 150, label: 'mistake' },
  { min: 50, label: 'inaccuracy' },
  { min: 1, label: 'good' },
  { min: 0, label: 'best' },
];

export function classify(centipawnLoss: number): Classification {
  const loss = Math.max(0, centipawnLoss);
  for (const band of BANDS) if (loss >= band.min) return band.label;
  return 'best';
}

export interface MoveAnalysis {
  classification: Classification;
  centipawnLoss: number;
  playedMove: string;
  bestMove: string | null;
  /** True when the player had no choice — criticising a forced move is nonsense. */
  forced: boolean;
  /** What the coach should say. Grounded: no motif it cannot verify. */
  spoken: string;
}

/** Score a position from `perspective`'s point of view, after a move has been
 *  made. Mate is worth more than any material. */
function scoreFor(game: Chess, perspective: Color, depth: number): number {
  if (game.isCheckmate()) {
    // The side to move is mated. Good for the other side.
    return game.turn() === perspective ? -100000 : 100000;
  }
  if (game.isDraw() || game.isStalemate()) return 0;
  if (depth <= 0) return evaluatePositionForColor(game, perspective);
  return minimaxAlphaBeta(game, depth, -Infinity, Infinity, false, perspective);
}

/**
 * Analyse one move played from `fenBefore`.
 *
 * Returns null when there is nothing to analyse — no move, or a move that is
 * not legal in that position. Garbage in, silence out; the coach says nothing
 * rather than something confident and wrong.
 */
/** Default search depth.
 *
 *  Measured on the queen-hang position (39 legal moves): depth 0 = 43ms,
 *  depth 1 = 277ms, depth 2 = 2491ms. Depth 2 produced *identical*
 *  classifications to depth 1 on every case tested — hung queen, mate found,
 *  mate missed, quiet opening — and differed only in which equally-reasonable
 *  alternative it named.
 *
 *  2.5 seconds of dead air before speech synthesis even starts is not a
 *  conversation, so the extra ply buys nothing a listener would notice and
 *  costs something they would. */
export const DEFAULT_DEPTH = 1;

export function analyseMove(
  fenBefore: string,
  playedSan: string,
  depth = DEFAULT_DEPTH,
): MoveAnalysis | null {
  let game: Chess;
  try {
    game = new Chess(fenBefore);
  } catch {
    return null;
  }

  const mover = game.turn() as Color;
  const legal = game.moves({ verbose: true });
  if (legal.length === 0) return null;

  const played = legal.find((m) => m.san === playedSan);
  if (!played) return null;

  // Case 3: one legal move is not a decision, so it cannot be a mistake.
  const forced = legal.length === 1;

  // Score the move the player actually made.
  game.move(played.san);
  const playedScore = scoreFor(game, mover, depth);
  game.undo();

  // Score every alternative to find the engine's best.
  let bestScore = -Infinity;
  let bestSan: string | null = null;
  for (const move of legal) {
    game.move(move.san);
    const score = scoreFor(game, mover, depth);
    game.undo();
    if (score > bestScore) {
      bestScore = score;
      bestSan = move.san;
    }
  }

  // Case 6: a shallow search can rate the played move above its own "best".
  // Clamping is what stops the coach insulting a move it simply did not see.
  const centipawnLoss = Math.max(0, Math.round(bestScore - playedScore));
  const classification = forced ? 'best' : classify(centipawnLoss);

  return {
    classification,
    centipawnLoss: forced ? 0 : centipawnLoss,
    playedMove: played.san,
    bestMove: bestSan,
    forced,
    spoken: speak({
      classification,
      centipawnLoss: forced ? 0 : centipawnLoss,
      forced,
      played,
      bestSan,
      fenBefore,
      mover,
    }),
  };
}

/** Phrase the verdict. Says what was lost and what was better — both computed —
 *  and never asserts a tactical motif the engine has not demonstrated. */
function speak(args: {
  classification: Classification;
  centipawnLoss: number;
  forced: boolean;
  played: { san: string; piece: PieceSymbol; to: string; captured?: PieceSymbol };
  bestSan: string | null;
  fenBefore: string;
  mover: Color;
}): string {
  const { classification, centipawnLoss, forced, played, bestSan } = args;

  const movedPiece = PIECE_NAMES[played.piece] ?? 'piece';
  const where = squareToIBCA(played.to);

  if (forced) {
    return `${capitalise(movedPiece)} to ${where} was forced — it was your only legal move.`;
  }

  if (classification === 'best') {
    return `${capitalise(movedPiece)} to ${where} was the best move in the position.`;
  }

  if (classification === 'good') {
    return `${capitalise(movedPiece)} to ${where} is fine. ${bestPhrase(bestSan)}`;
  }

  // For the three negative bands, quantify in pawns — a unit players think in.
  const pawns = (centipawnLoss / 100).toFixed(1).replace(/\.0$/, '');
  const severity =
    classification === 'blunder'
      ? 'That was a blunder'
      : classification === 'mistake'
        ? 'That was a mistake'
        : 'That was slightly inaccurate';

  return `${severity}. ${capitalise(movedPiece)} to ${where} gives up about ${pawns} ${
    pawns === '1' ? 'pawn' : 'pawns'
  } of advantage. ${bestPhrase(bestSan)}`;
}

function bestPhrase(bestSan: string | null): string {
  return bestSan ? `${bestSan} was stronger.` : '';
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Material swing of a single move, in centipawns. Used by the spoken summary
 *  when a capture is involved — a fact, not an interpretation. */
export function materialSwing(captured?: PieceSymbol): number {
  if (!captured) return 0;
  return PIECE_VALUES[captured] ?? 0;
}
