"use client";

import { useState, useEffect } from "react";
import { useVoiceChessCoach } from "@/hooks/useVoiceChessCoach";
import { useA11ySettings } from "@/hooks/useA11ySettings";
import { useA11yFeedback } from "@/hooks/useA11yFeedback";
import { useHotkeys } from "@/hooks/useHotkeys";
import { ListenButton } from "@/components/voice/ListenButton";
import { CaptionBar } from "@/components/voice/CaptionBar";
import { TranscriptLog } from "@/components/voice/TranscriptLog";
import { TextFallbackForm } from "@/components/voice/TextFallbackForm";
import { ChessBoardPanel } from "@/components/board/ChessBoardPanel";
import { SettingsMenu } from "@/components/a11y/SettingsMenu";
import { ShortcutsModal } from "@/components/a11y/ShortcutsModal";
import { IBCAGuideModal } from "@/components/a11y/IBCAGuideModal";
import { GameOverModal } from "@/components/a11y/GameOverModal";
import { AccountPanel } from "@/components/account/AccountPanel";
import { cn } from "@/lib/utils";
import { PanelSplitter } from "@/components/layout/PanelSplitter";
import { announce } from "@/lib/announce";
import { useGamePersistence } from "@/hooks/useGamePersistence";
import { gameOverVerdict } from "@/lib/game-verdict";
import {
  playGameStartSound,
  playVictorySound,
  playDefeatSound,
  playDrawSound,
  resumeAudioContext,
} from "@/lib/sound-effects";

