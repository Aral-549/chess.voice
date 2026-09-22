// ============================================================
// VoiceChessmate — Mock AssemblyAI Voice Agent Manager
// Headless synthetic voice agent for testing in CI/Node environments
// Zero network calls, zero AudioContext, zero API keys required.
// ============================================================

import type { SessionConfig, VoiceAgentEvent } from '@/types';
import type { VoiceAgentStatus } from './voice-agent';

export type { VoiceAgentStatus };

export type EventHandler = (event: VoiceAgentEvent) => void;
export type StatusChangeHandler = (status: VoiceAgentStatus) => void;
export type TranscriptHandler = (transcript: string, isFinal: boolean) => void;
export type AudioDataHandler = (data: string) => void;
export type ToolCallHandler = (toolCall: { id: string; name: string; args: Record<string, unknown> }) => void;
export type ErrorHandler = (error: Error | string) => void;
export type ToolExecutor = (name: string, args: Record<string, unknown>, toolCallId: string) => Promise<string> | string;

export interface MockVoiceAgentOptions {
  autoResolveTools?: boolean;
  defaultGreeting?: string;
  sampleRate?: number;
}

export class MockVoiceAgentManager {
  private status: VoiceAgentStatus = 'disconnected';
  private listeningActive = false;
  private audioBuffer: string[] = [];
  private audioFlushed = false;
  private flushedCount = 0;

  // Configuration
  private lastSessionConfig: SessionConfig | Record<string, unknown> | null = null;
  private toolExecutor: ToolExecutor | null = null;

  // Event handlers
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private statusHandlers: StatusChangeHandler[] = [];
  private transcriptHandlers: TranscriptHandler[] = [];
  private audioDataHandlers: AudioDataHandler[] = [];
  private toolCallHandlers: ToolCallHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  // Outgoing history tracking
  private sentEvents: Record<string, unknown>[] = [];
  private sentToolResults: Map<string, string> = new Map();
  private pendingToolCalls: Map<string, { resolve: (res: string) => void; reject: (err: Error) => void }> = new Map();

  constructor(private readonly options: MockVoiceAgentOptions = {}) {}

  // --- Public Status & State ---

  getStatus(): VoiceAgentStatus {
    return this.status;
  }

  isListening(): boolean {
    return this.listeningActive;
  }

  setListening(active: boolean): void {
    this.listeningActive = active;
    if (this.status !== 'disconnected' && this.status !== 'connecting' && this.status !== 'error') {
      this.setStatus(active ? 'listening' : 'ready');
    }
  }

  startListening(): void {
    this.setListening(true);
  }

  stopListening(): void {
    this.setListening(false);
  }

  private setStatus(newStatus: VoiceAgentStatus): void {
    this.status = newStatus;
    for (const handler of this.statusHandlers) {
      handler(newStatus);
    }
  }

