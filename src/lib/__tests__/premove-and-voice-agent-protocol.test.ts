// ============================================================
// VoiceChessmate — Premove & AssemblyAI Protocol Verification Suite
// Verifies:
// 1. AssemblyAI Voice Agent tool.call protocol (call_id & tool_call_id)
// 2. Chess.com-style Voice Premove features (queue, cancel, auto-execute)
// 3. Spoken opponent move delivery with premoves
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ChessEngine } from '../chess-engine';
import { handleToolCall, CHESS_TOOLS } from '../tool-handlers';
import { SYSTEM_PROMPT, CHESS_KEYTERMS } from '../system-prompt';
import { MockVoiceAgentManager } from '../mock-voice-agent';
import { VoiceAgentManager } from '../voice-agent';

describe('AssemblyAI Voice Agent Protocol (call_id & tool_call_id)', () => {
  it('includes set_premove in CHESS_TOOLS array with valid schema', () => {
    const premoveTool = CHESS_TOOLS.find((t) => t.name === 'set_premove');
    expect(premoveTool).toBeDefined();
    expect(premoveTool?.type).toBe('function');
    expect(premoveTool?.parameters.properties.move_description).toBeDefined();
    expect(premoveTool?.parameters.properties.clear).toBeDefined();
  });

  it('includes PREMOVE guidelines in SYSTEM_PROMPT', () => {
    expect(SYSTEM_PROMPT).toContain('PREMOVE (CHESS.COM STYLE)');
    expect(SYSTEM_PROMPT).toContain('set_premove');
  });

  it('includes premove terms in CHESS_KEYTERMS', () => {
    expect(CHESS_KEYTERMS).toContain('premove');
    expect(CHESS_KEYTERMS).toContain('cancel premove');
  });

  it('MockVoiceAgentManager emits call_id on tool.call events', async () => {
    const mock = new MockVoiceAgentManager();
    let receivedCallId: string | undefined;

    mock.on('tool.call', (event) => {
      const e = event as unknown as { call_id?: string; tool_call_id?: string };
      receivedCallId = e.call_id;
      if (e.call_id) {
        mock.sendToolResult(e.call_id, JSON.stringify({ ok: true }));
      }
    });

    await mock.simulateToolCall('describe_board', { focus: 'full' }, 'chatcmpl-test-123');
    expect(receivedCallId).toBe('chatcmpl-test-123');
  });

  it('MockVoiceAgentManager sends tool.result with both call_id and tool_call_id', () => {
    const mock = new MockVoiceAgentManager();
    mock.sendToolResult('call_abc', JSON.stringify({ success: true }));

    const sent = mock.getLastSentEvent() as unknown as {
      type: string;
      call_id?: string;
      tool_call_id?: string;
      result?: string;
    };

    expect(sent.type).toBe('tool.result');
    expect(sent.call_id).toBe('call_abc');
    expect(sent.tool_call_id).toBe('call_abc');
    expect(sent.result).toContain('success');
  });

  it('VoiceAgentManager sendToolResult constructs payload with call_id and tool_call_id', () => {
    const manager = new VoiceAgentManager();
    let capturedPayload: {
      type?: string;
      call_id?: string;
      tool_call_id?: string;
      result?: string;
    } | null = null;

    // Spy on sendEvent
    manager.sendEvent = (event: Record<string, unknown>) => {
      capturedPayload = event as {
        type?: string;
        call_id?: string;
        tool_call_id?: string;
        result?: string;
      };
    };

    manager.sendToolResult('chatcmpl-tool-999', JSON.stringify({ narration: 'Test move' }));

    // Read through a fresh binding — TS's control-flow analysis can't see the
    // assignment inside the sendEvent closure and otherwise narrows this to never.
    const payload = capturedPayload as {
      type?: string;
      call_id?: string;
      tool_call_id?: string;
      result?: string;
    } | null;

    expect(payload).not.toBeNull();
    expect(payload?.type).toBe('tool.result');
    expect(payload?.call_id).toBe('chatcmpl-tool-999');
    expect(payload?.tool_call_id).toBe('chatcmpl-tool-999');
    expect(payload?.result).toBe(JSON.stringify({ narration: 'Test move' }));
  });
});

describe('ChessEngine Premove Capabilities', () => {
  let engine: ChessEngine;

  // Premoves are stored as resolved squares, never as spoken words — the board
  // changes before they fire, so words would be re-interpreted against a
  // different position and could resolve to a different piece's move.
  const e2e4 = { from: 'e2', to: 'e4', san: 'e4', spoken: 'Eva 4' };
  const g1f3 = { from: 'g1', to: 'f3', san: 'Nf3', spoken: 'knight to Felix 3' };

  beforeEach(() => {
    engine = new ChessEngine();
  });

  it('queues a resolved premove and exposes its SAN on GameState', () => {
    const res = engine.setPremove(e2e4);
    expect(res.success).toBe(true);
    expect(res.premove).toBe('e4');
    expect(res.narration).toContain('Premove queued');

    expect(engine.getGameState().premove).toBe('e4');
    expect(engine.getPremove()).toMatchObject({ from: 'e2', to: 'e4' });
  });

  it('clears an active premove and updates GameState', () => {
    engine.setPremove(g1f3);
    expect(engine.getPremove()).toMatchObject({ from: 'g1', to: 'f3' });

    const clearRes = engine.clearPremove();
    expect(clearRes.success).toBe(true);
    expect(clearRes.narration).toContain('cancelled');
    expect(engine.getPremove()).toBeNull();
    expect(engine.getGameState().premove).toBeNull();
  });

  it('reports no active premove when clearing an empty premove', () => {
    const clearRes = engine.clearPremove();
    expect(clearRes.success).toBe(true);
    expect(clearRes.narration).toContain('No active premove');
  });

  it('resets premove when engine.reset() is called', () => {
    engine.setPremove(e2e4);
    engine.reset();
    expect(engine.getPremove()).toBeNull();
    expect(engine.getGameState().premove).toBeNull();
  });

  it('plays the premove only when those exact squares are still legal', () => {
    engine.setPremove(e2e4);
    engine.makeMove('d4');          // player moves something else
    engine.makeMove('d5');          // opponent replies; e2-e4 is still legal
    const out = engine.tryExecutePremove();
    expect(out.played).toBe(true);
    expect(engine.getGameState().pgn).toContain('e4');
    expect(engine.getPremove()).toBeNull();
  });

  it('discards the premove instead of substituting when it became illegal', () => {
    engine.setPremove(e2e4);
    engine.makeMove('e3');          // e2 pawn moved; e2-e4 can never happen now
    const fenBefore = engine.getGameState().fen;
    const out = engine.tryExecutePremove();
    expect(out.played).toBe(false);
    expect(out.narration).toMatch(/no longer legal/i);
    expect(engine.getGameState().fen).toBe(fenBefore); // board untouched
    expect(engine.getPremove()).toBeNull();
  });

  it('is a no-op when nothing is queued', () => {
    const out = engine.tryExecutePremove();
    expect(out.played).toBe(false);
  });
});

