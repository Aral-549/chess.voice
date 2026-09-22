// ============================================================
// VoiceChessmate — Tool Call Handlers
// Maps AssemblyAI tool_call events to chess engine operations
//
// Move matching: scores every legal move against the spoken
// description instead of parsing strings. Much more robust.
// ============================================================

import { ChessEngine, squareToIBCA } from './chess-engine';
import type {
  GetBoardStateArgs,
  GetLegalMovesArgs,
  ToolDefinition,
  Difficulty,
  ResolvedMove,
} from '@/types';

// --- Tool Definitions (sent in session.update) ---

export const CHESS_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'apply_move',
    description:
      'Apply a player\'s move to the board. Pass the move exactly as the player described it — the tool handles parsing. Returns a "narration" field that you MUST read aloud verbatim. The narration contains the player\'s confirmed move AND the opponent\'s responding move. Always read the full narration — the player cannot see the opponent\'s move.',
    parameters: {
      type: 'object',
      properties: {
        move_description: {
          type: 'string',
          description:
            'The move as the player described it, e.g. "knight to f3", "e4", "Eva 4", "take his bishop", "castle kingside". Pass the player\'s words directly, do not try to convert to SAN.',
        },
      },
      required: ['move_description'],
    },
  },
  {
    type: 'function',
    name: 'describe_board',
    description:
      'Describe the current board position for the player. Call this whenever the player asks to hear about the board — e.g. "describe", "describe the board", "position", "what do you see", "where is everything", "read the board", "scan", "layout", "setup", "where is my rook", "where are the pieces". Read the result aloud completely.',
    parameters: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          description:
            'Area to focus on. Use "tactical" for a fast blitz read (material, hanging pieces, free captures, mate) — prefer it when the player asks "how am I doing", "quick check", "anything hanging", or is playing fast. Use "full" for a complete 64-square scan. Others: "kingside", "queenside", "center", "threats", "my_pieces", "captures".',
          enum: ['tactical', 'full', 'kingside', 'queenside', 'center', 'threats', 'my_pieces', 'captures'],
        },
      },
    },
  },
  {
    type: 'function',
    name: 'get_legal_moves',
    description:
      'List legal moves for a piece or all pieces. Use when the player asks "what can I do?" or "where can my knight go?"',
    parameters: {
      type: 'object',
      properties: {
        piece_or_square: {
          type: 'string',
          description: 'A piece name ("knight"), a square ("e4"), or "all".',
        },
      },
    },
  },
  {
    type: 'function',
    name: 'get_hint',
    description:
      'Get a move suggestion. Use only when the player explicitly asks for help.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'undo_move',
    description: 'Take back the last move pair (player + opponent).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'set_difficulty',
    description:
      'Set the AI opponent difficulty level: "beginner", "intermediate", "advanced", or "master".',
    parameters: {
      type: 'object',
      properties: {
        difficulty: {
          type: 'string',
          description: 'The difficulty level.',
          enum: ['beginner', 'intermediate', 'advanced', 'master'],
        },
      },
      required: ['difficulty'],
    },
  },
  {
    type: 'function',
    name: 'resign_game',
    description:
      'Resign the chess game immediately in favor of the opponent. Use when the player says "I resign", "concede", "surrender", or asks to forfeit.',
    parameters: {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          description: 'Color resigning: "w" (White) or "b" (Black). Defaults to the active player.',
          enum: ['w', 'b'],
        },
      },
    },
  },
  {
    type: 'function',
    name: 'set_premove',
    description:
      'Queue a premove to be automatically executed as soon as the opponent completes their move, just like chess.com premoves. Use when the player says "premove [move]", "queue move [move]", or asks to set or cancel a premove.',
    parameters: {
      type: 'object',
      properties: {
        move_description: {
          type: 'string',
          description:
            'The move to premove, e.g. "knight to f3", "Eva 4", "e4", "take his bishop". Pass empty or omit if clearing.',
        },
        clear: {
          type: 'boolean',
          description: 'Set to true if the player asked to cancel or clear their premove.',
        },
      },
    },
  },
  {
    type: 'function',
    name: 'set_timer',
    description:
      'Configure chess timer or blitz mode. E.g. "set timer to 5 minutes", "blitz 3 minutes", "rapid 10 minutes", "bullet 1 minute", "casual mode", "untimed".',
    parameters: {
      type: 'object',
      properties: {
        minutes: {
          type: 'number',
          description: 'Time in minutes per player (e.g. 1, 3, 5, 10). Set to 0 for casual/untimed mode.',
        },
        increment: {
          type: 'number',
          description: 'Increment in seconds added per move (e.g. 0, 2, 5).',
        },
        mode: {
          type: 'string',
          description: 'Game mode: "casual", "bullet_1_0", "blitz_3_0", "blitz_3_2", "blitz_5_0", "rapid_10_0", or "custom".',
          enum: ['casual', 'bullet_1_0', 'blitz_3_0', 'blitz_3_2', 'blitz_5_0', 'rapid_10_0', 'custom'],
        },
      },
    },
  },
  {
    type: 'function',
    name: 'adjust_timer',
    description:
      'Add or subtract time from a clock. E.g. "add 1 minute to my clock", "give me 30 seconds", "add 2 minutes".',
    parameters: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'Number of seconds to add (or negative to subtract).',
        },
        color: {
          type: 'string',
          description: 'Color whose clock to adjust: "w" (White/player) or "b" (Black/coach).',
          enum: ['w', 'b'],
        },
      },
      required: ['seconds'],
    },
  },
  {
    type: 'function',
    name: 'control_timer',
    description:
      'Pause, resume, reset, or query the chess clock. E.g. "pause clock", "resume timer", "how much time do I have?", "check timer".',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform on the timer.',
          enum: ['pause', 'resume', 'reset', 'status', 'disable'],
        },
      },
      required: ['action'],
    },
  },
  {
    type: 'function',
    name: 'control_board',
    description:
      'Control visual board display. E.g. "flip board", "hide board", "show board".',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: "flip" (flip orientation), "show" (display board), or "hide" (hide board).',
          enum: ['flip', 'show', 'hide'],
        },
      },
      required: ['action'],
    },
  },
  {
    type: 'function',
    name: 'control_settings',
    description:
      'Adjust accessibility and app settings by voice. E.g. "turn on high contrast", "toggle contrast", "mute sound effects", "unmute sounds".',
    parameters: {
      type: 'object',
      properties: {
        setting: {
          type: 'string',
          description: 'The setting to modify.',
          enum: ['high_contrast', 'sound_cues', 'announce_captions'],
        },
        enable: {
          type: 'boolean',
          description: 'Whether to enable (true) or disable (false). Omit to toggle.',
        },
      },
      required: ['setting'],
    },
  },
  {
    type: 'function',
    name: 'reset_game',
    description:
      'Start a new game or reset the board. E.g. "new game", "start over", "reset game", "restart".',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];


