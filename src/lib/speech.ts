// ============================================================
// VoiceChessmate — Speech Synthesis & Audio Pipeline Engine
// Provides hardened spoken feedback for board descriptions, opponent
// moves, and keyboard shortcut responses.
//
// Key Hardening Features:
// 1. Module-level activeUtterances Set prevents V8 GC cancellation.
// 2. 40ms settling debounce mitigates Chrome cancel() race conditions.
// 3. Asynchronous voice loading with non-overwriting listener.
// 4. Centralized non-leaking watchdog for paused and stuck synthesizer.
// 5. Priority queue (urgent, high, normal, low) and PTT interruption.
// 6. Dual-path fallback coordinator for WebSocket audio loss.
// ============================================================

import { resumeAudioContext } from './sound-effects';

export type SpeechPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface SpeakOptions {
  priority?: SpeechPriority;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
  interrupt?: boolean;
  /** 'local' = keyboard/button triggered (protected from reply.audio cancel) */
  source?: 'local' | 'fallback';
}

interface QueuedUtterance {
  id: string;
  text: string;
  options: SpeakOptions;
  timestamp: number;
}

// 1. Module-level Utterance Retention Set (V8 Garbage Collection Protection)
const activeUtterances = new Set<SpeechSynthesisUtterance>();
if (typeof window !== 'undefined') {
  (window as unknown as { __activeUtterances?: Set<SpeechSynthesisUtterance> }).__activeUtterances = activeUtterances;
}

// 2. Queue State
let speechQueue: QueuedUtterance[] = [];
let isProcessingQueue = false;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentUtteranceStartTime = 0;
let cancelDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentQueueSession = 0;

// Track whether current speech was triggered locally (keyboard/button)
// When true, voice-agent should NOT cancel speech on reply.audio events
let localSpeechActive = false;

// Single subscriber for the on-screen caption — every announcement routes
// through speakText(), so one hook here covers all call sites.
let captionListener: ((text: string) => void) | null = null;

export function setSpeechCaptionListener(fn: ((text: string) => void) | null): void {
  captionListener = fn;
}

const PRIORITY_LEVELS: Record<SpeechPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// 3. Voice Cache & Async Initialization
let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null;

export function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    cachedVoices = voices;
    return Promise.resolve(voices);
  }

  if (cachedVoices.length > 0) {
    return Promise.resolve(cachedVoices);
  }

  if (!voicesReadyPromise) {
    voicesReadyPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let settled = false;

      const finish = (resultVoices: SpeechSynthesisVoice[]) => {
        if (settled) return;
        settled = true;
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.removeEventListener('voiceschanged', handler);
        }
        cachedVoices = resultVoices;
        voicesReadyPromise = null;
        resolve(resultVoices);
      };

      const handler = () => {
        const v = window.speechSynthesis.getVoices() || [];
        if (v.length > 0) {
          clearTimeout(timer);
          finish(v);
        }
      };

      // Fallback timeout: resolve with whatever voices exist after 300ms
      const timer = setTimeout(() => {
        const v = (typeof window !== 'undefined' && 'speechSynthesis' in window)
          ? (window.speechSynthesis.getVoices() || [])
          : [];
        finish(v);
      }, 300);

      window.speechSynthesis.addEventListener('voiceschanged', handler);
    });
  }

  return voicesReadyPromise;
}

// Pre-trigger voice loading on module evaluation in browser
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  getVoicesAsync().catch(() => {});
}

// 4. Centralized Watchdog Service
let watchdogInterval: ReturnType<typeof setInterval> | null = null;

function startWatchdog(): void {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;

    if (!synth.speaking && speechQueue.length === 0 && activeUtterances.size === 0) {
      stopWatchdog();
      return;
    }

    // Auto-resume if browser unexpectedly paused
    if (synth.paused) {
      console.warn('[TTS Watchdog] Detected paused speech. Resuming.');
      synth.resume();
      return;
    }

    // Chrome 14-second freeze workaround: safely pulse pause/resume on utterances longer than 10s
    if (synth.speaking && Date.now() - currentUtteranceStartTime > 10000) {
      synth.pause();
      synth.resume();
    }

    // Stuck engine recovery (>20s)
    const maxDuration = 20000;
    if (synth.speaking && Date.now() - currentUtteranceStartTime > maxDuration) {
      console.warn('[TTS Watchdog] Speech synthesis stuck (>20s). Resetting audio queue.');
      resetSpeechEngine();
      return;
    }

    // Recover if browser dropped speech without onend callback
    if (!synth.speaking && isProcessingQueue && activeUtterances.size > 0 && Date.now() - currentUtteranceStartTime > 4000) {
      console.warn('[TTS Watchdog] Utterance finished without onend callback. Advancing queue.');
      activeUtterances.clear();
      currentUtterance = null;
      isProcessingQueue = false;
      processNextInQueue();
    }
  }, 2000);
}

function stopWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

function resetSpeechEngine(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  currentQueueSession++;
  window.speechSynthesis.cancel();
  activeUtterances.clear();
  currentUtterance = null;
  isProcessingQueue = false;

  if (cancelDebounceTimer) {
    clearTimeout(cancelDebounceTimer);
  }
  cancelDebounceTimer = setTimeout(() => {
    cancelDebounceTimer = null;
    processNextInQueue();
  }, 40);
}

// 5. Clean Utterance Text Sanitization
export function sanitizeSpeechText(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[*_#`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 6. Voice Selection
function selectBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  if (!voices || voices.length === 0) return undefined;

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const pool = english.length > 0 ? english : voices;

  return (
    pool.find((v) => /Natural|Google|Samantha|Daniel|Karen/.test(v.name)) ||
    // espeak-ng exposes ~15k "Name+variant" entries (e.g. "English (America)+male8").
    // The plain, variant-free voice is the intelligible one — prefer it.
    pool.find((v) => !v.name.includes('+') && v.lang.toLowerCase() === 'en-us') ||
    pool.find((v) => !v.name.includes('+')) ||
    pool[0]
  );
}

// Helper: insert non-urgent items by priority maintaining FIFO within same priority
function enqueueByPriority(req: QueuedUtterance): void {
  const level = PRIORITY_LEVELS[req.options.priority || 'normal'];
  const idx = speechQueue.findIndex(
    (item) => PRIORITY_LEVELS[item.options.priority || 'normal'] < level
  );
  if (idx === -1) {
    speechQueue.push(req);
  } else {
    speechQueue.splice(idx, 0, req);
  }
}

// 7. Core Queue Processor with Chrome Cancel Race Prevention
async function processNextInQueue(): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (isProcessingQueue) return;
  if (speechQueue.length === 0) {
    if (!window.speechSynthesis.speaking && activeUtterances.size === 0) {
      stopWatchdog();
    }
    return;
  }

  isProcessingQueue = true;
  const item = speechQueue.shift()!;
  const clean = sanitizeSpeechText(item.text);

  if (!clean) {
    console.warn('[TTS] Nothing to speak (empty after cleanup)');
    isProcessingQueue = false;
    item.options.onEnd?.();
    processNextInQueue();
    return;
  }

  const session = currentQueueSession;
  const voices = await getVoicesAsync();
  if (session !== currentQueueSession) {
    isProcessingQueue = false;
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = item.options.rate ?? 1.0;
    utterance.pitch = item.options.pitch ?? 1.0;
    utterance.volume = item.options.volume ?? 1.0;

    const voice = selectBestVoice(voices);
    if (voice) {
      utterance.voice = voice;
    }

    // GC Retention: hold strong reference in module-scoped Set
    activeUtterances.add(utterance);
    currentUtterance = utterance;
    currentUtteranceStartTime = Date.now();
    startWatchdog();

    utterance.onstart = () => {
      item.options.onStart?.();
    };

    const cleanup = () => {
      activeUtterances.delete(utterance);
      if (currentUtterance === utterance) {
        currentUtterance = null;
      }
      localSpeechActive = false;
      isProcessingQueue = false;
      captionListener?.('');
    };

    utterance.onend = () => {
      cleanup();
      item.options.onEnd?.();
      processNextInQueue();
    };

    utterance.onerror = (e) => {
      cleanup();
      item.options.onError?.(e);
      processNextInQueue();
    };

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    console.log(`[TTS] Speaking: "${clean.slice(0, 80)}..."`);
    // Caption fires here, not in onstart — on a machine with no TTS backend
    // (Linux without speech-dispatcher) onstart never fires, and the text
    // still needs to be visible.
    captionListener?.(clean);
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    // Never let a bad utterance wedge isProcessingQueue forever — that would
    // silently kill all future speech for the rest of the session.
    console.error('[TTS] Failed to speak, advancing queue:', err);
    isProcessingQueue = false;
    item.options.onError?.(err);
    processNextInQueue();
  }
}

