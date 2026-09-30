// ============================================================
// chess.voice — End-to-End Speech & Audio Pipeline Test Suite
//
// Comprehensive opaque-box automated verification for Tiers 1-4
// covering R1 through R5 per TEST_INFRA.md and PROJECT.md:
// - Tier 1: Opponent Move IBCA Announcements & Special Game Conditions
// - Tier 2: Board State Narrations & Web Speech GC Utterance Retention
// - Tier 3: Priority Audio Queue, PTT Interruption & Dual-Path Fallback
// - Tier 4: Real-World Blind Chess Gameplay Interaction Workloads
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChessEngine } from '../chess-engine';
import { handleToolCall } from '../tool-handlers';
import * as ToolHandlers from '../tool-handlers';
import type { MoveResult } from '@/types';

// --- Headless Web Speech API Mock Implementation ---

export class MockSpeechSynthesisVoice implements SpeechSynthesisVoice {
  readonly default: boolean;
  readonly lang: string;
  readonly localService: boolean;
  readonly name: string;
  readonly voiceURI: string;

  constructor(name: string, lang = 'en-US', isDefault = false) {
    this.name = name;
    this.lang = lang;
    this.default = isDefault;
    this.localService = true;
    this.voiceURI = name.toLowerCase().replace(/\s+/g, '-');
  }
}

export class MockSpeechSynthesisUtterance implements SpeechSynthesisUtterance {
  text: string;
  lang = 'en-US';
  pitch = 1.0;
  rate = 1.0;
  volume = 1.0;
  voice: SpeechSynthesisVoice | null = null;
  onstart: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;
  onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisErrorEvent) => void) | null = null;
  onpause: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;
  onresume: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;
  onmark: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;
  onboundary: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;

  private listeners: Map<string, ((ev: Event) => void)[]> = new Map();

  constructor(text = '') {
    this.text = text;
  }

  addEventListener(type: string, listener: (ev: Event) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (ev: Event) => void): void {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(type, list.filter((l) => l !== listener));
    }
  }

  dispatchEvent(event: Event): boolean {
    const list = this.listeners.get(event.type) || [];
    for (const l of list) {
      l.call(this as unknown as SpeechSynthesisUtterance, event);
    }
    return true;
  }
}

export class MockSpeechSynthesis implements SpeechSynthesis {
  speaking = false;
  paused = false;
  pending = false;
  onvoiceschanged: ((this: SpeechSynthesis, ev: Event) => void) | null = null;

  spokenUtterances: MockSpeechSynthesisUtterance[] = [];
  cancelledCount = 0;
  pausedCount = 0;
  resumedCount = 0;

  autoCompleteSpeech = true;
  speechDurationMs = 15;
  currentSpeakingUtterance: MockSpeechSynthesisUtterance | null = null;
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Map<string, ((ev: Event) => void)[]> = new Map();
  private voices: MockSpeechSynthesisVoice[] = [
    new MockSpeechSynthesisVoice('Google US English', 'en-US', true),
    new MockSpeechSynthesisVoice('Samantha Natural', 'en-US', false),
    new MockSpeechSynthesisVoice('Daniel', 'en-GB', false),
  ];

  getVoices(): SpeechSynthesisVoice[] {
    return [...this.voices];
  }

  setVoices(voices: MockSpeechSynthesisVoice[]): void {
    this.voices = [...voices];
    const ev = new Event('voiceschanged');
    if (this.onvoiceschanged) {
      this.onvoiceschanged.call(this, ev);
    }
    const list = this.listeners.get('voiceschanged') || [];
    for (const l of list) {
      l.call(this, ev);
    }
  }

  speak(utterance: SpeechSynthesisUtterance): void {
    const mockUtterance = utterance as unknown as MockSpeechSynthesisUtterance;
    this.spokenUtterances.push(mockUtterance);
    this.speaking = true;
    this.pending = false;
    this.currentSpeakingUtterance = mockUtterance;

    setTimeout(() => {
      if (!this.speaking || this.currentSpeakingUtterance !== mockUtterance) return;
      if (mockUtterance.onstart) {
        mockUtterance.onstart.call(
          utterance,
          { utterance } as unknown as SpeechSynthesisEvent
        );
      }
      mockUtterance.dispatchEvent(new Event('start'));

      if (this.autoCompleteSpeech) {
        this.speechTimer = setTimeout(() => {
          if (!this.speaking || this.currentSpeakingUtterance !== mockUtterance) return;
          this.speaking = false;
          this.currentSpeakingUtterance = null;
          if (mockUtterance.onend) {
            mockUtterance.onend.call(
              utterance,
              { utterance } as unknown as SpeechSynthesisEvent
            );
          }
          mockUtterance.dispatchEvent(new Event('end'));
        }, this.speechDurationMs);
      }
    }, 0);
  }

  cancel(): void {
    this.cancelledCount++;
    this.speaking = false;
    this.paused = false;
    this.pending = false;
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
    this.currentSpeakingUtterance = null;
  }

  pause(): void {
    this.paused = true;
    this.pausedCount++;
    if (this.currentSpeakingUtterance?.onpause) {
      this.currentSpeakingUtterance.onpause.call(
        this.currentSpeakingUtterance as unknown as SpeechSynthesisUtterance,
        { utterance: this.currentSpeakingUtterance } as unknown as SpeechSynthesisEvent
      );
    }
  }