// --- Engine Difficulty State ---
let currentDifficulty: Difficulty = 'intermediate';

export function setEngineDifficulty(difficulty: Difficulty): void {
  currentDifficulty = difficulty;
}

export function getEngineDifficulty(): Difficulty {
  return currentDifficulty;
}

// --- Fuzzy Move Matcher ---
// Instead of parsing natural language into SAN, score every legal move
// against the spoken description and pick the best match.

const PIECE_NAMES: Record<string, string> = {
  n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king', p: 'pawn',
};

const PIECE_ALIASES: Record<string, string> = {
  // Standard names
  knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k', pawn: 'p',
  // Common ASR mis-hearings
  night: 'n', nights: 'n', horse: 'n', nite: 'n', lite: 'n', kite: 'n',
  bish: 'b', fish: 'b', dish: 'b',
  castle: 'r', tower: 'r', rock: 'r', brook: 'r', roque: 'r',
  cream: 'q', keen: 'q', green: 'q', clean: 'q',
  // Abbreviations
  'the knight': 'n', 'the bishop': 'b', 'the rook': 'r', 'the queen': 'q', 'the king': 'k', 'the pawn': 'p',
  'my knight': 'n', 'my bishop': 'b', 'my rook': 'r', 'my queen': 'q', 'my king': 'k', 'my pawn': 'p',
};

// FIDE & International Braille Chess Association (IBCA) official phonetic file names
// Expanded with common ASR mis-transcriptions
const IBCA_FILES: Record<string, string> = {
  anna: 'a', ana: 'a', honour: 'a', honor: 'a', 'on a': 'a',
  bella: 'b', bela: 'b',
  cesar: 'c', caesar: 'c', ceasar: 'c', sees: 'c', 'sees are': 'c', 'c sir': 'c',
  david: 'd', dave: 'd', 'they would': 'd',
  eva: 'e', eve: 'e', ever: 'e', ava: 'e',
  felix: 'f', feel: 'f', phelix: 'f', phoenix: 'f',
  gustav: 'g', gustave: 'g', gust: 'g', goose: 'g',
  hector: 'h', 'heck tour': 'h', 'heck to': 'h', heater: 'h',
  // Direct letter names (ASR sometimes just outputs the letter)
  ay: 'a', bee: 'b', see: 'c', dee: 'd', ef: 'f', gee: 'g', aitch: 'h',
};

const NUMBER_WORDS: Record<string, string> = {
  one: '1', won: '1',
  two: '2', too: '2', tu: '2',
  three: '3', tree: '3', free: '3',
  four: '4', fore: '4', 'for a': '4',
  five: '5', hive: '5', fife: '5',
  six: '6', sic: '6',
  seven: '7',
  eight: '8', ate: '8', ait: '8',
};

