// ============================================================
// VoiceChessmate — play modes
//
// Blindfold and hands-free. Both are pure state machines so the rules can be
// tested without a board, a microphone or a browser.
//
// See contracts/coaching-and-modes.md sections 2 and 4.
// ============================================================

export type PlayMode = 'normal' | 'blindfold' | 'handsfree';

// ---------------------------------------------------------------- blindfold

export interface BlindfoldScore {
  movesPlayed: number;
  /** Moves naming a piece that is not on that square — the player lost the
   *  position in their head. This is the metric blindfold chess is actually
   *  about; losing on the board is a different skill. */
  positionErrors: number;
  /** Times the board was described on request. A crutch, not a failure. */
  assists: number;
  /** True once the player revealed the board. The attempt is over, the score
   *  is kept and marked. Peeking is allowed; pretending you did not is not. */
  broken: boolean;
}

export function newBlindfoldScore(): BlindfoldScore {
  return { movesPlayed: 0, positionErrors: 0, assists: 0, broken: false };
}

/** Why a move attempt failed, as far as blindfold scoring is concerned. */
export type AttemptOutcome =
  | 'played'
  /** The named piece is not on the named square: a memory failure. */
  | 'position-error'
  /** Legal square, illegal move, or simply unparsed — not a memory failure. */
  | 'other-rejection';

export function recordAttempt(
  score: BlindfoldScore,
  outcome: AttemptOutcome,
): BlindfoldScore {
  // Case 14: a legal move is never an error, whatever its quality.
  if (outcome === 'played') return { ...score, movesPlayed: score.movesPlayed + 1 };
  if (outcome === 'position-error') {
    return { ...score, positionErrors: score.positionErrors + 1 };
  }
  return score;
}

export function recordAssist(score: BlindfoldScore): BlindfoldScore {
  return { ...score, assists: score.assists + 1 };
}

/** Case 12/17: revealing the board ends the attempt but keeps the score. */
export function breakAttempt(score: BlindfoldScore): BlindfoldScore {
  return { ...score, broken: true };
}

/**
 * Spoken summary.
 *
 * Deliberately says "without the board", never anything about sight. For a
 * screen reader user the board is always effectively hidden, so framing this
 * as "experience what blind players experience" would be both wrong and
 * patronising. It is a training mode, announced as one.
 */
export function summariseBlindfold(score: BlindfoldScore): string {
  if (score.movesPlayed === 0 && score.positionErrors === 0) {
    return 'No moves played without the board.';
  }

  const moves = `${score.movesPlayed} ${score.movesPlayed === 1 ? 'move' : 'moves'} without the board`;

  const errors =
    score.positionErrors === 0
      ? 'You never lost track of a piece'
      : `You lost track of a piece ${score.positionErrors} ${
          score.positionErrors === 1 ? 'time' : 'times'
        }`;

  const assists =
    score.assists === 0 ? '' : ` You asked for the position ${score.assists} ${score.assists === 1 ? 'time' : 'times'}.`;

  const broken = score.broken ? ' You revealed the board, so this attempt is unranked.' : '';

  return `${moves}. ${errors}.${assists}${broken}`;
}

/**
 * Did this rejected move name a piece that is not where the player thinks?
 *
 * The signal is a square the player named as the *source*: if there is no
 * piece of the named type on it, the mental board has drifted. A move rejected
 * for any other reason (illegal but the piece is real, ambiguous phrasing,
 * unparsed speech) is not a memory failure and must not be scored as one.
 */
export function isPositionError(params: {
  /** Piece type the player named, if any: 'n', 'b', 'q'... */
  namedPiece?: string;
  /** Source square the player named, if any. */
  namedSquare?: string;
  /** What is actually on that square: piece type, or null if empty. */
  actualPieceOnSquare: string | null;
}): boolean {
  const { namedPiece, namedSquare, actualPieceOnSquare } = params;

  // No claim about a specific piece on a specific square — nothing to be wrong
  // about, so nothing to score.
  if (!namedPiece || !namedSquare) return false;

  return actualPieceOnSquare !== namedPiece;
}

// --------------------------------------------------------------- hands-free

export interface HandsFreePolicy {
  /** Server-side VAD decides turns instead of the J key. */
  continuousListening: boolean;
  /** Every spoken move must be confirmed before it touches the board. */
  requireConfirmation: boolean;
  /** The keyboard never goes away — it is the fallback when voice stops. */
  keyboardStillActive: boolean;
}

/**
 * Case 25, and the reason this mode is safe at all.
 *
 * Push-to-talk means the player chose to speak. Continuous listening means the
 * microphone decided. Under the governing rule — prefer no move over a wrong
 * move — that difference has to be paid for with an explicit confirmation on
 * every move, so ambient conversation cannot move a piece.
 */
export function policyFor(mode: PlayMode): HandsFreePolicy {
  if (mode === 'handsfree') {
    return {
      continuousListening: true,
      requireConfirmation: true,
      keyboardStillActive: true,
    };
  }
  return {
    continuousListening: false,
    requireConfirmation: false,
    keyboardStillActive: true,
  };
}

/** Turn-detection config sent to the agent. `input.turn_detection` is mutable
 *  mid-session, so a mode switch does not require a reconnect. */
export function turnDetectionFor(mode: PlayMode): Record<string, unknown> {
  return mode === 'handsfree'
    ? { type: 'server_vad', silence_duration_ms: 700 }
    : { type: 'manual' };
}
