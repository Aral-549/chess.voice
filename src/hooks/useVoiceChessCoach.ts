"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Support never changes after load, so the store never notifies. */
const NO_SUBSCRIBE = () => () => {};
import { Chess } from "chess.js";
import { AssemblyAIVoiceEngine } from "@/lib/assemblyai-voice-engine";
import { announce } from "@/lib/announce";
import { ChessEngine } from "@/lib/chess-engine";
import { handleToolCall, CHESS_TOOLS, setEngineDifficulty } from "@/lib/tool-handlers";
import { SYSTEM_PROMPT, GREETING, CHESS_KEYTERMS } from "@/lib/system-prompt";
import {
  playMoveEarcon,
  playGameStartSound,
  playCastleSound,
  playPromotionSound,
  resumeAudioContext,
} from "@/lib/sound-effects";
import { useChessClock, type TimeControlMode } from "@/hooks/useChessClock";
import type { Difficulty } from "@/types";

export type TranscriptEntry = {
  id: string;
  speaker: "you" | "coach" | "system";
  text: string;
  timestamp: number;
};

export type CoachStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking";

type GameSnapshot = {
  fen: string;
  history: string[];
  turn: "w" | "b";
  isGameOver: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  pgn: string;
};

export interface VoiceChessCoachOptions {
  speechRate?: number;
  onBoardAction?: (action: "flip" | "show" | "hide") => void;
  onSettingsAction?: (setting: "high_contrast" | "sound_cues" | "announce_captions", enable?: boolean) => void;
}

let idCounter = 0;
const nextId = () => `entry-${++idCounter}-${Date.now()}`;

function snapshotOf(game: Chess): GameSnapshot {
  return {
    fen: game.fen(),
    history: game.history(),
    turn: game.turn(),
    isGameOver: game.isGameOver(),
    isCheckmate: game.isCheckmate(),
    isDraw: game.isDraw(),
    isStalemate: game.isStalemate(),
    pgn: game.pgn(),
  };
}