export function normalizeIBCASpeech(raw: string): string {
  let s = raw.trim().toLowerCase();

  // Strip common filler/command words that add no chess meaning
  s = s.replace(/\b(please|play|move|go|put|place|make|do|try|let's|let me|i want|i'll|i will|wanna|gonna|um|uh|like|okay|ok|so|then|the|my|a|an)\b/g, ' ');

  // Direct word homophones before token splitting
  s = s.replace(/\bbefore\b/g, 'b4');
  s = s.replace(/\b(night|nite)\b/g, 'knight');

  // Convert number words e.g. "four" -> "4" (must come before IBCA to handle "Eva four")
  // Sort by length descending to match longer phrases first (e.g. "for a" before "four")
  const sortedNumbers = Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [word, digit] of sortedNumbers) {
    s = s.replace(new RegExp(`\\b${word.replace(/\s+/g, '\\s+')}\\b`, 'g'), digit);
  }

  // Convert IBCA file + rank (e.g. "eva 4" -> "e4", "felix 3" -> "f3", "gustav 1" -> "g1")
  // Sort IBCA entries by key length descending to prefer longer matches
  const sortedIBCA = Object.entries(IBCA_FILES).sort((a, b) => b[0].length - a[0].length);
  for (const [name, file] of sortedIBCA) {
    const pattern = new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\s*([1-8])\\b`, 'g');
    s = s.replace(pattern, `${file}$1`);
  }

  // Convert isolated IBCA file names (e.g. "knight on felix" -> "knight on f")
  for (const [name, file] of sortedIBCA) {
    if (name.length <= 1) continue; // Skip single letters to avoid false matches
    s = s.replace(new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'g'), file);
  }

  // Handle "letter space digit" → "letter+digit" (e.g. "e 4" → "e4", "f 3" → "f3", "b 4" -> "b4")
  s = s.replace(/\b([a-h])\s+([1-8])\b/g, '$1$2');

  // Handle "bee 4" / "b 4" -> "b4"
  s = s.replace(/\bb\s*4\b/g, 'b4');

  // Collapse excess whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

export function fuzzyMatchMove(description: string, engine: ChessEngine): { move: string; confidence: number } {
  // Normalize both IBCA phonetic speech ("Eva 4", "Felix 3") and standard algebraic speech ("e4", "f3")
  const s = normalizeIBCASpeech(description);
  const legalMoves = engine.getGameState().legalMoves;

  if (legalMoves.length === 0) {
    return { move: '', confidence: 0 };
  }

  // --- Direct SAN/UCI match first ---
  const directMatch = legalMoves.find(
    m => m.san.toLowerCase() === s || m.san === description.trim()
  );
  if (directMatch) return { move: directMatch.san, confidence: 1.0 };

  // UCI match (e.g., "e2e4", "g1f3")
  const uciClean = s.replace(/\s/g, '');
  const uciMatch = legalMoves.find(
    m => `${m.from}${m.to}` === uciClean
  );
  if (uciMatch) return { move: uciMatch.san, confidence: 1.0 };

  // --- Castling ---
  if (/castl\w*\s*(king|short)/i.test(s) || s === 'castle' || s === 'short castle' || /castle\s+kingside/i.test(s)) {
    const m = legalMoves.find(m => m.san === 'O-O');
    if (m) return { move: m.san, confidence: 1.0 };
  }
  if (/castl\w*\s*(queen|long)/i.test(s) || s === 'long castle' || /castle\s+queenside/i.test(s)) {
    const m = legalMoves.find(m => m.san === 'O-O-O');
    if (m) return { move: m.san, confidence: 1.0 };
  }

  // Target promotion piece from speech if any
  let targetPromotion: string | null = null;
  if (/\b(queen|cream|keen|clean)\b/i.test(s) || s.includes('=q')) {
    targetPromotion = 'q';
  } else if (/\b(rook|castle|tower|rock|brook)\b/i.test(s) || s.includes('=r')) {
    targetPromotion = 'r';
  } else if (/\b(bishop|bish|fish|dish)\b/i.test(s) || s.includes('=b')) {
    targetPromotion = 'b';
  } else if (/\b(knight|night|nite|horse)\b/i.test(s) || s.includes('=n')) {
    targetPromotion = 'n';
  }

  // --- Score every legal move against the description ---
  const scoredMoves: { move: typeof legalMoves[0]; score: number }[] = [];

  for (const move of legalMoves) {
    let score = 0;

    // Destination square mentioned? (+10)
    if (s.includes(move.to)) score += 10;

    // Source square mentioned? (+5)
    if (s.includes(move.from)) score += 5;

    // Source file mentioned? (e.g. "e takes d6")
    const sourceFile = move.from[0];
    if (new RegExp(`\\b${sourceFile}\\b`).test(s) && s.includes(move.to)) {
      score += 3;
    }

    // Piece name mentioned? (+8)
    const pieceName = PIECE_NAMES[move.piece];
    if (pieceName && s.includes(pieceName)) score += 8;

    // Check piece aliases
    for (const [alias, type] of Object.entries(PIECE_ALIASES)) {
      if (s.includes(alias) && move.piece === type) score += 8;
    }

    // Pawn promotion scoring
    if (move.promotion) {
      if (targetPromotion) {
        if (move.promotion === targetPromotion) {
          score += 15;
        } else {
          score -= 10;
        }
      } else {
        // Default to 'q' if a promotion move is requested without specifying a piece
        if (move.promotion === 'q') {
          score += 10;
        }
      }
      if (s.includes('promot')) {
        score += 5;
      }
    }

    // Capture mentioned and this is a capture? (+6)
    const captureWords = ['take', 'takes', 'capture', 'captures', 'x'];
    const mentionsCapture = captureWords.some(w => s.includes(w));
    if (mentionsCapture && move.captured) score += 6;
    if (mentionsCapture && !move.captured) score -= 3; // penalize non-captures when capture is mentioned

    // Captured piece type mentioned? (+4)
    if (move.captured) {
      const capturedName = PIECE_NAMES[move.captured];
      if (capturedName && s.includes(capturedName)) score += 4;
    }

    // Pawn moves: if no piece name is mentioned and destination is there, slight bonus (+2)
    if (move.piece === 'p' && !Object.keys(PIECE_ALIASES).some(a => s.includes(a))) {
      if (s.includes(move.to)) score += 2;
    }

    // If a piece is explicitly named in the input, penalize moves of different piece types
    const namedPieces = Object.entries(PIECE_ALIASES).filter(([alias]) => {
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      return regex.test(s);
    });
    if (namedPieces.length > 0 && !namedPieces.some(([, type]) => move.piece === type)) {
      score -= 15;
    }

    scoredMoves.push({ move, score });
  }

  scoredMoves.sort((a, b) => b.score - a.score);

  const bestScore = scoredMoves[0].score;
  const bestMove = scoredMoves[0].move;

  if (bestScore <= 0) {
    return { move: bestMove.san, confidence: 0.2 };
  }

  // Tie detection: if top candidate legal moves have the exact same top score
  const topCandidates = scoredMoves.filter(m => m.score === bestScore);
  if (topCandidates.length > 1) {
    return { move: bestMove.san, confidence: 0.5 };
  }

  const secondScore = scoredMoves.length > 1 ? scoredMoves[1].score : -Infinity;
  if (bestScore < 10 && secondScore > 0 && bestScore - secondScore < 3) {
    return { move: bestMove.san, confidence: 0.5 };
  }

  const confidence = bestScore >= 10 ? 0.9 : bestScore >= 5 ? 0.6 : 0.2;
  return { move: bestMove.san, confidence };
}

/** Confidence required before a move touches the board without confirmation.
 *  Premoves fire while the player is not listening, so they get the strict bar:
 *  prefer queueing nothing over queueing the wrong move. */
export const PREMOVE_MIN_CONFIDENCE = 0.9;

/** At or above this, a spoken move plays immediately without asking.
 *  0.9 means the destination square was named, the piece type agreed, and no other
 *  legal move tied for it — ambiguity already collapses to 0.5 and gets rejected.
 *  IBCA phonetic input ("knight to Felix 3") tops out at 0.9, so a stricter bar
 *  here would force confirmation on the app's primary input method. */
export const AUTOPLAY_MIN_CONFIDENCE = 0.9;
/** Below this, we don't even offer it — we read back legal options instead. */
export const CONFIRM_MIN_CONFIDENCE = 0.6;

/** Paranoid mode: confirm every spoken move that isn't exact notation (1.0).
 *  No confidence score can catch ASR hearing "a4" when you said "e4" — both are
 *  legal moves and score identically. Only asking, or typing, catches that.
 *  Off by default because it costs a word per move; on for games that matter. */
let confirmEverySpokenMove = false;

export function setConfirmEverySpokenMove(on: boolean): void {
  confirmEverySpokenMove = on;
}

export function getConfirmEverySpokenMove(): boolean {
  return confirmEverySpokenMove;
}

const YES_RE = /^(yes|yeah|yep|yup|yes please|confirm|confirmed|correct|right|affirmative|ok|okay|sure|do it|play it|go ahead)\b/i;
const NO_RE = /^(no|nope|nah|cancel|wrong|incorrect|negative|stop|don't|do not|never mind|nevermind)\b/i;

/** Spoken form of a move, for confirmation prompts. */
function describeSan(m: { piece: string; to: string; captured?: string; san: string }): string {
  if (m.san === 'O-O') return 'castle kingside';
  if (m.san === 'O-O-O') return 'castle queenside';
  const piece = PIECE_NAMES[m.piece] || 'piece';
  const target = squareToIBCA(m.to);
  return m.captured
    ? `${piece} takes ${PIECE_NAMES[m.captured] || 'piece'} on ${target}`
    : `${piece} to ${target}`;
}

function resolvePremove(
  engine: ChessEngine,
  spoken: string
): { ok: true; resolved: ResolvedMove } | { ok: false; narration: string } {
  const trimmed = spoken.trim();
  if (!trimmed) return { ok: false, narration: 'Please specify a move to premove.' };

  const { move, confidence } = fuzzyMatchMove(trimmed, engine);
  if (!move || confidence < PREMOVE_MIN_CONFIDENCE) {
    const options = engine.getGameState().legalMoves.slice(0, 5).map((m) => m.san).join(', ');
    return {
      ok: false,
      narration: `I'm not certain enough that "${trimmed}" means a specific move, so I did not queue it. Say it as exact notation, for example: ${options}.`,
    };
  }

  const legal = engine.getGameState().legalMoves.find((m) => m.san === move);
  if (!legal) return { ok: false, narration: `Could not queue "${trimmed}".` };

  return {
    ok: true,
    resolved: {
      from: legal.from,
      to: legal.to,
      promotion: legal.promotion,
      san: legal.san,
      spoken: trimmed,
    },
  };
}