describe('Premove queueing refuses ambiguous speech', () => {
  it('rejects a vague phrase rather than queueing a guess', () => {
    const engine = new ChessEngine();
    const parsed = JSON.parse(
      handleToolCall(engine, 'set_premove', { move_description: 'move something' })
    );
    expect(parsed.success).toBe(false);
    expect(parsed.clarificationNeeded).toBe(true);
    expect(engine.getPremove()).toBeNull();
  });

  it('accepts exact notation', () => {
    const engine = new ChessEngine();
    const parsed = JSON.parse(
      handleToolCall(engine, 'set_premove', { move_description: 'Nf3' })
    );
    expect(parsed.success).toBe(true);
    expect(engine.getPremove()).toMatchObject({ from: 'g1', to: 'f3' });
  });
});

describe('Voice Premove Execution via handleToolCall', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  const queue = (desc: string) =>
    JSON.parse(handleToolCall(engine, 'set_premove', { move_description: desc }));

  it('sets premove via dedicated set_premove tool call', () => {
    const parsed = queue('Knight to Felix 3');
    expect(parsed.success).toBe(true);
    expect(parsed.premove).toBe('Nf3'); // stored as resolved SAN, not the spoken words
    expect(parsed.narration).toContain('Premove queued');
    expect(engine.getPremove()).toMatchObject({ from: 'g1', to: 'f3' });
  });

  it('clears premove via set_premove with clear: true', () => {
    queue('Nf3');
    const parsed = JSON.parse(handleToolCall(engine, 'set_premove', { clear: true }));

    expect(parsed.success).toBe(true);
    expect(parsed.narration).toContain('cancelled');
    expect(engine.getPremove()).toBeNull();
  });

  it('handles verbal premove in apply_move (e.g. "premove Eva 4")', () => {
    const parsed = JSON.parse(
      handleToolCall(engine, 'apply_move', { move_description: 'premove Eva 4' })
    );

    expect(parsed.success).toBe(true);
    expect(parsed.premove).toBe('e4');
    expect(parsed.narration).toContain('Premove queued');
    expect(engine.getPremove()).toMatchObject({ from: 'e2', to: 'e4' });
  });

  it('handles verbal cancel premove in apply_move (e.g. "cancel premove")', () => {
    queue('Nf3');
    const parsed = JSON.parse(
      handleToolCall(engine, 'apply_move', { move_description: 'cancel premove' })
    );

    expect(parsed.success).toBe(true);
    expect(parsed.narration).toContain('cancelled');
    expect(engine.getPremove()).toBeNull();
  });

  it('automatically executes queued premove after opponent responds', () => {
    queue('knight to Felix 3');
    expect(engine.getPremove()).toMatchObject({ from: 'g1', to: 'f3' });

    const parsed = JSON.parse(
      handleToolCall(engine, 'apply_move', { move_description: 'Eva 4' }, undefined, 'beginner')
    );
    expect(parsed.success).toBe(true);

    // Spoken narration carries the opponent reply and the premove, but NOT the
    // player's own move 1 (that lives in your_move).
    expect(parsed.your_move).toContain('Eva 4');
    expect(parsed.narration).toContain('Your premove');
    expect(parsed.narration).toContain('Felix 3');
    expect(parsed.premove_executed).toBe(true);
    expect(engine.getPremove()).toBeNull();
  });

  it('refuses to queue a move that is not legal in the current position', () => {
    // Rooks cannot move on move 1 — under resolve-at-queue this is caught up front
    // rather than being stored and mis-resolved later.
    const parsed = queue('rook to Eva 4');
    expect(parsed.success).toBe(false);
    expect(parsed.clarificationNeeded).toBe(true);
    expect(engine.getPremove()).toBeNull();
  });

  it('discards a queued premove that became illegal, without substituting', () => {
    queue('Nf3');
    // Move that same knight elsewhere, so the g1 square is empty and the queued
    // g1->f3 can never happen. A re-matching implementation would "helpfully"
    // find some other knight move here; this one must not.
    engine.makeMove('Nh3');
    engine.makeMove('a5');
    const before = engine.getGameState().fen;
    const out = engine.tryExecutePremove();
    expect(out.played).toBe(false);
    expect(engine.getGameState().fen).toBe(before);
    expect(engine.getPremove()).toBeNull();
  });
});
