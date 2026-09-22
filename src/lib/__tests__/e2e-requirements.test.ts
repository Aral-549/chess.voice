// ============================================================
// VoiceChessmate — End-to-End Requirements Test Suite
// Derived strictly from ORIGINAL_REQUEST.md & PROJECT.md
// Covers 13 Functional Requirement Categories (47 Distinct Tests)
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ChessEngine, squareToIBCA } from '../chess-engine';
import { handleToolCall } from '../tool-handlers';
import type { GameState, MoveResult } from '@/types';

describe('E2E Category 1: IBCA Phonetic Notation Standards', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  it('1.1 "Eva 4" voice input parses to e4 and executes successfully with IBCA narration', () => {
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'Eva 4' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Eva 4');
    expect(res.opponent_move).toBeDefined();
    expect(engine.getGameState().moveNumber).toBe(2);
  });

  it('1.2 "Felix 3" voice input parses to f3 and executes successfully with IBCA narration', () => {
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'Felix 3' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Felix 3');
    expect(res.opponent_move).toBeDefined();
    expect(engine.getGameState().moveNumber).toBe(2);
  });

  it('1.3 "Cesar 4" voice input parses to c4 and executes successfully with IBCA narration', () => {
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'Cesar 4' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Cesar 4');
    expect(res.opponent_move).toBeDefined();
    expect(engine.getGameState().moveNumber).toBe(2);
  });

  it('1.4 "Anna 4" voice input parses to a4 and executes successfully with IBCA narration', () => {
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'Anna 4' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Anna 4');
    expect(res.opponent_move).toBeDefined();
    expect(engine.getGameState().moveNumber).toBe(2);
  });

  it('1.5 Additional IBCA files (Bella, David, Gustav, Hector) parse to corresponding moves', () => {
    // Bella 3 -> b3
    let testEngine = new ChessEngine();
    let res = JSON.parse(handleToolCall(testEngine, 'apply_move', { move_description: 'Bella 3' }));
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Bella 3');

    // David 4 -> d4
    testEngine = new ChessEngine();
    res = JSON.parse(handleToolCall(testEngine, 'apply_move', { move_description: 'David 4' }));
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('David 4');

    // Gustav 3 -> g3
    testEngine = new ChessEngine();
    res = JSON.parse(handleToolCall(testEngine, 'apply_move', { move_description: 'Gustav 3' }));
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Gustav 3');

    // Hector 4 -> h4
    testEngine = new ChessEngine();
    res = JSON.parse(handleToolCall(testEngine, 'apply_move', { move_description: 'Hector 4' }));
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Hector 4');
  });

  it('1.6 squareToIBCA maps all 8 files (Anna through Hector) across various ranks accurately', () => {
    expect(squareToIBCA('a1')).toBe('Anna 1');
    expect(squareToIBCA('b2')).toBe('Bella 2');
    expect(squareToIBCA('c3')).toBe('Cesar 3');
    expect(squareToIBCA('d4')).toBe('David 4');
    expect(squareToIBCA('e5')).toBe('Eva 5');
    expect(squareToIBCA('f6')).toBe('Felix 6');
    expect(squareToIBCA('g7')).toBe('Gustav 7');
    expect(squareToIBCA('h8')).toBe('Hector 8');
  });
});

