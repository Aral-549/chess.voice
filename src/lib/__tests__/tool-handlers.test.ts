import { describe, it, expect, beforeEach } from 'vitest';
import { ChessEngine } from '../chess-engine';
import { handleToolCall, normalizeIBCASpeech, setEngineDifficulty, getEngineDifficulty } from '../tool-handlers';

describe('Tool Handlers', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
    setEngineDifficulty('intermediate');
  });

  // --- Basic Tool Dispatch ---

  it('handleToolCall() dispatches to correct tool', () => {
    const resultJson = handleToolCall(engine, 'get_legal_moves', { piece_or_square: 'all' });
    const result = JSON.parse(resultJson);
    expect(result.moves).toBeDefined();
  });

  it('Unknown tool returns error', () => {
    const resultJson = handleToolCall(engine, 'unknown_tool', {});
    const result = JSON.parse(resultJson);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Unknown tool');
  });

  // --- Speech & IBCA Move Parsing ---

  it('apply_move with IBCA speech ("Eva 4" -> e4)', () => {
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'Eva 4' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.your_move).toContain('Eva 4');
  });

  it('apply_move with natural language ("knight to Felix 3")', () => {
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'knight to Felix 3' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.your_move).toContain('Felix 3');
  });

  // --- Homophone Resolution ---

  it('Fuzzy matcher handles ASR mis-hearings ("night" -> knight)', () => {
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'night to f3' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.your_move).toContain('Felix 3');
  });

  it('Fuzzy matcher handles homophone "before" -> "b4"', () => {
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'before' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.your_move).toContain('Bella 4');
  });

  it('Fuzzy matcher handles homophone "see four" -> "c4"', () => {
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'see four' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.your_move).toContain('Cesar 4');
  });

  it('Fuzzy matcher handles number word homophones ("tree" -> 3, "fore" -> 4)', () => {
    const e1 = new ChessEngine();
    const res1 = JSON.parse(handleToolCall(e1, 'apply_move', { move_description: 'Felix tree' }));
    expect(res1.success).toBe(true);
    expect(res1.your_move).toContain('Felix 3');

    const e2 = new ChessEngine();
    const res2 = JSON.parse(handleToolCall(e2, 'apply_move', { move_description: 'David fore' }));
    expect(res2.success).toBe(true);
    expect(res2.your_move).toContain('David 4');
  });

  it('normalizeIBCASpeech normalizes all IBCA files (Anna..Hector)', () => {
    expect(normalizeIBCASpeech('Anna 4')).toBe('a4');
    expect(normalizeIBCASpeech('Bella 3')).toBe('b3');
    expect(normalizeIBCASpeech('Cesar 4')).toBe('c4');
    expect(normalizeIBCASpeech('David 4')).toBe('d4');
    expect(normalizeIBCASpeech('Eva 4')).toBe('e4');
    expect(normalizeIBCASpeech('Felix 3')).toBe('f3');
    expect(normalizeIBCASpeech('Gustav 3')).toBe('g3');
    expect(normalizeIBCASpeech('Hector 4')).toBe('h4');
    expect(normalizeIBCASpeech('before')).toBe('b4');
    expect(normalizeIBCASpeech('night to f3')).toBe('knight to f3');
  });

  // --- Pawn Promotion ---

  it('Pawn promotion to Queen ("Eva 8 Queen" -> e8=Q)', () => {
    // Non-terminal promotion position: White pawn on e7, White King on a1, Black King on h8, Black pawn on h7
    const promoEngine = new ChessEngine('7k/4P2p/8/8/8/8/8/K7 w - - 0 1');
    const resultJson = handleToolCall(promoEngine, 'apply_move', { move_description: 'Eva 8 Queen' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.your_move.toLowerCase()).toContain('queen');
    expect(result.your_move).toContain('Eva 8');
  });

  it('Pawn promotion to Rook ("e8 rook" -> e8=R)', () => {
    const promoEngine = new ChessEngine('7k/4P2p/8/8/8/8/8/K7 w - - 0 1');
    const resultJson = handleToolCall(promoEngine, 'apply_move', { move_description: 'e8 rook' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.your_move.toLowerCase()).toContain('rook');
  });

  it('Pawn promotion defaults to Queen when piece is unspecified ("Eva 8")', () => {
    const promoEngine = new ChessEngine('7k/4P2p/8/8/8/8/8/K7 w - - 0 1');
    const resultJson = handleToolCall(promoEngine, 'apply_move', { move_description: 'Eva 8' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.your_move.toLowerCase()).toContain('queen');
  });

  // --- Resignation ---

  it('Verbal resignation via apply_move ("I resign") terminates game', () => {
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'I resign' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.narration.toLowerCase()).toContain('resign');
    expect(engine.getGameState().isGameOver).toBe(true);
  });

  it('Dedicated resign_game tool terminates game with narration', () => {
    const resultJson = handleToolCall(engine, 'resign_game', {});
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.narration.toLowerCase()).toContain('resign');
    expect(engine.getGameState().isGameOver).toBe(true);
  });

  it('Resignation preserves board FEN and prevents subsequent moves', () => {
    engine.makeMove('e4');
    engine.makeMove('e5');
    const fenBefore = engine.getGameState().fen;

    const resignJson = handleToolCall(engine, 'resign_game', { color: 'w' });
    const resignRes = JSON.parse(resignJson);
    expect(resignRes.success).toBe(true);
    expect(engine.getGameState().fen).toBe(fenBefore);
    expect(engine.getGameState().isGameOver).toBe(true);

    // Subsequent move attempt should be rejected
    const nextMoveJson = handleToolCall(engine, 'apply_move', { move_description: 'Nf3' });
    const nextMoveRes = JSON.parse(nextMoveJson);
    expect(nextMoveRes.success).toBe(false);
  });

  // --- Difficulty Setting ---

  it('set_difficulty tool updates engine difficulty', () => {
    expect(getEngineDifficulty()).toBe('intermediate');

    const resultJson = handleToolCall(engine, 'set_difficulty', { difficulty: 'master' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.difficulty).toBe('master');
    expect(result.narration).toContain('master');
    expect(getEngineDifficulty()).toBe('master');
  });

  it('set_difficulty tool rejects invalid difficulty with error narration', () => {
    const resultJson = handleToolCall(engine, 'set_difficulty', { difficulty: 'grandmaster' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid difficulty');
    expect(result.narration).toContain('Invalid difficulty');
  });

  it('verbal difficulty setting in apply_move updates difficulty', () => {
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'set difficulty to beginner' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(true);
    expect(result.difficulty).toBe('beginner');
    expect(getEngineDifficulty()).toBe('beginner');
  });

  // --- Ambiguity & Tie Detection ---

  it('Ambiguity rejection flags moves with confidence < 0.6 and provides clarification', () => {
    const fenBefore = engine.getGameState().fen;
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'banana split 42' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(false);
    expect(result.clarificationNeeded).toBe(true);
    expect(result.narration.toLowerCase()).toContain('not sure which move you mean');
    expect(engine.getGameState().fen).toBe(fenBefore);
  });

  it('Multi-candidate tie detection (e.g. "knight" on move 1) flags ambiguity', () => {
    const fenBefore = engine.getGameState().fen;
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'knight' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(false);
    expect(result.clarificationNeeded).toBe(true);
    expect(result.narration.toLowerCase()).toContain('which');
    expect(engine.getGameState().fen).toBe(fenBefore);
  });

  // --- Invalid Move & Error Handling ---

  it('Illegal pawn move is rejected with verbal explanation and preserves board state', () => {
    const fenBefore = engine.getGameState().fen;
    const turnBefore = engine.getGameState().turn;

    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'pawn to e5' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(false);
    expect(engine.getGameState().fen).toBe(fenBefore);
    expect(engine.getGameState().turn).toBe(turnBefore);
  });

  it('Non-existent coordinate ("pawn to z9") rejected with state preservation', () => {
    const fenBefore = engine.getGameState().fen;
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: 'pawn to z9' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(false);
    expect(result.clarificationNeeded).toBe(true);
    expect(engine.getGameState().fen).toBe(fenBefore);
  });

  it('Empty move description returns clarification request without mutating board', () => {
    const fenBefore = engine.getGameState().fen;
    const resultJson = handleToolCall(engine, 'apply_move', { move_description: '   ' });
    const result = JSON.parse(resultJson);
    expect(result.success).toBe(false);
    expect(result.clarificationNeeded).toBe(true);
    expect(result.message).toContain('Please specify a move');
    expect(engine.getGameState().fen).toBe(fenBefore);
  });

  // --- Board State, Hint, and Undo ---

  it('describe_board returns board description', () => {
    const resultJson = handleToolCall(engine, 'describe_board', { focus: 'full' });
    const result = JSON.parse(resultJson);
    expect(result.description).toBeDefined();
    expect(typeof result.description).toBe('string');
  });

  it('get_hint returns evaluation', () => {
    const resultJson = handleToolCall(engine, 'get_hint', {});
    const result = JSON.parse(resultJson);
    expect(result.bestMove).toBeDefined();
    expect(result.evaluation).toBeDefined();
  });

  it('undo_move undoes two moves (player + opponent)', () => {
    engine.makeMove('e4');
    engine.makeMove('e5');

    expect(engine.getGameState().moveNumber).toBe(2);

    const resultJson = handleToolCall(engine, 'undo_move', {});
    const result = JSON.parse(resultJson);

    expect(result.success).toBe(true);
    expect(engine.getGameState().moveNumber).toBe(1);
    expect(engine.getGameState().turn).toBe('w');
  });
});

