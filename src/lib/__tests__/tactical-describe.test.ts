import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../chess-engine';
import { handleToolCall } from '../tool-handlers';

const tactical = (e: ChessEngine) => e.describeBoardState('tactical').description;

describe('tactical (blitz) describe', () => {
  it('reports even material and nothing hanging from the start position', () => {
    const d = tactical(new ChessEngine());
    expect(d).toContain('Material even');
    expect(d).not.toContain('Hanging');
  });

  it('names a free capture when the opponent leaves a piece undefended', () => {
    const e = new ChessEngine();
    // 1. e4 e5 2. Bc4 Nf6?? — the e5 pawn is loose
    e.reset('rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1');
    const d = tactical(e);
    expect(d.toLowerCase()).toMatch(/free|hanging|material/);
  });

  it('announces check', () => {
    const e = new ChessEngine();
    e.reset('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 1');
    expect(tactical(e)).toContain('You are in check');
  });

  it('reports a material deficit in pawns', () => {
    const e = new ChessEngine();
    // White is missing its queen
    e.reset('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1');
    expect(tactical(e)).toContain('You are down 9 pawns');
  });

  it('stays short enough to be useful in blitz', () => {
    expect(tactical(new ChessEngine()).length).toBeLessThan(200);
  });
});

describe('apply_move narration announces ONLY the opponent reply', () => {
  it('does not echo the player move back', () => {
    const e = new ChessEngine();
    const res = JSON.parse(handleToolCall(e, 'apply_move', { move_description: 'e4' }));
    expect(res.success).toBe(true);
    // The opponent is Black; the player's own move must not appear in the spoken text
    expect(res.narration).not.toMatch(/White/i);
    expect(res.narration).toMatch(/Black/i);
    // ...but the UI still gets the player's move separately
    expect(res.your_move).toMatch(/White/i);
  });
});