// 8. Public API
export function speakText(
  text: string,
  optionsOrOnEnd?: SpeakOptions | (() => void)
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('[TTS] speechSynthesis not available');
    return;
  }

  if (typeof text !== 'string' || !text.trim()) {
    // Guards every caller at the one choke point they all route through —
    // a bad (undefined/non-string) narration must never wedge the queue.
    return;
  }

  const options: SpeakOptions =
    typeof optionsOrOnEnd === 'function' ? { onEnd: optionsOrOnEnd } : (optionsOrOnEnd || {});

  const priority = options.priority || 'normal';
  const isUrgent = priority === 'urgent' || priority === 'high' || !!options.interrupt;

  // Mark local speech as active so reply.audio doesn't cancel it
  if (options.source === 'local') {
    localSpeechActive = true;
  }

  // Auto-resume AudioContext on interaction
  resumeAudioContext();

  const req: QueuedUtterance = {
    id: `tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    options,
    timestamp: Date.now(),
  };

  if (isUrgent) {
    // Urgent preemption: cancel current, clear lower-priority backlog
    speechQueue = speechQueue.filter((q) => {
      const p = q.options.priority || 'normal';
      return p === 'urgent' || p === 'high';
    });
    enqueueByPriority(req);

    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      currentQueueSession++;
      window.speechSynthesis.cancel();
      activeUtterances.clear();
      currentUtterance = null;
      isProcessingQueue = false;

      // Chrome cancel race prevention: wait 40ms for IPC to settle before speaking new utterance
      if (cancelDebounceTimer) {
        clearTimeout(cancelDebounceTimer);
      }
      cancelDebounceTimer = setTimeout(() => {
        cancelDebounceTimer = null;
        processNextInQueue();
      }, 40);
      return;
    }
  } else {
    // Normal queueing with priority hierarchy
    enqueueByPriority(req);
  }

  if (!isProcessingQueue && !window.speechSynthesis.speaking && !cancelDebounceTimer) {
    processNextInQueue();
  }
}

export function stopSpeaking(clearQueue = true): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (cancelDebounceTimer) {
    clearTimeout(cancelDebounceTimer);
    cancelDebounceTimer = null;
  }
  currentQueueSession++;
  if (clearQueue) {
    speechQueue = [];
  }
  window.speechSynthesis.cancel();
  activeUtterances.clear();
  currentUtterance = null;
  localSpeechActive = false;
  isProcessingQueue = false;
  stopWatchdog();
}

/** Returns true if browser TTS is currently speaking from a local trigger (keyboard/button).
 *  Voice-agent should NOT call stopSpeaking() when this is true. */
export function isLocalSpeechActive(): boolean {
  return localSpeechActive;
}

export function initSpeech(): void {
  resumeAudioContext();
  getVoicesAsync().catch(() => {});
}

// 9. Dual-Path Audio Fallback Coordinator
export interface DualPathOptions {
  text: string;
  priority?: SpeechPriority;
  timeoutMs?: number; // default: 400ms
  isWebSocketAudioActive: () => boolean;
  onSpoken?: () => void;
}

export function scheduleDualPathSpeech(options: DualPathOptions): () => void {
  // If WebSocket is already streaming audio, do nothing
  if (options.isWebSocketAudioActive()) {
    return () => {};
  }

  const timeoutMs = options.timeoutMs ?? 1200;
  if (timeoutMs <= 0) {
    speakText(options.text, { priority: options.priority || 'urgent' });
    options.onSpoken?.();
    return () => {};
  }

  const timer = setTimeout(() => {
    if (!options.isWebSocketAudioActive()) {
      console.log('[DualPath] WebSocket audio inactive; executing browser TTS fallback');
      speakText(options.text, { priority: options.priority || 'urgent' });
      options.onSpoken?.();
    }
  }, timeoutMs);

  // Return cancel function when WebSocket audio starts
  return () => clearTimeout(timer);
}

// 10. Inspection Helpers for Automated Verification
export function _getSpeechInternalStateForTesting(): {
  activeUtterancesCount: number;
  queueLength: number;
  isProcessingQueue: boolean;
  hasCurrentUtterance: boolean;
  isWatchdogActive: boolean;
} {
  return {
    activeUtterancesCount: activeUtterances.size,
    queueLength: speechQueue.length,
    isProcessingQueue,
    hasCurrentUtterance: currentUtterance !== null,
    isWatchdogActive: watchdogInterval !== null,
  };
}

export function _resetSpeechStateForTesting(): void {
  stopSpeaking(true);
  cachedVoices = [];
  voicesReadyPromise = null;
}
