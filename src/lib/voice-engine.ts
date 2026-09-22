/**
 * VoiceEngine is the seam between this UI and whatever actually does
 * speech-to-text / text-to-speech.
 */

export type VoiceEngineEvent =
  | "connecting"
  | "connect-failed"
  | "listening-start"
  | "listening-stop"
  | "partial-transcript"
  | "final-transcript"
  | "agent-speaking-start"
  | "agent-speaking-text"
  | "agent-speaking-end"
  | "error";

export type VoiceEngineEventPayload = {
  connecting: undefined;
  "connect-failed": undefined;
  "listening-start": undefined;
  "listening-stop": undefined;
  "partial-transcript": { text: string };
  "final-transcript": { text: string };
  "agent-speaking-start": undefined;
  "agent-speaking-text": { text: string };
  "agent-speaking-end": undefined;
  error: { message: string };
};

export interface VoiceEngine {
  readonly isSupported: boolean;
  readonly isLive?: boolean;
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  cancel(): void;
  speak(text: string, opts?: { rate?: number }): void;
  sendCommandAudio?(url: string): Promise<boolean>;
  stopSpeaking(): void;
  on<E extends VoiceEngineEvent>(event: E, handler: (payload: VoiceEngineEventPayload[E]) => void): () => void;
}