  // --- Event Subscription ---

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
    return () => {
      const list = this.eventHandlers.get(eventType);
      if (list) {
        this.eventHandlers.set(eventType, list.filter(h => h !== handler));
      }
    };
  }

  off(eventType: string, handler: EventHandler): void {
    const list = this.eventHandlers.get(eventType);
    if (list) {
      this.eventHandlers.set(eventType, list.filter(h => h !== handler));
    }
  }

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  /** Alias matching onStatusChange for parity */
  onStateChange(handler: StatusChangeHandler): () => void {
    return this.onStatusChange(handler);
  }

  onTranscript(handler: TranscriptHandler): () => void {
    this.transcriptHandlers.push(handler);
    return () => {
      this.transcriptHandlers = this.transcriptHandlers.filter(h => h !== handler);
    };
  }

  onAudioData(handler: AudioDataHandler): () => void {
    this.audioDataHandlers.push(handler);
    return () => {
      this.audioDataHandlers = this.audioDataHandlers.filter(h => h !== handler);
    };
  }

  onToolCall(handler: ToolCallHandler): () => void {
    this.toolCallHandlers.push(handler);
    return () => {
      this.toolCallHandlers = this.toolCallHandlers.filter(h => h !== handler);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
    };
  }

  private emit(eventType: string, event: VoiceAgentEvent): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    const wildcardHandlers = this.eventHandlers.get('*') || [];
    for (const h of [...handlers, ...wildcardHandlers]) {
      try {
        h(event);
      } catch (err) {
        console.error(`[MockVoiceAgent] Handler error for "${eventType}":`, err);
      }
    }
  }

  clearHandlers(): void {
    this.eventHandlers.clear();
    this.statusHandlers = [];
    this.transcriptHandlers = [];
    this.audioDataHandlers = [];
    this.toolCallHandlers = [];
    this.errorHandlers = [];
  }

  // --- Session Connection Lifecycle ---

  async connect(sessionConfig?: SessionConfig | Record<string, unknown>): Promise<void> {
    this.setStatus('connecting');
    this.lastSessionConfig = sessionConfig || null;
    this.audioFlushed = false;

    // Simulate instant asynchronous connection
    await Promise.resolve();

    this.setStatus('ready');

    const readyEvent: VoiceAgentEvent = {
      type: 'session.ready',
      session_id: `mock_session_${Date.now()}`,
    };
    this.emit('session.ready', readyEvent);

    if (sessionConfig && 'greeting' in sessionConfig && typeof sessionConfig.greeting === 'string') {
      this.simulateAgentReply(sessionConfig.greeting);
    } else if (this.options.defaultGreeting) {
      this.simulateAgentReply(this.options.defaultGreeting);
    }
  }

  disconnect(): void {
    this.flushAudio();
    this.setStatus('disconnected');
    this.listeningActive = false;

    const closeEvent: VoiceAgentEvent = {
      type: 'session.close',
      code: 1000,
      reason: 'Normal closure',
    };
    this.emit('session.close', closeEvent);

    // Reject any pending tool calls
    for (const [, { reject }] of this.pendingToolCalls) {
      reject(new Error('MockVoiceAgent disconnected with pending tool call'));
    }
    this.pendingToolCalls.clear();
  }

  // --- Audio Buffer & Interruption ---

  flushAudio(): void {
    this.audioBuffer = [];
    this.audioFlushed = true;
    this.flushedCount++;

    this.emit('reply.done', {
      type: 'reply.done',
      status: 'interrupted',
    });
  }

  isAudioFlushed(): boolean {
    return this.audioFlushed;
  }

  getFlushedCount(): number {
    return this.flushedCount;
  }

  getBufferedAudio(): string[] {
    return [...this.audioBuffer];
  }

  // --- Synthetic Voice Simulation Methods ---

  sendTextMessage(text: string): void {
    this.simulateTranscript(text, true);
  }

  simulateTranscript(transcript: string, isFinal = true): void {
    for (const handler of this.transcriptHandlers) {
      handler(transcript, isFinal);
    }

    const type = isFinal ? 'transcript.user.final' : 'transcript.user.delta';
    const userEvent: VoiceAgentEvent = {
      type,
      transcript,
      delta: transcript,
      text: transcript,
      is_final: isFinal,
      final: isFinal,
      end_of_turn: isFinal,
    };
    this.emit(type, userEvent);

    // Also emit standard user.transcript for compatibility
    this.emit('user.transcript', {
      type: 'user.transcript',
      transcript,
      end_of_turn: isFinal,
    });
  }

  simulateAudioStream(chunk: string | Uint8Array | Float32Array = 'AA=='): void {
    let base64 = 'AA==';
    if (typeof chunk === 'string') {
      base64 = chunk;
    } else if (chunk instanceof Uint8Array) {
      base64 = Buffer.from(chunk).toString('base64');
    } else if (chunk instanceof Float32Array) {
      const pcm16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      base64 = Buffer.from(pcm16.buffer).toString('base64');
    }

    this.audioBuffer.push(base64);
    this.audioFlushed = false;

    for (const handler of this.audioDataHandlers) {
      handler(base64);
    }

    this.emit('reply.audio', {
      type: 'reply.audio',
      data: base64,
    });
  }

  simulateAgentReply(text: string, audioChunk?: string): void {
    this.emit('reply.started', { type: 'reply.started' });

    this.emit('transcript.agent.delta', {
      type: 'transcript.agent.delta',
      delta: text,
      text,
    });

    this.emit('agent.text', {
      type: 'agent.text',
      text,
      end_of_text: true,
    });

    if (audioChunk) {
      this.simulateAudioStream(audioChunk);
    }

    this.emit('reply.done', {
      type: 'reply.done',
      status: 'completed',
    });
  }

  async simulateToolCall(
    name: string,
    args: Record<string, unknown>,
    toolCallId?: string
  ): Promise<string> {
    const id = toolCallId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const argsJson = JSON.stringify(args);

    const callPayload = {
      type: 'tool.call',
      call_id: id,
      tool_call_id: id,
      id,
      name,
      function_name: name,
      arguments: argsJson,
      parameters: args,
    };

    // Create promise to await result BEFORE firing listeners so synchronous sendToolResult calls resolve it
    const resultPromise = new Promise<string>((resolve, reject) => {
      this.pendingToolCalls.set(id, { resolve, reject });
    });

    // Invoke dedicated onToolCall listeners
    for (const handler of this.toolCallHandlers) {
      handler({ id, name, args });
    }

    // Emit event for wildcard or type-specific listeners
    this.emit('tool.call', callPayload);

    // If an automatic tool executor was registered, run it
    if (this.toolExecutor) {
      try {
        const res = await this.toolExecutor(name, args, id);
        this.sendToolResult(id, res);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.sendToolResult(id, JSON.stringify({ error: errMsg }));
      }
    }

    return resultPromise;
  }

  simulateError(error: Error | string): void {
    const errObj = typeof error === 'string' ? new Error(error) : error;
    this.setStatus('error');

    for (const handler of this.errorHandlers) {
      handler(errObj);
    }

    this.emit('session.error', {
      type: 'session.error',
      code: 'simulated_error',
      message: errObj.message,
    });
  }

  // --- Outgoing Events & Results ---

  sendEvent(event: Record<string, unknown>): void {
    this.sentEvents.push(event);
  }

  sendToolResult(toolCallId: string, result: string): void {
    this.sentToolResults.set(toolCallId, result);
    this.sendEvent({
      type: 'tool.result',
      call_id: toolCallId,
      tool_call_id: toolCallId,
      result,
    });

    const pending = this.pendingToolCalls.get(toolCallId);
    if (pending) {
      this.pendingToolCalls.delete(toolCallId);
      pending.resolve(result);
    }
  }

  registerToolHandler(executor: ToolExecutor): void {
    this.toolExecutor = executor;
  }

  // --- Inspection / Testing Helpers ---

  getSentEvents(): Record<string, unknown>[] {
    return [...this.sentEvents];
  }

  getLastSentEvent(): Record<string, unknown> | undefined {
    return this.sentEvents[this.sentEvents.length - 1];
  }

  getSentToolResult(toolCallId: string): string | undefined {
    return this.sentToolResults.get(toolCallId);
  }

  getLastSessionConfig(): SessionConfig | Record<string, unknown> | null {
    return this.lastSessionConfig;
  }

  clearHistory(): void {
    this.sentEvents = [];
    this.sentToolResults.clear();
    this.audioBuffer = [];
    this.audioFlushed = false;
    this.flushedCount = 0;
  }
}