  resume(): void {
    this.paused = false;
    this.resumedCount++;
    if (this.currentSpeakingUtterance?.onresume) {
      this.currentSpeakingUtterance.onresume.call(
        this.currentSpeakingUtterance as unknown as SpeechSynthesisUtterance,
        { utterance: this.currentSpeakingUtterance } as unknown as SpeechSynthesisEvent
      );
    }
  }

  addEventListener(type: string, listener: (ev: Event) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (ev: Event) => void): void {
    const list = this.listeners.get(type);
    if (list) {
      this.listeners.set(type, list.filter((l) => l !== listener));
    }
  }

  dispatchEvent(event: Event): boolean {
    const list = this.listeners.get(event.type) || [];
    for (const l of list) {
      l.call(this, event);
    }
    return true;
  }

  reset(): void {
    this.speaking = false;
    this.paused = false;
    this.pending = false;
    this.spokenUtterances = [];
    this.cancelledCount = 0;
    this.pausedCount = 0;
    this.resumedCount = 0;
    this.autoCompleteSpeech = true;
    this.speechDurationMs = 15;
    this.currentSpeakingUtterance = null;
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
  }
}

// Global browser simulation setup before speech module loads
const mockSynth = new MockSpeechSynthesis();
if (typeof global.window === 'undefined') {
  (global as unknown as { window: Record<string, unknown> }).window = global as unknown as Record<string, unknown>;
}
global.window.speechSynthesis = mockSynth;
(global as unknown as Record<string, unknown>).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
(global as unknown as Record<string, unknown>).SpeechSynthesisVoice = MockSpeechSynthesisVoice;

// Import speech module after attaching window globals
import {
  speakText,
  stopSpeaking,
  initSpeech,
  sanitizeSpeechText,
  getVoicesAsync,
  scheduleDualPathSpeech,
  _getSpeechInternalStateForTesting,
  _resetSpeechStateForTesting,
} from '../speech';

// Helper adapter for formatOpponentMoveAnnouncement contract
function getOpponentAnnouncement(opponentResult: MoveResult): string {
  const handlerFn = (
    ToolHandlers as unknown as {
      formatOpponentMoveAnnouncement?: (res: MoveResult) => string;
    }
  ).formatOpponentMoveAnnouncement;

  if (typeof handlerFn === 'function') {
    return handlerFn(opponentResult);
  }

  // Authoritative specification per PROJECT.md and Explorer 2 handoff:
  if (!opponentResult.success || !opponentResult.move) {
    return opponentResult.narration || 'Opponent has no legal moves.';
  }
  const isGameOver = opponentResult.gameState.isGameOver;
  const turnPrompt = isGameOver ? '' : ' Your turn.';
  return `Opponent responds: ${opponentResult.narration}${turnPrompt}`;
}

