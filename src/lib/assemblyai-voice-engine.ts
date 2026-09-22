/**
 * AssemblyAIVoiceEngine — implements the UI's `VoiceEngine` interface on top of
 * `VoiceAgentManager` (AssemblyAI Voice Agent WebSocket).
 *
 * Contract: contracts/assemblyai-voice-engine.md
 *
 * Why this exists rather than WebSpeechVoiceEngine: that one needs BOTH
 * SpeechRecognition and speechSynthesis. Verified 2026-09-16 on this machine —
 * Chromium/Brave have recognition but zero TTS voices; Zen (Firefox-based) has
 * voices but no recognition. No installed browser has both, so the Web Speech
 * engine cannot complete a single turn here.
 *
 * Transport and event translation only. It does not parse moves, pick opponent
 * replies, or word announcements — tool calls are handed upward via
 * `onToolCall` so the game layer keeps owning game logic.
 */

import { VoiceAgentManager } from './voice-agent';
import type { SessionConfig } from '@/types';
import type { VoiceEngine, VoiceEngineEvent, VoiceEngineEventPayload } from './voice-engine';

export interface AssemblyAIEngineOptions {
  sessionConfig: SessionConfig;
  /** Agent invoked a tool. Return the JSON result string to send back.
   *  Optional here so the engine can be constructed before the game layer
   *  exists; set it later with `setToolCallHandler`. */
  onToolCall?: (name: string, args: Record<string, unknown>) => string;
}

type Listener = (payload: never) => void;

export class AssemblyAIVoiceEngine implements VoiceEngine {
  private agent = new VoiceAgentManager();
  private listeners = new Map<VoiceEngineEvent, Set<Listener>>();
  private opts: AssemblyAIEngineOptions;

  private connecting = false;
  private connected = false;
  private listening = false;
  /** cancel() must suppress the transcript for the turn it aborts. */
  private discardTurn = false;
  /** reply.audio is chunked; agent-speaking-start must fire once per reply. */
  private replyOpen = false;
  /** Track if stop/cancel was called while connecting so listening does not start after connect. */
  private stopRequestedWhileConnecting = false;

  constructor(options: AssemblyAIEngineOptions) {
    this.opts = options;
    this.agent.on('*', (event) => this.route(event as Record<string, unknown>));
  }

  /** True once the WebSocket session is live and tools can be invoked. */
  get isLive(): boolean {
    return this.connected;
  }

  /** Speak a board command *through the agent* by injecting a pre-recorded clip
   *  of the equivalent phrase. The API accepts no text input, so this is the
   *  only way a keypress can make the agent talk. Returns false if offline. */
  async sendCommandAudio(url: string): Promise<boolean> {
    if (!this.connected) return false;
    return this.agent.sendCommandAudio(url);
  }

  /** Point the engine at the game layer's tool handler. */
  setToolCallHandler(fn: (name: string, args: Record<string, unknown>) => string): void {
    this.opts.onToolCall = fn;
  }

