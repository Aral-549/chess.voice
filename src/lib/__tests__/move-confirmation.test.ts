import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChessEngine } from '../chess-engine';
import {
  handleToolCall,
  fuzzyMatchMove,
  setConfirmEverySpokenMove,
  AUTOPLAY_MIN_CONFIDENCE,
  CONFIRM_MIN_CONFIDENCE,
} from '../tool-handlers';

const play = (e: ChessEngine, desc: string) =>
  JSON.parse(handleToolCall(e, 'apply_move', { move_description: desc }, undefined, 'beginner'));

// Spoken IBCA/natural phrasing tops out at 0.9. In paranoid mode anything short
// of exact notation (1.0) must be confirmed — that's the band exercised here.
const MID = 'knight f3';

describe('spoken move confirmation (paranoid mode)', () => {
  beforeEach(() => setConfirmEverySpokenMove(true));
  afterEach(() => setConfirmEverySpokenMove(false));

  it('plays exact notation outright even in paranoid mode', () => {
    const e = new ChessEngine();
    const res = play(e, 'e4');
    expect(res.success).toBe(true);
    expect(res.confirmationNeeded).toBeUndefined();
    expect(e.getGameState().pgn).toContain('e4');
  });

  it('holds a mid-confidence move and does NOT touch the board', () => {
    const c = fuzzyMatchMove(MID, new ChessEngine()).confidence;
    expect(c).toBeGreaterThanOrEqual(CONFIRM_MIN_CONFIDENCE);
    expect(c).toBeLessThan(1.0); // understood, but not exact notation

    const e = new ChessEngine();
    const before = e.getGameState().fen;
    const res = play(e, MID);

    expect(res.success).toBe(false);
    expect(res.confirmationNeeded).toBe(true);
    expect(res.narration).toMatch(/say yes/i);
    expect(e.getGameState().fen, 'board must be untouched until confirmed').toBe(before);
    expect(e.getPendingConfirmation()).not.toBeNull();
  });

  it('"yes" plays the held move and the opponent replies', () => {
    const e = new ChessEngine();
    play(e, MID);
    const pending = e.getPendingConfirmation()!;

    const res = play(e, 'yes');
    expect(res.success).toBe(true);
    expect(res.your_move).toBeDefined();
    expect(res.narration).toMatch(/Black/); // opponent replied
    expect(e.getGameState().pgn).toContain(pending.san.replace(/[+#]/g, ''));
    expect(e.getPendingConfirmation()).toBeNull();
  });

  it('"no" discards it and plays nothing', () => {
    const e = new ChessEngine();
    play(e, MID);
    const before = e.getGameState().fen;

    const res = play(e, 'no');
    expect(res.success).toBe(false);
    expect(res.narration).toMatch(/cancelled/i);
    expect(e.getGameState().fen).toBe(before);
    expect(e.getPendingConfirmation()).toBeNull();
  });

  it('an unrelated phrase drops the pending move rather than confirming it', () => {
    const e = new ChessEngine();
    play(e, MID);

    // Saying a different, clear move must play THAT move — never the held one.
    const res = play(e, 'd4');
    expect(res.success).toBe(true);
    expect(e.getGameState().pgn).toContain('d4');
    expect(e.getPendingConfirmation()).toBeNull();
  });

  it('still refuses outright anything below the confirm threshold', () => {
    const e = new ChessEngine();
    const before = e.getGameState().fen;
    const res = play(e, 'do something clever');
    expect(res.success).toBe(false);
    expect(res.clarificationNeeded).toBe(true);
    expect(res.confirmationNeeded).toBeUndefined();
    expect(e.getGameState().fen).toBe(before);
  });

  it('thresholds are ordered so no confidence band is unreachable', () => {
    expect(CONFIRM_MIN_CONFIDENCE).toBeLessThan(AUTOPLAY_MIN_CONFIDENCE);
  });

  it('default mode plays 0.9 spoken moves without asking', () => {
    setConfirmEverySpokenMove(false);
    const e = new ChessEngine();
    const res = play(e, 'knight to Felix 3');
    expect(res.success).toBe(true);
    expect(res.confirmationNeeded).toBeUndefined();
    expect(e.getGameState().pgn).toContain('Nf3');
  });
});
