// ============================================================
// VoiceChessmate — Chess Engine (chess.js wrapper)
// Manages game state, move validation, and board narration
// ============================================================

import { Chess, Square, Move, Color, PieceSymbol } from 'chess.js';
import type { GameState, MoveResult, ResolvedMove, BoardDescription, Difficulty } from '@/types';

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const FILE_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANK_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8'];

// Official FIDE and International Braille Chess Association (IBCA) standard phonetic files
export const IBCA_FILE_NAMES: Record<string, string> = {
  a: 'Anna',
  b: 'Bella',
  c: 'Cesar',
  d: 'David',
  e: 'Eva',
  f: 'Felix',
  g: 'Gustav',
  h: 'Hector',
};

export function squareToIBCA(square: string): string {
  if (!square || square.length < 2) return square;
  const file = square[0].toLowerCase();
  const rank = square[1];
  const name = IBCA_FILE_NAMES[file];
  return name ? `${name} ${rank}` : square;
}

// Centipawn piece values for engine evaluation
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-Square Tables (PST) from White's perspective:
// Indexed by rank (0 = Rank 1, 7 = Rank 8) and file (0 = a, 7 = h).
// For Black, rank index is mirrored: 7 - rank.
const PST_PAWN: number[][] = [
  [  0,   0,   0,   0,   0,   0,   0,   0], // Rank 1
  [  5,  10,  10, -20, -20,  10,  10,   5], // Rank 2
  [  5,  -5, -10,   0,   0, -10,  -5,   5], // Rank 3
  [  0,   0,   0,  20,  20,   0,   0,   0], // Rank 4
  [  5,   5,  10,  25,  25,  10,   5,   5], // Rank 5
  [ 10,  10,  20,  30,  30,  20,  10,  10], // Rank 6
  [ 50,  50,  50,  50,  50,  50,  50,  50], // Rank 7
  [  0,   0,   0,   0,   0,   0,   0,   0], // Rank 8
];

const PST_KNIGHT: number[][] = [
  [-50, -40, -30, -30, -30, -30, -40, -50], // Rank 1
  [-40, -20,   0,   5,   5,   0, -20, -40], // Rank 2
  [-30,   5,  10,  15,  15,  10,   5, -30], // Rank 3
  [-30,   0,  15,  20,  20,  15,   0, -30], // Rank 4
  [-30,   5,  15,  20,  20,  15,   5, -30], // Rank 5
  [-30,   0,  10,  15,  15,  10,   0, -30], // Rank 6
  [-40, -20,   0,   0,   0,   0, -20, -40], // Rank 7
  [-50, -40, -30, -30, -30, -30, -40, -50], // Rank 8
];

const PST_BISHOP: number[][] = [
  [-20, -10, -10, -10, -10, -10, -10, -20], // Rank 1
  [-10,   5,   0,   0,   0,   0,   5, -10], // Rank 2
  [-10,  10,  10,  10,  10,  10,  10, -10], // Rank 3
  [-10,   0,  10,  10,  10,  10,   0, -10], // Rank 4
  [-10,   5,   5,  10,  10,   5,   5, -10], // Rank 5
  [-10,   0,   5,  10,  10,   5,   0, -10], // Rank 6
  [-10,   0,   0,   0,   0,   0,   0, -10], // Rank 7
  [-20, -10, -10, -10, -10, -10, -10, -20], // Rank 8
];

const PST_ROOK: number[][] = [
  [  0,   0,   0,   5,   5,   0,   0,   0], // Rank 1
  [ -5,   0,   0,   0,   0,   0,   0,  -5], // Rank 2
  [ -5,   0,   0,   0,   0,   0,   0,  -5], // Rank 3
  [ -5,   0,   0,   0,   0,   0,   0,  -5], // Rank 4
  [ -5,   0,   0,   0,   0,   0,   0,  -5], // Rank 5
  [ -5,   0,   0,   0,   0,   0,   0,  -5], // Rank 6
  [  5,  10,  10,  10,  10,  10,  10,   5], // Rank 7
  [  0,   0,   0,   0,   0,   0,   0,   0], // Rank 8
];

const PST_QUEEN: number[][] = [
  [-20, -10, -10,  -5,  -5, -10, -10, -20], // Rank 1
  [-10,   0,   5,   0,   0,   0,   0, -10], // Rank 2
  [-10,   5,   5,   5,   5,   5,   0, -10], // Rank 3
  [  0,   0,   5,   5,   5,   5,   0,  -5], // Rank 4
  [ -5,   0,   5,   5,   5,   5,   0,  -5], // Rank 5
  [-10,   0,   5,   5,   5,   5,   0, -10], // Rank 6
  [-10,   0,   0,   0,   0,   0,   0, -10], // Rank 7
  [-20, -10, -10,  -5,  -5, -10, -10, -20], // Rank 8
];