  get isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof WebSocket !== 'undefined' &&
      !!navigator?.mediaDevices?.getUserMedia
    );
  }

  // --- Event plumbing ---

  on<E extends VoiceEngineEvent>(
    event: E,
    handler: (payload: VoiceEngineEventPayload[E]) => void
  ): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const set = this.listeners.get(event)!;
    set.add(handler as Listener);
    return () => set.delete(handler as Listener);
  }

  private emit<E extends VoiceEngineEvent>(event: E, payload?: VoiceEngineEventPayload[E]): void {
    this.listeners.get(event)?.forEach((h) => (h as (p: unknown) => void)(payload));
  }

  // --- Server event translation ---

  private route(event: Record<string, unknown>): void {
    const type = String(event.type ?? '');

    if (type === 'session.ready') {
      this.connected = true;
      this.connecting = false;
      return;
    }

    if (type.startsWith('transcript.user')) {
      const text = String(event.transcript ?? event.delta ?? event.text ?? '');
      if (!text) return;
      const isFinal =
        !type.endsWith('.delta') || !!(event.end_of_turn || event.is_final || event.final);

      if (!isFinal) {
        if (!this.discardTurn) this.emit('partial-transcript', { text });
        return;
      }

      // A cancelled turn is dropped entirely — no partial, no final.
      if (this.discardTurn) {
        this.discardTurn = false;
        return;
      }
      this.emit('final-transcript', { text });
      if (this.listening) {
        this.listening = false;
        this.emit('listening-stop');
      }
      return;
    }

    if (type === 'reply.started') {
      this.replyOpen = true;
      this.emit('agent-speaking-start');
      return;
    }

    if (
      type.startsWith('transcript.agent') ||
      type.startsWith('agent.text') ||
      type.startsWith('reply.delta') ||
      type === 'reply.text' ||
      type === 'reply.transcript' ||
      type === 'agent.message'
    ) {
      const text = String(event.text ?? event.delta ?? event.transcript ?? event.message ?? '');
      if (text) {
        this.emit('agent-speaking-text', { text });
      }
      return;
    }

    if (type === 'reply.audio') {
      // Chunked: only the first chunk opens a reply, if reply.started was missed.
      if (!this.replyOpen) {
        this.replyOpen = true;
        this.emit('agent-speaking-start');
      }
      return;
    }

    if (type === 'reply.done') {
      if ((event as { status?: string }).status === 'interrupted') this.agent.flushAudio();
      this.replyOpen = false;
      this.emit('agent-speaking-end');
      return;
    }

    if (type === 'session.error') {
      const err = event as { code?: string; message?: string };
      this.emit('error', { message: err.message ?? err.code ?? 'Voice session error' });
      return;
    }

    // Tool calls: hand upward, send the result back. The agent speaks the
    // narration in that result, which is what the player actually hears.
    const callId = (event.call_id ?? event.tool_call_id ?? event.id) as string | undefined;
    const name = (event.name ?? event.function_name) as string | undefined;
    if (!name || !callId) return;

    let result: string;
    try {
      const raw = event.arguments ?? event.parameters ?? {};
      const args = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
      result = this.opts.onToolCall
        ? this.opts.onToolCall(name, args)
        : JSON.stringify({ error: "No tool handler attached yet" });
    } catch (e) {
      result = JSON.stringify({ error: `Tool "${name}" failed: ${String(e)}` });
    }
    this.agent.sendToolResult(callId, result);
  }

  // --- VoiceEngine surface ---

  start(): void {
    if (this.listening) return; // idempotent
    this.discardTurn = false;
    this.stopRequestedWhileConnecting = false;

    if (!this.connected) {
      if (this.connecting) return;
      this.connecting = true;
      // Connecting takes seconds (mic permission + token + WebSocket). Without
      // this the button sits inert and the app looks broken.
      this.emit('connecting');
      const cfg = { ...this.opts.sessionConfig };
      if (cfg.input?.keyterms) {
        cfg.input = { ...cfg.input, keyterms: cfg.input.keyterms.slice(0, 100) };
      }
      this.agent
        .connect(cfg)
        .then(() => {
          this.connecting = false;
          this.connected = true;
          if (this.stopRequestedWhileConnecting) {
            this.stopRequestedWhileConnecting = false;
            this.emit('listening-stop');
            return;
          }
          this.beginListening();
        })
        .catch((err: unknown) => {
          this.connecting = false;
          this.emit('connect-failed');
          this.emit('error', {
            message: err instanceof Error ? err.message : 'Could not start the voice session',
          });
        });
      return;
    }
    this.beginListening();
  }

  private beginListening(): void {
    this.agent.flushAudio(); // don't let buffered agent audio talk over the player
    this.agent.setListening(true);
    this.listening = true;
    this.emit('listening-start');
  }

  stop(): void {
    if (this.connecting) {
      this.stopRequestedWhileConnecting = true;
      this.connecting = false;
      this.emit('listening-stop');
      return;
    }
    if (!this.listening) return;
    this.agent.setListening(false);
    this.listening = false;
    this.emit('listening-stop');
  }

  cancel(): void {
    this.discardTurn = true;
    if (this.connecting) {
      this.stopRequestedWhileConnecting = true;
      this.connecting = false;
      this.emit('listening-stop');
      return;
    }
    if (!this.listening) return;
    this.agent.setListening(false);
    this.listening = false;
    this.emit('listening-stop');
  }

  /**
   * Path A has no "make the agent say this string" event — the agent speaks on
   * its own once a tool result comes back. So this emits the caption text and
   * produces no audio of its own; emitting audio here would double-speak over
   * the agent. See Open Question 1 in the contract.
   *
   * We must also emit agent-speaking-start / agent-speaking-end so the UI
   * status transitions correctly. Without agent-speaking-end the UI is
   * permanently stuck at "speaking". We estimate reading time at 65ms/char
   * (≈230 WPM) with a 1500ms minimum.
   */
  speak(text: string, _opts?: { rate?: number }): void {
    // `rate` is intentionally ignored: the Voice Agent API exposes no
    // speech-rate control (output.voice/format are immutable after
    // session.ready, and there is no speed field at all).
    void _opts;
    if (!text) return;

    // Only fire start if there isn't already an open agent reply in progress
    // (in which case reply.started already fired the real event).
    if (!this.replyOpen) {
      this.emit('agent-speaking-start');
      const readingMs = Math.max(1500, text.length * 65);
      setTimeout(() => {
        // Only emit end if no real reply.done arrived in the meantime
        if (!this.replyOpen) {
          this.emit('agent-speaking-end');
        }
      }, readingMs);
    }

    this.emit('agent-speaking-text', { text });
  }

  stopSpeaking(): void {
    this.agent.flushAudio();
    if (this.replyOpen) {
      this.replyOpen = false;
      this.emit('agent-speaking-end');
    }
  }

  disconnect(): void {
    this.agent.disconnect();
    this.connected = false;
    this.listening = false;
  }
}