// --- Tool Call Router ---

export function handleToolCall(
  engine: ChessEngine,
  toolName: string,
  args: Record<string, unknown>,
  onOpponentMoveOrDifficulty?: ((result: ReturnType<ChessEngine['makeEngineMove']>) => void) | Difficulty,
  difficultyArg?: Difficulty
): string {
  const t0 = Date.now();

  let onOpponentMove: ((result: ReturnType<ChessEngine['makeEngineMove']>) => void) | undefined;
  let activeDifficulty: Difficulty = currentDifficulty;

  if (typeof onOpponentMoveOrDifficulty === 'function') {
    onOpponentMove = onOpponentMoveOrDifficulty;
    if (difficultyArg) {
      activeDifficulty = difficultyArg;
    }
  } else if (typeof onOpponentMoveOrDifficulty === 'string') {
    activeDifficulty = onOpponentMoveOrDifficulty;
  }

  if (args.difficulty && typeof args.difficulty === 'string') {
    const valid: Difficulty[] = ['beginner', 'intermediate', 'advanced', 'master'];
    if (valid.includes(args.difficulty as Difficulty)) {
      activeDifficulty = args.difficulty as Difficulty;
    }
  }

  switch (toolName) {
    case 'apply_move':
    case 'validate_and_play_move': {
      const rawMove = (args.move_description || args.move || '') as string;
      const trimmed = rawMove.trim();

      // Handle empty move description
      if (!trimmed) {
        const narration = 'Please specify a move.';
        return JSON.stringify({
          success: false,
          clarificationNeeded: true,
          message: narration,
          narration,
          fen: engine.getGameState().fen,
        });
      }

      // A confirmation is outstanding: yes plays it, no discards it, anything
      // else is treated as a fresh move attempt (and drops the pending one).
      const awaiting = engine.getPendingConfirmation();
      if (awaiting) {
        if (NO_RE.test(trimmed)) {
          engine.clearPendingConfirmation();
          const narration = 'Cancelled. Nothing was played.';
          return JSON.stringify({ success: false, narration, fen: engine.getGameState().fen });
        }
        if (YES_RE.test(trimmed)) {
          const confirmed = engine.confirmPendingMove();
          if (!confirmed || !confirmed.success) {
            const narration = `${awaiting.san} is no longer legal. Nothing was played.`;
            return JSON.stringify({ success: false, narration, fen: engine.getGameState().fen });
          }
          if (confirmed.gameState.isGameOver) {
            return JSON.stringify({
              success: true,
              narration: confirmed.narration,
              your_move: confirmed.narration,
              fen: engine.getGameState().fen,
            });
          }
          const reply = engine.makeEngineMove(activeDifficulty);
          if (onOpponentMove) onOpponentMove(reply);
          return JSON.stringify({
            success: true,
            narration: reply.success ? reply.narration : 'Opponent has no legal moves.',
            your_move: confirmed.narration,
            opponent_move: reply.success ? reply.narration : 'Opponent has no moves.',
            fen: engine.getGameState().fen,
          });
        }
        engine.clearPendingConfirmation();
      }

      // Check for verbal resignation in move description
      if (
        /^(i\s+)?(resign|surrender|concede|forfeit)\b/i.test(trimmed) ||
        /\b(i\s+resign|i\s+surrender|i\s+forfeit|i\s+concede)\b/i.test(trimmed)
      ) {
        const resignResult = engine.resign();
        return JSON.stringify({
          success: resignResult.success,
          narration: resignResult.narration,
          gameOverReason: resignResult.gameOverReason,
          fen: engine.getGameState().fen,
          isGameOver: true,
        });
      }

      // Check for verbal difficulty setting in move description
      const diffMatch = trimmed.match(/^(?:set\s+)?(?:difficulty|level|bot\s+level|bot\s+difficulty)\s+(?:to\s+)?(beginner|intermediate|advanced|master)/i) ||
                        trimmed.match(/^(beginner|intermediate|advanced|master)\s+(?:difficulty|level|mode|bot)$/i);
      if (diffMatch) {
        const d = diffMatch[1].toLowerCase() as Difficulty;
        currentDifficulty = d;
        if (typeof (engine as unknown as { setDifficulty?: (d: Difficulty) => void }).setDifficulty === 'function') {
          (engine as unknown as { setDifficulty: (d: Difficulty) => void }).setDifficulty(d);
        }
        return JSON.stringify({
          success: true,
          difficulty: d,
          narration: `Engine difficulty set to ${d}.`,
        });
      }

      // Check for verbal premove in move description
      const premoveMatch = trimmed.match(/^(?:premove|pre-move|queue\s+move|queue)\s+(.+)$/i);
      if (premoveMatch) {
        const resolution = resolvePremove(engine, premoveMatch[1]);
        if (!resolution.ok) {
          return JSON.stringify({
            success: false,
            clarificationNeeded: true,
            narration: resolution.narration,
            fen: engine.getGameState().fen,
          });
        }
        const premoveRes = engine.setPremove(resolution.resolved);
        return JSON.stringify({
          success: true,
          narration: premoveRes.narration,
          premove: premoveRes.premove,
          fen: engine.getGameState().fen,
        });
      }
      if (/^(?:cancel|clear|remove)\s+(?:the\s+)?premove$/i.test(trimmed)) {
        const cancelRes = engine.clearPremove();
        return JSON.stringify({
          success: true,
          narration: cancelRes.narration,
          fen: engine.getGameState().fen,
        });
      }

      // Check for verbal timer & blitz controls
      const timerSetMatch = trimmed.match(/^(?:set\s+)?(?:timer|clock|blitz|rapid|bullet)\s+(?:to\s+)?(\d+)\s*(?:min|mins|minute|minutes)?(?:\s+(?:with\s+)?(\d+)\s*sec(?:ond)?\s*increment)?$/i) ||
                            trimmed.match(/^(\d+)\s*(?:min|mins|minute|minutes)\s+(?:blitz|rapid|bullet|timer|clock)$/i);
      if (timerSetMatch) {
        const mins = parseInt(timerSetMatch[1], 10);
        const inc = timerSetMatch[2] ? parseInt(timerSetMatch[2], 10) : 0;
        const mode = mins <= 1 ? 'bullet_1_0' : mins === 3 ? (inc === 2 ? 'blitz_3_2' : 'blitz_3_0') : mins === 5 ? 'blitz_5_0' : mins === 10 ? 'rapid_10_0' : 'custom';
        return JSON.stringify({
          success: true,
          timerAction: 'set',
          minutes: mins,
          increment: inc,
          mode,
          narration: `Timer set to ${mins} minute${mins === 1 ? '' : 's'}${inc ? ` with ${inc} second increment` : ''}.`,
          fen: engine.getGameState().fen,
        });
      }

      if (/^(?:pause|stop)\s+(?:the\s+)?(?:timer|clock)$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          timerAction: 'pause',
          narration: 'Chess clock paused.',
          fen: engine.getGameState().fen,
        });
      }

      if (/^(?:resume|start|unpause)\s+(?:the\s+)?(?:timer|clock)$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          timerAction: 'resume',
          narration: 'Chess clock resumed.',
          fen: engine.getGameState().fen,
        });
      }

      const addTimeMatch = trimmed.match(/^add\s+(\d+)\s*(sec|second|seconds|min|minute|minutes)(?:\s+(?:to\s+)?(my|white|black|opponent's)\s+(?:clock|time))?$/i);
      if (addTimeMatch) {
        const num = parseInt(addTimeMatch[1], 10);
        const unit = addTimeMatch[2].toLowerCase();
        const seconds = unit.startsWith('min') ? num * 60 : num;
        const targetColor = (addTimeMatch[3] && /black|opponent/i.test(addTimeMatch[3])) ? 'b' : 'w';
        return JSON.stringify({
          success: true,
          timerAction: 'adjust',
          seconds,
          color: targetColor,
          narration: `Added ${num} ${unit} to ${targetColor === 'w' ? 'your' : "the coach's"} clock.`,
          fen: engine.getGameState().fen,
        });
      }

      if (/^(?:how\s+much\s+time|check\s+time|time\s+left|check\s+clock)$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          timerAction: 'status',
          narration: 'Checking time.',
          fen: engine.getGameState().fen,
        });
      }

      if (/^(?:casual|untimed|disable\s+timer|turn\s+off\s+clock)\s*(?:mode)?$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          timerAction: 'disable',
          mode: 'casual',
          narration: 'Switched to casual untimed mode. Clock disabled.',
          fen: engine.getGameState().fen,
        });
      }

      // Check for verbal board controls
      if (/^(?:flip|turn)\s+(?:the\s+)?board$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          boardAction: 'flip',
          narration: 'Flipped board perspective.',
          fen: engine.getGameState().fen,
        });
      }
      if (/^(?:hide|close)\s+(?:the\s+)?board$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          boardAction: 'hide',
          narration: 'Visual board hidden.',
          fen: engine.getGameState().fen,
        });
      }
      if (/^(?:show|open|view)\s+(?:the\s+)?board$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          boardAction: 'show',
          narration: 'Visual board displayed.',
          fen: engine.getGameState().fen,
        });
      }

      // Check for verbal settings controls
      if (/^(?:toggle|turn\s+on|turn\s+off|enable|disable)?\s*high\s*contrast$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          settingsAction: 'high_contrast',
          narration: 'Toggled high contrast mode.',
          fen: engine.getGameState().fen,
        });
      }
      if (/^(?:toggle|mute|unmute)?\s*(?:sound|sounds|sound\s*cues|audio\s*cues)$/i.test(trimmed)) {
        return JSON.stringify({
          success: true,
          settingsAction: 'sound_cues',
          narration: 'Toggled sound cues.',
          fen: engine.getGameState().fen,
        });
      }

      // Check for verbal new game / reset
      if (/^(?:new\s+game|start\s+(?:a\s+)?new\s+game|restart\s+(?:the\s+)?game|reset\s+(?:the\s+)?game|start\s+over)$/i.test(trimmed)) {
        engine.reset();
        return JSON.stringify({
          success: true,
          resetGame: true,
          narration: 'Started a new game. Board is reset. You are White.',
          fen: engine.getGameState().fen,
        });
      }

      const { move, confidence } = fuzzyMatchMove(rawMove, engine);
      console.log(`[Move] "${rawMove}" → "${move}" (confidence: ${confidence}) [${Date.now() - t0}ms]`);

      if (!move || engine.getGameState().legalMoves.length === 0) {
        engine.clearPendingConfirmation();
        const narration = 'No legal moves available. The game may be over.';
        return JSON.stringify({
          success: false,
          clarificationNeeded: true,
          message: narration,
          narration,
          fen: engine.getGameState().fen,
        });
      }

      if (confidence < CONFIRM_MIN_CONFIDENCE) {
        // Too vague to act on at all — read back real options rather than guess.
        engine.clearPendingConfirmation();
        const suggestions = engine.getGameState().legalMoves.slice(0, 5).map(m => m.san);
        const narration = `I'm not sure which move you mean by "${rawMove}". Some options are: ${suggestions.join(', ')}. Could you be more specific?`;
        return JSON.stringify({
          success: false,
          clarificationNeeded: true,
          message: narration,
          narration,
          fen: engine.getGameState().fen,
        });
      }

      const needsConfirmation = confirmEverySpokenMove
        ? confidence < 1.0
        : confidence < AUTOPLAY_MIN_CONFIDENCE;

      if (needsConfirmation) {
        // Probably right, not certainly right. A wrong move is unrecoverable, so
        // hold it and ask. The board is NOT touched until the player says yes.
        const legal = engine.getGameState().legalMoves.find(m => m.san === move);
        if (legal) {
          engine.setPendingConfirmation({
            from: legal.from,
            to: legal.to,
            promotion: legal.promotion,
            san: legal.san,
            spoken: trimmed,
          });
          const narration = `Did you mean ${describeSan(legal)}? Say yes to play it, or no to cancel.`;
          return JSON.stringify({
            success: false,
            confirmationNeeded: true,
            pending: legal.san,
            message: narration,
            narration,
            fen: engine.getGameState().fen,
          });
        }
      }

      engine.clearPendingConfirmation();
      const result = engine.makeMove(move);

      if (!result.success) {
        const narration = result.narration || result.error || 'Invalid move.';
        return JSON.stringify({
          success: false,
          clarificationNeeded: true,
          message: narration,
          narration,
          error: result.error,
          fen: engine.getGameState().fen,
        });
      }

      if (result.gameState.isGameOver) {
        return JSON.stringify({
          success: true,
          narration: result.narration,
          your_move: result.narration,
          fen: engine.getGameState().fen,
        });
      }

      // Opponent responds immediately
      const opponentResult = engine.makeEngineMove(activeDifficulty);
      if (onOpponentMove) onOpponentMove(opponentResult);

      // Execute a queued premove. The squares were pinned when it was queued, so
      // this is a pure legality check against the new position — never a re-match.
      let premoveNarration = '';
      if (engine.getPremove() && opponentResult.success && !engine.getGameState().isGameOver) {
        const premove = engine.tryExecutePremove();
        if (premove.played) {
          premoveNarration = ` Your premove: ${premove.narration}`;
          if (!engine.getGameState().isGameOver) {
            const secondOpponentResult = engine.makeEngineMove(activeDifficulty);
            if (onOpponentMove) onOpponentMove(secondOpponentResult);
            if (secondOpponentResult.success) {
              premoveNarration += ` Opponent responds: ${secondOpponentResult.narration}`;
            }
          }
        } else {
          premoveNarration = ` ${premove.narration}`;
        }
      }

      // Announce ONLY the opponent's reply. The player just spoke their own move —
      // repeating it back wastes seconds that matter in blitz. Their move is echoed
      // in `your_move` for the UI, not in the spoken narration.
      const fullNarration = opponentResult.success
        ? `${opponentResult.narration}${premoveNarration}`
        : 'Opponent has no legal moves.';

      const response = {
        success: true,
        // narration is the PRIMARY field — the system prompt tells the agent to read this verbatim
        narration: fullNarration,
        your_move: result.narration,
        opponent_move: opponentResult.success ? opponentResult.narration : 'Opponent has no moves.',
        premove_executed: !!premoveNarration,
        fen: engine.getGameState().fen,
      };

      console.log(`[Move complete] [${Date.now() - t0}ms]`);
      return JSON.stringify(response);
    }

    case 'describe_board':
    case 'get_board_state': {
      const { focus = 'full' } = args as unknown as GetBoardStateArgs;
      const description = engine.describeBoardState(focus);
      return JSON.stringify({ description: description.description });
    }

    case 'get_legal_moves': {
      const { piece_or_square = 'all' } = args as unknown as GetLegalMovesArgs;
      const moves = engine.getLegalMoves(piece_or_square);
      return JSON.stringify({ moves });
    }

    case 'get_hint':
    case 'get_engine_suggestion': {
      const evaluation = engine.getSimpleEvaluation();
      return JSON.stringify(evaluation);
    }

    case 'undo_move':
    case 'undo_last_move': {
      engine.undoMove(); // undo opponent
      const result = engine.undoMove(); // undo player
      return JSON.stringify({
        success: result.success,
        narration: result.narration,
        fen: engine.getGameState().fen,
      });
    }

    case 'set_difficulty':
    case 'change_difficulty': {
      const targetDiff = (args.difficulty || args.level) as Difficulty;
      const validDiffs: Difficulty[] = ['beginner', 'intermediate', 'advanced', 'master'];
      if (validDiffs.includes(targetDiff)) {
        currentDifficulty = targetDiff;
        return JSON.stringify({
          success: true,
          difficulty: targetDiff,
          narration: `Engine difficulty set to ${targetDiff}.`,
        });
      }
      return JSON.stringify({
        success: false,
        error: `Invalid difficulty: ${targetDiff}. Valid options are: beginner, intermediate, advanced, master.`,
        narration: `Invalid difficulty: ${targetDiff}. Valid options are: beginner, intermediate, advanced, or master.`,
      });
    }

    case 'resign_game':
    case 'resign': {
      const color = args.color as 'w' | 'b' | undefined;
      const resignResult = engine.resign(color);
      return JSON.stringify({
        success: resignResult.success,
        narration: resignResult.narration,
        gameOverReason: resignResult.gameOverReason,
        fen: engine.getGameState().fen,
        isGameOver: true,
      });
    }

    case 'set_premove':
    case 'queue_premove': {
      if (args.clear) {
        const clearRes = engine.clearPremove();
        return JSON.stringify({
          success: true,
          narration: clearRes.narration,
          fen: engine.getGameState().fen,
        });
      }
      const moveDesc = (args.move_description || args.move || '') as string;
      const resolution = resolvePremove(engine, moveDesc);
      if (!resolution.ok) {
        return JSON.stringify({
          success: false,
          clarificationNeeded: true,
          narration: resolution.narration,
          fen: engine.getGameState().fen,
        });
      }
      const premoveRes = engine.setPremove(resolution.resolved);
      return JSON.stringify({
        success: premoveRes.success,
        narration: premoveRes.narration,
        premove: premoveRes.premove,
        fen: engine.getGameState().fen,
      });
    }

    case 'set_timer': {
      const mins = typeof args.minutes === 'number' ? args.minutes : 0;
      const inc = typeof args.increment === 'number' ? args.increment : 0;
      const mode = (args.mode as string) || (mins === 0 ? 'casual' : mins <= 1 ? 'bullet_1_0' : mins === 3 ? (inc === 2 ? 'blitz_3_2' : 'blitz_3_0') : mins === 5 ? 'blitz_5_0' : mins === 10 ? 'rapid_10_0' : 'custom');
      return JSON.stringify({
        success: true,
        timerAction: 'set',
        minutes: mins,
        increment: inc,
        mode,
        narration: mins === 0 ? 'Casual mode enabled. Clock disabled.' : `Timer set to ${mins} minute${mins === 1 ? '' : 's'}${inc ? ` with ${inc} second increment` : ''}.`,
        fen: engine.getGameState().fen,
      });
    }

    case 'adjust_timer': {
      const seconds = typeof args.seconds === 'number' ? args.seconds : 0;
      const color = (args.color as 'w' | 'b') || 'w';
      return JSON.stringify({
        success: true,
        timerAction: 'adjust',
        seconds,
        color,
        narration: `${seconds >= 0 ? 'Added' : 'Subtracted'} ${Math.abs(seconds)} seconds ${seconds >= 0 ? 'to' : 'from'} ${color === 'w' ? 'your' : "the coach's"} clock.`,
        fen: engine.getGameState().fen,
      });
    }

    case 'control_timer': {
      const action = (args.action as string) || 'status';
      return JSON.stringify({
        success: true,
        timerAction: action,
        narration:
          action === 'pause'
            ? 'Chess clock paused.'
            : action === 'resume'
            ? 'Chess clock resumed.'
            : action === 'reset'
            ? 'Chess clock reset to starting time.'
            : action === 'disable'
            ? 'Timer disabled. Switched to casual untimed mode.'
            : 'Clock status checked.',
        fen: engine.getGameState().fen,
      });
    }

    case 'control_board': {
      const action = (args.action as string) || 'show';
      return JSON.stringify({
        success: true,
        boardAction: action,
        narration:
          action === 'flip'
            ? 'Flipped board perspective.'
            : action === 'hide'
            ? 'Visual board hidden.'
            : 'Visual board displayed.',
        fen: engine.getGameState().fen,
      });
    }

    case 'control_settings': {
      const setting = (args.setting as string) || 'high_contrast';
      const enable = args.enable as boolean | undefined;
      return JSON.stringify({
        success: true,
        settingsAction: setting,
        enable,
        narration: `Updated ${setting.replace('_', ' ')} setting.`,
        fen: engine.getGameState().fen,
      });
    }

    case 'reset_game': {
      engine.reset();
      return JSON.stringify({
        success: true,
        resetGame: true,
        narration: 'Started a new game. Board is reset. You are White.',
        fen: engine.getGameState().fen,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