export function useVoiceChessCoach(options?: VoiceChessCoachOptions) {
  const clock = useChessClock("blitz_5_0");
  const [difficulty, setDifficultyState] = useState<Difficulty>("intermediate");
  const difficultyRef = useRef<Difficulty>("intermediate");
  // Stable, mutable singletons — created once via useState's lazy
  // initializer (not useRef: reading a ref's .current during render, or
  // passing a ref-derived value in a dependency array, isn't allowed under
  // React's purity rules; useState's initial value is exempt precisely
  // because it's only ever evaluated once).
  // The real chess brain: minimax + piece-square tables, IBCA narration,
  // premoves and the move-confidence gate. `game` stays as the chess.js view
  // the UI already reads from, kept in step with the engine after every move.
  const [coach] = useState(() => new ChessEngine());
  const [game] = useState(() => new Chess());

  const [engine] = useState<AssemblyAIVoiceEngine>(
    () =>
      new AssemblyAIVoiceEngine({
        sessionConfig: {
          system_prompt: SYSTEM_PROMPT,
          greeting: GREETING,
          input: {
            format: { encoding: "audio/pcm" },
            keyterms: CHESS_KEYTERMS.slice(0, 100),
            turn_detection: {
              vad_threshold: 0.45,
              min_silence: 200,
              max_silence: 1200,
              interrupt_response: true,
            },
          },
          output: { voice: "anna", format: { encoding: "audio/pcm" } },
          tools: CHESS_TOOLS,
        },
      }),
  );

  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => snapshotOf(game));
  const [entries, setEntries] = useState<TranscriptEntry[]>(() => [
    {
      id: nextId(),
      speaker: "system",
      text: "Press J to speak your move. Say something like \"knight to f3\" or \"e4.\"",
      timestamp: Date.now(),
    },
  ]);
  const [status, setStatus] = useState<CoachStatus>("idle");
  const [partialText, setPartialText] = useState("");
  const [caption, setCaption] = useState("");
  const [speechRate, setSpeechRate] = useState(1);
  const lastCoachMessageRef = useRef<string>("");

  // `engine.isSupported` reads window/navigator, so it is false during SSR and
  // true in the browser — rendering it directly made the server emit a "voice
  // unavailable" alert the client didn't, i.e. a hydration mismatch.
  // useSyncExternalStore is the hydration-safe way to read a client-only value:
  // the third argument is the server snapshot.
  const isVoiceSupported = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => engine.isSupported,
    () => true,
  );

  // `coach` is authoritative; `game` is a read-only mirror the UI already
  // knows how to render. loadPgn keeps history correct across undo too.
  const syncSnapshot = useCallback(() => {
    const st = coach.getGameState();
    try {
      game.loadPgn(st.pgn);
    } catch {
      /* empty pgn at game start */
    }
    setSnapshot(snapshotOf(game));
  }, [coach, game]);

  /** Sound the last move — chess.com-style audio for each event type. */
  const soundLastMove = useCallback(() => {
    const st = coach.getGameState();
    const m = st.lastMove;
    if (!m) return;

    // Castle: two-clunk sound instead of standard earcon
    if (m.san === 'O-O' || m.san === 'O-O-O') {
      playCastleSound();
      return;
    }

    // Promotion: shimmer chime
    if (m.san?.includes('=') || m.flags?.includes('p')) {
      playPromotionSound();
      // Also play the spatial earcon so blind players hear destination
      playMoveEarcon({ from: m.from, to: m.to, piece: m.piece, san: m.san });
      return;
    }

    // Play spatial earcon (handles check/checkmate alerts internally)
    playMoveEarcon({
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured,
      san: m.san,
      isCheck: st.isCheck,
      isCheckmate: st.isCheckmate,
    });

    // Game-over sounds are deliberately NOT played here. `soundLastMove` fires
    // for every move and has no way to tell who won, so this branch used to
    // play victory on every checkmate — including ones the player lost. The
    // verdict belongs to whoever knows it: `app/page.tsx` reads `turn` after
    // the mating move and plays victory/defeat/draw exactly once per game.
    // See BUGLOG 2026-09-22 "Defeat announced as victory".
  }, [coach]);

  const addEntry = useCallback((speaker: TranscriptEntry["speaker"], text: string) => {
    setEntries((prev) => [...prev, { id: nextId(), speaker, text, timestamp: Date.now() }]);
  }, []);

  const speak = useCallback(
    (text: string, opts?: { isCoach?: boolean }) => {
      if (opts?.isCoach !== false) {
        // Do NOT set lastCoachMessageRef here — tool narration (e.g. "Black knight to
        // Felix 6") is just a short SAN string.  lastCoachMessageRef is only updated
        // in agent-speaking-end with the full streamed coach response, so the R key
        // always replays what the coach actually said, not the move notation.
        addEntry("coach", text);
      }
      setStatus("speaking");
      engine.speak(text, { rate: speechRate });
    },
    [engine, speechRate, addEntry],
  );

  const setDifficulty = useCallback(
    (newDiff: Difficulty) => {
      setDifficultyState(newDiff);
      difficultyRef.current = newDiff;
      coach.setDifficulty(newDiff);
      setEngineDifficulty(newDiff);
      announce(`Bot mastery level set to ${newDiff}.`);
    },
    [coach],
  );

  const resetGame = useCallback(() => {
    coach.reset();
    game.reset();
    clock.resetClock();
    syncSnapshot();
    setEntries([{ id: nextId(), speaker: "system", text: "New game. Press J to speak your move.", timestamp: Date.now() }]);
    // Chess.com-style game-start chime
    resumeAudioContext();
    setTimeout(() => playGameStartSound(), 100);
  }, [coach, game, clock, syncSnapshot]);

  /**
   * Restore a previously saved game.
   *
   * Mirrors resetGame, but seeds both the authoritative engine and the UI
   * mirror from PGN instead of clearing them. Returns false if the PGN will
   * not load, so the caller can fall back to a fresh board rather than showing
   * a half-restored position.
   *
   * See contracts/game-persistence.md case 3.
   */
  const resumeFromPgn = useCallback(
    (pgn: string, resumedDifficulty?: Difficulty) => {
      if (!coach.loadPgn(pgn)) return false;

      try {
        game.loadPgn(pgn);
      } catch {
        return false;
      }

      if (resumedDifficulty) {
        coach.setDifficulty(resumedDifficulty);
        setEngineDifficulty(resumedDifficulty);
        setDifficulty(resumedDifficulty);
      }

      clock.resetClock();
      syncSnapshot();
      setEntries([
        {
          id: nextId(),
          speaker: "system",
          text: "Resumed your saved game. Press J to speak your move.",
          timestamp: Date.now(),
        },
      ]);
      return true;
    },
    [coach, game, clock, syncSnapshot, setDifficulty],
  );

  const dispatchToolSideEffects = useCallback(
    (parsed: Record<string, unknown>, toolName: string) => {
      // 1. Timer / Blitz actions
      if (parsed.timerAction) {
        const act = parsed.timerAction as string;
        if (act === "set" && parsed.mode) {
          clock.setTimeControl(
            parsed.mode as TimeControlMode,
            typeof parsed.minutes === "number" ? parsed.minutes : undefined,
            typeof parsed.increment === "number" ? parsed.increment : undefined,
          );
        } else if (act === "adjust" && typeof parsed.seconds === "number") {
          clock.adjustTime(parsed.seconds, (parsed.color as "w" | "b") || "w");
        } else if (act === "pause") {
          clock.pauseClock();
        } else if (act === "resume") {
          clock.resumeClock();
        } else if (act === "reset") {
          clock.resetClock();
        } else if (act === "disable") {
          clock.setTimeControl("casual");
        } else if (act === "status") {
          const msg =
            clock.mode === "casual"
              ? "Casual mode is active. No chess clock is running."
              : `You have ${clock.whiteFormatted} remaining. Opponent has ${clock.blackFormatted}.`;
          speak(msg);
        }
      }

      // 2. Bot difficulty
      if (parsed.difficulty) {
        const d = parsed.difficulty as Difficulty;
        setDifficultyState(d);
        difficultyRef.current = d;
        coach.setDifficulty(d);
        setEngineDifficulty(d);
      }

      // 3. Board actions
      if (parsed.boardAction && options?.onBoardAction) {
        options.onBoardAction(parsed.boardAction as "flip" | "show" | "hide");
      }

      // 4. Settings actions
      if (parsed.settingsAction && options?.onSettingsAction) {
        options.onSettingsAction(
          parsed.settingsAction as "high_contrast" | "sound_cues" | "announce_captions",
          parsed.enable as boolean | undefined,
        );
      }

      // 5. Reset game
      if (parsed.resetGame) {
        resetGame();
      }

      // 6. Turn switching on successful move
      if (toolName === "apply_move" || toolName === "validate_and_play_move") {
        if (parsed.success) {
          if (coach.getGameState().isGameOver) {
            clock.pauseClock();
          } else {
            clock.switchTurn("w");
          }
        }
      }
    },
    [clock, coach, options, resetGame, speak],
  );

  const playOpponentReply = useCallback(() => {
    if (coach.getGameState().isGameOver) {
      clock.pauseClock();
      return;
    }
    window.setTimeout(() => {
      const reply = coach.makeEngineMove(difficultyRef.current);
      syncSnapshot();
      soundLastMove();
      if (coach.getGameState().isGameOver) {
        clock.pauseClock();
      } else {
        clock.switchTurn("w");
      }
      if (reply.success) speak(reply.narration);
    }, 350);
  }, [coach, speak, syncSnapshot, soundLastMove, clock]);

  /** Every non-agent move path goes through here: typed fallback, board
   *  clicks, and hotkeys. Writing to `game` would be discarded — it's a
   *  read-only mirror of `coach`, which is the authoritative board. */
  const runTool = useCallback(
    (name: string, args: Record<string, unknown> = {}) => {
      setStatus("thinking");
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(handleToolCall(coach, name, args, undefined, difficultyRef.current));
      } catch {
        parsed = {};
      }
      syncSnapshot();

      if (name === "apply_move" && parsed.success) soundLastMove();

      dispatchToolSideEffects(parsed, name);

      const spoken =
        (parsed.narration as string) ??
        (parsed.description as string) ??
        (parsed.explanation as string) ??
        "";
      if (spoken) {
        speak(spoken);
        // The agent isn't in the loop for these, so nothing else would reach a
        // screen reader — announce explicitly.
        announce(spoken);
      }
      setStatus("idle");
      return parsed;
    },
    [coach, syncSnapshot, soundLastMove, dispatchToolSideEffects, speak],
  );

  // The agent invokes apply_move / describe_board / etc. itself. This runs the
  // real handler (fuzzy match + confidence gate + premoves + minimax reply) and
  // returns JSON for the agent to speak.
  useEffect(() => {
    engine.setToolCallHandler((name, args) => {
      const result = handleToolCall(coach, name, args, undefined, difficultyRef.current);
      syncSnapshot();
      try {
        const parsed = JSON.parse(result);
        if (name === "apply_move" || name === "validate_and_play_move") {
          if (parsed.success) soundLastMove();
        }
        dispatchToolSideEffects(parsed, name);
        const spoken = parsed.narration ?? parsed.description ?? parsed.explanation;
        if (spoken) {
          lastCoachMessageRef.current = spoken;
          addEntry("coach", spoken);
          setCaption(spoken);
        }
      } catch {
        /* non-JSON tool result */
      }
      return result;
    });
  }, [engine, coach, syncSnapshot, soundLastMove, addEntry, dispatchToolSideEffects]);

  useEffect(() => {
    // Accumulates streaming tokens — we only commit to the transcript once
    // speaking ends, not once per word/token.
    const streamingTextRef = { current: "" };

    const unsubscribers = [
      engine.on("connecting", () => setStatus("connecting")),
      engine.on("connect-failed", () => setStatus("idle")),
      engine.on("listening-start", () => {
        setStatus("listening");
        setPartialText("");
      }),
      engine.on("listening-stop", () => {
        setStatus((s) => (s === "listening" ? "idle" : s));
      }),
      engine.on("partial-transcript", ({ text }) => setPartialText(text)),
      engine.on("final-transcript", ({ text }) => {
        setPartialText("");
        if (!text) return;
        addEntry("you", text);
        announce(`You said: ${text}`);
        setStatus("thinking");
      }),
      engine.on("agent-speaking-start", () => {
        streamingTextRef.current = "";
        setStatus("speaking");
      }),
      engine.on("agent-speaking-text", ({ text }) => {
        if (!text) return;
        // Update the live caption so it streams visually in real-time
        setCaption(text);
        // Accumulate into ref — do NOT call addEntry here (causes word-per-line spam)
        streamingTextRef.current = text;
        // Keep lastCoachMessageRef current so R key always replays latest
        lastCoachMessageRef.current = text;
      }),
      engine.on("agent-speaking-end", () => {
        setStatus((s) => (s === "speaking" ? "idle" : s));
        // Commit exactly ONE transcript entry for the whole utterance
        const finalText = streamingTextRef.current;
        if (finalText) {
          // Only add if it's not a duplicate of what the tool handler already logged
          // (tool handlers call addEntry("coach", narration) synchronously before speak())
          setEntries((prev) => {
            const last = prev[prev.length - 1];
            if (last?.speaker === "coach" && last.text === finalText) return prev;
            return [...prev, { id: nextId(), speaker: "coach" as const, text: finalText, timestamp: Date.now() }];
          });
        }
        streamingTextRef.current = "";
      }),
      engine.on("error", ({ message }) => {
        const text = `Voice error: ${message}. Use the text box to play instead.`;
        addEntry("system", text);
        announce(text);
        setStatus("idle");
      }),
    ];
    return () => unsubscribers.forEach((unsub) => unsub());
  }, [engine, addEntry]);

  // Self-healing watchdog: never leave status permanently locked in connecting, thinking, or speaking
  useEffect(() => {
    if (status === "connecting") {
      const timer = setTimeout(() => {
        console.warn("[VoiceCoach] Connecting timeout exceeded; reverting to idle");
        setStatus("idle");
      }, 7000);
      return () => clearTimeout(timer);
    }
    if (status === "thinking") {
      const timer = setTimeout(() => {
        console.warn("[VoiceCoach] Thinking timeout exceeded; reverting to idle");
        setStatus("idle");
      }, 10000);
      return () => clearTimeout(timer);
    }
    if (status === "speaking") {
      // 30s ceiling: if the agent truly speaks this long the user can press J to interrupt.
      // This catches the "stuck speaking" bug where reply.done never arrived or audio failed.
      const timer = setTimeout(() => {
        console.warn("[VoiceCoach] Speaking timeout exceeded (30s); reverting to idle");
        engine.stopSpeaking();
        setStatus("idle");
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [status, engine]);

  const pressTalk = useCallback(() => {
    if (status === "speaking") {
      engine.stopSpeaking();
      setStatus("idle");
      return;
    }
    if (status === "listening") {
      engine.stop();
      setStatus("idle");
      return;
    }
    if (status === "connecting" || status === "thinking") {
      engine.cancel();
      setStatus("idle");
      return;
    }
    engine.start();
  }, [engine, status]);

  const startListening = useCallback(() => {
    if (status === "speaking") {
      engine.stopSpeaking();
    }
    if (status !== "listening" && status !== "connecting") {
      engine.start();
    }
  }, [engine, status]);

  const stopListening = useCallback(() => {
    if (status === "listening" || status === "connecting") {
      engine.stop();
    }
  }, [engine, status]);

  const cancelListening = useCallback(() => {
    engine.cancel();
    setStatus("idle");
  }, [engine]);

  const repeatLast = useCallback(() => {
    if (!lastCoachMessageRef.current) return;
    setStatus("speaking");
    engine.speak(lastCoachMessageRef.current, { rate: speechRate });
  }, [engine, speechRate]);

  const submitTextFallback = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      addEntry("you", text);
      runTool("apply_move", { move_description: text });
    },
    [addEntry, runTool],
  );

  /** Lets the (optional) visual board accept a click/drag move directly. */
  const attemptManualMove = useCallback(
    (from: string, to: string) => {
      const res = coach.makeMove(`${from}${to}`);
      if (!res.success) return false;
      syncSnapshot();
      soundLastMove();
      addEntry("you", res.narration);
      clock.switchTurn("b");
      playOpponentReply();
      return true;
    },
    [coach, syncSnapshot, soundLastMove, addEntry, clock, playOpponentReply],
  );

  /** Spoken board readouts. The old UI had these on D/T/O/C; the new one lost
   *  them, but they're the core of playing without sight. */
  const describeBoard = useCallback(
    (focus: "full" | "tactical" | "threats" | "my_pieces" | "captures" = "full") => {
      const clip = { full: "describe", threats: "threats", tactical: "tactical", my_pieces: "pieces", captures: "captures" }[focus];
      // Live session: let the agent hear the command and answer aloud — that is
      // the only path that produces actual speech on Path A.
      if (engine.isLive) {
        setStatus("thinking");
        engine.sendCommandAudio(`/cmd/${clip}.wav`).then((sent) => {
          if (!sent) runTool("describe_board", { focus });
        });
        return;
      }
      runTool("describe_board", { focus });
    },
    [engine, runTool],
  );

  const undoMove = useCallback(() => runTool("undo_move"), [runTool]);

  return {
    isVoiceSupported,
    fen: snapshot.fen,
    moveHistory: snapshot.history,
    turn: snapshot.turn,
    isGameOver: snapshot.isGameOver,
    snapshot,
    status,
    partialText,
    caption,
    entries,
    speechRate,
    setSpeechRate,
    pressTalk,
    startListening,
    stopListening,
    cancelListening,
    repeatLast,
    submitTextFallback,
    attemptManualMove,
    resumeFromPgn,
    describeBoard,
    undoMove,
    resetGame,
    difficulty,
    setDifficulty,
    clock,
  };
}