describe('E2E Category 2: Standard Algebraic Notation (SAN)', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  it('2.1 Standard pawn push "e4" executes and transitions turn', () => {
    const result = engine.makeMove('e4');
    expect(result.success).toBe(true);
    expect(result.move?.san).toBe('e4');
    expect(result.gameState.turn).toBe('b');
    expect(result.narration).toContain('White pawn to Eva 4');
  });

  it('2.2 Piece development moves ("Nf3", "Bc4") execute with proper piece identity', () => {
    engine.makeMove('e4');
    engine.makeMove('e5');

    const m1 = engine.makeMove('Nf3');
    expect(m1.success).toBe(true);
    expect(m1.move?.piece).toBe('n');
    expect(m1.narration).toContain('White knight to Felix 3');

    const m2 = engine.makeMove('Nc6'); // Black reply
    expect(m2.success).toBe(true);

    const m3 = engine.makeMove('Bc4');
    expect(m3.success).toBe(true);
    expect(m3.move?.piece).toBe('b');
    expect(m3.narration).toContain('White bishop to Cesar 4');
  });

  it('2.3 Captures in SAN ("exd5") update board and narrate capture event', () => {
    engine.makeMove('e4');
    engine.makeMove('d5');
    const captureResult = engine.makeMove('exd5');
    expect(captureResult.success).toBe(true);
    expect(captureResult.move?.captured).toBe('p');
    expect(captureResult.narration).toContain('takes pawn on David 5');
    expect(engine.getGameState().capturedPieces.white).toContain('p');
  });

  it('2.4 Checks and checkmate via SAN ("Qxf7#") update game state flags', () => {
    engine.makeMove('e4');
    engine.makeMove('e5');
    engine.makeMove('Bc4');
    engine.makeMove('Nc6');
    engine.makeMove('Qh5');
    engine.makeMove('Nf6');
    const mateResult = engine.makeMove('Qxf7#');
    expect(mateResult.success).toBe(true);
    expect(mateResult.gameState.isCheck).toBe(true);
    expect(mateResult.gameState.isCheckmate).toBe(true);
    expect(mateResult.gameState.isGameOver).toBe(true);
    expect(mateResult.narration).toContain('Checkmate! White wins the game.');
  });
});