const PST_KING: number[][] = [
  [ 20,  30,  10,   0,   0,  10,  30,  20], // Rank 1
  [ 20,  20,   0,   0,   0,   0,  20,  20], // Rank 2
  [-10, -20, -20, -20, -20, -20, -20, -10], // Rank 3
  [-20, -30, -30, -40, -40, -30, -30, -20], // Rank 4
  [-30, -40, -40, -50, -50, -40, -40, -30], // Rank 5
  [-30, -40, -40, -50, -50, -40, -40, -30], // Rank 6
  [-30, -40, -40, -50, -50, -40, -40, -30], // Rank 7
  [-30, -40, -40, -50, -50, -40, -40, -30], // Rank 8
];

export function evaluatePositionForColor(game: Chess, perspective: Color): number {
  if (game.isCheckmate()) {
    return game.turn() === perspective ? -30000 : 30000;
  }
  if (game.isDraw() || game.isStalemate()) {
    return 0;
  }

  const board = game.board();
  let whiteScore = 0;
  let blackScore = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;

      const rankIdx = 7 - r;
      const fileIdx = f;
      const pieceRank = piece.color === 'w' ? rankIdx : 7 - rankIdx;

      let pst = 0;
      switch (piece.type) {
        case 'p': pst = PST_PAWN[pieceRank][fileIdx]; break;
        case 'n': pst = PST_KNIGHT[pieceRank][fileIdx]; break;
        case 'b': pst = PST_BISHOP[pieceRank][fileIdx]; break;
        case 'r': pst = PST_ROOK[pieceRank][fileIdx]; break;
        case 'q': pst = PST_QUEEN[pieceRank][fileIdx]; break;
        case 'k': pst = PST_KING[pieceRank][fileIdx]; break;
      }

      const totalVal = PIECE_VALUES[piece.type] + pst;
      if (piece.color === 'w') {
        whiteScore += totalVal;
      } else {
        blackScore += totalVal;
      }
    }
  }

  return perspective === 'w' ? whiteScore - blackScore : blackScore - whiteScore;
}

