"use client";

import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

import type { TimeControlMode } from "@/hooks/useChessClock";
import type { Difficulty } from "@/types";

export interface ChessClockState {
  mode: TimeControlMode;
  whiteFormatted: string;
  blackFormatted: string;
  isRunning: boolean;
  activeColor: "w" | "b" | null;
  flagFell: "w" | "b" | null;
  isLowTimeWhite: boolean;
  isLowTimeBlack: boolean;
  isUrgentWhite: boolean;
  isUrgentBlack: boolean;
  setTimeControl: (mode: TimeControlMode) => void;
  pauseClock: () => void;
  resumeClock: () => void;
}

interface ChessBoardPanelProps {
  fen: string;
  moveHistory: string[];
  onManualMove: (from: string, to: string) => boolean;
  visible: boolean;
  onToggleVisible: () => void;
  isOpponentThinking?: boolean;
  isGameOver?: boolean;
  clock?: ChessClockState;
  difficulty?: Difficulty;
  onSelectDifficulty?: (d: Difficulty) => void;
}

/**
 * Chessboard panel.
 *
 * The board is sized to take every pixel the column can spare — it is the
 * thing sighted players actually look at, and it was previously capped small
 * to leave room for window chrome that has since been removed.
 *
 * Features:
 * - Dual chess clocks (White & Black) with low-time and urgent warnings
 * - Time-control and difficulty selectors
 * - Opponent and player bars with live turn indicators
 * - Collapsible with hotkey (B); hidden and locked in blindfold mode
 */