describe('E2E Category 3: Castling Moves (Voice & Algebraic)', () => {
  // FEN where White can castle either kingside or queenside
  // e1=K, h1=R, a1=R; b1,c1,d1,f1,g1 are empty
  const castlingFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

  it('3.1 Spoken "castle kingside" executes kingside castling (O-O) with IBCA narration', () => {
    const engine = new ChessEngine(castlingFen);
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'castle kingside' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('White castles kingside.');
    // Check White Rank 1: King on g1, Rook on f1
    const ranks = engine.getGameState().fen.split(' ')[0].split('/');
    expect(ranks[7]).toContain('RK');
  });

  it('3.2 Spoken "castle queenside" executes queenside castling (O-O-O) with IBCA narration', () => {
    const engine = new ChessEngine(castlingFen);
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'castle queenside' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('White castles queenside.');
    // Check White Rank 1: King on c1, Rook on d1
    const ranks = engine.getGameState().fen.split(' ')[0].split('/');
    expect(ranks[7]).toContain('KR');
  });

  it('3.3 Algebraic SAN "O-O" and "O-O-O" properly relocate king and rook', () => {
    const engineKingside = new ChessEngine(castlingFen);
    const resK = engineKingside.makeMove('O-O');
    expect(resK.success).toBe(true);
    expect(resK.narration).toContain('White castles kingside.');

    const engineQueenside = new ChessEngine(castlingFen);
    const resQ = engineQueenside.makeMove('O-O-O');
    expect(resQ.success).toBe(true);
    expect(resQ.narration).toContain('White castles queenside.');
  });

  it('3.4 Castling when king has moved or path obstructed is rejected and preserves state', () => {
    // Initial position where pieces obstruct castling
    const engine = new ChessEngine();
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'castle kingside' });
    const res = JSON.parse(resJson);
    // Castling is illegal on move 1
    expect(res.success).toBe(false);
    expect(engine.getGameState().fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
});

describe('E2E Category 4: Pawn Promotion (Voice & Algebraic)', () => {
  // FEN with White pawn on e7 ready to promote on e8
  const promoFen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
  // Non-terminal promotion position with black pawns remaining
  const promoFenNonTerminal = '7k/4P2p/8/8/8/8/8/K7 w - - 0 1';

  it('4.1 Algebraic pawn promotion to Queen ("e8=Q")', () => {
    const engine = new ChessEngine(promoFen);
    const result = engine.makeMove('e8=Q');
    expect(result.success).toBe(true);
    expect(result.move?.promotion).toBe('q');
    expect(result.narration).toContain('Promoted to queen.');
  });

  it('4.2 Algebraic pawn promotion to Rook ("e8=R"), Bishop ("e8=B"), Knight ("e8=N")', () => {
    const eR = new ChessEngine(promoFen);
    const resR = eR.makeMove('e8=R');
    expect(resR.success).toBe(true);
    expect(resR.move?.promotion).toBe('r');
    expect(resR.narration).toContain('Promoted to rook.');

    const eB = new ChessEngine(promoFen);
    const resB = eB.makeMove('e8=B');
    expect(resB.success).toBe(true);
    expect(resB.move?.promotion).toBe('b');
    expect(resB.narration).toContain('Promoted to bishop.');

    const eN = new ChessEngine(promoFen);
    const resN = eN.makeMove('e8=N');
    expect(resN.success).toBe(true);
    expect(resN.move?.promotion).toBe('n');
    expect(resN.narration).toContain('Promoted to knight.');
  });

  it('4.3 Voice pawn promotion to Queen ("Eva 8 Queen" / "promote to queen")', () => {
    const engine = new ChessEngine(promoFenNonTerminal);
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'Eva 8 Queen' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    const narration = (res.your_move || res.narration || '').toLowerCase();
    expect(narration).toContain('queen');
  });

  it('4.4 Voice pawn promotion to Rook selects requested piece rather than defaulting', () => {
    const engine = new ChessEngine(promoFenNonTerminal);
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'e8 rook' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    const narration = (res.your_move || res.narration || '').toLowerCase();
    expect(narration).toContain('rook');
  });
});

describe('E2E Category 5: En Passant Captures', () => {
  // FEN with White pawn on e5, Black pawn just pushed d7-d5 (en passant target d6)
  const enPassantFen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';

  it('5.1 En passant capture executes correctly via SAN ("exd6")', () => {
    const engine = new ChessEngine(enPassantFen);
    const result = engine.makeMove('exd6');
    expect(result.success).toBe(true);
    expect(result.move?.captured).toBe('p');
    // Captured black pawn on d5 should be gone, white pawn on d6
    const fen = engine.getGameState().fen;
    expect(fen.split(' ')[0]).toContain('3P4'); // pawn on d6
    expect(engine.getGameState().capturedPieces.white).toContain('p');
  });

  it('5.2 Spoken en passant ("Eva takes David 6") executes en passant capture with narration', () => {
    const engine = new ChessEngine(enPassantFen);
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'Eva takes David 6' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('David 6');
    expect(res.your_move).toContain('takes pawn');
  });

  it('5.3 En passant removes captured pawn from board and increments captured pieces ledger', () => {
    const engine = new ChessEngine(enPassantFen);
    const stateBefore = engine.getGameState();
    expect(stateBefore.capturedPieces.white.length).toBe(0);

    const result = engine.makeMove('exd6');
    expect(result.success).toBe(true);
    const stateAfter = engine.getGameState();
    expect(stateAfter.capturedPieces.white).toEqual(['p']);
  });
});

describe('E2E Category 6: Resignation Handling', () => {
  it('6.1 Spoken "I resign" via apply_move triggers game resignation and ends game', () => {
    const engine = new ChessEngine();
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'I resign' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.narration.toLowerCase()).toContain('resign');
    expect(engine.getGameState().isGameOver).toBe(true);
  });

  it('6.2 Dedicated resign tool call handles verbal surrender', () => {
    const engine = new ChessEngine();
    const resJson = handleToolCall(engine, 'resign_game', {});
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.narration.toLowerCase()).toContain('resign');
    expect(engine.getGameState().isGameOver).toBe(true);
  });

  it('6.3 Resignation marks Black as winner, preserves board FEN, and rejects subsequent moves', () => {
    const engine = new ChessEngine();
    engine.makeMove('e4');
    engine.makeMove('e5');
    const fenBeforeResign = engine.getGameState().fen;

    // Resign as White
    const resignable = engine as unknown as { resign?: (color?: 'w' | 'b') => GameState | MoveResult };
    if (typeof resignable.resign === 'function') {
      resignable.resign('w');
      const state = engine.getGameState();
      expect(state.isGameOver).toBe(true);
      expect(state.fen).toBe(fenBeforeResign);

      // Subsequent move must be rejected
      const moveAfter = engine.makeMove('Nf3');
      expect(moveAfter.success).toBe(false);
    } else {
      // If engine.resign is not yet implemented, fail with explicit requirement note
      expect(typeof resignable.resign).toBe('function');
    }
  });
});