export function minimaxAlphaBeta(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  rootColor: Color
): number {
  if (depth <= 0) {
    return evaluatePositionForColor(game, rootColor);
  }

  const moves = game.moves({ verbose: true });
  if (moves.length === 0) {
    if (game.isCheck()) {
      return isMaximizing ? -30000 : 30000;
    }
    return 0;
  }

  // Move ordering: captures and checks first to optimize alpha-beta cutoffs
  moves.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    if (a.captured) scoreA += PIECE_VALUES[a.captured] * 10 - PIECE_VALUES[a.piece];
    if (a.san.includes('+')) scoreA += 50;
    if (a.promotion) scoreA += 800;
    if (a.to === 'd4' || a.to === 'e4' || a.to === 'd5' || a.to === 'e5') scoreA += 20;

    if (b.captured) scoreB += PIECE_VALUES[b.captured] * 10 - PIECE_VALUES[b.piece];
    if (b.san.includes('+')) scoreB += 50;
    if (b.promotion) scoreB += 800;
    if (b.to === 'd4' || b.to === 'e4' || b.to === 'd5' || b.to === 'e5') scoreB += 20;

    return scoreB - scoreA;
  });

  const candidateMoves = moves.length > 15 ? moves.slice(0, 15) : moves;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of candidateMoves) {
      game.move(move.san);
      const evalScore = minimaxAlphaBeta(game, depth - 1, alpha, beta, false, rootColor);
      game.undo();
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of candidateMoves) {
      game.move(move.san);
      const evalScore = minimaxAlphaBeta(game, depth - 1, alpha, beta, true, rootColor);
      game.undo();
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export class ChessEngine {
  private game: Chess;
  private moveHistory: Move[] = [];
  private capturedPieces: { white: PieceSymbol[]; black: PieceSymbol[] } = {
    white: [],
    black: [],
  };
  private isResigned = false;
  private resignedColor: Color | null = null;
  private pendingPremove: ResolvedMove | null = null;
  private pendingConfirmation: ResolvedMove | null = null;
  private terseNarration = false;
  private difficulty: Difficulty = 'intermediate';

  constructor(fen?: string) {
    this.game = new Chess(fen);
  }

  setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
  }

  getDifficulty(): Difficulty {
    return this.difficulty;
  }

  // --- State ---

  getGameState(): GameState {
    const history = this.game.history({ verbose: true });
    const lastMove = history.length > 0 ? history[history.length - 1] : null;

    return {
      fen: this.game.fen(),
      pgn: this.game.pgn(),
      turn: this.game.turn(),
      moveNumber: Math.ceil(history.length / 2) + 1,
      isCheck: this.isResigned ? false : this.game.isCheck(),
      isCheckmate: this.isResigned ? false : this.game.isCheckmate(),
      isDraw: this.isResigned ? false : this.game.isDraw(),
      isStalemate: this.isResigned ? false : this.game.isStalemate(),
      isGameOver: this.isResigned || this.game.isGameOver(),
      lastMove,
      legalMoves: this.isResigned ? [] : this.game.moves({ verbose: true }),
      capturedPieces: {
        white: [...this.capturedPieces.white],
        black: [...this.capturedPieces.black],
      },
      premove: this.pendingPremove?.san ?? null,
    };
  }

  // --- Premove Support (Chess.com style voice premoving) ---

  /** Queue a premove that has ALREADY been resolved to concrete squares.
   *  Storing squares rather than the spoken words is the whole point: the board
   *  changes before a premove fires, so re-interpreting the words later can resolve
   *  to a different piece's move than the one the player meant. */
  setPremove(resolved: ResolvedMove): { success: boolean; narration: string; premove: string } {
    this.pendingPremove = resolved;
    return {
      success: true,
      narration: `Premove queued: ${resolved.san}. It will play automatically if it is still legal after the opponent moves.`,
      premove: resolved.san,
    };
  }

  getPremove(): ResolvedMove | null {
    return this.pendingPremove;
  }

  // --- Pending Confirmation (moderate-confidence speech) ---
  // A move we think we understood but won't play unheard. Same square-pinning
  // rule as premoves: store the squares, never the words.

  setPendingConfirmation(resolved: ResolvedMove): void {
    this.pendingConfirmation = resolved;
  }

  getPendingConfirmation(): ResolvedMove | null {
    return this.pendingConfirmation;
  }

  clearPendingConfirmation(): void {
    this.pendingConfirmation = null;
  }

  /** Play the awaiting-confirmation move, if those squares are still legal. */
  confirmPendingMove(): MoveResult | null {
    const pending = this.pendingConfirmation;
    this.pendingConfirmation = null;
    if (!pending) return null;

    const match = this.game.moves({ verbose: true }).find(
      (m) =>
        m.from === pending.from &&
        m.to === pending.to &&
        (pending.promotion ? m.promotion === pending.promotion : !m.promotion)
    );
    if (!match) return null;
    return this.makeMove(match.san);
  }

  /** Play the queued premove only if those exact squares are still legal.
   *  Never re-matches and never substitutes — an unplayable premove is discarded. */
  tryExecutePremove(): { played: boolean; narration: string; result?: MoveResult } {
    const queued = this.pendingPremove;
    if (!queued) return { played: false, narration: '' };

    this.pendingPremove = null;
    this.pendingConfirmation = null;

    const match = this.game.moves({ verbose: true }).find(
      (m) =>
        m.from === queued.from &&
        m.to === queued.to &&
        (queued.promotion ? m.promotion === queued.promotion : !m.promotion)
    );
    if (!match) {
      return { played: false, narration: `Premove ${queued.san} is no longer legal. Cancelled.` };
    }

    const result = this.makeMove(match.san);
    return result.success
      ? { played: true, narration: result.narration, result }
      : { played: false, narration: `Premove ${queued.san} could not be played. Cancelled.` };
  }

  clearPremove(): { success: boolean; narration: string } {
    const hadPremove = !!this.pendingPremove;
    this.pendingPremove = null;
    return {
      success: true,
      narration: hadPremove ? 'Active premove has been cancelled.' : 'No active premove to cancel.',
    };
  }

  // --- Resignation ---

  resign(color?: 'w' | 'b'): GameState & {
    success: boolean;
    narration: string;
    gameOverReason: string;
    gameState: GameState;
  } {
    const state = this.getGameState();
    if (state.isGameOver) {
      const gameOverReason = this.describeGameOver();
      return {
        ...state,
        success: false,
        narration: gameOverReason,
        gameOverReason,
        gameState: state,
      };
    }

    const resigningColor: Color = color ?? this.game.turn();
    this.isResigned = true;
    this.resignedColor = resigningColor;

    const winnerColor: Color = resigningColor === 'w' ? 'b' : 'w';
    const resignedName = resigningColor === 'w' ? 'White' : 'Black';
    const winnerName = winnerColor === 'w' ? 'White' : 'Black';
    const narration = `${resignedName} resigns. ${winnerName} wins by resignation.`;
    const newState = this.getGameState();

    return {
      ...newState,
      success: true,
      narration,
      gameOverReason: narration,
      gameState: newState,
    };
  }

  // --- Move Execution ---

  makeMove(moveInput: string): MoveResult {
    const state = this.getGameState();
    if (state.isGameOver) {
      return {
        success: false,
        error: this.describeGameOver(),
        gameState: state,
        narration: this.describeGameOver(),
      };
    }

    try {
      // chess.js accepts SAN ("Nf3"), UCI ("g1f3"), and object notation
      const move = this.game.move(moveInput);
      if (!move) {
        return {
          success: false,
          error: `Invalid move: "${moveInput}". It's ${state.turn === 'w' ? "white" : "black"}'s turn.`,
          gameState: this.getGameState(),
          narration: `That move is not legal. ${this.suggestSimilarMoves(moveInput)}`,
        };
      }

      // Track captures
      if (move.captured) {
        const capturingColor = move.color;
        if (capturingColor === 'w') {
          this.capturedPieces.white.push(move.captured);
        } else {
          this.capturedPieces.black.push(move.captured);
        }
      }

      this.moveHistory.push(move);
      const narration = this.narrateMove(move);
      return {
        success: true,
        move,
        gameState: this.getGameState(),
        narration,
      };
    } catch {
      return {
        success: false,
        error: `Could not parse move: "${moveInput}".`,
        gameState: this.getGameState(),
        narration: `I couldn't understand that move. Try something like "knight to f3" or "e4". ${this.suggestSimilarMoves(moveInput)}`,
      };
    }
  }

  // --- Move Narration ---

  /** Blitz narration: drop every word that carries no information.
   *  "Black pawn to Eva 5." (5 words) becomes "Pawn Eva 5." (3). The colour is
   *  redundant — the only move ever announced is the opponent's — and "to" says
   *  nothing. At ~3x fewer words this is the single biggest latency win available,
   *  since the API exposes no speech-rate control. */
  private narrateMoveTerse(move: Move): string {
    const piece = PIECE_NAMES[move.piece];
    const toSquare = squareToIBCA(move.to);
    let out: string;

    if (move.san === 'O-O') out = 'Castles kingside';
    else if (move.san === 'O-O-O') out = 'Castles queenside';
    else if (move.captured) out = `${piece} takes ${PIECE_NAMES[move.captured]} ${toSquare}`;
    else out = `${piece} ${toSquare}`;

    if (move.promotion) out += `, promotes ${PIECE_NAMES[move.promotion]}`;

    const s = this.getGameState();
    if (s.isCheckmate) out += '. Mate';
    else if (s.isCheck) out += '. Check';
    else if (s.isStalemate) out += '. Stalemate';
    else if (s.isDraw) out += '. Draw';

    return out.charAt(0).toUpperCase() + out.slice(1) + '.';
  }

  setTerseNarration(on: boolean): void {
    this.terseNarration = on;
  }

  private narrateMove(move: Move): string {
    if (this.terseNarration) return this.narrateMoveTerse(move);

    const piece = PIECE_NAMES[move.piece];
    const color = move.color === 'w' ? 'White' : 'Black';
    const toSquare = squareToIBCA(move.to);
    let narration = '';

    if (move.san === 'O-O') {
      narration = `${color} castles kingside.`;
    } else if (move.san === 'O-O-O') {
      narration = `${color} castles queenside.`;
    } else if (move.captured) {
      const captured = PIECE_NAMES[move.captured];
      narration = `${color} ${piece} takes ${captured} on ${toSquare}.`;
    } else {
      narration = `${color} ${piece} to ${toSquare}.`;
    }

    // Check/checkmate/draw annotations
    const newState = this.getGameState();
    if (newState.isCheckmate) {
      narration += ` Checkmate! ${color} wins the game.`;
    } else if (newState.isCheck) {
      narration += ' Check!';
    } else if (newState.isStalemate) {
      narration += ' Stalemate. The game is a draw.';
    } else if (newState.isDraw) {
      narration += ' The game is a draw.';
    }

    if (move.promotion) {
      narration += ` Promoted to ${PIECE_NAMES[move.promotion]}.`;
    }

    return narration;
  }

  // --- Board Description ---

  describeBoardState(focus: string = 'full'): BoardDescription {
    const board = this.game.board();
    const turn = this.game.turn();
    const playerColor = turn; // describe from current player's perspective

    switch (focus) {
      case 'tactical':
      case 'blitz':
        return { focus: 'tactical' as BoardDescription['focus'], description: this.describeTactical(playerColor) };
      case 'threats':
        return { focus: 'threats', description: this.describeThreats(playerColor) };
      case 'kingside':
        return { focus: 'kingside', description: this.describeRegion(board, playerColor, 4, 7) };
      case 'queenside':
        return { focus: 'queenside', description: this.describeRegion(board, playerColor, 0, 3) };
      case 'center':
        return { focus: 'center', description: this.describeCenter(board) };
      case 'my_pieces':
        return { focus: 'my_pieces', description: this.describePlayerPieces(board, playerColor) };
      case 'captures':
        return { focus: 'captures', description: this.describeCapturedPieces() };
      case 'scan':
        return { focus: 'scan' as unknown as BoardDescription['focus'], description: this.describeFullBoard(board, playerColor) };
      case 'full':
      default:
        return { focus: 'full', description: this.describeFullBoard(board, playerColor) };
    }
  }

  // Official IBCA tournament standard: scan rank 1 through rank 8 in fixed order,
  // announcing occupied squares using full piece name + phonetic file + rank number.
  private describeFullBoard(board: ReturnType<Chess['board']>, perspective: Color): string {
    const lines: string[] = [];
    const colorName = perspective === 'w' ? 'White' : 'Black';

    lines.push(`Board position, scanning rank 1 through rank 8. It's ${colorName}'s turn.`);

    for (let r = 1; r <= 8; r++) {
      const rankIdx = 8 - r; // rank 1 is board[7], rank 8 is board[0]
      const piecesOnRank: string[] = [];

      for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
        const piece = board[rankIdx]?.[fileIdx];
        if (piece) {
          const color = piece.color === 'w' ? 'White' : 'Black';
          const pieceName = PIECE_NAMES[piece.type];
          const fileName = IBCA_FILE_NAMES[FILE_NAMES[fileIdx]];
          piecesOnRank.push(`${color} ${pieceName} ${fileName} ${r}`);
        }
      }

      if (piecesOnRank.length > 0) {
        lines.push(`Rank ${r}: ${piecesOnRank.join(', ')}.`);
      }
    }

    if (this.game.isCheck()) {
      lines.push(`${colorName} is in check!`);
    }

    return lines.join(' ');
  }

  private describeRegion(board: ReturnType<Chess['board']>, perspective: Color, fileStart: number, fileEnd: number): string {
    const pieces: string[] = [];
    const regionName = fileStart < 4 ? 'queenside' : 'kingside';

    for (let rank = 0; rank < 8; rank++) {
      for (let file = fileStart; file <= fileEnd; file++) {
        const piece = board[rank][file];
        if (piece) {
          const square = `${FILE_NAMES[file]}${RANK_NAMES[7 - rank]}`;
          const color = piece.color === perspective ? 'your' : "opponent's";
          pieces.push(`${color} ${PIECE_NAMES[piece.type]} on ${squareToIBCA(square)}`);
        }
      }
    }

    if (pieces.length === 0) {
      return `The ${regionName} is empty.`;
    }
    return `On the ${regionName}: ${pieces.join(', ')}.`;
  }

  private describeCenter(board: ReturnType<Chess['board']>): string {
    const centerSquares = [
      [3, 3], [3, 4], [4, 3], [4, 4], // d4, e4, d5, e5
      [2, 3], [2, 4], [5, 3], [5, 4], // extended center
    ];

    const pieces: string[] = [];
    for (const [rank, file] of centerSquares) {
      const piece = board[rank][file];
      if (piece) {
        const square = `${FILE_NAMES[file]}${RANK_NAMES[7 - rank]}`;
        const color = piece.color === 'w' ? 'White' : 'Black';
        pieces.push(`${color} ${PIECE_NAMES[piece.type]} on ${squareToIBCA(square)}`);
      }
    }

    if (pieces.length === 0) {
      return 'The center is open with no pieces occupying it.';
    }
    return `In the center: ${pieces.join(', ')}.`;
  }

  private describePlayerPieces(board: ReturnType<Chess['board']>, color: Color): string {
    const pieces: string[] = [];

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.color === color) {
          const square = `${FILE_NAMES[file]}${RANK_NAMES[7 - rank]}`;
          pieces.push(`${PIECE_NAMES[piece.type]} on ${squareToIBCA(square)}`);
        }
      }
    }

    return `Your pieces: ${pieces.join(', ')}.`;
  }

  /** Blitz mode: the tactical read a sighted player gets at a glance, in one breath.
   *  Material, what's hanging on both sides, and whether you're in check.
   *  ponytail: "hanging" = attacked and not defended. A real SEE swing
   *  (defended-but-losing exchanges) needs a proper static exchange eval. */
  private describeTactical(perspective: Color): string {
    const parts: string[] = [];
    const board = this.game.board();

    if (this.game.inCheck()) parts.push('You are in check');

    // Material balance
    let diff = 0;
    for (const row of board) {
      for (const sq of row) {
        if (!sq || sq.type === 'k') continue;
        diff += (sq.color === perspective ? 1 : -1) * PIECE_VALUES[sq.type];
      }
    }
    const pawns = Math.round(Math.abs(diff) / 100);
    if (Math.abs(diff) < 100) parts.push('Material even');
    else parts.push(`${diff > 0 ? 'You are up' : 'You are down'} ${pawns} ${pawns === 1 ? 'pawn' : 'pawns'}`);

    const theirAttacks = this.getOpponentAttacks(perspective);
    const myMoves = this.game.turn() === perspective ? this.game.moves({ verbose: true }) : [];
    const defended = new Set(myMoves.map((m) => m.to));
    const attackedByThem = new Set(theirAttacks.map((m) => m.to));

    // My pieces that are attacked and undefended, worst first
    const hanging: { name: string; sq: string; val: number }[] = [];
    for (const row of board) {
      for (const sq of row) {
        if (!sq || sq.color !== perspective || sq.type === 'k') continue;
        if (attackedByThem.has(sq.square) && !defended.has(sq.square)) {
          hanging.push({ name: PIECE_NAMES[sq.type], sq: squareToIBCA(sq.square), val: PIECE_VALUES[sq.type] });
        }
      }
    }
    hanging.sort((a, b) => b.val - a.val);
    if (hanging.length > 0) {
      parts.push(`Hanging: ${hanging.slice(0, 3).map((h) => `${h.name} on ${h.sq}`).join(', ')}`);
    }

    // Free material for me: their undefended pieces I can take
    const theirDefended = new Set(theirAttacks.map((m) => m.to));
    const wins = myMoves
      .filter((m) => m.captured && !theirDefended.has(m.to))
      .sort((a, b) => PIECE_VALUES[b.captured!] - PIECE_VALUES[a.captured!]);
    if (wins.length > 0) {
      parts.push(`You can take their ${PIECE_NAMES[wins[0].captured!]} on ${squareToIBCA(wins[0].to)} for free`);
    }

    const checks = myMoves.filter((m) => m.san.includes('#'));
    if (checks.length > 0) parts.push(`Mate available: ${checks[0].san}`);

    if (hanging.length === 0 && wins.length === 0 && parts.length <= 1) {
      parts.push('Nothing hanging on either side');
    }
    return parts.join('. ') + '.';
  }

  private describeThreats(perspective: Color): string {
    const threats: string[] = [];
    const opponentMoves = this.getOpponentAttacks(perspective);

    // Find our pieces that are under attack
    const board = this.game.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.color === perspective) {
          const square = `${FILE_NAMES[file]}${RANK_NAMES[7 - rank]}` as Square;
          if (opponentMoves.some(m => m.to === square)) {
            threats.push(`Your ${PIECE_NAMES[piece.type]} on ${squareToIBCA(square)} is under attack`);
          }
        }
      }
    }

    if (threats.length === 0) {
      return 'None of your pieces are currently under direct attack.';
    }
    return `Threats: ${threats.join('. ')}.`;
  }

  private describeCapturedPieces(): string {
    const parts: string[] = [];
    if (this.capturedPieces.white.length > 0) {
      parts.push(`White has captured: ${this.capturedPieces.white.map(p => PIECE_NAMES[p]).join(', ')}`);
    }
    if (this.capturedPieces.black.length > 0) {
      parts.push(`Black has captured: ${this.capturedPieces.black.map(p => PIECE_NAMES[p]).join(', ')}`);
    }
    if (parts.length === 0) {
      return 'No pieces have been captured yet.';
    }
    return parts.join('. ') + '.';
  }

  // --- Legal Moves ---

  getLegalMoves(pieceOrSquare?: string): string {
    let moves: Move[];

    if (!pieceOrSquare || pieceOrSquare === 'all') {
      moves = this.game.moves({ verbose: true });
      const grouped = new Map<string, string[]>();
      for (const move of moves) {
        const fromIBCA = squareToIBCA(move.from);
        const toIBCA = squareToIBCA(move.to);
        const key = `${PIECE_NAMES[move.piece]} on ${fromIBCA}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(`${toIBCA}`);
      }
      const parts: string[] = [];
      for (const [piece, sans] of grouped) {
        parts.push(`${piece} can play to: ${sans.join(', ')}`);
      }
      return parts.join('. ') + '.';
    }

    // Normalize IBCA phonetic files in query e.g. "eva 4" -> "e4"
    let normalized = pieceOrSquare.toLowerCase().trim();
    for (const [file, name] of Object.entries(IBCA_FILE_NAMES)) {
      normalized = normalized.replace(new RegExp(`\\b${name.toLowerCase()}\\s*([1-8])\\b`, 'g'), `${file}$1`);
    }

    // Try as square first
    const square = normalized as Square;
    if (/^[a-h][1-8]$/.test(square)) {
      moves = this.game.moves({ square, verbose: true });
      const sqIBCA = squareToIBCA(square);
      if (moves.length === 0) {
        return `No legal moves from ${sqIBCA}.`;
      }
      const piece = this.game.get(square);
      const pieceName = piece ? PIECE_NAMES[piece.type] : 'piece';
      const moveDescs = moves.map(m => squareToIBCA(m.to));
      return `Your ${pieceName} on ${sqIBCA} can play to: ${moveDescs.join(', ')}.`;
    }

    // Try as piece name
    const pieceMap: Record<string, PieceSymbol> = {
      pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k',
    };
    const pieceType = pieceMap[normalized];
    if (pieceType) {
      moves = this.game.moves({ verbose: true }).filter(m => m.piece === pieceType);
      if (moves.length === 0) {
        return `Your ${pieceOrSquare} has no legal moves.`;
      }
      const moveDescs = moves.map(m => `${squareToIBCA(m.from)} to ${squareToIBCA(m.to)}`);
      return `Your ${pieceOrSquare} can play: ${moveDescs.join(', ')}.`;
    }

    return `I don't understand "${pieceOrSquare}". Try a square like "Eva 4" or a piece name like "knight".`;
  }

  // --- Evaluation & Minimax Search Heuristics ---

  getSimpleEvaluation(): { bestMove: string; evaluation: string; explanation: string } {
    const moves = this.game.moves({ verbose: true });
    if (moves.length === 0) {
      return { bestMove: 'none', evaluation: 'Game over', explanation: this.describeGameOver() };
    }

    const rootColor = this.game.turn();
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = 0;
      this.game.move(move.san);
      if (this.game.isCheckmate()) {
        score += 10000;
      } else if (this.game.isCheck()) {
        score += 50;
      } else {
        score = minimaxAlphaBeta(this.game, 1, -Infinity, Infinity, false, rootColor);
      }
      this.game.undo();

      if (move.captured) {
        score += PIECE_VALUES[move.captured] * 10 - PIECE_VALUES[move.piece];
      }
      if (move.san === 'O-O' || move.san === 'O-O-O') {
        score += 40;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    const pieceName = PIECE_NAMES[bestMove.piece];
    const toIBCA = squareToIBCA(bestMove.to);
    let explanation = `I'd suggest ${pieceName} to ${toIBCA}.`;
    if (bestMove.captured) {
      explanation += ` This captures their ${PIECE_NAMES[bestMove.captured]}.`;
    }
    if (bestMove.san === 'O-O' || bestMove.san === 'O-O-O') {
      explanation = `I'd suggest castling to get your king to safety.`;
    }

    return {
      bestMove: bestMove.san,
      evaluation: bestScore > 100 ? 'winning' : bestScore > 10 ? 'good' : 'equal',
      explanation,
    };
  }

  // --- Opponent Auto-Move (for solo play against engine) ---

  makeEngineMove(difficulty?: Difficulty): MoveResult {
    const moves = this.game.moves({ verbose: true });
    if (moves.length === 0 || this.isResigned) {
      return {
        success: false,
        error: 'No legal moves available.',
        gameState: this.getGameState(),
        narration: this.describeGameOver(),
      };
    }

    const rootColor = this.game.turn();
    let selectedMove: Move;

    const activeDifficulty = difficulty ?? this.difficulty;
    switch (activeDifficulty) {
      case 'beginner': {
        // High blunder rate / random move selection
        selectedMove = moves[Math.floor(Math.random() * moves.length)];
        break;
      }
      case 'intermediate': {
        // 1-ply capture & piece-square table (PST) heuristic
        // Evaluates immediate moves at depth 1 without exploring opponent replies
        const scoredMoves: { move: Move; score: number }[] = [];
        for (const move of moves) {
          this.game.move(move.san);
          let score = evaluatePositionForColor(this.game, rootColor);
          if (move.captured) {
            score += PIECE_VALUES[move.captured] * 10 - PIECE_VALUES[move.piece];
          }
          if (move.san.includes('+')) score += 30;
          this.game.undo();
          scoredMoves.push({ move, score });
        }

        scoredMoves.sort((a, b) => b.score - a.score);
        selectedMove = scoredMoves[0].move;
        break;
      }
      case 'advanced': {
        // 2-ply minimax with alpha-beta search and piece-square tables
        // Searches engine move + opponent reply (avoids blunders and defended pieces)
        let bestScore = -Infinity;
        let bestMoves: Move[] = [];

        const sortedMoves = [...moves].sort((a, b) => {
          const scoreA = (a.captured ? PIECE_VALUES[a.captured] * 10 - PIECE_VALUES[a.piece] : 0) + (a.san.includes('+') ? 50 : 0);
          const scoreB = (b.captured ? PIECE_VALUES[b.captured] * 10 - PIECE_VALUES[b.piece] : 0) + (b.san.includes('+') ? 50 : 0);
          return scoreB - scoreA;
        });

        let alpha = -Infinity;
        const beta = Infinity;
        for (const move of sortedMoves) {
          this.game.move(move.san);
          const score = minimaxAlphaBeta(this.game, 1, alpha, beta, false, rootColor);
          this.game.undo();

          if (score > bestScore) {
            bestScore = score;
            bestMoves = [move];
          } else if (score === bestScore) {
            bestMoves.push(move);
          }
          if (score > alpha) {
            alpha = score;
          }
        }
        selectedMove = bestMoves[0];
        break;
      }
      case 'master': {
        // 3-ply minimax with alpha-beta search and piece-square tables
        // Searches 3 plies ahead: engine move, opponent reply, engine follow-up
        // Finds tactics, combinations, and mate in 2
        let bestScore = -Infinity;
        let bestMoves: Move[] = [];

        const sortedMoves = [...moves].sort((a, b) => {
          const scoreA = (a.captured ? PIECE_VALUES[a.captured] * 10 - PIECE_VALUES[a.piece] : 0) + (a.san.includes('+') ? 50 : 0);
          const scoreB = (b.captured ? PIECE_VALUES[b.captured] * 10 - PIECE_VALUES[b.piece] : 0) + (b.san.includes('+') ? 50 : 0);
          return scoreB - scoreA;
        });

        let alpha = -Infinity;
        const beta = Infinity;
        const movesToSearch = sortedMoves.length > 15 ? sortedMoves.slice(0, 15) : sortedMoves;
        for (const move of movesToSearch) {
          this.game.move(move.san);
          const score = minimaxAlphaBeta(this.game, 2, alpha, beta, false, rootColor);
          this.game.undo();

          if (score > bestScore) {
            bestScore = score;
            bestMoves = [move];
          } else if (score === bestScore) {
            bestMoves.push(move);
          }
          if (score > alpha) {
            alpha = score;
          }
        }
        selectedMove = bestMoves[0];
        break;
      }
      default:
        selectedMove = moves[Math.floor(Math.random() * moves.length)];
    }

    return this.makeMove(selectedMove.san);
  }

  // --- Helpers ---

  private moveCausesCheck(move: Move): boolean {
    this.game.move(move.san);
    const inCheck = this.game.isCheck();
    this.game.undo();
    return inCheck;
  }

  private getOpponentAttacks(perspective: Color): Move[] {
    // Temporarily switch turns to see opponent's moves
    const fen = this.game.fen();
    const parts = fen.split(' ');
    parts[1] = perspective === 'w' ? 'b' : 'w';
    try {
      const tempGame = new Chess(parts.join(' '));
      return tempGame.moves({ verbose: true });
    } catch {
      return [];
    }
  }

  private suggestSimilarMoves(input: string): string {
    const moves = this.game.moves();
    const lower = input.toLowerCase();
    const similar = moves.filter(m =>
      m.toLowerCase().includes(lower) || lower.includes(m.toLowerCase())
    );
    if (similar.length > 0) {
      return `Did you mean: ${similar.slice(0, 3).join(', ')}?`;
    }
    return `Legal moves include: ${moves.slice(0, 5).join(', ')}, and more.`;
  }

  private describeGameOver(): string {
    if (this.isResigned && this.resignedColor) {
      const resignedName = this.resignedColor === 'w' ? 'White' : 'Black';
      const winnerName = this.resignedColor === 'w' ? 'Black' : 'White';
      return `${resignedName} resigns. ${winnerName} wins by resignation.`;
    }
    if (this.game.isCheckmate()) {
      const winner = this.game.turn() === 'w' ? 'Black' : 'White';
      return `Checkmate! ${winner} wins the game.`;
    }
    if (this.game.isStalemate()) return 'Stalemate — the game is a draw.';
    if (this.game.isDraw()) return 'The game is a draw.';
    return 'The game is over.';
  }

  // --- Reset ---

  reset(fen?: string): void {
    this.game = new Chess(fen);
    this.moveHistory = [];
    this.capturedPieces = { white: [], black: [] };
    this.isResigned = false;
    this.resignedColor = null;
    this.pendingPremove = null;
    this.pendingConfirmation = null;
  }

  // --- Undo ---

  undoMove(): MoveResult {
    const undone = this.game.undo();
    if (!undone) {
      return {
        success: false,
        error: 'No moves to undo.',
        gameState: this.getGameState(),
        narration: 'There are no moves to take back.',
      };
    }
    this.moveHistory.pop();
    if (undone.captured) {
      const capturingColor = undone.color === 'w' ? 'white' : 'black';
      this.capturedPieces[capturingColor].pop();
    }
    this.isResigned = false;
    this.resignedColor = null;
    return {
      success: true,
      move: undone,
      gameState: this.getGameState(),
      narration: `Took back the last move: ${PIECE_NAMES[undone.piece]} from ${undone.to} back to ${undone.from}.`,
    };
  }
}
