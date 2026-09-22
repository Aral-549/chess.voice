"use client";

import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

import type { TimeControlMode } from "@/hooks/useChessClock";
import { PlayerRail } from "./PlayerRail";
import { capturedFromFen } from "@/lib/captured";
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
}: ChessBoardPanelProps) {
  const [flipped, setFlipped] = useState(false);

  // Derive turn from FEN
  const isWhiteTurn = useMemo(() => {
    const parts = fen.split(" ");
    return parts.length > 1 ? parts[1] === "w" : true;
  }, [fen]);

  // Derived from the FEN so it cannot drift from the board across resume,
  // undo or replay.
  const captured = useMemo(() => capturedFromFen(fen), [fen]);

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
          {/* Flag fell alert banner */}
          {clock?.flagFell && (
            <div
              role="alert"
              className="w-full max-w-[min(100%,480px)] xl:max-w-[520px] rounded-xl border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 text-center text-xs font-semibold text-rose-400 backdrop-blur-md animate-pulse"
            >
              Time Out! {clock.flagFell === "w" ? "White's flag fell — Black wins on time." : "Black's flag fell — White wins on time."}
            </div>
          )}

          {/* The board is the product. Removing the window chrome above bought
              back vertical space, so the reserve drops from 330px to 250px and
              the hard caps rise — on a 1080p screen this is roughly a 40%
              larger board. The frame is one hairline now; the stacked
              gradient, inset shadow and blur were reading as a bezel around
              the board rather than as part of it. */}
          {/* Board flanked by its two rails. The space either side of a square
              board was empty; the clocks and captured material now live there
              instead of stacked above and below, where they were eating the
              height the board wanted. Below `lg` the rails wrap under it. */}
          <div className="flex w-full flex-col items-center justify-center gap-2 lg:flex-row lg:items-stretch lg:gap-3 min-h-0">
            <PlayerRail
              side="black"
              name="Voice Coach"
              subtitle={`Black · ${difficulty ?? "intermediate"}`}
              captured={captured.byBlack}
              advantage={-captured.materialAdvantage}
              clock={clock && clock.mode !== "casual" ? clock.blackFormatted : null}
              isTurn={!isWhiteTurn}
              isLowTime={clock?.isLowTimeBlack}
              isUrgent={clock?.isUrgentBlack}
              thinking={isOpponentThinking}
            />

            {/* No padding or border on this wrapper. With them, the rails
                stretched to the *frame* and sat 5px proud of the first and
                last ranks — the board's squares are what the eye aligns to,
                so the wrapper has to be exactly the squares. */}
            <div className="relative flex w-full max-w-[min(100%,calc(100vh-250px),560px)] xl:max-w-[min(100%,calc(100vh-250px),640px)] items-center justify-center shrink-0 self-center">
            {/* Game over overlay — dims board and shows result */}
            {isGameOver && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl sm:rounded-2xl bg-black/50 backdrop-blur-sm pointer-events-none">
                <span className="rounded-full border border-border/80 bg-bg/90 px-4 py-1.5 font-display text-sm font-semibold text-fg shadow-xl">
                  Game Over
                </span>
              </div>
            )}
            <div className="w-full aspect-square overflow-hidden rounded-lg border border-border/50">
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

            <PlayerRail
              side="white"
              name="You"
              subtitle="White pieces"
              captured={captured.byWhite}
              advantage={captured.materialAdvantage}
              clock={clock && clock.mode !== "casual" ? clock.whiteFormatted : null}
              isTurn={isWhiteTurn}
              isLowTime={clock?.isLowTimeWhite}
              isUrgent={clock?.isUrgentWhite}
            />
          </div>

          {/* Move history */}
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