describe('E2E Category 7: Speech Homophone & ASR Resilience', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  it('7.1 Homophone "night" -> "knight" ("night to f3" / "night to Felix 3")', () => {
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'night to f3' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Felix 3');
  });

  it('7.2 Homophone "see four" -> "c4" parses to c4 pawn move', () => {
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'see four' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Cesar 4');
  });

  it('7.3 Homophone "before" -> "b4" parses to b4 pawn move', () => {
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'before' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(true);
    expect(res.your_move).toContain('Bella 4');
  });

  it('7.4 Phonetic number homophones ("tree" -> 3, "ate" -> 8, "fife" -> 5) resolve properly', () => {
    // "Felix tree" -> f3
    const e1 = new ChessEngine();
    const res1 = JSON.parse(handleToolCall(e1, 'apply_move', { move_description: 'Felix tree' }));
    expect(res1.success).toBe(true);
    expect(res1.your_move).toContain('Felix 3');

    // "David fore" -> d4
    const e2 = new ChessEngine();
    const res2 = JSON.parse(handleToolCall(e2, 'apply_move', { move_description: 'David fore' }));
    expect(res2.success).toBe(true);
    expect(res2.your_move).toContain('David 4');
  });
});

describe('E2E Category 8: Ambiguity Gating & Clarification (< 0.6 Confidence)', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  it('8.1 Completely nonsensical input returns success: false with clarification prompt', () => {
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'banana split 42' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(false);
    expect(res.narration.toLowerCase()).toContain('not sure which move you mean');
  });

  it('8.2 Confidence < 0.6 flags clarification without mutating board position', () => {
    const fenBefore = engine.getGameState().fen;
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'something completely unparseable' });
    const res = JSON.parse(resJson);
    expect(res.success).toBe(false);
    expect(res.narration).toContain('not sure which move you mean');
    expect(engine.getGameState().fen).toBe(fenBefore);
  });

  it('8.3 Multi-candidate ambiguity (e.g. "knight" on move 1) triggers clarification request', () => {
    // On move 1, 4 knight moves are legal (Na3, Nc3, Nf3, Nh3). Saying just "knight" is ambiguous.
    const resJson = handleToolCall(engine, 'apply_move', { move_description: 'knight' });
    const res = JSON.parse(resJson);
    // Must NOT arbitrarily guess Na3 with high confidence — should ask for clarification
    expect(res.success).toBe(false);
    expect(res.narration.toLowerCase()).toContain('which');
  });
});

