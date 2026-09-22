// ============================================================
// VoiceChessmate — Tier 5 Adversarial Chess Engine & Rules Probe Suite
// Author: challenger_tier5_1 (critic & specialist)
// Scope: FIDE & IBCA rules, underpromotions, en passant, resignation,
//        board scan ordering, difficulty divergence, latency benchmark,
//        and state preservation / undo invariance.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ChessEngine } from '../chess-engine';
import { handleToolCall } from '../tool-handlers';

describe('Tier 5 Adversarial Suite: FIDE & IBCA Chess Rules', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  describe('1. Castling Rules & Edge Cases', () => {
    it('1.1 White Kingside castling (O-O) relocates King to g1 and Rook to f1', () => {
      // Position where White can castle kingside: e1, h1, f1 and g1 empty
      engine.reset('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 1 6');
      const res = engine.makeMove('O-O');
      expect(res.success).toBe(true);
      expect(res.narration).toContain('White castles kingside');

      const state = engine.getGameState();
      expect(state.fen).toContain('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b kq -');
      expect(state.turn).toBe('b');
    });

    it('1.2 White Queenside castling (O-O-O) relocates King to c1 and Rook to d1', () => {
      // Position where White can castle queenside: b1, c1, d1 empty
      engine.reset('r3k2r/pppq1ppp/2npbn2/2b1p3/4P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 2 8');
      const res = engine.makeMove('O-O-O');
      expect(res.success).toBe(true);
      expect(res.narration).toContain('White castles queenside');

      const state = engine.getGameState();
      expect(state.fen).toContain('r3k2r/pppq1ppp/2npbn2/2b1p3/4P3/2NPBN2/PPPQ1PPP/2KR3R b kq -');
    });

    it('1.3 Black Kingside (O-O) and Queenside (O-O-O) castling', () => {
      // Black kingside castling
      engine.reset('r1bqk2r/pppp1ppp/2n2n2/2b1p3/4P3/3P1N2/PPP2PPP/RNBQKB1R b KQkq - 0 4');
      const resBlackKingside = engine.makeMove('O-O');
      expect(resBlackKingside.success).toBe(true);
      expect(resBlackKingside.narration).toContain('Black castles kingside');

      // Black queenside castling
      engine.reset('r3k2r/pppqbppp/2np1n2/4p3/4P3/2NP1N2/PPPQBPPP/R3K2R b KQkq - 0 8');
      const resBlackQueenside = engine.makeMove('O-O-O');
      expect(resBlackQueenside.success).toBe(true);
      expect(resBlackQueenside.narration).toContain('Black castles queenside');
    });

    it('1.4 Spoken "castle kingside" and "castle queenside" via tool handler apply valid castling', () => {
      engine.reset('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 1 6');
      const resKs = JSON.parse(handleToolCall(engine, 'apply_move', { move_description: 'castle kingside' }));
      expect(resKs.success).toBe(true);
      expect(resKs.your_move).toContain('castles kingside');

      engine.reset('r3k2r/pppq1ppp/2npbn2/2b1p3/4P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 2 8');
      const resQs = JSON.parse(handleToolCall(engine, 'apply_move', { move_description: 'castle queenside' }));
      expect(resQs.success).toBe(true);
      expect(resQs.your_move).toContain('castles queenside');
    });

    it('1.5 Blocked castling: intermediate pieces obstruct castling path', () => {
      // Starting position: both sides have pieces on b1, c1, d1, f1, g1
      const preState = engine.getGameState();
      const resKs = engine.makeMove('O-O');
      expect(resKs.success).toBe(false);
      expect(engine.getGameState().fen).toBe(preState.fen);

      const resQs = engine.makeMove('O-O-O');
      expect(resQs.success).toBe(false);
      expect(engine.getGameState().fen).toBe(preState.fen);
    });

    it('1.6 Castling through check is illegal by FIDE Article 3.8.b (king crossing attacked square)', () => {
      // FEN: White Ke1, Rh1, Ra1. Black Bishop on a6 attacks f1 (square king must cross)
      engine.reset('r3k2r/8/b7/8/8/8/8/R3K2R w KQkq - 0 1');
      const preFen = engine.getGameState().fen;

      // King would cross f1 which is controlled by Ba6
      const resKs = engine.makeMove('O-O');
      expect(resKs.success).toBe(false);
      expect(engine.getGameState().fen).toBe(preFen);

      // Queenside: d1 is NOT attacked, b1 is NOT crossed by King -> O-O-O must be legal!
      const resQs = engine.makeMove('O-O-O');
      expect(resQs.success).toBe(true);
    });

    it('1.7 Castling through check on Queenside: crossing d1 while attacked is illegal', () => {
      // Black Rook on d8 controls d1 (square king must cross on queenside castling)
      engine.reset('3rk2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
      const preFen = engine.getGameState().fen;

      const resQs = engine.makeMove('O-O-O');
      expect(resQs.success).toBe(false);
      expect(engine.getGameState().fen).toBe(preFen);
    });

    it('1.8 Castling when King is currently in check is illegal', () => {
      // Black Rook on e8 delivers direct check to White King on e1
      engine.reset('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
      expect(engine.getGameState().isCheck).toBe(true);
      const preFen = engine.getGameState().fen;

      const resKs = engine.makeMove('O-O');
      expect(resKs.success).toBe(false);
      expect(engine.getGameState().fen).toBe(preFen);

      const resQs = engine.makeMove('O-O-O');
      expect(resQs.success).toBe(false);
      expect(engine.getGameState().fen).toBe(preFen);
    });

    it('1.9 Castling after King has moved and returned is permanently lost', () => {
      engine.reset('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
      engine.makeMove('Ke2');
      engine.makeMove('Ke7');
      engine.makeMove('Ke1');
      engine.makeMove('Ke8');

      const preFen = engine.getGameState().fen;
      expect(preFen).toContain('w - -'); // Both castling rights lost for White

      const resKs = engine.makeMove('O-O');
      expect(resKs.success).toBe(false);

      const resQs = engine.makeMove('O-O-O');
      expect(resQs.success).toBe(false);
      expect(engine.getGameState().fen).toBe(preFen);
    });

    it('1.10 Castling after Rook has moved: only that side loses castling rights', () => {
      engine.reset('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
      engine.makeMove('Rh2');
      engine.makeMove('Ke7');
      engine.makeMove('Rh1');
      engine.makeMove('Ke8');

      // White kingside lost (h1 rook moved), but queenside rook (a1) never moved
      const resKs = engine.makeMove('O-O');
      expect(resKs.success).toBe(false);

      const resQs = engine.makeMove('O-O-O');
      expect(resQs.success).toBe(true);
    });
  });

  describe('2. Pawn Promotion & Underpromotion Rules', () => {
    it('2.1 Standard promotion to Queen (e8=Q) sets queen piece and narrates correctly', () => {
      engine.reset('3k4/4P3/8/8/8/8/8/3K4 w - - 0 1');
      const res = engine.makeMove('e8=Q+');
      expect(res.success).toBe(true);
      expect(res.move?.promotion).toBe('q');
      expect(res.narration).toContain('Promoted to queen');
      expect(engine.getGameState().fen).toContain('3kQ3/8/8/8/8/8/8/3K4');
    });

    it('2.2 Underpromotion to Knight avoids stalemate and delivers check (B7/k1P5/2K5)', () => {
      // In FEN 'B7/k1P5/2K5/8/8/8/8/8 w - - 0 1':
      // Promoting to Queen (c8=Q) causes immediate STALEMATE.
      // Underpromoting to Knight (c8=N+) delivers CHECK, avoids stalemate, and wins!
      engine.reset('B7/k1P5/2K5/8/8/8/8/8 w - - 0 1');

      // Test c8=Q causes stalemate
      const resQ = engine.makeMove('c8=Q');
      expect(resQ.success).toBe(true);
      expect(resQ.gameState.isStalemate).toBe(true);
      expect(resQ.gameState.isGameOver).toBe(true);

      // Undo and test underpromotion to Knight
      engine.undoMove();
      expect(engine.getGameState().isStalemate).toBe(false);

      const resN = engine.makeMove('c8=N+');
      expect(resN.success).toBe(true);
      expect(resN.move?.promotion).toBe('n');
      expect(resN.narration).toContain('Promoted to knight');
      expect(resN.gameState.isStalemate).toBe(false);
      expect(resN.gameState.isCheck).toBe(true);
      expect(resN.gameState.legalMoves.length).toBeGreaterThan(0);
    });

    it('2.3 Underpromotion to Knight executes royal fork of King and Queen (8/2P1k3/3q4)', () => {
      // FEN: White Ka1, Pc7. Black Ke7, Qd6.
      // Underpromoting to Knight forks Ke7 and Qd6!
      engine.reset('8/2P1k3/3q4/8/8/8/8/K7 w - - 0 1');
      const res = engine.makeMove('c8=N+');
      expect(res.success).toBe(true);
      expect(res.move?.promotion).toBe('n');
      expect(res.gameState.isCheck).toBe(true);

      // Black must respond to check
      engine.makeMove('Ke6');
      // Knight on c8 can now capture the Queen on d6
      const captureQ = engine.makeMove('Nxd6');
      expect(captureQ.success).toBe(true);
      expect(captureQ.move?.captured).toBe('q');
      expect(engine.getGameState().capturedPieces.white).toContain('q');
    });

    it('2.4 Underpromotion to Rook avoids stalemate in classic Saavedra composition', () => {
      // FEN: 8/2P5/1r6/8/8/8/p7/k1K5 w - - 0 1
      // If 1. c8=Q, Black has 1... Rc6+! 2. Qxc6 STALEMATE.
      // If 1. c8=R!, Black cannot sacrifice rook with check, White threatens Ra8#.
      engine.reset('8/2P5/1r6/8/8/8/p7/k1K5 w - - 0 1');
      const resR = engine.makeMove('c8=R');
      expect(resR.success).toBe(true);
      expect(resR.move?.promotion).toBe('r');
      expect(resR.narration).toContain('Promoted to rook');
      expect(resR.gameState.isStalemate).toBe(false);
      expect(resR.gameState.fen).toContain('2R5/8/1r6/');
    });

    it('2.5 Underpromotion to Bishop (c8=B) is valid and avoids stalemate', () => {
      engine.reset('B7/k1P5/2K5/8/8/8/8/8 w - - 0 1');
      const resB = engine.makeMove('c8=B');
      expect(resB.success).toBe(true);
      expect(resB.move?.promotion).toBe('b');
      expect(resB.narration).toContain('Promoted to bishop');
      expect(resB.gameState.isStalemate).toBe(false);
      expect(resB.gameState.legalMoves.length).toBeGreaterThan(0);
    });

    it('2.6 Black promotion on Rank 1 (e1=Q, e1=N, e1=R, e1=B)', () => {
      engine.reset('3k4/8/8/8/8/8/4p3/3K4 b - - 0 1');
      const resQ = engine.makeMove('e1=Q+');
      expect(resQ.success).toBe(true);
      expect(resQ.move?.color).toBe('b');
      expect(resQ.move?.promotion).toBe('q');
      expect(resQ.gameState.isCheck).toBe(true);
      expect(resQ.narration).toContain('Promoted to queen');

      engine.undoMove();
      const resN = engine.makeMove('e1=N');
      expect(resN.success).toBe(true);
      expect(resN.move?.promotion).toBe('n');
      expect(resN.narration).toContain('Promoted to knight');
    });

    it('2.7 Illegal promotion attempts (e.g. promoting on rank 4 or to invalid piece) rejected', () => {
      // Pawn on rank 2 cannot promote
      const preFen = engine.getGameState().fen;
      const resInvalidRank = engine.makeMove('e4=Q');
      expect(resInvalidRank.success).toBe(false);
      expect(engine.getGameState().fen).toBe(preFen);

      // Pawn promoting to King (illegal)
      engine.reset('3k4/4P3/8/8/8/8/8/3K4 w - - 0 1');
      const resInvalidPiece = engine.makeMove('e8=K');
      expect(resInvalidPiece.success).toBe(false);
    });
  });

  describe('3. En Passant Captures', () => {
    it('3.1 Timing: en passant is strictly legal only immediately following the double push', () => {
      engine.makeMove('e4');
      engine.makeMove('e5');
      engine.makeMove('d4');
      engine.makeMove('exd4');
      engine.makeMove('e5');
      engine.makeMove('d5'); // Black double pawn push

      // Check that en passant 'exd6' is in legal moves right now
      const legalMovesBefore = engine.getGameState().legalMoves.map(m => m.san);
      expect(legalMovesBefore).toContain('exd6');

      // If White plays a different move (Nf3) and Black plays Nf6:
      engine.makeMove('Nf3');
      engine.makeMove('Nf6');

      // On move 5, en passant right is EXPIRED
      const legalMovesAfter = engine.getGameState().legalMoves.map(m => m.san);
      expect(legalMovesAfter).not.toContain('exd6');

      const attemptLateEP = engine.makeMove('exd6');
      expect(attemptLateEP.success).toBe(false);
    });

    it('3.2 Square validity & clearing captured pawn from board and capturedPieces ledger', () => {
      engine.makeMove('e4');
      engine.makeMove('e5');
      engine.makeMove('d4');
      engine.makeMove('exd4');
      engine.makeMove('e5');
      engine.makeMove('d5');

      const stateBefore = engine.getGameState();
      expect(stateBefore.capturedPieces.white).not.toContain('p');

      // Execute en passant capture
      const epResult = engine.makeMove('exd6');
      expect(epResult.success).toBe(true);
      expect(epResult.move?.captured).toBe('p');
      expect(epResult.move?.flags).toContain('e'); // 'e' flag for en passant in chess.js
      expect(epResult.narration).toContain('White pawn takes pawn on David 6');

      const stateAfter = engine.getGameState();
      // d5 square must be empty now (captured pawn cleared from board)
      expect(stateAfter.fen).not.toContain('3pP3');
      expect(stateAfter.capturedPieces.white).toContain('p');
    });

    it('3.3 Black en passant capture clears White pawn and updates ledger', () => {
      // 1. d4 Nf6 2. d5 e5 3. dxe6 (or reversed colors)
      engine.makeMove('a3'); // White waiting move
      engine.makeMove('d5');
      engine.makeMove('a4');
      engine.makeMove('d4');
      engine.makeMove('e4'); // White double push adjacent to Black pawn on d4

      const legalMoves = engine.getGameState().legalMoves.map(m => m.san);
      expect(legalMoves).toContain('dxe3');

      const epResult = engine.makeMove('dxe3');
      expect(epResult.success).toBe(true);
      expect(epResult.move?.color).toBe('b');
      expect(epResult.move?.captured).toBe('p');
      expect(engine.getGameState().capturedPieces.black).toContain('p');
    });
  });

  describe('4. Resignation & Game-Over Freezing', () => {
    it('4.1 White resigning freezes game-over and awards victory to Black', () => {
      const res = engine.resign('w');
      expect(res.success).toBe(true);
      expect(res.isGameOver).toBe(true);
      expect(res.narration).toBe('White resigns. Black wins by resignation.');
      expect(res.gameOverReason).toBe('White resigns. Black wins by resignation.');

      const state = engine.getGameState();
      expect(state.isGameOver).toBe(true);
      expect(state.legalMoves).toHaveLength(0);
      expect(state.isCheck).toBe(false);
      expect(state.isCheckmate).toBe(false);
    });

    it('4.2 Black resigning freezes game-over and awards victory to White', () => {
      engine.makeMove('e4');
      const res = engine.resign('b');
      expect(res.success).toBe(true);
      expect(res.isGameOver).toBe(true);
      expect(res.narration).toBe('Black resigns. White wins by resignation.');
    });

    it('4.3 Subsequent player moves and engine auto-moves after resignation are strictly rejected', () => {
      engine.resign('w');

      // Attempting player move
      const moveAttempt = engine.makeMove('e4');
      expect(moveAttempt.success).toBe(false);
      expect(moveAttempt.narration).toContain('White resigns. Black wins by resignation.');

      // Attempting opponent engine move
      const engineMoveAttempt = engine.makeEngineMove('intermediate');
      expect(engineMoveAttempt.success).toBe(false);
      expect(engineMoveAttempt.error).toBe('No legal moves available.');
      expect(engineMoveAttempt.narration).toContain('White resigns. Black wins by resignation.');

      // Attempting duplicate resignation
      const secondResign = engine.resign('b');
      expect(secondResign.success).toBe(false);
      expect(secondResign.narration).toContain('White resigns. Black wins by resignation.');
    });
  });

  describe('5. Board Scan: Rank 1 to Rank 8 Strict Ordering', () => {
    it('5.1 describeBoardState("scan") returns occupied squares ordered strictly Rank 1 to Rank 8', () => {
      const scan = engine.describeBoardState('scan');
      expect(scan.focus).toBe('scan');
      expect(scan.description).toContain('Board position, scanning rank 1 through rank 8');

      const rank1Pos = scan.description.indexOf('Rank 1:');
      const rank2Pos = scan.description.indexOf('Rank 2:');
      const rank7Pos = scan.description.indexOf('Rank 7:');
      const rank8Pos = scan.description.indexOf('Rank 8:');

      expect(rank1Pos).toBeGreaterThan(-1);
      expect(rank2Pos).toBeGreaterThan(rank1Pos);
      expect(rank7Pos).toBeGreaterThan(rank2Pos);
      expect(rank8Pos).toBeGreaterThan(rank7Pos);

      // Verify IBCA coordinate formatting
      expect(scan.description).toContain('White rook Anna 1');
      expect(scan.description).toContain('White king Eva 1');
      expect(scan.description).toContain('Black king Eva 8');
      expect(scan.description).toContain('Black rook Hector 8');
    });

    it('5.2 Comprehensive multi-rank position verifies all 8 ranks appear in strictly ascending order', () => {
      // Custom position with pieces on EVERY rank 1 through 8
      // Rank 1: Ke1, Rank 2: a2 pawn, Rank 3: Nc3, Rank 4: e4 pawn,
      // Rank 5: d5 pawn, Rank 6: Nf6, Rank 7: a7 pawn, Rank 8: Ke8
      engine.reset('4k3/p7/5n2/3p4/4P3/2N5/P7/4K3 w - - 0 1');
      const scan = engine.describeBoardState('scan');

      const rankIndices: number[] = [];
      for (let r = 1; r <= 8; r++) {
        const idx = scan.description.indexOf(`Rank ${r}:`);
        expect(idx).toBeGreaterThan(-1);
        rankIndices.push(idx);
      }

      for (let i = 0; i < rankIndices.length - 1; i++) {
        expect(rankIndices[i]).toBeLessThan(rankIndices[i + 1]);
      }
    });

    it('5.3 Files within each rank are announced in order from File Anna (a) through Hector (h)', () => {
      const scan = engine.describeBoardState('scan');
      // Rank 1 piece sequence: a1 (Anna), b1 (Bella), c1 (Cesar), d1 (David), e1 (Eva), f1 (Felix), g1 (Gustav), h1 (Hector)
      const r1Match = scan.description.match(/Rank 1: ([^.]+)\./);
      expect(r1Match).toBeTruthy();
      const r1Content = r1Match![1];

      const annaPos = r1Content.indexOf('Anna 1');
      const bellaPos = r1Content.indexOf('Bella 1');
      const cesarPos = r1Content.indexOf('Cesar 1');
      const davidPos = r1Content.indexOf('David 1');
      const evaPos = r1Content.indexOf('Eva 1');
      const felixPos = r1Content.indexOf('Felix 1');
      const gustavPos = r1Content.indexOf('Gustav 1');
      const hectorPos = r1Content.indexOf('Hector 1');

      expect(annaPos).toBeLessThan(bellaPos);
      expect(bellaPos).toBeLessThan(cesarPos);
      expect(cesarPos).toBeLessThan(davidPos);
      expect(davidPos).toBeLessThan(evaPos);
      expect(evaPos).toBeLessThan(felixPos);
      expect(felixPos).toBeLessThan(gustavPos);
      expect(gustavPos).toBeLessThan(hectorPos);
    });
  });

  describe('6. Engine Difficulty & Move Selection Characteristics', () => {
    it('6.1 3 Selectable difficulty levels exhibit distinct move selection characteristics', () => {
      const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

      // Beginner: high entropy (random moves) across 20 trials
      const beginnerMoves = new Set<string>();
      for (let i = 0; i < 20; i++) {
        engine.reset(fen);
        const res = engine.makeEngineMove('beginner');
        if (res.move) beginnerMoves.add(res.move.san);
      }
      expect(beginnerMoves.size).toBeGreaterThanOrEqual(3);

      // Intermediate: 1-ply evaluation gives deterministic selection
      const intermediateMoves = new Set<string>();
      for (let i = 0; i < 5; i++) {
        engine.reset(fen);
        const res = engine.makeEngineMove('intermediate');
        if (res.move) intermediateMoves.add(res.move.san);
      }
      expect(intermediateMoves.size).toBe(1);

      // Advanced: 2-ply evaluation gives deterministic selection
      const advancedMoves = new Set<string>();
      for (let i = 0; i < 5; i++) {
        engine.reset(fen);
        const res = engine.makeEngineMove('advanced');
        if (res.move) advancedMoves.add(res.move.san);
      }
      expect(advancedMoves.size).toBe(1);
    });

    it('6.2 Intermediate takes free material; Advanced avoids 2-ply trap that intermediate falls for', () => {
      // 1. Free Queen capture:
      engine.reset('rnb1kbnr/pppp1ppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
      const intRes = engine.makeEngineMove('intermediate');
      expect(intRes.move?.san).toBe('exd5'); // Greedily takes free queen

      // 2. 2-ply trap: White could take protected pawn on d5 with Queen (Qxd5), but Black answers with Nxd5 winning the Queen!
      // Advanced searches 2-ply ahead and refuses to blunder the Queen.
      engine.reset('r1bqkbnr/ppp2ppp/2n5/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1');
      const advRes = engine.makeEngineMove('advanced');
      expect(advRes.move?.san).not.toBe('Qxd5');
    });
  });

  describe('7. Engine Latency Benchmark (< 1500ms constraint across all phases)', () => {
    const positions = [
      { name: 'Standard Opening', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
      { name: 'French Defense Opening', fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' },
      { name: 'Dense Tactical Middlegame', fen: 'r1b2rk1/pp1nqppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQR1K1 w - - 4 9' },
      { name: 'Sharp Open Middlegame', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7' },
      { name: 'Rook & Pawn Endgame', fen: '8/5pk1/4p1p1/7p/7P/5KP1/5P2/8 w - - 0 35' },
      { name: 'Tactical Endgame', fen: '6k1/5ppp/8/8/8/8/1r3PPP/4R1K1 w - - 0 1' },
    ];

    const difficulties = ['beginner', 'intermediate', 'advanced', 'master'] as const;

    for (const pos of positions) {
      for (const diff of difficulties) {
        it(`Computes ${diff} move in ${pos.name} strictly under 1500ms`, () => {
          engine.reset(pos.fen);
          const t0 = performance.now();
          const res = engine.makeEngineMove(diff);
          const elapsed = performance.now() - t0;

          expect(res.success).toBe(true);
          expect(elapsed).toBeLessThan(1500);
        });
      }
    }
  });

  describe('8. State Preservation: Multi-Capture Undo Round-Trip', () => {
    it('8.1 Sequential undo of multi-capture chain perfectly restores FEN and capturedPieces at every ply', () => {
      // Forward move sequence with multiple captures by White and Black:
      // 1. e4
      // 2. d5
      // 3. exd5 (White captures black pawn)
      // 4. Qxd5 (Black captures white pawn)
      // 5. Nc3
      // 6. Qe5+
      // 7. Be2
      // 8. Bg4
      // 9. d4
      // 10. Bxe2 (Black captures white bishop)
      // 11. Ngxe2 (White captures black bishop)
      const moves = ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qe5+', 'Be2', 'Bg4', 'd4', 'Bxe2', 'Ngxe2'];
      const historySnapshots: { fen: string; capturedWhite: string[]; capturedBlack: string[] }[] = [];

      // Record initial starting position
      const initialFen = engine.getGameState().fen;
      historySnapshots.push({
        fen: initialFen,
        capturedWhite: [],
        capturedBlack: [],
      });

      // Play forward and record snapshot after each ply
      for (const m of moves) {
        const res = engine.makeMove(m);
        expect(res.success).toBe(true);
        const st = engine.getGameState();
        historySnapshots.push({
          fen: st.fen,
          capturedWhite: [...st.capturedPieces.white],
          capturedBlack: [...st.capturedPieces.black],
        });
      }

      // Check captured pieces at full forward play
      const finalState = engine.getGameState();
      expect(finalState.capturedPieces.white).toEqual(['p', 'b']);
      expect(finalState.capturedPieces.black).toEqual(['p', 'b']);

      // Now undo step-by-step in reverse and verify against exact forward snapshots
      for (let i = moves.length - 1; i >= 0; i--) {
        const undoRes = engine.undoMove();
        expect(undoRes.success).toBe(true);

        const expectedSnapshot = historySnapshots[i];
        const currentState = engine.getGameState();

        expect(currentState.fen).toBe(expectedSnapshot.fen);
        expect(currentState.capturedPieces.white).toEqual(expectedSnapshot.capturedWhite);
        expect(currentState.capturedPieces.black).toEqual(expectedSnapshot.capturedBlack);
      }

      // Verify board is 100% back at initial starting state
      const restoredInitial = engine.getGameState();
      expect(restoredInitial.fen).toBe(initialFen);
      expect(restoredInitial.turn).toBe('w');
      expect(restoredInitial.capturedPieces.white).toEqual([]);
      expect(restoredInitial.capturedPieces.black).toEqual([]);

      // Calling undo on empty history returns clean error without crashing
      const emptyUndo = engine.undoMove();
      expect(emptyUndo.success).toBe(false);
      expect(emptyUndo.error).toBe('No moves to undo.');
      expect(engine.getGameState().fen).toBe(initialFen);
    });
  });

  describe('9. State Preservation: Invalid Move Invariance', () => {
    it('9.1 Board state is 100% preserved after rejecting diverse illegal moves', () => {
      // Test starting position
      const testInvalidMoves = [
        'e5',        // Black move on White's turn
        'Ke2',       // Pawn blocks king
        'z9',        // Non-existent coordinate
        'banana',    // Garbage string
        'Nf5',       // Knight cannot leap 3 squares
        'e2e5',      // 3 squares pawn advance
        'Ra3',       // Pawn blocks rook
        'O-O',       // Castling blocked
        'O-O-O',     // Castling blocked
        'e4=Q',      // Cannot promote on rank 4
      ];

      for (const badMove of testInvalidMoves) {
        const preState = engine.getGameState();
        const res = engine.makeMove(badMove);

        expect(res.success).toBe(false);
        const postState = engine.getGameState();

        expect(postState.fen).toBe(preState.fen);
        expect(postState.turn).toBe(preState.turn);
        expect(postState.moveNumber).toBe(preState.moveNumber);
        expect(postState.capturedPieces).toEqual(preState.capturedPieces);
        expect(postState.isCheck).toBe(preState.isCheck);
        expect(postState.isGameOver).toBe(preState.isGameOver);
        expect(postState.legalMoves.length).toBe(preState.legalMoves.length);
      }
    });

    it('9.2 Moving pinned piece exposing King to check is rejected with complete state preservation', () => {
      // Position: Black King on e8, Black Knight on e7 pinned by White Rook on e1
      engine.reset('4k3/4n3/8/8/8/8/8/4R1K1 b - - 0 1');
      const preState = engine.getGameState();

      // Knight on e7 tries to move to f5, exposing King on e8 to check from Rook on e1
      const resPinned = engine.makeMove('Nf5');
      expect(resPinned.success).toBe(false);

      const postState = engine.getGameState();
      expect(postState.fen).toBe(preState.fen);
      expect(postState.turn).toBe('b');
      expect(postState.isCheck).toBe(false);
    });
  });
});

