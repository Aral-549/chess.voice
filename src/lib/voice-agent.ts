// ============================================================
// VoiceChessmate — AssemblyAI Voice Agent WebSocket Manager
// Handles connection, audio streaming, and event routing
//
// DUAL AudioContext design:
//   speakerContext  — native hardware rate (48kHz on most systems).
//                     Schedules AudioBufferSourceNodes for agent speech.
//                     Native rate prevents PulseAudio/PipeWire from
//                     muting the sink (which happens with forced 24kHz).
//   captureContext  — forced 24kHz. Processes mic input.
//                     AssemblyAI's Voice Agent API requires 24kHz PCM16.
//                     Mic input goes to the worklet → WS, never to speakers,
//                     so Linux audio hardware constraints don't apply here.
//
// Fixes:
//  1. ScriptProcessorNode → scheduled AudioBufferSourceNode (speaker)
//  2. Separate 24kHz context for capture keeps mic audio at correct rate
//  3. Resume speakerContext if suspended when audio arrives
//  4. Safe base64 extraction from reply.audio payload
// ============================================================

import type { SessionConfig, VoiceAgentEvent } from '@/types';

const AGENT_WS_URL = 'wss://agents.assemblyai.com/v1/ws';
const CAPTURE_SAMPLE_RATE = 24_000; // AssemblyAI Voice Agent requires 24kHz input
const CHUNK_MS = 50;
const CHUNK_SIZE = (CAPTURE_SAMPLE_RATE * CHUNK_MS) / 1000; // 1200 samples per chunk

export type VoiceAgentStatus = 'disconnected' | 'connecting' | 'ready' | 'listening' | 'error';

/** Locate the `data` chunk of a RIFF/WAVE file. Encoders insert optional chunks
 *  (ffmpeg writes LIST, pushing audio to byte 78), so the header is not a fixed 44. */
export function wavToPcm16(buf: ArrayBuffer): Int16Array | null {
  const view = new DataView(buf);
  if (view.byteLength < 12) return null;
  if (view.getUint32(0, false) !== 0x52494646) return null; // "RIFF"
  if (view.getUint32(8, false) !== 0x57415645) return null; // "WAVE"

  let pos = 12;
  while (pos + 8 <= view.byteLength) {
    const id = view.getUint32(pos, false);
    const size = view.getUint32(pos + 4, true);
    if (id === 0x64617461) { // "data"
      const off = pos + 8;
      const len = Math.min(size, view.byteLength - off);
      // Int16Array needs a 2-byte-aligned offset; copy on the rare odd boundary.
      return off % 2
        ? new Int16Array(buf.slice(off, off + (len & ~1)))
        : new Int16Array(buf, off, len >> 1);
    }
    pos += 8 + size + (size & 1); // chunks are word-aligned
  }
  return null;
}

type EventHandler = (event: VoiceAgentEvent) => void;

export class VoiceAgentManager {
  private ws: WebSocket | null = null;

  // --- Dual AudioContext ---
  /** Speaker playback — native hardware rate so Linux sinks don't mute it. */
  private speakerContext: AudioContext | null = null;
  /** Mic capture — forced 24kHz to match what AssemblyAI expects. */
  private captureContext: AudioContext | null = null;

  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  // --- Gapless AudioBufferSourceNode playback ---
  // nextPlayTime is the clock position (in speakerContext time) at which the
  // next chunk should start. Web Audio resamples the 24kHz buffers to the
  // native rate automatically with high-quality interpolation.
  private nextPlayTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  // Legacy compat stubs (isAudioPlaying / flushAudio public API)
  private speakerBuffer: Float32Array = new Float32Array(0);
  private writePos = 0;
  private readPos = 0;
  private speakerNode: ScriptProcessorNode | null = null; // always null now

  private status: VoiceAgentStatus = 'disconnected';
  private isListeningActive = false;
  private isMuted = false;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private statusHandlers: ((status: VoiceAgentStatus) => void)[] = [];

  // Reconnect support
  private lastSessionConfig: Record<string, unknown> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private intentionalDisconnect = false;

  // --- Event System ---

  on(eventType: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  onStatusChange(handler: (status: VoiceAgentStatus) => void): void {
    this.statusHandlers.push(handler);
  }

  private emit(eventType: string, event: VoiceAgentEvent): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    const wildcardHandlers = this.eventHandlers.get('*') || [];
    [...handlers, ...wildcardHandlers].forEach(h => h(event));
  }