export default function Home() {
  const { settings, toggleHighContrast, toggleBoardVisible, toggleSoundCues, toggleAnnounceCaptions, cycleFontScale, setTheme } =
    useA11ySettings();

  const coach = useVoiceChessCoach({
    onBoardAction: (action) => {
      if (action === "show" && !settings.boardVisible) toggleBoardVisible();
      else if (action === "hide" && settings.boardVisible) toggleBoardVisible();
      // "flip" was declared in the callback's type and then silently dropped
      // here, so the control_board voice tool reported a flip that never
      // happened. See BUGLOG 2026-09-24.
      else if (action === "flip") setBoardFlipped((f) => !f);
    },
    onModeAction: (mode, boardHidden) => {
      setPlayMode(mode);
      // Blindfold hides the board; leaving it re-reveals it. The reveal
      // control itself stays available — revealing ends the attempt.
      if (boardHidden && settings.boardVisible) toggleBoardVisible();
      if (!boardHidden && !settings.boardVisible && mode === "normal") toggleBoardVisible();
    },
    onSettingsAction: (setting) => {
      if (setting === "high_contrast") toggleHighContrast();
      else if (setting === "sound_cues") toggleSoundCues();
      else if (setting === "announce_captions") toggleAnnounceCaptions();
    },
  });

  // BUG 1 fix: track whether the game-over modal was dismissed for this game
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  const [playMode, setPlayMode] = useState<"normal" | "blindfold" | "handsfree">("normal");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardFlipped, setBoardFlipped] = useState(false);

  /** Conversation column width. Read after mount, never during render, so the
   *  server and first client render agree — see BUGLOG 2026-09-16. */
  const [panelWidth, setPanelWidth] = useState(440);
  useEffect(() => {
    let saved = NaN;
    try {
      saved = Number(window.localStorage.getItem("vcm_panel_width"));
    } catch {
      /* private mode — the default is fine */
    }
    if (!Number.isFinite(saved) || saved < 320 || saved > 760) return;
    // Same deliberate second render pass as useA11ySettings: reading storage
    // during the first (server-matching) render would be a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanelWidth(saved);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("vcm_panel_width", String(panelWidth));
    } catch {
      /* ignore */
    }
  }, [panelWidth]);

  /** A game is underway once a move exists. Drives the header collapse. */
  const inPlay = coach.moveHistory.length > 0;
  // Reset dismissal when a new game starts (isGameOver goes false).
  // Adjusted during render rather than in an effect: an effect would commit a
  // first paint still showing the stale dismissal, then immediately re-render.
  // This is React's documented "adjust state when a prop changes" pattern.
  const [prevGameOver, setPrevGameOver] = useState(coach.isGameOver);
  if (prevGameOver !== coach.isGameOver) {
    setPrevGameOver(coach.isGameOver);
    if (!coach.isGameOver) setGameOverDismissed(false);
  }

  // Play game-start sound on first interaction (satisfies browser autoplay policy)
  useEffect(() => {
    const onFirstInteraction = () => {
      resumeAudioContext();
      playGameStartSound();
      window.removeEventListener("click", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
    window.addEventListener("click", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });
    return () => {
      window.removeEventListener("click", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, []);

  // --- Persistence -------------------------------------------------------
  // The verdict the rating is written from is the same one the sound uses, so
  // a game can never be saved as a win and announced as a loss.
  const persistedOutcome = (() => {
    if (!coach.isGameOver) return null;
    const { isCheckmate, isDraw, isStalemate, turn } = coach.snapshot ?? {};
    const verdict = gameOverVerdict({
      isGameOver: true, isCheckmate, isDraw, isStalemate, turn, playerColor: "w",
    });
    if (verdict === "victory") return "win" as const;
    if (verdict === "defeat") return "loss" as const;
    if (verdict === "draw") return "draw" as const;
    return null;
  })();

  const persistence = useGamePersistence({
    snapshot: { pgn: coach.snapshot?.pgn ?? "", isGameOver: coach.isGameOver },
    difficulty: coach.difficulty,
    timeControl: coach.clock?.mode ?? "casual",
    outcome: persistedOutcome,
    onResume: (resume) => {
      // A PGN that will not load leaves the fresh board in place rather than
      // showing a half-restored position.
      coach.resumeFromPgn(resume.pgn, resume.difficulty);
    },
  });

  // Contract case 12: peeking is allowed, pretending you did not is not. If the
  // board becomes visible while blindfold is on, the attempt ends and says so,
  // rather than the control being silently disabled.
  const [prevBoardVisible, setPrevBoardVisible] = useState(settings.boardVisible);
  if (prevBoardVisible !== settings.boardVisible) {
    setPrevBoardVisible(settings.boardVisible);
    if (settings.boardVisible && playMode === "blindfold") {
      setPlayMode("normal");
      announce(
        "You revealed the board, so this blindfold attempt is unranked. The game continues.",
        "polite",
      );
    }
  }

  // Play win/loss/draw sound when game ends (only once per game)
  const gameOverSoundPlayedRef = useState(false);
  useEffect(() => {
    if (!coach.isGameOver || gameOverDismissed) return;
    if (gameOverSoundPlayedRef[0]) return;
    gameOverSoundPlayedRef[1](true);
    const { isCheckmate, isDraw, isStalemate, turn } = coach.snapshot ?? {};
    // Single source of truth for who won — see lib/game-verdict.ts. Returns
    // null when the outcome is not determinable, in which case we stay silent
    // rather than announce a guess.
    const verdict = gameOverVerdict({
      isGameOver: true,
      isCheckmate,
      isDraw,
      isStalemate,
      turn,
      playerColor: "w",
    });
    if (verdict === "victory") setTimeout(() => playVictorySound(), 200);
    else if (verdict === "defeat") setTimeout(() => playDefeatSound(), 200);
    else if (verdict === "draw") setTimeout(() => playDrawSound(), 200);
  }, [coach.isGameOver, coach.snapshot, gameOverDismissed, gameOverSoundPlayedRef]);

  // Reset sound-played flag on new game
  useEffect(() => {
    if (!coach.isGameOver) gameOverSoundPlayedRef[1](false);
  }, [coach.isGameOver, gameOverSoundPlayedRef]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [ibcaOpen, setIbcaOpen] = useState(false);
  const [isHoldingJ, setIsHoldingJ] = useState(false);

  useA11yFeedback(coach.status, coach.caption, {
    soundCues: settings.soundCues,
    announceCaptions: settings.announceCaptions,
  });

  useHotkeys(
    {
      j: {
        onDown: () => {
          setIsHoldingJ(true);
          coach.startListening();
        },
        onUp: () => {
          setIsHoldingJ(false);
          coach.stopListening();
        },
      },
      escape: () => {
        setIsHoldingJ(false);
        coach.cancelListening();
      },
      r: () => coach.repeatLast(),
      // H, F, I and 1-4 were advertised in the shortcuts modal and bound
      // nowhere — the comment below even described 1-4 as difficulty keys
      // above code that bound only 5-9. keyboard-contract.test.ts now fails
      // if the advertised set and the bound set drift apart again.
      h: () => coach.getHint(),
      f: () => coach.flipBoard(),
      i: () => setIbcaOpen((v) => !v),
      "1": () => coach.setDifficulty("beginner"),
      "2": () => coach.setDifficulty("intermediate"),
      "3": () => coach.setDifficulty("advanced"),
      "4": () => coach.setDifficulty("master"),
      d: () => coach.describeBoard("full"),
      t: () => coach.describeBoard("threats"),
      g: () => coach.describeBoard("tactical"),
      w: () => coach.explainLastMove(),
      // K for clock. Reads both clocks aloud and says whose move it is —
      // the one piece of game state that changes without anything happening
      // on the board, so it is the one you cannot infer from the last move.
      k: () => coach.announceTime(),
      u: () => coach.undoMove(),
      b: () => toggleBoardVisible(),
      c: () => toggleHighContrast(),
      // S opens the settings menu, which now holds difficulty, time control,
      // play mode and themes. The menu traps focus and returns it on Escape,
      // so this is a complete keyboard route to every setting.
      s: () => setSettingsOpen((v) => !v),
      // Time control, which lost its always-visible pills. Shift is not
      // required: 1-4 are difficulty, 5-9 are the clock.
      "5": () => coach.clock?.setTimeControl("casual"),
      "6": () => coach.clock?.setTimeControl("bullet_1_0"),
      "7": () => coach.clock?.setTimeControl("blitz_3_0"),
      "8": () => coach.clock?.setTimeControl("blitz_5_0"),
      "9": () => coach.clock?.setTimeControl("rapid_10_0"),
      "?": () => setShortcutsOpen((v) => !v),
      "+": () => cycleFontScale(1),
      "=": () => cycleFontScale(1),
      "-": () => cycleFontScale(-1),
    },
    !shortcutsOpen && !ibcaOpen,
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <a href="#main-content" className="skip-link">
        Skip to voice controls
      </a>

      {/* ── Header: full before the first move, compact once play starts ──
          Before a game it is orientation — the name, the one instruction that
          matters, every setting. Once a move has been played it is overhead
          competing with the board, so it collapses to a single row and hands
          the height back. Settings stay one click away rather than always
          on screen. */}
      <header
        className={cn(
          "flex-shrink-0 border-b border-border px-4 backdrop-blur-md bg-bg/80 z-30 transition-[padding] duration-300",
          inPlay ? "py-1.5" : "py-2.5",
        )}
      >
        <div className="mx-auto flex max-w-screen-2xl items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <h1
              className={cn(
                "font-display font-semibold tracking-tight whitespace-nowrap transition-[font-size] duration-300",
                inPlay ? "text-base" : "text-lg",
              )}
            >
              ♔ VoiceChessmate
            </h1>
            {!inPlay && (
              <p className="hidden sm:block text-xs text-fg-muted whitespace-nowrap">Hold J to speak</p>
            )}
          </div>

          {/* Everything that used to live across the header and above the
              board is in one menu now. Nothing here is needed mid-move, and
              every option keeps its single-key shortcut. */}
          <div className="flex-1" />

          <div className="flex items-center gap-2 shrink-0">
            <SettingsMenu
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              settings={settings}
              onToggleHighContrast={toggleHighContrast}
              onToggleSoundCues={toggleSoundCues}
              onToggleAnnounceCaptions={toggleAnnounceCaptions}
              onCycleFontScale={cycleFontScale}
              onSetTheme={setTheme}
              onOpenIBCAGuide={() => {
                setSettingsOpen(false);
                setIbcaOpen(true);
              }}
              difficulty={coach.difficulty}
              onSelectDifficulty={coach.setDifficulty}
              timeControl={coach.clock?.mode}
              onSelectTimeControl={(mode) => coach.clock?.setTimeControl(mode)}
              playMode={playMode}
              onSelectPlayMode={(mode) => coach.changePlayMode(mode)}
              onOpenShortcuts={() => setShortcutsOpen(true)}
            />
            {playMode !== "normal" && (
              <span
                role="status"
                className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent whitespace-nowrap"
              >
                {playMode === "blindfold" ? "Blindfold" : "Hands-free"}
              </span>
            )}
            <AccountPanel />
            <button
              type="button"
              onClick={() => {
                persistence.startNewGame();
                coach.resetGame();
              }}
              className="rounded-full border border-border bg-bg-raised px-3 py-1 text-xs font-semibold text-fg-muted hover:border-accent hover:text-accent transition-colors active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
            >
              New Game
            </button>
          </div>
        </div>
      </header>

      {/*
        Left: scrollable panel for voice controls + transcript
        Right: fixed, non-scrollable — board sized to perfectly fill remaining height
      */}
      <main
        id="main-content"
        className="flex-1 overflow-y-auto lg:overflow-hidden mx-auto w-full max-w-screen-2xl flex flex-col lg:flex-row min-h-0"
      >
        {/* ── Left: controls pinned, transcript scrolls ──
            The column itself no longer scrolls. Everything above the
            transcript is shrink-0 and stays put, so the microphone button is
            always reachable without hunting for it — which matters most for
            the people least able to hunt. The transcript owns the only
            scrollbar in this column. */}
        <div
          className="flex flex-col gap-3 px-3 pt-3 pb-3 lg:px-4 lg:pt-4 lg:pb-4 w-full shrink-0 lg:overflow-hidden min-h-0 h-full max-h-full"
          style={{ ["--panel-w" as string]: `${panelWidth}px` }}
          data-panel
        >
          {!coach.isVoiceSupported && (
            <p role="alert" className="panel w-full border-danger p-3 text-sm flex-shrink-0">
              Voice input isn&apos;t available in this browser. Use the text box below.
            </p>
          )}

          <div className="shrink-0 flex flex-col gap-3">
          <ListenButton
            status={coach.status}
            isHolding={isHoldingJ}
            onPress={coach.pressTalk}
            onStartHold={() => {
              setIsHoldingJ(true);
              coach.startListening();
            }}
            onEndHold={() => {
              setIsHoldingJ(false);
              coach.stopListening();
            }}
            onCancel={coach.cancelListening}
            onRepeat={coach.repeatLast}
            voiceError={coach.voiceError}
          />
          <CaptionBar
            caption={coach.caption}
            partialText={coach.partialText}
            status={coach.status}
            onRepeat={coach.repeatLast}
          />
          {/* Emphasised whenever typing is the only way through — the browser
              never supported voice, or this session's attempt failed. */}
          <TextFallbackForm
            onSubmit={coach.submitTextFallback}
            emphasized={!coach.isVoiceSupported || coach.voiceError !== null}
          />
          </div>
          <TranscriptLog entries={coach.entries} />
        </div>

        <PanelSplitter width={panelWidth} onWidthChange={setPanelWidth} />

        {/* ── Right: fixed height, no scroll — board fits perfectly ── */}
        <div className="flex-1 overflow-hidden flex flex-col items-center justify-center p-1.5 sm:p-2 min-h-0 h-full">
          {/* This wrapper constrains the board to the available column height */}
          {/* Wide enough for rail + board + rail (184 + 12 + 640 + 12 + 184). The
              old 860px cap was narrower than its own contents. */}
          <div className="w-full h-full flex flex-col items-center justify-center max-w-[1040px] xl:max-w-[1120px] min-h-0">
            <ChessBoardPanel
              fen={coach.fen}
              moveHistory={coach.moveHistory}
              onManualMove={coach.attemptManualMove}
              visible={settings.boardVisible}
              onToggleVisible={toggleBoardVisible}
              isOpponentThinking={coach.status === "thinking"}
              isGameOver={coach.isGameOver}
              clock={coach.clock}
              difficulty={coach.difficulty}
              flipped={boardFlipped}
              onFlippedChange={setBoardFlipped}
            />
          </div>
          <p className="flex-shrink-0 mt-1 text-[11px] text-fg-muted text-center">
            Press <span className="font-mono">?</span> for keyboard shortcuts
          </p>
        </div>
      </main>

      {/* Game over modal */}
      {coach.isGameOver && !gameOverDismissed && (
        <GameOverModal
          isGameOver={coach.isGameOver}
          isCheckmate={coach.snapshot?.isCheckmate ?? false}
          isDraw={coach.snapshot?.isDraw ?? false}
          isStalemate={coach.snapshot?.isStalemate ?? false}
          turn={coach.turn}
          moveNumber={Math.floor(coach.moveHistory.length / 2) + 1}
          pgn={coach.snapshot?.pgn ?? ""}
          onNewGame={() => {
            setGameOverDismissed(false);
            coach.resetGame();
          }}
          onClose={() => setGameOverDismissed(true)}
        />
      )}

      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      {/* The phonetic guide has existed, finished, since early on: pronunciation,
          history, worked examples. Nothing imported it, and all three advertised
          routes to it (the I key, the Settings item, the shortcuts list) were
          dead. `onTryCommand` runs the example through the same text path the
          fallback box uses, so "try saying Eva 4" actually plays the move. */}
      {ibcaOpen && (
        <IBCAGuideModal
          onClose={() => setIbcaOpen(false)}
          onTryCommand={(cmd) => {
            setIbcaOpen(false);
            coach.submitTextFallback(cmd);
          }}
        />
      )}
    </div>
  );
}
