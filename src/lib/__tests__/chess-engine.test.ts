import { describe, it, expect, beforeEach } from 'vitest';
import { ChessEngine, squareToIBCA } from '../chess-engine';

describe('ChessEngine', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  it('Constructor creates starting position', () => {
    const state = engine.getGameState();
    expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(state.turn).toBe('w');
  });

  it('makeMove() with valid SAN moves (e4, Nf3)', () => {
    let result = engine.makeMove('e4');
    expect(result.success).toBe(true);
    expect(result.gameState.turn).toBe('b');

    result = engine.makeMove('Nf6');
    expect(result.success).toBe(true);
    expect(result.gameState.turn).toBe('w');
  });

  it('makeMove() with invalid moves returns error', () => {
    const result = engine.makeMove('invalid_move');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('Game state tracking (turn, check, checkmate)', () => {
    // Scholar's mate
    engine.makeMove('e4');
    engine.makeMove('e5');
    engine.makeMove('Bc4');
    engine.makeMove('Nc6');
    engine.makeMove('Qh5');
    engine.makeMove('Nf6');
    const result = engine.makeMove('Qxf7#');
    
    expect(result.success).toBe(true);
    const state = engine.getGameState();
    expect(state.isCheck).toBe(true);
    expect(state.isCheckmate).toBe(true);
    expect(state.isGameOver).toBe(true);
  });

  it('describeBoardState() returns descriptions for all focus types', () => {
    const focuses = ['full', 'threats', 'kingside', 'queenside', 'center', 'my_pieces', 'captures'];
    for (const focus of focuses) {
      const desc = engine.describeBoardState(focus);
      expect(desc.focus).toBe(focus);
      expect(typeof desc.description).toBe('string');
      expect(desc.description.length).toBeGreaterThan(0);
    }
  });

  it('getLegalMoves() returns formatted strings', () => {
    const movesAll = engine.getLegalMoves('all');
    expect(typeof movesAll).toBe('string');
    expect(movesAll.length).toBeGreaterThan(0);

    const movesPiece = engine.getLegalMoves('knight');
    expect(typeof movesPiece).toBe('string');

    const movesSquare = engine.getLegalMoves('e2');
    expect(typeof movesSquare).toBe('string');
  });

  it('undoMove() works correctly', () => {
    engine.makeMove('e4');
    const stateBeforeUndo = engine.getGameState();
    expect(stateBeforeUndo.turn).toBe('b');

    const undoResult = engine.undoMove();
    expect(undoResult.success).toBe(true);
    
    const stateAfterUndo = engine.getGameState();
    expect(stateAfterUndo.turn).toBe('w');
    expect(stateAfterUndo.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('makeEngineMove() produces valid opponent moves', () => {
    const result = engine.makeEngineMove('beginner');
    expect(result.success).toBe(true);
    expect(engine.getGameState().turn).toBe('b');
  });

  it('squareToIBCA() converts correctly', () => {
    expect(squareToIBCA('e4')).toBe('Eva 4');
    expect(squareToIBCA('a1')).toBe('Anna 1');
    expect(squareToIBCA('h8')).toBe('Hector 8');
  });

  // --- Milestone 1 Enhancements & Edge Cases ---

  it('undoMove() properly reverts capturedPieces on capture moves', () => {
    engine.makeMove('e4');
    engine.makeMove('d5');
    const capture = engine.makeMove('exd5');
    expect(capture.success).toBe(true);
    expect(capture.move?.captured).toBe('p');

    let state = engine.getGameState();
    expect(state.capturedPieces.white).toEqual(['p']);
    expect(state.capturedPieces.black).toEqual([]);

    const undoCapture = engine.undoMove();
    expect(undoCapture.success).toBe(true);

    state = engine.getGameState();
    expect(state.capturedPieces.white).toEqual([]);
    expect(state.capturedPieces.black).toEqual([]);
    expect(engine.describeBoardState('captures').description).toContain('No pieces have been captured yet');
  });

  it('undoMove() handles multiple captures across both colors in sequence', () => {
    engine.makeMove('e4');
    engine.makeMove('d5');
    engine.makeMove('exd5'); // White captures Black pawn
    engine.makeMove('Qxd5'); // Black captures White pawn

    let state = engine.getGameState();
    expect(state.capturedPieces.white).toEqual(['p']);
    expect(state.capturedPieces.black).toEqual(['p']);

    // Undo Black's capture
    let undoResult = engine.undoMove();
    expect(undoResult.success).toBe(true);
    state = engine.getGameState();
    expect(state.capturedPieces.white).toEqual(['p']);
    expect(state.capturedPieces.black).toEqual([]);

    // Undo White's capture
    undoResult = engine.undoMove();
    expect(undoResult.success).toBe(true);
    state = engine.getGameState();
    expect(state.capturedPieces.white).toEqual([]);
    expect(state.capturedPieces.black).toEqual([]);
  });

  it('resign() allows White to resign and sets game over state', () => {
    const result = engine.resign('w');
    expect(result.success).toBe(true);
    expect(result.isGameOver).toBe(true);
    expect(result.narration).toBe('White resigns. Black wins by resignation.');
    expect(result.gameOverReason).toBe('White resigns. Black wins by resignation.');

    const state = engine.getGameState();
    expect(state.isGameOver).toBe(true);
    expect(state.legalMoves).toHaveLength(0);

    // Subsequent moves must be rejected
    const moveAttempt = engine.makeMove('e4');
    expect(moveAttempt.success).toBe(false);
    expect(moveAttempt.narration).toContain('White resigns. Black wins by resignation.');
  });

  it('resign() allows Black to resign and declares White as winner', () => {
    engine.makeMove('e4');
    const result = engine.resign('b');
    expect(result.success).toBe(true);
    expect(result.isGameOver).toBe(true);
    expect(result.narration).toBe('Black resigns. White wins by resignation.');

    const state = engine.getGameState();
    expect(state.isGameOver).toBe(true);
  });

  it('resign() defaults to active player when color is omitted', () => {
    // White's turn initially
    const r1 = engine.resign();
    expect(r1.success).toBe(true);
    expect(r1.narration).toContain('White resigns');

    // Test Black's turn default
    engine.reset();
    engine.makeMove('e4'); // Now Black's turn
    const r2 = engine.resign();
    expect(r2.success).toBe(true);
    expect(r2.narration).toContain('Black resigns');
  });

  it('resign() on already finished game returns game over without mutating', () => {
    engine.resign('w');
    const secondResign = engine.resign('b');
    expect(secondResign.success).toBe(false);
    expect(secondResign.narration).toContain('White resigns. Black wins by resignation.');
  });

  it('describeBoardState("scan") strictly returns occupied squares ordered Rank 1 to Rank 8', () => {
    const scan = engine.describeBoardState('scan');
    expect(scan.focus).toBe('scan');
    expect(scan.description).toContain('Board position, scanning rank 1 through rank 8');

    // Rank 1 must precede Rank 2, and Rank 2 must precede Rank 7, and Rank 7 must precede Rank 8
    const idxRank1 = scan.description.indexOf('Rank 1:');
    const idxRank2 = scan.description.indexOf('Rank 2:');
    const idxRank7 = scan.description.indexOf('Rank 7:');
    const idxRank8 = scan.description.indexOf('Rank 8:');

    expect(idxRank1).toBeGreaterThan(-1);
    expect(idxRank2).toBeGreaterThan(idxRank1);
    expect(idxRank7).toBeGreaterThan(idxRank2);
    expect(idxRank8).toBeGreaterThan(idxRank7);

    // Check piece identity and IBCA coordinates
    expect(scan.description).toContain('White rook Anna 1');
    expect(scan.description).toContain('White king Eva 1');
    expect(scan.description).toContain('White pawn Anna 2');
    expect(scan.description).toContain('Black pawn Hector 7');
    expect(scan.description).toContain('Black king Eva 8');
  });

  it('describeBoardState("scan") omits empty ranks in sparse endgame positions', () => {
    // Kings only: White king on e1, Black king on e8
    engine.reset('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    const scan = engine.describeBoardState('scan');

    expect(scan.description).toContain('Rank 1: White king Eva 1.');
    expect(scan.description).toContain('Rank 8: Black king Eva 8.');
    // Ranks 2 through 7 should NOT appear
    expect(scan.description).not.toContain('Rank 2:');
    expect(scan.description).not.toContain('Rank 3:');
    expect(scan.description).not.toContain('Rank 4:');
    expect(scan.description).not.toContain('Rank 5:');
    expect(scan.description).not.toContain('Rank 6:');
    expect(scan.description).not.toContain('Rank 7:');
  });

  it('describeBoardState("scan") appends check announcement when player is in check', () => {
    // White bishop on f7 checks Black king
    engine.makeMove('e4');
    engine.makeMove('e5');
    engine.makeMove('Bc4');
    engine.makeMove('Nc6');
    engine.makeMove('Bxf7+');

    const scan = engine.describeBoardState('scan');
    expect(scan.description).toContain('Black is in check!');
  });

  it('makeEngineMove() handles all 4 difficulty levels with valid legal moves', () => {
    const difficulties = ['beginner', 'intermediate', 'advanced', 'master'] as const;
    for (const diff of difficulties) {
      engine.reset();
      const result = engine.makeEngineMove(diff);
      expect(result.success).toBe(true);
      expect(result.move).toBeDefined();
      expect(engine.getGameState().turn).toBe('b');
    }
  });

  it('makeEngineMove("intermediate") uses 1-ply capture heuristic', () => {
    // Position where White can capture a free Black queen on d5
    engine.reset('rnb1kbnr/pppp1ppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
    const result = engine.makeEngineMove('intermediate');
    expect(result.success).toBe(true);
    // 1-ply evaluation should greedily capture the queen on d5 (exd5)
    expect(result.move?.san).toBe('exd5');
  });

  it('makeEngineMove("advanced") avoids blundering material that 1-ply falls for', () => {
    // Position where White Queen could greedily capture protected pawn on d5:
    // Black knight on c6 defends d5.
    // 1-ply sees capture of pawn (+100), but 2-ply sees Qxd5 is answered by Nxd5 losing the Queen (-900)!
    engine.reset('r1bqkbnr/ppp2ppp/2n5/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1');
    const result = engine.makeEngineMove('advanced');
    expect(result.success).toBe(true);
    expect(result.move?.san).not.toBe('Qxd5');
  });

  it('makeEngineMove("master") finds tactical sequence (3-ply)', () => {
    // White Rooks on a6 and b1, Black King on h8.
    // White plays Ra7 or Rb7 (threatening back rank mate)
    engine.reset('7k/8/R7/8/8/8/8/1R4K1 w - - 0 1');
    const result = engine.makeEngineMove('master');
    expect(result.success).toBe(true);
    expect(['Ra7', 'Rb7', 'Ra8+']).toContain(result.move?.san);
  });

  it('Difficulty levels exhibit demonstrably distinct move characteristics', () => {
    // Beginner exhibits move entropy across multiple trials
    const beginnerMoves = new Set<string>();
    for (let i = 0; i < 20; i++) {
      engine.reset('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
      const res = engine.makeEngineMove('beginner');
      if (res.move) beginnerMoves.add(res.move.san);
    }
    expect(beginnerMoves.size).toBeGreaterThanOrEqual(3);

    // Advanced in the same position chooses consistently strong moves
    const advancedMoves = new Set<string>();
    for (let i = 0; i < 5; i++) {
      engine.reset('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
      const res = engine.makeEngineMove('advanced');
      if (res.move) advancedMoves.add(res.move.san);
    }
    expect(advancedMoves.size).toBeLessThanOrEqual(2);
  });

  it('Engine computation latency is under 1500ms across opening, middlegame, and endgame', () => {
    const testPositions = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Opening
      'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7', // Middlegame
      '8/5pk1/4p1p1/7p/7P/5KP1/5P2/8 w - - 0 35', // Endgame
    ];

    for (const fen of testPositions) {
      engine.reset(fen);
      const t0 = performance.now();
      const result = engine.makeEngineMove('master');
      const elapsed = performance.now() - t0;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(1500); // Acceptance criteria requirement: < 1500ms
    }
  });

  it('reset() properly clears resignation and capturedPieces', () => {
    engine.makeMove('e4');
    engine.makeMove('d5');
    engine.makeMove('exd5');
    engine.resign('w');

    let state = engine.getGameState();
    expect(state.isGameOver).toBe(true);
    expect(state.capturedPieces.white).toEqual(['p']);

    engine.reset();
    state = engine.getGameState();
    expect(state.isGameOver).toBe(false);
    expect(state.turn).toBe('w');
    expect(state.capturedPieces.white).toEqual([]);
    expect(state.capturedPieces.black).toEqual([]);
  });
});

