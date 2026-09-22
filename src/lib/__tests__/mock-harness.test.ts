// ============================================================
// VoiceChessmate — Mock Voice Agent Harness Test Suite
// Verifies headless synthetic voice agent interactions in CI
// Zero network calls, zero AudioContext, zero API keys required.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { MockVoiceAgentManager } from '../mock-voice-agent';
import { ChessEngine } from '../chess-engine';
import { handleToolCall } from '../tool-handlers';
import type { VoiceAgentEvent } from '@/types';
import type { VoiceAgentStatus } from '../mock-voice-agent';

describe('MockVoiceAgentManager CI Harness', () => {
  let agent: MockVoiceAgentManager;
  let engine: ChessEngine;

  beforeEach(() => {
    agent = new MockVoiceAgentManager();
    engine = new ChessEngine();
  });

  describe('Lifecycle & Connection Contract', () => {
    it('initializes in disconnected state without network or audio hardware', () => {
      expect(agent.getStatus()).toBe('disconnected');
      expect(agent.isListening()).toBe(false);
      expect(agent.getBufferedAudio()).toHaveLength(0);
      expect(agent.isAudioFlushed()).toBe(false);
    });

    it('connects headlessly and transitions status through connecting to ready', async () => {
      const statusTransitions: VoiceAgentStatus[] = [];
      agent.onStatusChange((status) => statusTransitions.push(status));

      let readyEventReceived = false;
      agent.on('session.ready', (event: VoiceAgentEvent) => {
        expect(event.session_id).toBeDefined();
        readyEventReceived = true;
      });

      await agent.connect({
        system_prompt: 'You are a chess voice assistant.',
        greeting: 'Welcome to VoiceChessmate.',
      });

      expect(agent.getStatus()).toBe('ready');
      expect(statusTransitions).toContain('connecting');
      expect(statusTransitions).toContain('ready');
      expect(readyEventReceived).toBe(true);
    });

    it('supports onStateChange alias for parity with event specifications', async () => {
      const states: VoiceAgentStatus[] = [];
      const unsubscribe = agent.onStateChange((s) => states.push(s));

      await agent.connect();
      expect(states).toEqual(['connecting', 'ready']);

      agent.setListening(true);
      expect(states).toEqual(['connecting', 'ready', 'listening']);

      unsubscribe();
      agent.setListening(false);
      // Handler was unsubscribed, so length remains 3
      expect(states).toHaveLength(3);
    });

    it('handles push-to-talk listening state transitions', async () => {
      await agent.connect();
      expect(agent.getStatus()).toBe('ready');

      agent.startListening();
      expect(agent.isListening()).toBe(true);
      expect(agent.getStatus()).toBe('listening');

      agent.stopListening();
      expect(agent.isListening()).toBe(false);
      expect(agent.getStatus()).toBe('ready');
    });

    it('disconnects cleanly, flushes audio, and cleans up state', async () => {
      await agent.connect();
      agent.simulateAudioStream('dummyAudioData==');
      expect(agent.getBufferedAudio().length).toBeGreaterThan(0);

      let closeEventFired = false;
      agent.on('session.close', (e) => {
        if (e.type === 'session.close') closeEventFired = true;
      });

      agent.disconnect();

      expect(agent.getStatus()).toBe('disconnected');
      expect(agent.isListening()).toBe(false);
      expect(agent.isAudioFlushed()).toBe(true);
      expect(agent.getBufferedAudio()).toHaveLength(0);
      expect(closeEventFired).toBe(true);
    });
  });

  describe('Synthetic Speech & Transcript Simulation', () => {
    it('simulates partial and final speech transcripts', async () => {
      await agent.connect();

      const receivedTranscripts: { text: string; isFinal: boolean }[] = [];
      agent.onTranscript((text, isFinal) => {
        receivedTranscripts.push({ text, isFinal });
      });

      agent.simulateTranscript('I want to move', false);
      agent.simulateTranscript('Eva 4', true);

      expect(receivedTranscripts).toEqual([
        { text: 'I want to move', isFinal: false },
        { text: 'Eva 4', isFinal: true },
      ]);
    });

    it('sendTextMessage sends a final speech transcript', async () => {
      await agent.connect();

      let lastTranscript = '';
      agent.onTranscript((t, final) => {
        if (final) lastTranscript = t;
      });

      agent.sendTextMessage('Felix 3');
      expect(lastTranscript).toBe('Felix 3');
    });

    it('simulates agent speech replies with delta and audio chunks', async () => {
      await agent.connect();

      const events: string[] = [];
      agent.on('*', (e) => events.push(e.type));

      agent.simulateAgentReply('White pawn moved to Eva 4', 'audioBase64Chunk==');

      expect(events).toContain('reply.started');
      expect(events).toContain('transcript.agent.delta');
      expect(events).toContain('agent.text');
      expect(events).toContain('reply.audio');
      expect(events).toContain('reply.done');
      expect(agent.getBufferedAudio()).toContain('audioBase64Chunk==');
    });
  });

  describe('Audio Buffer Management & Interruption', () => {
    it('simulates audio streaming and gapless buffer accumulation', () => {
      const audioList: string[] = [];
      agent.onAudioData((chunk) => audioList.push(chunk));

      agent.simulateAudioStream('chunk1==');
      agent.simulateAudioStream('chunk2==');

      expect(audioList).toEqual(['chunk1==', 'chunk2==']);
      expect(agent.getBufferedAudio()).toEqual(['chunk1==', 'chunk2==']);
    });

    it('flushes audio buffer on user interruption', () => {
      agent.simulateAudioStream('chunkA==');
      agent.simulateAudioStream('chunkB==');
      expect(agent.getBufferedAudio()).toHaveLength(2);

      let interrupted = false;
      agent.on('reply.done', (e) => {
        if (e.status === 'interrupted') interrupted = true;
      });

      agent.flushAudio();

      expect(agent.getBufferedAudio()).toHaveLength(0);
      expect(agent.isAudioFlushed()).toBe(true);
      expect(agent.getFlushedCount()).toBe(1);
      expect(interrupted).toBe(true);
    });
  });

  describe('Synthetic Tool Call Lifecycle & Chess Integration', () => {
    it('dispatches tool call and resolves promise when sendToolResult is invoked', async () => {
      await agent.connect();

      agent.onToolCall(({ id, name, args }) => {
        expect(name).toBe('describe_board');
        expect(args.focus).toBe('full');
        agent.sendToolResult(id, JSON.stringify({ description: 'Initial board state' }));
      });

      const resultStr = await agent.simulateToolCall('describe_board', { focus: 'full' });
      const parsed = JSON.parse(resultStr);

      expect(parsed.description).toBe('Initial board state');
      expect(agent.getLastSentEvent()?.type).toBe('tool.result');
    });

    it('executes automated tool dispatcher wired with real handleToolCall', async () => {
      await agent.connect();

      // Wire automatic tool handler
      agent.registerToolHandler(async (name, args) => {
        return handleToolCall(engine, name, args);
      });

      // 1. Tool Call: apply_move
      const moveResStr = await agent.simulateToolCall('apply_move', { move_description: 'Eva 4' });
      const moveRes = JSON.parse(moveResStr);
      expect(moveRes.success).toBe(true);
      expect(moveRes.your_move).toContain('Eva 4');
      expect(moveRes.fen).toContain('/4P3/');

      // 2. Tool Call: describe_board
      const descResStr = await agent.simulateToolCall('describe_board', { focus: 'scan' });
      const descRes = JSON.parse(descResStr);
      expect(descRes.description).toContain('scanning rank 1 through rank 8');

      // 3. Tool Call: get_hint
      const hintResStr = await agent.simulateToolCall('get_hint', { difficulty: 'intermediate' });
      const hintRes = JSON.parse(hintResStr);
      expect(hintRes.bestMove).toBeDefined();
      expect(hintRes.explanation).toBeDefined();

      // 4. Tool Call: undo_move
      const undoResStr = await agent.simulateToolCall('undo_move', {});
      const undoRes = JSON.parse(undoResStr);
      expect(undoRes.success).toBe(true);
      expect(undoRes.narration).toContain('Took back the last move');

      // 5. Tool Call: set_difficulty
      const diffResStr = await agent.simulateToolCall('set_difficulty', { difficulty: 'advanced' });
      const diffRes = JSON.parse(diffResStr);
      expect(diffRes.success).toBe(true);
      expect(diffRes.difficulty).toBe('advanced');

      // 6. Tool Call: resign_game
      const resignResStr = await agent.simulateToolCall('resign_game', { color: 'w' });
      const resignRes = JSON.parse(resignResStr);
      expect(resignRes.success).toBe(true);
      expect(resignRes.isGameOver).toBe(true);
      expect(engine.getGameState().isGameOver).toBe(true);
    });

    it('rejects pending tool calls if agent disconnects abruptly', async () => {
      await agent.connect();

      const toolPromise = agent.simulateToolCall('apply_move', { move_description: 'e4' });
      agent.disconnect();

      await expect(toolPromise).rejects.toThrow(/disconnected with pending tool call/);
    });
  });

  describe('Synthetic Error Simulation', () => {
    it('transitions to error state and notifies onError listeners', async () => {
      await agent.connect();

      let caughtError: Error | null = null;
      agent.onError((err) => {
        caughtError = err instanceof Error ? err : new Error(String(err));
      });

      agent.simulateError('Simulated WebSocket timeout');

      expect(agent.getStatus()).toBe('error');
      expect(caughtError).not.toBeNull();
      expect((caughtError as unknown as Error).message).toBe('Simulated WebSocket timeout');
    });
  });

  describe('Full End-to-End Synthetic Voice Session Lifecycle', () => {
    it('executes a complete game turn session headlessly with zero API keys', async () => {
      // Step 1: Initialize without API key or audio hardware
      expect(process.env.ASSEMBLYAI_API_KEY).toBeUndefined();

      // Step 2: Wire agent wildcard routing (same pattern as page.tsx)
      const transcriptLedger: { speaker: string; text: string }[] = [];

      agent.on('*', (event) => {
        const type = event.type as string;

        if (type.startsWith('transcript.user') && (event.is_final || event.end_of_turn)) {
          transcriptLedger.push({ speaker: 'user', text: event.transcript as string });
        }

        if (type === 'tool.call') {
          const id = event.tool_call_id as string;
          const name = event.name as string;
          const rawArgs = event.parameters || JSON.parse((event.arguments as string) || '{}');
          const result = handleToolCall(engine, name, rawArgs as Record<string, unknown>);
          agent.sendToolResult(id, result);

          const parsedResult = JSON.parse(result);
          if (parsedResult.narration) {
            agent.simulateAgentReply(parsedResult.narration, 'speechPcmBytes==');
          }
        }

        if (type === 'transcript.agent.delta') {
          transcriptLedger.push({ speaker: 'agent', text: event.delta as string });
        }
      });

      // Step 3: Connect
      await agent.connect({
        system_prompt: 'VoiceChessmate Assistant',
        greeting: 'Chess companion ready.',
      });
      expect(agent.getStatus()).toBe('ready');

      // Step 4: User presses push-to-talk
      agent.startListening();
      expect(agent.getStatus()).toBe('listening');

      // Step 5: User speaks move "Eva 4"
      agent.simulateTranscript('Eva 4', true);

      // Step 6: Agent dispatches tool call
      await agent.simulateToolCall('apply_move', { move_description: 'Eva 4' });

      // Step 7: Verify engine state and agent speech output
      expect(engine.getGameState().fen).toContain('/4P3/');
      expect(agent.getBufferedAudio().length).toBeGreaterThan(0);
      expect(transcriptLedger.some(t => t.speaker === 'user' && t.text === 'Eva 4')).toBe(true);
      expect(transcriptLedger.some(t => t.speaker === 'agent' && t.text.includes('Black'))).toBe(true);

      // Step 8: User interrupts while agent is speaking
      agent.flushAudio();
      expect(agent.isAudioFlushed()).toBe(true);

      // Step 9: Stop listening and disconnect
      agent.stopListening();
      expect(agent.getStatus()).toBe('ready');
      agent.disconnect();
      expect(agent.getStatus()).toBe('disconnected');
    });
  });
});