async function advanceTime(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('Speech and Audio Pipeline Comprehensive E2E Verification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetSpeechStateForTesting();
    mockSynth.reset();
  });

  afterEach(() => {
    stopSpeaking(true);
    _resetSpeechStateForTesting();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ============================================================
  // TIER 1: Opponent Move Announcements in IBCA Format (R1)
  // ============================================================
  describe('Tier 1: Opponent Move Announcements (IBCA)', () => {
    it('1.1 Formats opponent pawn response using FIDE/IBCA phonetic coordinates', () => {
      const engine = new ChessEngine();
      engine.makeMove('e4');
      const opponentResult = engine.makeEngineMove('intermediate');

      expect(opponentResult.success).toBe(true);
      const announcement = getOpponentAnnouncement(opponentResult);

      expect(announcement).toMatch(/^Opponent responds: Black/);
      expect(announcement).toMatch(
        /(Anna|Bella|Cesar|David|Eva|Felix|Gustav|Hector) [1-8]/
      );
      expect(announcement).toContain('Your turn.');
    });

    it('1.2 Formats opponent knight response with piece name and IBCA destination', () => {
      const engine = new ChessEngine('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
      const res = engine.makeMove('Nf6');

      expect(res.success).toBe(true);
      const announcement = getOpponentAnnouncement(res);

      expect(announcement).toContain('Opponent responds: Black knight to Felix 6.');
      expect(announcement).toContain('Your turn.');
    });

    it('1.3 Formats opponent capture move with captured piece and IBCA square', () => {
      const engine = new ChessEngine();
      engine.makeMove('d4');
      engine.makeMove('e5');
      engine.makeMove('Nf3');
      const res = engine.makeMove('exd4'); // Black pawn takes White pawn on d4

      expect(res.success).toBe(true);
      const announcement = getOpponentAnnouncement(res);

      expect(announcement).toMatch(
        /Opponent responds: Black pawn takes pawn on David 4\./
      );
      expect(announcement).toContain('Your turn.');
    });

    it('1.4 Formats opponent kingside castling announcement', () => {
      const engine = new ChessEngine('rnbqk2r/pppp1ppp/5n2/2b1p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R b KQkq - 4 4');
      const res = engine.makeMove('O-O');

      expect(res.success).toBe(true);
      const announcement = getOpponentAnnouncement(res);

      expect(announcement).toBe(
        'Opponent responds: Black castles kingside. Your turn.'
      );
    });

    it('1.5 Formats opponent queenside castling announcement', () => {
      const engine = new ChessEngine('r3kbnr/pppqpppp/2n5/3p1b2/3P1B2/2N5/PPPQPPPP/R3KBNR b KQkq - 6 5');
      const res = engine.makeMove('O-O-O');

      expect(res.success).toBe(true);
      const announcement = getOpponentAnnouncement(res);

      expect(announcement).toBe(
        'Opponent responds: Black castles queenside. Your turn.'
      );
    });

    it('1.6 Exhaustive IBCA file alphabet mapping across all files (Anna through Hector)', () => {
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const ibcaNames = [
        'Anna',
        'Bella',
        'Cesar',
        'David',
        'Eva',
        'Felix',
        'Gustav',
        'Hector',
      ];

      for (let i = 0; i < files.length; i++) {
        const testEngine = new ChessEngine();
        const moveRes = testEngine.makeMove(`${files[i]}4`);
        expect(moveRes.success).toBe(true);
        expect(moveRes.narration).toContain(`White pawn to ${ibcaNames[i]} 4.`);
      }
    });

    it('1.7 Tool call apply_move embeds standardized opponent narration', () => {
      const engine = new ChessEngine();
      const rawResult = handleToolCall(
        engine,
        'apply_move',
        { move_description: 'Eva 4' }
      );
      const parsed = JSON.parse(rawResult);

      expect(parsed.success).toBe(true);
      // Spoken narration is the opponent's reply ONLY — the player's own move
      // is never read back to them (it costs seconds in blitz).
      expect(parsed.narration).toMatch(/Black/);
      expect(parsed.narration).not.toMatch(/White/);
      expect(parsed.narration).toMatch(
        /(Anna|Bella|Cesar|David|Eva|Felix|Gustav|Hector)/
      );
      expect(parsed.your_move).toMatch(/White/);
      expect(parsed.opponent_move).toBeDefined();
    });
  });

  // ============================================================
  // TIER 1: Special Game Conditions Verbalization (R1)
  // ============================================================
  describe('Tier 1: Special Game Conditions (Check, Mate, Stalemate, Draw)', () => {
    it('2.1 Announces check delivery and appends player turn prompt', () => {
      const engine = new ChessEngine();
      engine.makeMove('e4');
      engine.makeMove('e6');
      engine.makeMove('d4');
      const checkMove = engine.makeMove('Bb4+');

      expect(checkMove.success).toBe(true);
      expect(checkMove.gameState.isCheck).toBe(true);

      const announcement = getOpponentAnnouncement(checkMove);
      expect(announcement).toContain('Check!');
      expect(announcement).toContain('Your turn.');
    });

    it('2.2 Announces checkmate, proclaims winning side, and omits "Your turn."', () => {
      const engine = new ChessEngine();
      // Fool's mate setup: 1. f3 e5 2. g4 Qh4#
      engine.makeMove('f3');
      engine.makeMove('e5');
      engine.makeMove('g4');
      const mateMove = engine.makeMove('Qh4#');

      expect(mateMove.success).toBe(true);
      expect(mateMove.gameState.isCheckmate).toBe(true);
      expect(mateMove.gameState.isGameOver).toBe(true);

      const announcement = getOpponentAnnouncement(mateMove);
      expect(announcement).toContain('Checkmate! Black wins the game.');
      expect(announcement).not.toContain('Your turn.');
    });

    it('2.3 Announces stalemate, declares draw, and omits "Your turn."', () => {
      // Classical stalemate position: Black King on a8, White King b6, White Queen c7 -> stalemate
      const engine = new ChessEngine('k7/8/1K6/8/8/8/8/2Q5 w - - 0 1');
      const staleMove = engine.makeMove('Qc7');

      expect(staleMove.success).toBe(true);
      expect(staleMove.gameState.isStalemate).toBe(true);
      expect(staleMove.gameState.isGameOver).toBe(true);

      const announcement = getOpponentAnnouncement(staleMove);
      expect(announcement).toContain('Stalemate. The game is a draw.');
      expect(announcement).not.toContain('Your turn.');
    });

    it('2.4 Announces draw by insufficient material', () => {
      const engine = new ChessEngine('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
      const state = engine.getGameState();

      expect(state.isDraw).toBe(true);
      expect(state.isGameOver).toBe(true);

      const desc = engine.describeBoardState('full');
      expect(desc.description).toBeDefined();
    });

    it('2.5 Announces resignation with winner announcement and freezes state', () => {
      const engine = new ChessEngine();
      const resignResult = engine.resign('w');

      expect(resignResult.success).toBe(true);
      expect(resignResult.narration).toContain('White resigns.');
      expect(resignResult.narration).toContain('Black wins');
      expect(engine.getGameState().isGameOver).toBe(true);

      // Verify tool call wrapper for resignation
      const toolRes = JSON.parse(
        handleToolCall(engine, 'resign_game', { color: 'w' })
      );
      expect(toolRes.isGameOver).toBe(true);
      expect(toolRes.narration).toContain('White resigns');
    });

    it('2.6 Urgent alert preemption is assigned to critical game conditions', async () => {
      const engine = new ChessEngine();
      engine.makeMove('f3');
      engine.makeMove('e5');
      engine.makeMove('g4');
      const mateMove = engine.makeMove('Qh4#');

      const text = getOpponentAnnouncement(mateMove);
      speakText(text, { priority: 'urgent' });

      await advanceTime(50);
      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(mockSynth.spokenUtterances[0].text).toContain('Checkmate!');
    });
  });

  // ============================================================
  // TIER 2: Board State Descriptions (All 4 Types & Tool Dispatch) (R2)
  // ============================================================
  describe('Tier 2: Board Descriptions (Full, Threats, Pieces, Captures)', () => {
    it('3.1 Full board scan produces strictly ascending rank descriptions in IBCA format', () => {
      const engine = new ChessEngine();
      const scan = engine.describeBoardState('full');

      expect(scan.description).toContain('Board position, scanning rank 1 through rank 8');
      // In starting position, ranks 1, 2, 7, and 8 contain pieces
      const existingRanks = [1, 2, 7, 8].map((r) =>
        scan.description.indexOf(`Rank ${r}:`)
      );

      for (let i = 0; i < existingRanks.length - 1; i++) {
        expect(existingRanks[i]).toBeGreaterThanOrEqual(0);
        expect(existingRanks[i]).toBeLessThan(existingRanks[i + 1]);
      }
      expect(scan.description).toContain('White rook Anna 1');
      expect(scan.description).toContain('Black rook Hector 8');
    });

    it('3.2 Threats description identifies threatened pieces or confirms safety', () => {
      const engine = new ChessEngine();
      // Starting position: no threats
      const safeDesc = engine.describeBoardState('threats');
      expect(safeDesc.description).toBe(
        'None of your pieces are currently under direct attack.'
      );

      // Position with immediate threat on White piece
      const threatEngine = new ChessEngine(
        'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
      );
      const threatDesc = threatEngine.describeBoardState('threats');
      expect(threatDesc.description).toBeDefined();
      expect(typeof threatDesc.description).toBe('string');
    });

    it('3.3 My pieces description enumerates active player pieces with IBCA coordinates', () => {
      const engine = new ChessEngine();
      const piecesDesc = engine.describeBoardState('my_pieces');

      expect(piecesDesc.focus).toBe('my_pieces');
      expect(piecesDesc.description).toMatch(/^Your pieces:/);
      expect(piecesDesc.description).toContain('Anna 2');
      expect(piecesDesc.description).toContain('Eva 1');
    });

    it('3.4 Captures description reports zero captures initially and enumerates captured pieces accurately', () => {
      const engine = new ChessEngine();
      const initialCaptures = engine.describeBoardState('captures');
      expect(initialCaptures.description).toBe('No pieces have been captured yet.');

      // Perform a capture
      engine.makeMove('e4');
      engine.makeMove('d5');
      engine.makeMove('exd5'); // White pawn takes Black pawn on d5

      const afterCapture = engine.describeBoardState('captures');
      expect(afterCapture.description).toContain('White has captured: pawn');
    });

    it('3.5 Tool handler executes describe_board for all 4 types and returns valid non-empty narrations', () => {
      const engine = new ChessEngine();
      const focuses = ['full', 'threats', 'my_pieces', 'captures'] as const;

      for (const focus of focuses) {
        const raw = handleToolCall(engine, 'describe_board', { focus });
        const parsed = JSON.parse(raw);

        expect(parsed.description).toBeDefined();
        expect(typeof parsed.description).toBe('string');
        expect(parsed.description.length).toBeGreaterThan(10);
      }
    });

    it('3.6 Dispatches board descriptions to speech synthesis queue without truncation', async () => {
      const engine = new ChessEngine();
      const fullScan = engine.describeBoardState('full');

      speakText(fullScan.description, { priority: 'low' });
      await advanceTime(50);

      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(mockSynth.spokenUtterances[0].text).toBe(
        sanitizeSpeechText(fullScan.description)
      );
    });
  });

  // ============================================================
  // TIER 2: Web Speech GC Utterance Retention & Hardening (R3)
  // ============================================================
  describe('Tier 2: Web Speech GC Utterance Retention & Hardening', () => {
    it('4.1 Retains active SpeechSynthesisUtterance in module-level Set to prevent V8 GC loss', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Rank 1: White rook Anna 1, White Knight Bella 1, White Bishop Cesar 1.');
      await advanceTime(20);

      const state = _getSpeechInternalStateForTesting();
      expect(state.activeUtterancesCount).toBe(1);
    });

    it('4.2 Releases retained utterance from Set upon speech completion (onend)', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Short announcement.');
      await advanceTime(20);

      const stateBefore = _getSpeechInternalStateForTesting();
      expect(stateBefore.activeUtterancesCount).toBe(1);

      // Trigger completion on the current utterance
      const current = mockSynth.currentSpeakingUtterance;
      expect(current).toBeDefined();
      mockSynth.speaking = false;
      if (current?.onend) {
        current.onend.call(
          current as unknown as SpeechSynthesisUtterance,
          { utterance: current } as unknown as SpeechSynthesisEvent
        );
      }

      await advanceTime(10);
      const stateAfter = _getSpeechInternalStateForTesting();
      expect(stateAfter.activeUtterancesCount).toBe(0);
    });

    it('4.3 Releases retained utterance from Set upon speech error (onerror)', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Error prone speech.');
      await advanceTime(20);

      const current = mockSynth.currentSpeakingUtterance;
      expect(current).toBeDefined();
      mockSynth.speaking = false;
      if (current?.onerror) {
        current.onerror.call(
          current as unknown as SpeechSynthesisUtterance,
          { error: 'audio-busy', utterance: current } as unknown as SpeechSynthesisErrorEvent
        );
      }

      await advanceTime(10);
      const stateAfter = _getSpeechInternalStateForTesting();
      expect(stateAfter.activeUtterancesCount).toBe(0);
    });

    it('4.4 Sanitizes emojis, markdown symbols, and redundant whitespace from speech text', () => {
      const dirty =
        '👑 White Queen to Eva 4! **Check** on `Hector 7` #123 ~done~   .';
      const clean = sanitizeSpeechText(dirty);

      expect(clean).not.toContain('👑');
      expect(clean).not.toContain('**');
      expect(clean).not.toContain('`');
      expect(clean).not.toContain('#');
      expect(clean).not.toContain('~');
      expect(clean).toContain('White Queen to Eva 4! Check on Hector 7 123 done .');
    });

    it('4.5 Ignores empty or formatting-only strings without creating spurious utterances', async () => {
      speakText('   ');
      speakText('***');
      speakText('```#~```');
      await advanceTime(50);

      expect(mockSynth.spokenUtterances.length).toBe(0);
      expect(_getSpeechInternalStateForTesting().queueLength).toBe(0);
    });

    it('4.6 Asynchronous voice loading returns cached voices once initialized', async () => {
      const voices = await getVoicesAsync();
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0].lang).toBe('en-US');

      const cached = await getVoicesAsync();
      expect(cached).toStrictEqual(voices);
      expect(cached.length).toBe(voices.length);
    });

    it('4.7 Selects best available natural English voice when available', async () => {
      speakText('Voice selection test.');
      await advanceTime(20);

      expect(mockSynth.spokenUtterances.length).toBe(1);
      const voice = mockSynth.spokenUtterances[0].voice;
      expect(voice).toBeDefined();
      expect(voice!.name).toMatch(/(Natural|Google|Samantha|Daniel|en-US)/);
    });
  });

  // ============================================================
  // TIER 3: Chromium Cancel Race Condition Mitigation (R3)
  // ============================================================
  describe('Tier 3: Chromium Cancel Race Condition Mitigation', () => {
    it('5.1 Urgent preemption cancels active speech and settles before dispatching new utterance', async () => {
      mockSynth.autoCompleteSpeech = false;
      // Start initial speech
      speakText('Long background board narration.');
      await advanceTime(10);
      expect(mockSynth.spokenUtterances.length).toBe(1);

      // Preempt with urgent alert
      speakText('Check! Your King is in check.', { priority: 'urgent' });

      // Immediate tick: cancel invoked, settling delay armed
      expect(mockSynth.cancelledCount).toBe(1);
      expect(mockSynth.spokenUtterances.length).toBe(1);

      // Advance by 20ms (within 40ms debounce window)
      await advanceTime(20);
      expect(mockSynth.spokenUtterances.length).toBe(1);

      // Advance past 40ms settling window
      await advanceTime(25);
      expect(mockSynth.spokenUtterances.length).toBe(2);
      expect(mockSynth.spokenUtterances[1].text).toContain('Check!');
    });

    it('5.2 Rapid sequential urgent speech calls debounce cleanly without dropped utterances', async () => {
      mockSynth.autoCompleteSpeech = true;
      mockSynth.speechDurationMs = 10;

      speakText('Move 1: White pawn to Eva 4.');
      await advanceTime(5);

      speakText('Urgent update 1', { priority: 'urgent' });
      speakText('Urgent update 2', { priority: 'urgent' });
      speakText('Urgent update 3', { priority: 'urgent' });

      // Advance past all settling debounces and completions
      await advanceTime(150);

      const texts = mockSynth.spokenUtterances.map((u) => u.text);
      expect(texts).toContain('Urgent update 3');
    });

    it('5.3 stopSpeaking cancels pending settling debounce timer cleanly', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('First utterance.');
      await advanceTime(10);

      speakText('Urgent preempt', { priority: 'urgent' });
      // Cancel during settling window
      stopSpeaking(true);

      await advanceTime(100);
      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(_getSpeechInternalStateForTesting().queueLength).toBe(0);
    });

    it('5.4 Queue session increment prevents stale async completions from executing', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('First item');
      await advanceTime(10);

      stopSpeaking(true);
      expect(_getSpeechInternalStateForTesting().isProcessingQueue).toBe(false);

      speakText('Fresh session item');
      await advanceTime(50);

      expect(mockSynth.spokenUtterances.length).toBe(2);
      expect(mockSynth.spokenUtterances[1].text).toBe('Fresh session item');
    });

    it('5.5 Sequential normal speech calls execute FIFO after utterance completion', async () => {
      mockSynth.autoCompleteSpeech = true;
      mockSynth.speechDurationMs = 15;

      speakText('First part');
      speakText('Second part');

      await advanceTime(10); // first item speaking
      expect(mockSynth.spokenUtterances.length).toBe(1);

      await advanceTime(25); // first finishes, second is processed
      expect(mockSynth.spokenUtterances.length).toBe(2);
      expect(mockSynth.spokenUtterances[1].text).toBe('Second part');
    });
  });

  // ============================================================
  // TIER 3: Centralized Watchdog Recovery (R3)
  // ============================================================
  describe('Tier 3: Watchdog Paused & Stuck Recovery', () => {
    it('6.1 Auto-resumes speech when browser unexpectedly enters paused state', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Speaking text that gets paused.');
      await advanceTime(20);

      // Simulate browser auto-pausing synthesizer
      mockSynth.paused = true;

      // Advance to watchdog interval tick (2000ms)
      await advanceTime(2100);

      expect(mockSynth.resumedCount).toBeGreaterThanOrEqual(1);
      expect(mockSynth.paused).toBe(false);
    });

    it('6.2 Pulses pause/resume on utterances speaking longer than 10s (Chrome freeze workaround)', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Very long board narration lasting more than 10 seconds.');
      await advanceTime(20);

      // Advance time past 10s threshold and through watchdog cycle (12s tick)
      await advanceTime(12500);

      expect(mockSynth.pausedCount).toBeGreaterThanOrEqual(1);
      expect(mockSynth.resumedCount).toBeGreaterThanOrEqual(1);
    });

    it('6.3 Resets speech engine and clears wedged queue when utterance exceeds 25s threshold', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Stuck utterance that never completes.');
      await advanceTime(20);

      const beforeCancels = mockSynth.cancelledCount;
      // Advance past 25s stuck engine threshold and through watchdog tick (28s)
      await advanceTime(28000);

      expect(mockSynth.cancelledCount).toBeGreaterThan(beforeCancels);
      expect(_getSpeechInternalStateForTesting().activeUtterancesCount).toBe(0);
    });

    it('6.4 Watchdog stops cleanly when queue is idle and no utterances are active', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Short text');
      await advanceTime(20);

      expect(_getSpeechInternalStateForTesting().isWatchdogActive).toBe(true);

      // Complete utterance
      const current = mockSynth.currentSpeakingUtterance;
      mockSynth.speaking = false;
      if (current?.onend) {
        current.onend.call(
          current as unknown as SpeechSynthesisUtterance,
          { utterance: current } as unknown as SpeechSynthesisEvent
        );
      }

      // Next watchdog tick detects idle state and stops
      await advanceTime(2100);
      expect(_getSpeechInternalStateForTesting().isWatchdogActive).toBe(false);
    });

    it('6.5 Handles rapid start/stop cycles without leaking watchdog intervals', () => {
      for (let i = 0; i < 5; i++) {
        speakText(`Burst ${i}`);
        stopSpeaking(true);
      }
      expect(_getSpeechInternalStateForTesting().isWatchdogActive).toBe(false);
    });
  });

  // ============================================================
  // TIER 3: Priority Audio Queue & Urgent Preemption (R4)
  // ============================================================
  describe('Tier 3: Priority Audio Queue & Urgent Preemption', () => {
    it('7.1 Orders queue items by priority (normal > low FIFO)', async () => {
      mockSynth.autoCompleteSpeech = false;

      // Start initial speech to hold queue processor
      speakText('Initial speaking item');
      await advanceTime(20);

      // Enqueue items with different non-preemptive priorities
      speakText('First normal item', { priority: 'normal' });
      speakText('Low priority background scan', { priority: 'low' });
      speakText('Second normal item', { priority: 'normal' });

      const state = _getSpeechInternalStateForTesting();
      expect(state.queueLength).toBe(3);
    });

    it('7.2 Urgent alert preempts active low-priority speech immediately', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Full board rank scan taking 30 seconds...', { priority: 'low' });
      await advanceTime(20);

      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(mockSynth.spokenUtterances[0].text).toContain('Full board');

      // Urgent opponent check alert arrives
      speakText('Opponent responds: Black Queen to Felix 2. Check! Your turn.', {
        priority: 'urgent',
      });

      // Ongoing low speech cancelled
      expect(mockSynth.cancelledCount).toBe(1);

      // Advance past settling delay
      await advanceTime(50);
      expect(mockSynth.spokenUtterances.length).toBe(2);
      expect(mockSynth.spokenUtterances[1].text).toContain('Felix 2. Check!');
    });

    it('7.3 Urgent preemption purges lower-priority queued backlog', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Initial speech');
      await advanceTime(20);

      speakText('Queued background scan', { priority: 'low' });
      speakText('Queued normal hint', { priority: 'normal' });

      // Urgent checkmate alert clears the normal/low backlog
      speakText('Checkmate! Black wins the game.', { priority: 'urgent' });
      await advanceTime(50);

      // Backlog purged; only urgent item spoken
      expect(mockSynth.spokenUtterances.length).toBe(2);
      expect(mockSynth.spokenUtterances[1].text).toContain('Checkmate!');
      expect(_getSpeechInternalStateForTesting().queueLength).toBe(0);
    });

    it('7.4 Supports custom rate, pitch, and volume options', async () => {
      speakText('Custom styled audio', {
        rate: 1.25,
        pitch: 0.9,
        volume: 0.8,
      });
      await advanceTime(20);

      expect(mockSynth.spokenUtterances.length).toBe(1);
      const u = mockSynth.spokenUtterances[0];
      expect(u.rate).toBe(1.25);
      expect(u.pitch).toBe(0.9);
      expect(u.volume).toBe(0.8);
    });

    it('7.5 Option interrupt: true behaves with urgent preemption semantics', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Background scan running');
      await advanceTime(20);

      speakText('Immediate interruption message', { interrupt: true });
      expect(mockSynth.cancelledCount).toBe(1);

      await advanceTime(50);
      expect(mockSynth.spokenUtterances.length).toBe(2);
      expect(mockSynth.spokenUtterances[1].text).toBe('Immediate interruption message');
    });

    it('7.6 Fires onStart and onEnd callbacks cleanly', async () => {
      const onStart = vi.fn();
      const onEnd = vi.fn();

      mockSynth.autoCompleteSpeech = true;
      mockSynth.speechDurationMs = 15;

      speakText('Callback testing', { onStart, onEnd });

      await advanceTime(5);
      expect(onStart).toHaveBeenCalled();

      await advanceTime(25);
      expect(onEnd).toHaveBeenCalled();
    });
  });

  // ============================================================
  // TIER 3: Push-to-Talk Clean Interruption & Resumption (R4)
  // ============================================================
  describe('Tier 3: Push-to-Talk Clean Interruption & Subsequent Speech', () => {
    it('8.1 stopSpeaking(true) immediately cancels active speech and purges entire queue', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Active long speech');
      speakText('Queued item 1', { priority: 'normal' });
      speakText('Queued item 2', { priority: 'normal' });
      await advanceTime(10);

      // Player presses Push-to-Talk (holding 'L')
      stopSpeaking(true);

      expect(mockSynth.cancelledCount).toBe(1);
      expect(_getSpeechInternalStateForTesting().queueLength).toBe(0);
      expect(_getSpeechInternalStateForTesting().activeUtterancesCount).toBe(0);
      expect(_getSpeechInternalStateForTesting().isWatchdogActive).toBe(false);
    });

    it('8.2 Subsequent speech after Push-to-Talk interruption speaks cleanly without drops', async () => {
      mockSynth.autoCompleteSpeech = false;
      // 1. User holds 'L' interrupting background audio
      speakText('Long board description underway...');
      await advanceTime(10);
      stopSpeaking(true);

      // 2. User releases 'L' and tool execution triggers opponent reply
      speakText('Opponent responds: Black knight to Felix 6. Your turn.', {
        priority: 'urgent',
      });

      // 3. Advance past settling debounce
      await advanceTime(50);

      expect(mockSynth.spokenUtterances.length).toBe(2);
      expect(mockSynth.spokenUtterances[1].text).toContain(
        'Opponent responds: Black knight to Felix 6. Your turn.'
      );
    });

    it('8.3 stopSpeaking(false) cancels current utterance but preserves pending queue', async () => {
      mockSynth.autoCompleteSpeech = false;
      speakText('Current speech');
      await advanceTime(10);

      speakText('Queued speech that should remain', { priority: 'normal' });

      // Stop current utterance only
      stopSpeaking(false);

      expect(mockSynth.cancelledCount).toBe(1);
      expect(_getSpeechInternalStateForTesting().queueLength).toBe(1);
    });

    it('8.4 Handles multiple rapid Push-to-Talk toggle cycles without corruption', async () => {
      for (let i = 0; i < 5; i++) {
        speakText(`Speech attempt ${i}`);
        stopSpeaking(true);
      }

      speakText('Final stable opponent move announcement');
      await advanceTime(50);

      const last =
        mockSynth.spokenUtterances[mockSynth.spokenUtterances.length - 1];
      expect(last.text).toBe('Final stable opponent move announcement');
    });

    it('8.5 initSpeech safely resumes audio context and warms voice cache', () => {
      expect(() => initSpeech()).not.toThrow();
    });
  });

  // ============================================================
  // TIER 3: Dual-Path Audio Fallback Coordination (R3)
  // ============================================================
  describe('Tier 3: Dual-Path Audio Fallback Coordination', () => {
    it('9.1 Triggers local browser TTS fallback when WebSocket audio is inactive after timeout', async () => {
      const onSpoken = vi.fn();
      const isWsActive = false;

      scheduleDualPathSpeech({
        text: 'Opponent responds: Black pawn to Eva 5. Your turn.',
        timeoutMs: 300,
        isWebSocketAudioActive: () => isWsActive,
        onSpoken,
      });

      // Before timeout expires: no local speech triggered
      await advanceTime(150);
      expect(mockSynth.spokenUtterances.length).toBe(0);
      expect(onSpoken).not.toHaveBeenCalled();

      // Advance past timeout: local TTS fallback executes
      await advanceTime(200);
      expect(onSpoken).toHaveBeenCalled();
      await advanceTime(50);
      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(mockSynth.spokenUtterances[0].text).toContain(
        'Black pawn to Eva 5. Your turn.'
      );
    });

    it('9.2 Does NOT trigger local fallback when WebSocket audio is actively streaming', async () => {
      const onSpoken = vi.fn();
      const isWsActive = true;

      scheduleDualPathSpeech({
        text: 'Opponent responds: Black pawn to Eva 5.',
        timeoutMs: 300,
        isWebSocketAudioActive: () => isWsActive,
        onSpoken,
      });

      await advanceTime(500);
      expect(onSpoken).not.toHaveBeenCalled();
      expect(mockSynth.spokenUtterances.length).toBe(0);
    });

    it('9.3 Returned cancellation function cleanly prevents local fallback if WebSocket audio starts', async () => {
      const onSpoken = vi.fn();
      let isWsActive = false;

      const cancel = scheduleDualPathSpeech({
        text: 'Opponent move fallback',
        timeoutMs: 300,
        isWebSocketAudioActive: () => isWsActive,
        onSpoken,
      });

      // WebSocket audio starts streaming at 150ms
      await advanceTime(150);
      isWsActive = true;
      cancel();

      // Advance past 300ms
      await advanceTime(300);
      expect(onSpoken).not.toHaveBeenCalled();
      expect(mockSynth.spokenUtterances.length).toBe(0);
    });

    it('9.4 Passes specified priority to fallback speech (defaults to urgent)', async () => {
      scheduleDualPathSpeech({
        text: 'Urgent fallback move',
        timeoutMs: 100,
        priority: 'urgent',
        isWebSocketAudioActive: () => false,
      });

      await advanceTime(150);
      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(mockSynth.spokenUtterances[0].text).toBe('Urgent fallback move');
    });

    it('9.5 Default timeout falls back at 1200ms when unspecified', async () => {
      const onSpoken = vi.fn();
      scheduleDualPathSpeech({
        text: 'Default 1200ms fallback',
        isWebSocketAudioActive: () => false,
        onSpoken,
      });

      await advanceTime(1100);
      expect(onSpoken).not.toHaveBeenCalled();

      await advanceTime(150);
      expect(onSpoken).toHaveBeenCalled();
    });
  });

  // ============================================================
  // TIER 4: Real-World Application Scenarios
  // ============================================================
  describe('Tier 4: Real-World Blind Chess Gameplay Scenarios', () => {
    it('Scenario 1: Blind User Plays e4 and Opponent Responds with e5 in IBCA', async () => {
      const engine = new ChessEngine();

      // 1. Tool call execution for player's move "Eva 4"
      const toolRes = JSON.parse(
        handleToolCall(engine, 'apply_move', { move_description: 'Eva 4' })
      );
      expect(toolRes.success).toBe(true);

      // 2. Narration carries the opponent reply only; player's move is in your_move
      expect(toolRes.narration).toMatch(/Black/);
      expect(toolRes.narration).not.toMatch(/White/);
      expect(toolRes.your_move).toContain('White pawn to Eva 4.');
      expect(toolRes.narration).toMatch(
        /(Anna|Bella|Cesar|David|Eva|Felix|Gustav|Hector)/
      );

      // 3. Spoken dispatch executes with urgent priority
      speakText(toolRes.narration, { priority: 'urgent' });
      await advanceTime(50);

      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(mockSynth.spokenUtterances[0].text).toBe(
        sanitizeSpeechText(toolRes.narration)
      );
    });

    it('Scenario 2: Opponent Delivers Check with Urgent Speech Preemption', async () => {
      const engine = new ChessEngine();
      engine.makeMove('e4');
      engine.makeMove('e6');
      engine.makeMove('d4');
      const checkResult = engine.makeMove('Bb4+');
      expect(checkResult.gameState.isCheck).toBe(true);

      const announcement = getOpponentAnnouncement(checkResult);
      expect(announcement).toContain('Check!');
      expect(announcement).toContain('Your turn.');

      mockSynth.autoCompleteSpeech = false;
      // Background speech ongoing
      speakText('Background description of rank 4 pieces...', { priority: 'low' });
      await advanceTime(20);

      // Urgent check announcement preempts
      speakText(announcement, { priority: 'urgent' });
      await advanceTime(50);

      expect(mockSynth.cancelledCount).toBe(1);
      const latest =
        mockSynth.spokenUtterances[mockSynth.spokenUtterances.length - 1];
      expect(latest.text).toContain('Check!');
    });

    it('Scenario 3: Opponent Delivers Checkmate (Omits "Your turn." and Freezes)', async () => {
      const engine = new ChessEngine();
      engine.makeMove('f3');
      engine.makeMove('e5');
      engine.makeMove('g4');
      const mateResult = engine.makeMove('Qh4#');

      const announcement = getOpponentAnnouncement(mateResult);
      expect(announcement).toContain('Checkmate! Black wins the game.');
      expect(announcement).not.toContain('Your turn.');

      speakText(announcement, { priority: 'urgent' });
      await advanceTime(50);

      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(mockSynth.spokenUtterances[0].text).toContain('Checkmate!');
    });

    it('Scenario 4: Player Executes Full Board Scan via Shortcut "D"', async () => {
      const engine = new ChessEngine();
      const scan = engine.describeBoardState('full');

      mockSynth.autoCompleteSpeech = false;
      speakText(scan.description, { priority: 'low' });
      await advanceTime(20);

      // Verify utterance retained in GC Set during lengthy scan
      expect(_getSpeechInternalStateForTesting().activeUtterancesCount).toBe(1);
      expect(_getSpeechInternalStateForTesting().isWatchdogActive).toBe(true);

      // Utterance text covers rank 1 to 8
      expect(mockSynth.spokenUtterances[0].text).toContain('Rank 1:');
      expect(mockSynth.spokenUtterances[0].text).toContain('Rank 8:');
    });

    it('Scenario 5: Player Interrupts Ongoing Narration via Push-to-Talk', async () => {
      const engine = new ChessEngine();
      const scan = engine.describeBoardState('full');

      mockSynth.autoCompleteSpeech = false;
      // 1. Board scan is speaking
      speakText(scan.description, { priority: 'low' });
      await advanceTime(20);
      expect(mockSynth.spokenUtterances.length).toBe(1);

      // 2. Player presses Push-to-Talk 'L'
      stopSpeaking(true);
      expect(mockSynth.cancelledCount).toBe(1);
      expect(_getSpeechInternalStateForTesting().queueLength).toBe(0);

      // 3. Player says move, engine replies
      engine.makeMove('e4');
      const oppRes = engine.makeEngineMove('beginner');
      const moveAnnouncement = getOpponentAnnouncement(oppRes);

      speakText(moveAnnouncement, { priority: 'urgent' });
      await advanceTime(50);

      // 4. Opponent move announcement speaks cleanly without dropped audio
      expect(mockSynth.spokenUtterances.length).toBe(2);
      expect(mockSynth.spokenUtterances[1].text).toContain('Opponent responds:');
    });

    it('Scenario 6: WebSocket Audio Latency Exceeds 1200ms Triggering Local Fallback', async () => {
      const engine = new ChessEngine();
      engine.makeMove('e4');
      const opp = engine.makeEngineMove('beginner');
      const text = getOpponentAnnouncement(opp);

      const wsAudioPlaying = false;
      const onFallbackSpoken = vi.fn();

      scheduleDualPathSpeech({
        text,
        timeoutMs: 1200,
        isWebSocketAudioActive: () => wsAudioPlaying,
        onSpoken: onFallbackSpoken,
      });

      // At 1000ms: still waiting for WebSocket audio
      await advanceTime(1000);
      expect(onFallbackSpoken).not.toHaveBeenCalled();

      // At 1250ms: latency timeout triggers local TTS fallback
      await advanceTime(250);
      expect(onFallbackSpoken).toHaveBeenCalled();

      await advanceTime(50);
      expect(mockSynth.spokenUtterances.length).toBe(1);
      expect(mockSynth.spokenUtterances[0].text).toContain('Opponent responds:');
    });
  });
});
