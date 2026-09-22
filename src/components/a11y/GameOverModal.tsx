"use client";

import { useEffect, useRef, useState } from "react";

interface GameOverModalProps {
  isGameOver: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  turn: "w" | "b";
  moveNumber: number;
  pgn: string;
  onNewGame: () => void;
  onClose: () => void;
}

export function GameOverModal({
  isGameOver,
  isCheckmate,
  isDraw,
  isStalemate,
  turn,
  moveNumber,
  pgn,
  onNewGame,
  onClose,
}: GameOverModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isGameOver) {
      dialogRef.current?.focus();
    }
  }, [isGameOver]);

  if (!isGameOver) return null;

  const winner = isCheckmate ? (turn === "w" ? "Black" : "White") : null;
  const isPlayerWin = winner === "White";

  const handleCopyPGN = () => {
    navigator.clipboard.writeText(pgn);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-title"
        tabIndex={-1}
        className="panel w-full max-w-md p-6 outline-none shadow-2xl border-border text-center"
      >
        <div className="text-4xl mb-3" aria-hidden="true">
          {isPlayerWin ? "🏆" : isCheckmate ? "♚" : isStalemate ? "🤝" : "🏁"}
        </div>

        <h2 id="game-over-title" className="font-display text-2xl font-bold text-fg mb-1">
          {isCheckmate
            ? `${winner} wins by Checkmate!`
            : isStalemate
              ? "Game Drawn by Stalemate"
              : isDraw
                ? "Game Drawn"
                : "Game Over"}
        </h2>

        <p className="text-sm text-fg-muted mb-6">
          {isPlayerWin
            ? "Outstanding tactical play! You defeated the engine."
            : isCheckmate
              ? "The coach delivered checkmate. A strong game!"
              : "Neither side can force a victory."}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6 font-mono text-xs">
          <div className="panel p-3 bg-bg/50">
            <span className="text-fg-muted block mb-1">Total Turns</span>
            <span className="text-lg font-bold text-fg">{moveNumber - 1}</span>
          </div>
          <div className="panel p-3 bg-bg/50">
            <span className="text-fg-muted block mb-1">Result</span>
            <span className="text-lg font-bold text-accent">
              {isCheckmate ? (winner === "White" ? "1 - 0" : "0 - 1") : "½ - ½"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onNewGame}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-accent text-bg font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer shadow-md"
          >
            Start New Game
          </button>
          <button
            type="button"
            onClick={handleCopyPGN}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-border bg-bg-raised text-fg text-sm font-medium hover:border-accent hover:text-accent transition-colors"
          >
            {copied ? "PGN Copied!" : "Copy PGN"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-border text-fg-muted text-sm hover:text-fg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