  clearHandlers(): void {
    this.eventHandlers.clear();
    this.statusHandlers = [];
  }

  private setStatus(status: VoiceAgentStatus): void {
    this.status = status;
    this.statusHandlers.forEach(h => h(status));
  }

  // --- Push-to-Talk / Push-to-Listen State ---

  setListening(active: boolean): void {
    const wasListening = this.isListeningActive;
    this.isListeningActive = active;

    // When releasing push-to-talk, send a short silence burst so the server's VAD
    // detects end-of-speech faster (the API has no explicit end-of-turn event —
    // VAD handles turn detection based on incoming audio silence)
    if (wasListening && !active && this.ws?.readyState === WebSocket.OPEN) {
      const silenceChunk = new Int16Array(1200); // 50ms of silence at 24kHz
      const base64 = this.int16ToBase64(silenceChunk);
      // Send 3 silence chunks (~150ms) to trigger VAD end-of-speech
      for (let i = 0; i < 3; i++) {
        this.sendEvent({ type: 'input.audio', audio: base64 });
      }
      console.log('[VoiceAgent] Sent silence burst to finalize turn');
    }

    if (this.status !== 'disconnected' && this.status !== 'connecting' && this.status !== 'error') {
      this.setStatus(active ? 'listening' : 'ready');
    }
    console.log(`[VoiceAgent] Push-to-Listen state: ${active ? 'ACTIVE' : 'IDLE'}`);
  }

  isListening(): boolean {
    return this.isListeningActive;
  }

  getStatus(): VoiceAgentStatus {
    return this.status;
  }

  // --- Connection ---

  async connect(sessionConfig: SessionConfig): Promise<void> {
    this.setStatus('connecting');
    this.lastSessionConfig = sessionConfig as unknown as Record<string, unknown>;
    this.reconnectAttempts = 0;
    this.intentionalDisconnect = false;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // ── 1a. Speaker context at NATIVE hardware rate ──────────────────────
      // Forcing 24kHz on Linux PulseAudio/PipeWire either mutes the audio
      // sink or routes to no device. Native rate (48kHz) is always accepted.
      // We tag AudioBuffers as 24kHz so Web Audio resamples automatically.
      this.speakerContext = new AudioContextClass();
      if (this.speakerContext.state === 'suspended') {
        await this.speakerContext.resume();
      }
      this.nextPlayTime = 0;
      console.log(`[VoiceAgent] speakerContext: ${this.speakerContext.sampleRate}Hz state=${this.speakerContext.state}`);

      // ── 1b. Capture context at 24kHz ────────────────────────────────────
      // AssemblyAI Voice Agent API requires 24kHz PCM16 mono on the input.
      // This context never routes audio to the hardware output device, so
      // Linux audio sink constraints do NOT apply.
      this.captureContext = new AudioContextClass({ sampleRate: CAPTURE_SAMPLE_RATE });
      if (this.captureContext.state === 'suspended') {
        await this.captureContext.resume();
      }
      console.log(`[VoiceAgent] captureContext: ${this.captureContext.sampleRate}Hz state=${this.captureContext.state}`);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser context. Please use localhost or HTTPS.');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: CAPTURE_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // ── 2. Mic capture pipeline in captureContext (24kHz) ────────────────
      // createMediaStreamSource in captureContext: the browser resamples the
      // mic stream to 24kHz if getUserMedia returns a different native rate.
      this.sourceNode = this.captureContext.createMediaStreamSource(this.mediaStream);

      // Try AudioWorklet first, fall back to ScriptProcessor if worklet fails
      try {
        await this.captureContext.audioWorklet.addModule('/audio-processor.js');
        this.workletNode = new AudioWorkletNode(this.captureContext, 'pcm-processor', {
          processorOptions: { chunkSize: CHUNK_SIZE },
        });

        this.workletNode.port.onmessage = (event) => {
          if (this.ws?.readyState === WebSocket.OPEN && this.isListeningActive) {
            const pcm16 = event.data as Int16Array;
            const base64 = this.int16ToBase64(pcm16);
            this.sendEvent({ type: 'input.audio', audio: base64 });
          }
        };

        this.sourceNode.connect(this.workletNode);
        console.log('[VoiceAgent] AudioWorklet connected in captureContext (24kHz) — mic pipeline active');
      } catch (workletErr) {
        console.warn('[VoiceAgent] AudioWorklet failed, using fallback ScriptProcessor:', workletErr);
        const scriptProcessor = this.captureContext.createScriptProcessor(1024, 1, 1);
        scriptProcessor.onaudioprocess = (e) => {
          if (this.ws?.readyState === WebSocket.OPEN && this.isListeningActive) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.sendEvent({ type: 'input.audio', audio: this.int16ToBase64(pcm16) });
          }
        };
        this.sourceNode.connect(scriptProcessor);
        // Connect to captureContext destination to keep it alive (no audible output)
        scriptProcessor.connect(this.captureContext.destination);
        console.log('[VoiceAgent] ScriptProcessor fallback connected (24kHz captureContext) — mic pipeline active');
      }

