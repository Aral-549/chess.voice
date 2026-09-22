// ============================================================
// VoiceChessmate — captured material, derived from a position
//
// Taken from the FEN rather than tracked alongside it. A derived value cannot
// drift from the board: resume, undo and replay all produce the right answer
// without anyone remembering to update a second source of truth.
// ============================================================

import { PIECE_VALUES } from './chess-engine';
import type { PieceSymbol } from '@/types';

/** What each side starts with. */
const STARTING: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

/** Heaviest first, so a rail reads queen → rook → bishop → knight → pawn. */
export const CAPTURE_ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];

export interface CapturedSummary {
  /** Black pieces White has taken. */
  byWhite: PieceSymbol[];
  /** White pieces Black has taken. */
  byBlack: PieceSymbol[];
  /** Positive when White is ahead, in pawns. */
  materialAdvantage: number;
}

/**
 * Count captured material from the piece-placement field of a FEN.
 *
 * Promotions make this an approximation, and deliberately so: a promoted pawn
 * shows as "one pawn missing, one extra queen", which reads as a captured pawn
 * that was never captured. Every chess UI has this problem; the alternative is
 * replaying the whole game on every render. The material advantage stays
 * correct either way, which is the number a player actually uses.
 */
export function capturedFromFen(fen: string): CapturedSummary {
  const placement = (fen ?? '').split(' ')[0] ?? '';

  const present: Record<'w' | 'b', Record<string, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };

  for (const ch of placement) {
    if (!/[a-zA-Z]/.test(ch)) continue;
    const colour = ch === ch.toUpperCase() ? 'w' : 'b';
    const type = ch.toLowerCase();
    if (type in present[colour]) present[colour][type] += 1;
  }

  const missing = (colour: 'w' | 'b'): PieceSymbol[] => {
    const out: PieceSymbol[] = [];
    for (const type of CAPTURE_ORDER) {
      const gone = Math.max(0, STARTING[type] - (present[colour][type] ?? 0));
      for (let i = 0; i < gone; i++) out.push(type);
    }
    return out;
  };

  // A missing black piece was taken by White, and vice versa.
  const byWhite = missing('b');
  const byBlack = missing('w');

  const sum = (pieces: PieceSymbol[]) =>
    pieces.reduce((total, piece) => total + (PIECE_VALUES[piece] ?? 0), 0);

  return {
    byWhite,
    byBlack,
    // Centipawns to pawns — the unit shown next to a player's name.
    materialAdvantage: Math.round((sum(byWhite) - sum(byBlack)) / 100),
  };
}

/** Unicode glyph for a captured piece, always drawn in the taker's colour. */
export const PIECE_GLYPH: Record<PieceSymbol, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

/** Spoken/labelled name, for the rail's accessible text. */
export function describeCaptured(pieces: PieceSymbol[]): string {
  if (pieces.length === 0) return 'no pieces captured';

  const names: Record<PieceSymbol, [string, string]> = {
    p: ['pawn', 'pawns'],
    n: ['knight', 'knights'],
    b: ['bishop', 'bishops'],
    r: ['rook', 'rooks'],
    q: ['queen', 'queens'],
    k: ['king', 'kings'],
  };

  const counts = new Map<PieceSymbol, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);

  return CAPTURE_ORDER.filter((type) => counts.has(type))
    .map((type) => {
      const n = counts.get(type)!;
      return `${n} ${names[type][n === 1 ? 0 : 1]}`;
    })
    .join(', ');
}