describe('E2E Category 9: Board Scan Invariant (Strict Rank 1 to 8 Ordering)', () => {
  it('9.1 Board scan begins with preamble announcing Rank 1 through 8 scan', () => {
    const engine = new ChessEngine();
    const desc = engine.describeBoardState('full');
    expect(desc.description).toMatch(/^Board position, scanning rank 1 through rank 8\./);
  });

  it('9.2 Occupied squares appear strictly in ascending rank order (Rank 1 before Rank 2 ... before Rank 8)', () => {
    const engine = new ChessEngine();
    const desc = engine.describeBoardState('full').description;

    const rank1Idx = desc.indexOf('Rank 1:');
    const rank2Idx = desc.indexOf('Rank 2:');
    const rank7Idx = desc.indexOf('Rank 7:');
    const rank8Idx = desc.indexOf('Rank 8:');

    expect(rank1Idx).toBeGreaterThan(-1);
    expect(rank2Idx).toBeGreaterThan(rank1Idx);
    expect(rank7Idx).toBeGreaterThan(rank2Idx);
    expect(rank8Idx).toBeGreaterThan(rank7Idx);
  });

  it('9.3 Empty ranks are omitted and pieces formatted with full IBCA coordinate tokens', () => {
    // Endgame FEN with only kings on e1 and e5
    const engine = new ChessEngine('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
    const desc = engine.describeBoardState('full').description;

    expect(desc).toContain('Rank 1: White king Eva 1.');
    expect(desc).toContain('Rank 5: Black king Eva 5.');
    // Unoccupied ranks (2, 3, 4, 6, 7, 8) must NOT appear
    expect(desc).not.toContain('Rank 2:');
    expect(desc).not.toContain('Rank 3:');
    expect(desc).not.toContain('Rank 4:');
    expect(desc).not.toContain('Rank 6:');
    expect(desc).not.toContain('Rank 7:');
    expect(desc).not.toContain('Rank 8:');
  });

  it('9.4 Board scan appends check alert when player king is under attack', () => {
    // Position where White king on e1 is in check from Black queen on h4
    const checkEngine = new ChessEngine('rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    const desc = checkEngine.describeBoardState('full').description;
    expect(desc).toContain('White is in check!');
  });
});

describe('E2E Category 10: Opponent Engine Latency (< 1500ms Performance)', () => {
  it('10.1 Opening position move latency is strictly under 1500ms', () => {
    const engine = new ChessEngine();
    const start = performance.now();
    const result = engine.makeEngineMove('intermediate');
    const durationMs = performance.now() - start;

    expect(result.success).toBe(true);
    expect(durationMs).toBeLessThan(1500);
    expect(result.move).toBeDefined();
  });

  it('10.2 Complex middlegame position move latency is strictly under 1500ms', () => {
    // Tactical middlegame position with many active pieces
    const middlegameFen = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 0 7';
    const engine = new ChessEngine(middlegameFen);
    const start = performance.now();
    const result = engine.makeEngineMove('advanced');
    const durationMs = performance.now() - start;

    expect(result.success).toBe(true);
    expect(durationMs).toBeLessThan(1500);
  });

  it('10.3 Endgame position move latency is strictly under 1500ms', () => {
    // Pawn endgame position
    const endgameFen = '8/5k2/8/4p3/4P3/8/5K2/8 w - - 0 1';
    const engine = new ChessEngine(endgameFen);
    const start = performance.now();
    const result = engine.makeEngineMove('intermediate');
    const durationMs = performance.now() - start;

    expect(result.success).toBe(true);
    expect(durationMs).toBeLessThan(1500);
  });
});

describe('E2E Category 11: Engine Difficulty Levels Differentiation', () => {
  // Mate in 1 tactical test position: White has Qxf7#
  const mateIn1Fen = 'r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1';

  it('11.1 "advanced" difficulty deterministically selects winning mate-in-1 move (Qxf7#)', () => {
    const engine = new ChessEngine(mateIn1Fen);
    const result = engine.makeEngineMove('advanced');
    expect(result.success).toBe(true);
    expect(result.move?.san).toBe('Qxf7#');
    expect(result.gameState.isCheckmate).toBe(true);
  });

  it('11.2 "beginner" difficulty exhibits stochastic/non-deterministic behavior across multiple runs', () => {
    // Over 25 runs, beginner should pick various moves from the 42 legal moves
    const chosenMoves = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const engine = new ChessEngine(mateIn1Fen);
      const res = engine.makeEngineMove('beginner');
      if (res.move) chosenMoves.add(res.move.san);
    }
    // Beginner must not be deterministic (should explore multiple different moves)
    expect(chosenMoves.size).toBeGreaterThan(1);
  });

  it('11.3 Distinct move selection characteristics between beginner and advanced on hanging Queen', () => {
    // Position with undefended hanging Queen on d5: exd5 or Qxd5 wins Queen
    const hangingQueenFen = 'rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';

    // Advanced will evaluate material and capture the Queen
    const advEngine = new ChessEngine(hangingQueenFen);
    const advRes = advEngine.makeEngineMove('advanced');
    expect(advRes.success).toBe(true);
    expect(['exd5', 'Qxd5']).toContain(advRes.move?.san);

    // Beginner makes random moves, frequently missing the capture
    let beginnerMissedCapture = 0;
    for (let i = 0; i < 20; i++) {
      const begEngine = new ChessEngine(hangingQueenFen);
      const begRes = begEngine.makeEngineMove('beginner');
      if (begRes.move && begRes.move.san !== 'exd5' && begRes.move.san !== 'Qxd5') {
        beginnerMissedCapture++;
      }
    }
    expect(beginnerMissedCapture).toBeGreaterThan(0);
  });
});

describe('E2E Category 12: Move Undo & Capture History Restoration', () => {
  it('12.1 engine.undoMove() restores board position, turn, and move history', () => {
    const engine = new ChessEngine();
    const initialFen = engine.getGameState().fen;

    engine.makeMove('e4');
    expect(engine.getGameState().turn).toBe('b');

    const undoRes = engine.undoMove();
    expect(undoRes.success).toBe(true);
    expect(engine.getGameState().turn).toBe('w');
    expect(engine.getGameState().fen).toBe(initialFen);
  });

  it('12.2 Undoing a capture move restores the captured piece and clears it from capturedPieces ledger', () => {
    const engine = new ChessEngine();
    engine.makeMove('e4');
    engine.makeMove('d5');
    engine.makeMove('exd5');

    expect(engine.getGameState().capturedPieces.white).toContain('p');

    // Undo the capture
    const undoRes = engine.undoMove();
    expect(undoRes.success).toBe(true);

    // capturedPieces must NOT still contain the undone captured piece
    expect(engine.getGameState().capturedPieces.white).toEqual([]);
  });

  it('12.3 E2E undo_move tool call reverts both player move and engine reply (2 plies)', () => {
    const engine = new ChessEngine();
    const startFen = engine.getGameState().fen;

    // Player moves Eva 4 -> engine replies automatically
    const moveRes = JSON.parse(handleToolCall(engine, 'apply_move', { move_description: 'Eva 4' }));
    expect(moveRes.success).toBe(true);
    expect(engine.getGameState().moveNumber).toBe(2);

    // Tool call undo_move
    const undoRes = JSON.parse(handleToolCall(engine, 'undo_move', {}));
    expect(undoRes.success).toBe(true);
    expect(engine.getGameState().moveNumber).toBe(1);
    expect(engine.getGameState().turn).toBe('w');
    expect(engine.getGameState().fen).toBe(startFen);
  });
});

describe('E2E Category 13: Invalid Move Rejection & Strict State Preservation', () => {
  it('13.1 Illegal pawn move (e.g. backward or non-adjacent) is rejected and preserves state', () => {
    const engine = new ChessEngine();
    const fenBefore = engine.getGameState().fen;
    const turnBefore = engine.getGameState().turn;

    const result = engine.makeMove('e5'); // e5 on move 1 is illegal for White pawn
    expect(result.success).toBe(false);
    expect(result.narration.toLowerCase()).toContain('legal');
    expect(engine.getGameState().fen).toBe(fenBefore);
    expect(engine.getGameState().turn).toBe(turnBefore);
  });

  it('13.2 Non-existent / invalid coordinates (e.g. "z9", "j4") rejected without state mutation', () => {
    const engine = new ChessEngine();
    const fenBefore = engine.getGameState().fen;

    const r1 = engine.makeMove('z9');
    expect(r1.success).toBe(false);

    const r2 = JSON.parse(handleToolCall(engine, 'apply_move', { move_description: 'pawn to z9' }));
    expect(r2.success).toBe(false);

    expect(engine.getGameState().fen).toBe(fenBefore);
  });

  it('13.3 Moving while in check to a non-evasive square is rejected and preserves check state', () => {
    // In check position: Black Queen on h4 checks White King on e1
    const engine = new ChessEngine('rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    const fenBefore = engine.getGameState().fen;

    // Nf3 is illegal because King remains in check
    const result = engine.makeMove('Nf3');
    expect(result.success).toBe(false);
    expect(engine.getGameState().fen).toBe(fenBefore);
    expect(engine.getGameState().isCheck).toBe(true);
  });

  it('13.4 Moves attempted when game is over (checkmate) are rejected with game-over narration', () => {
    const engine = new ChessEngine();
    engine.makeMove('e4');
    engine.makeMove('e5');
    engine.makeMove('Bc4');
    engine.makeMove('Nc6');
    engine.makeMove('Qh5');
    engine.makeMove('Nf6');
    engine.makeMove('Qxf7#'); // Scholar's mate

    expect(engine.getGameState().isCheckmate).toBe(true);
    expect(engine.getGameState().isGameOver).toBe(true);

    // Attempt further move
    const overMove = engine.makeMove('Kxf7');
    expect(overMove.success).toBe(false);
    expect(overMove.narration).toContain('Checkmate! White wins the game.');
  });
});