      // ── 3. Get a temporary token from our backend ────────────────────────
      const tokenRes = await fetch('/api/token');
      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        throw new Error(`Token minting failed (${tokenRes.status}): ${errBody}`);
      }
      const { token } = await tokenRes.json();

      // ── 4. Connect via WebSocket with token ──────────────────────────────
      this.ws = new WebSocket(`${AGENT_WS_URL}?token=${token}`);

      this.ws.onopen = () => {
        console.log('[VoiceAgent] WebSocket connected, sending session.update');
        this.sendEvent({
          type: 'session.update',
          session: sessionConfig,
        });
      };

      this.ws.onmessage = (event) => {
        const data: VoiceAgentEvent = JSON.parse(event.data);
        this.handleServerEvent(data);
      };

      this.ws.onerror = (error) => {
        console.error('[VoiceAgent] WebSocket error:', error);
        this.setStatus('error');
      };

      this.ws.onclose = (event) => {
        console.log(`[VoiceAgent] WebSocket closed: code=${event.code} reason="${event.reason}"`);

        // Attempt auto-reconnect on unexpected drops (not user-initiated)
        if (!this.intentionalDisconnect && event.code !== 1000 && event.code !== 1005) {
          if (this.reconnectAttempts < this.maxReconnectAttempts && this.lastSessionConfig) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
            console.log(`[VoiceAgent] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.setStatus('connecting');
            setTimeout(() => {
              this.connect(this.lastSessionConfig as unknown as SessionConfig).catch(err => {
                console.error('[VoiceAgent] Reconnect failed:', err);
                this.setStatus('error');
              });
            }, delay);
            return;
          }
        }
        this.setStatus('disconnected');
        this.cleanup();
      };
    } catch (error) {
      console.error('[VoiceAgent] Connection failed:', error);
      this.setStatus('error');
      this.cleanup();
      throw error;
    }
  }

  // --- Server Event Handling ---

  private async handleServerEvent(event: VoiceAgentEvent): Promise<void> {
    this.emit(event.type, event);

    switch (event.type) {
      case 'session.ready':
        this.setStatus('ready');
        break;

      case 'reply.audio': {
        // AssemblyAI sends the base64 PCM16 in the `data` field.
        // Guard against alternative field names used in some SDK versions.
        const base64 = (event.data ?? event.audio ?? event.delta ?? event.chunk) as string | undefined;
        if (base64 && typeof base64 === 'string') {
          this.scheduleSpeakerChunk(base64);
        } else {
          console.warn('[VoiceAgent] reply.audio received with no audio payload:', JSON.stringify(event).slice(0, 200));
        }
        break;
      }

      case 'reply.done':
        if ((event as unknown as { status: string }).status === 'interrupted') {
          // Flush playback buffer immediately — stop stale audio
          this.flushPlayback();
        }
        break;

      case 'session.error': {
        const err = event as unknown as { code?: string; message?: string; param?: string };
        console.warn(`[VoiceAgent] Server error: code=${err.code} message="${err.message}" param=${err.param}`);

        // Only transition to error state on fatal errors (auth, config)
        // Non-fatal format warnings (invalid_format, invalid_value) should not kill the session
        const fatalCodes = ['authentication_error', 'authorization_error', 'rate_limit_exceeded'];
        if (err.code && fatalCodes.includes(err.code)) {
          this.setStatus('error');
        }
        break;
      }
    }
  }

  // --- Gapless AudioBufferSourceNode Playback (speakerContext) ---
  // AssemblyAI sends 24kHz PCM16. We tag each buffer as 24kHz so
  // speakerContext (at native rate) resamples it correctly.

  private scheduleSpeakerChunk(base64Audio: string): void {
    if (this.isMuted || !this.speakerContext) return;

    // Resume if browser auto-suspended after async operations
    if (this.speakerContext.state === 'suspended') {
      this.speakerContext.resume().catch(e => {
        console.warn('[VoiceAgent] Failed to resume speakerContext:', e);
      });
    }

    const pcm16 = this.base64ToInt16(base64Audio);
    if (pcm16.length === 0) return;

    // Create a mono AudioBuffer tagged as 24kHz — Web Audio resamples to native
    const buffer = this.speakerContext.createBuffer(1, pcm16.length, CAPTURE_SAMPLE_RATE);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) {
      channelData[i] = pcm16[i] / 32768.0;
    }

    const source = this.speakerContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.speakerContext.destination);

    // Schedule back-to-back: start at max(now + 5ms, nextPlayTime)
    const startTime = Math.max(this.speakerContext.currentTime + 0.005, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };
  }

  /** Drop incoming agent audio without touching the session. */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) this.flushPlayback();
  }

  /** Retune turn detection mid-session. Sends the full `input` block from the
   *  original config so keyterms and format aren't dropped by a partial update. */
  setTurnDetection(turnDetection: Record<string, unknown>): void {
    const input = (this.lastSessionConfig?.input ?? {}) as Record<string, unknown>;
    this.sendEvent({
      type: 'session.update',
      session: { input: { ...input, turn_detection: turnDetection } },
    });
  }

  private flushPlayback(): void {
    // Stop all scheduled AudioBufferSourceNodes immediately (barge-in / mute)
    this.activeSources.forEach(source => {
      try { source.stop(); } catch { /* already stopped */ }
    });
    this.activeSources.clear();
    // Reset schedule pointer so next chunk plays immediately
    this.nextPlayTime = 0;
    // Legacy ring-buffer compat
    this.readPos = this.writePos;
  }

  /** Public — flush speaker buffer so audio doesn't play after interrupt */
  flushAudio(): void {
    this.flushPlayback();
  }

  /** Public — check if there are unplayed scheduled audio sources */
  isAudioPlaying(): boolean {
    return this.activeSources.size > 0;
  }

  // --- Send Events ---

  sendEvent(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  /** Feed a pre-recorded command clip into the agent as if the user had spoken it. */
  async sendCommandAudio(url: string): Promise<boolean> {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;

    const buf = await (await fetch(url)).arrayBuffer();
    const pcm = wavToPcm16(buf);
    if (!pcm) {
      console.warn(`[VoiceAgent] ${url} is not a readable PCM16 WAV`);
      return false;
    }

    for (let i = 0; i < pcm.length; i += CHUNK_SIZE) {
      this.sendEvent({
        type: 'input.audio',
        audio: this.int16ToBase64(pcm.subarray(i, i + CHUNK_SIZE)),
      });
    }

    // Trailing silence so the server's VAD closes the turn (same as push-to-talk release)
    const silence = this.int16ToBase64(new Int16Array(CHUNK_SIZE));
    for (let i = 0; i < 6; i++) this.sendEvent({ type: 'input.audio', audio: silence });

    console.log(`[VoiceAgent] Injected command audio: ${url}`);
    return true;
  }

  sendToolResult(toolCallId: string, result: string): void {
    const payload = {
      type: 'tool.result',
      call_id: toolCallId,
      tool_call_id: toolCallId,
      result,
    };
    console.log('[VoiceAgent] Sending tool.result:', JSON.stringify(payload).slice(0, 500));
    this.sendEvent(payload);
  }

  // --- Encoding Utilities ---

  private int16ToBase64(pcm16: Int16Array): string {
    // Honour byteOffset/byteLength — a subarray's .buffer is the whole backing store.
    const bytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToInt16(base64: string): Int16Array {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Int16Array(bytes.buffer);
    } catch (e) {
      console.warn('[VoiceAgent] base64ToInt16 decode error:', e);
      return new Int16Array(0);
    }
  }

  // --- Disconnect ---

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  private cleanup(): void {
    this.flushPlayback();
    if (this.speakerNode) {
      this.speakerNode.disconnect();
      this.speakerNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.captureContext && this.captureContext.state !== 'closed') {
      this.captureContext.close();
      this.captureContext = null;
    }
    if (this.speakerContext && this.speakerContext.state !== 'closed') {
      this.speakerContext.close();
      this.speakerContext = null;
    }
    this.nextPlayTime = 0;
  }
}
