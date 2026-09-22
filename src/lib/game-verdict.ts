// ============================================================
// VoiceChessmate — Game-over verdict
//
// One place decides whether the player won, lost, or drew. It exists as a pure
// function because the verdict drives the *audio* verdict, and this app is used
// by people who cannot see the board: an incorrect sound here tells a blind
// player they won a game they lost, with nothing on screen to correct it.
//
// See BUGLOG 2026-09-22 "Defeat announced as victory".
// ============================================================

import type { Color } from '@/types';

export type Verdict = 'victory' | 'defeat' | 'draw';

export interface VerdictInput {
  isGameOver: boolean;
  isCheckmate?: boolean;
  isDraw?: boolean;
  isStalemate?: boolean;
  /**
   * Whose turn it is *after* the final move. On checkmate this is the side
   * that has no legal reply — i.e. the loser.
   */
  turn?: Color;
  /** Side that resigned, when the game ended by resignation. */
  resignedColor?: Color;
  /** The human player's colour. White by default in this app. */
  playerColor?: Color;
}

/**
 * Returns the player's verdict, or `null` when the game is not over or the
 * outcome cannot be determined from the snapshot.
 *
 * `null` is deliberate: it means "say nothing". Consistent with the project's
 * governing rule — prefer no announcement over a wrong one.
 */
export function gameOverVerdict(input: VerdictInput): Verdict | null {
  const { isGameOver, isCheckmate, isDraw, isStalemate, turn, resignedColor } = input;
  const playerColor: Color = input.playerColor ?? 'w';

  if (!isGameOver) return null;

  // Resignation is unambiguous and takes precedence: a player can resign in a
  // position that is not otherwise terminal.
  if (resignedColor) {
    return resignedColor === playerColor ? 'defeat' : 'victory';
  }

  // Stalemate is a draw, and is checked before checkmate because a position
  // cannot be both — but a malformed snapshot could set both flags, and a draw
  // is the safer of the two to announce.
  if (isStalemate || isDraw) return 'draw';

  if (isCheckmate) {
    if (!turn) return null; // cannot tell who was mated — say nothing
    // `turn` is the side to move with no legal reply: the loser.
    return turn === playerColor ? 'defeat' : 'victory';
  }

  // Game is over for a reason this function does not model (timeout handled by
  // the clock, abandonment, etc.). Say nothing rather than guess.
  return null;
}