export function ChessBoardPanel({
  fen,
  moveHistory,
  onManualMove,
  visible,
  onToggleVisible,
  isOpponentThinking = false,
  isGameOver = false,
  clock,
  difficulty = "intermediate",
  onSelectDifficulty,
}: ChessBoardPanelProps) {
  const [flipped, setFlipped] = useState(false);

  // Derive turn from FEN
  const isWhiteTurn = useMemo(() => {
    const parts = fen.split(" ");
    return parts.length > 1 ? parts[1] === "w" : true;
  }, [fen]);

  const lastMoveSquares = useMemo(() => {
    if (moveHistory.length === 0) return {};
    try {
      const replay = new Chess();
      let lastFrom: string | null = null;
      let lastTo: string | null = null;
      for (const san of moveHistory) {
        const m = replay.move(san);
        lastFrom = m.from;
        lastTo = m.to;
      }
      return {
        ...(lastFrom ? { [lastFrom]: { backgroundColor: "rgba(56, 189, 248, 0.25)" } } : {}),
        ...(lastTo ? { [lastTo]: { backgroundColor: "rgba(56, 189, 248, 0.45)" } } : {}),
      };
    } catch {
      return {};
    }
  }, [moveHistory]);

  return (
    <section
      aria-label="Interactive visual chessboard"
      className={cn(
        "w-full max-h-full flex flex-col justify-center rounded-xl border border-border/60 bg-bg-raised/60 p-2 sm:p-2.5 transition-all duration-300 select-none",
      )}
    >
      <div className="mb-1.5 sm:mb-2 flex items-center justify-between gap-2 border-b border-border/50 pb-1.5 shrink-0">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-base font-semibold tracking-tight text-fg truncate">
              Visual Chessboard
            </h2>
            <p className="text-[10px] sm:text-[11px] text-fg-muted truncate">
              {isWhiteTurn ? "White to play" : "Black to play"} • Move {Math.floor(moveHistory.length / 2) + 1}
            </p>
          </div>
        </div>

        {/* Board actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {visible && (
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              title="Flip board perspective"
              className="rounded-full border border-border/80 bg-bg/60 px-2 sm:px-2.5 py-0.5 text-[11px] font-medium text-fg-muted backdrop-blur-md transition-all hover:border-accent hover:text-accent cursor-pointer active:scale-95"
            >
              Flip ⇅
            </button>
          )}

          <button
            type="button"
            onClick={onToggleVisible}
            aria-expanded={visible}
            className="flex items-center gap-1 rounded-full border border-border/80 bg-bg/80 px-2 sm:px-3 py-0.5 text-[11px] font-semibold text-fg backdrop-blur-md transition-all hover:border-accent hover:text-accent cursor-pointer active:scale-95 shadow-xs"
          >
            <span>{visible ? "Hide" : "Show"}</span>
            <kbd className="hidden sm:inline rounded bg-bg-raised px-1 py-0.2 font-mono text-[9px] text-fg-muted">B</kbd>
          </button>
        </div>
      </div>

      {visible ? (
        <div className="flex flex-col items-center gap-1.5 sm:gap-2 w-full flex-1 min-h-0 justify-center">
          {/* Apple Mode & Bot Mastery Pill Selectors */}
          <div className="flex flex-wrap items-center justify-between gap-1 w-full max-w-[min(100%,calc(100vh-320px),420px)] xl:max-w-[min(100%,calc(100vh-320px),460px)] shrink-0">
            {/* Blitz / Time Control Modes */}
            <div className="flex items-center gap-1 bg-bg/60 p-1 rounded-full border border-border/60 backdrop-blur-md overflow-x-auto scrollbar-none shadow-xs">
              {(
                [
                  { id: "casual", label: "Casual" },
                  { id: "bullet_1_0", label: "1m" },
                  { id: "blitz_3_0", label: "3m" },
                  { id: "blitz_5_0", label: "5m" },
                  { id: "rapid_10_0", label: "10m" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => clock?.setTimeControl(m.id)}
                  title={`Set timer to ${m.label}`}
                  className={cn(
                    "px-2.5 py-0.5 sm:py-1 rounded-full font-mono text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer",
                    clock?.mode === m.id
                      ? "bg-accent text-bg shadow-xs"
                      : "text-fg-muted hover:text-fg hover:bg-bg-raised/60",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Bot Mastery Levels */}
            <div className="flex items-center gap-1 bg-bg/60 p-1 rounded-full border border-border/60 backdrop-blur-md shadow-xs">
              {(
                [
                  { id: "beginner", label: "Beginner" },
                  { id: "intermediate", label: "Inter" },
                  { id: "advanced", label: "Adv" },
                  { id: "master", label: "Master" },
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectDifficulty?.(d.id)}
                  title={`Bot difficulty: ${d.label}`}
                  className={cn(
                    "px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] transition-all cursor-pointer",
                    difficulty === d.id
                      ? "bg-accent-2/90 text-bg font-semibold shadow-xs"
                      : "text-fg-muted hover:text-fg hover:bg-bg-raised/60",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Flag fell alert banner */}
          {clock?.flagFell && (
            <div
              role="alert"
              className="w-full max-w-[min(100%,480px)] xl:max-w-[520px] rounded-xl border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 text-center text-xs font-semibold text-rose-400 backdrop-blur-md animate-pulse"
            >
              Time Out! {clock.flagFell === "w" ? "White's flag fell — Black wins on time." : "Black's flag fell — White wins on time."}
            </div>
          )}

          {/* Apple-style Top Player Bar (Black / Coach) */}
          <div className="flex w-full max-w-[min(100%,calc(100vh-320px),420px)] xl:max-w-[min(100%,calc(100vh-320px),460px)] items-center justify-between rounded-xl border border-border/60 bg-bg/40 px-2.5 sm:px-3 py-1 sm:py-1.5 backdrop-blur-md shadow-xs gap-2 min-w-0 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-stone-900 border border-stone-700 text-stone-100 shadow-sm text-xs sm:text-sm font-bold">
                ♚
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-fg truncate">
                    Voice Coach
                  </span>
                  <span className="shrink-0 rounded border border-border bg-bg-raised px-1 py-0.2 font-mono text-[9px] text-fg-muted uppercase">
                    {difficulty}
                  </span>
                </div>
                <span className="text-[10px] text-fg-muted block truncate">Black Pieces</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Coach Digital Clock LED */}
              {clock && clock.mode !== "casual" && (
                <div
                  className={cn(
                    "font-mono text-xs px-2 py-0.5 rounded-md border font-bold tracking-wider transition-all",
                    !isWhiteTurn && clock.isRunning
                      ? clock.isUrgentBlack
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/60 animate-pulse"
                        : clock.isLowTimeBlack
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/60"
                        : "bg-accent/15 text-accent border-accent/40"
                      : "bg-bg-raised/40 text-fg-muted border-border/40",
                  )}
                >
                  {clock.blackFormatted}
                </div>
              )}

              {/* Coach Turn Status Pill */}
              {!isWhiteTurn ? (
                <div className="shrink-0 flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
                  <span>{isOpponentThinking ? "Thinking…" : "Playing"}</span>
                </div>
              ) : (
                <span className="shrink-0 text-[10px] text-fg-muted/70">Waiting</span>
              )}
            </div>
          </div>

          {/* The board is the product. Removing the window chrome above bought
              back vertical space, so the reserve drops from 330px to 250px and
              the hard caps rise — on a 1080p screen this is roughly a 40%
              larger board. The frame is one hairline now; the stacked
              gradient, inset shadow and blur were reading as a bezel around
              the board rather than as part of it. */}
          <div className="relative flex w-full max-w-[min(100%,calc(100vh-250px),560px)] xl:max-w-[min(100%,calc(100vh-250px),640px)] items-center justify-center p-1 rounded-lg border border-border/50 bg-bg-raised/40 shrink-0">
            {/* Game over overlay — dims board and shows result */}
            {isGameOver && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl sm:rounded-2xl bg-black/50 backdrop-blur-sm pointer-events-none">
                <span className="rounded-full border border-border/80 bg-bg/90 px-4 py-1.5 font-display text-sm font-semibold text-fg shadow-xl">
                  Game Over
                </span>
              </div>
            )}
            <div className="w-full aspect-square overflow-hidden rounded-lg sm:rounded-xl shadow-lg">
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation: flipped ? "black" : "white",
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    // BUG 9 fix: no moves after game over
                    if (isGameOver || !targetSquare) return false;
                    return onManualMove(sourceSquare, targetSquare);
                  },
                  lightSquareStyle: { backgroundColor: "var(--color-board-light, #EDE7DC)" },
                  darkSquareStyle: { backgroundColor: "var(--color-board-dark, #798694)" },
                  squareStyles: lastMoveSquares,
                  showNotation: true,
                  animationDurationInMs: 250,
                  boardStyle: { borderRadius: "10px", overflow: "hidden" },
                }}
              />
            </div>
          </div>

          {/* Apple-style Bottom Player Bar (White / You) */}
          <div className="flex w-full max-w-[min(100%,calc(100vh-320px),420px)] xl:max-w-[min(100%,calc(100vh-320px),460px)] items-center justify-between rounded-xl border border-border/60 bg-bg/40 px-2.5 sm:px-3 py-1 sm:py-1.5 backdrop-blur-md shadow-xs gap-2 min-w-0 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 border border-stone-300 text-stone-900 shadow-sm text-xs sm:text-sm font-bold">
                ♔
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-fg truncate">You</span>
                  <span className="shrink-0 rounded border border-border bg-bg-raised px-1 py-0.2 font-mono text-[9px] text-fg-muted">
                    Player
                  </span>
                </div>
                <span className="text-[10px] text-fg-muted block truncate">White Pieces</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Player Digital Clock LED */}
              {clock && clock.mode !== "casual" && (
                <div
                  className={cn(
                    "font-mono text-xs px-2 py-0.5 rounded-md border font-bold tracking-wider transition-all",
                    isWhiteTurn && clock.isRunning
                      ? clock.isUrgentWhite
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/60 animate-pulse"
                        : clock.isLowTimeWhite
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/60"
                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                      : "bg-bg-raised/40 text-fg-muted border-border/40",
                  )}
                >
                  {clock.whiteFormatted}
                </div>
              )}

              {/* Player Turn Status Pill */}
              {isWhiteTurn ? (
                <div className="shrink-0 flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Your Turn</span>
                </div>
              ) : (
                <span className="shrink-0 text-[10px] text-fg-muted/70">Opponent Turn</span>
              )}
            </div>
          </div>

          {/* Apple-styled Move History Drawer */}
          <MoveHistoryList moveHistory={moveHistory} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-2 opacity-50">♟</div>
          <p className="text-sm font-medium text-fg-muted">Visual board is currently hidden.</p>
          <button
            type="button"
            onClick={onToggleVisible}
            className="mt-3 rounded-full border border-border bg-bg px-4 py-1.5 text-xs font-semibold text-fg hover:border-accent hover:text-accent transition-colors"
          >
            Show Board (Press B)
          </button>
        </div>
      )}
    </section>
  );
}

function MoveHistoryList({ moveHistory }: { moveHistory: string[] }) {
  if (moveHistory.length === 0) return null;

  const pairs: [string, string | undefined][] = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    pairs.push([moveHistory[i], moveHistory[i + 1]]);
  }

  return (
    <div className="w-full max-w-[min(100%,calc(100vh-320px),420px)] xl:max-w-[min(100%,calc(100vh-320px),460px)] mt-0.5 rounded-xl border border-border/50 bg-bg/30 px-2.5 py-1 backdrop-blur-sm shrink-0">
      <div className="flex items-center justify-between mb-0.5">
        <h3 className="font-mono text-[9px] uppercase tracking-widest text-fg-muted">
          Notation History ({moveHistory.length} plies)
        </h3>
      </div>
      <div className="max-h-12 overflow-y-auto scrollbar-thin">
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-1 font-mono text-[11px]">
          {pairs.map(([white, black], i) => (
            <li
              key={i}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-bg-raised/40 hover:bg-bg-raised/80 transition-colors"
            >
              <span className="text-fg-muted font-semibold">{i + 1}.</span>
              <span className="font-medium text-fg">{white}</span>
              {black && <span className="text-fg-muted">{black}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
