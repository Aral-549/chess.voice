// ============================================================
// VoiceChessmate — Modern Visual Chess Board
// Inspired by tournament UI: Blue Ocean Marble theme, SVG pieces,
// Opponent & Player profile bars with digital clocks,
// and full accessibility + click-to-move support.
// ============================================================

'use client';

import { useMemo, useState } from 'react';
import { ChessPiece } from './ChessPiece';
import type { Move } from '@/types';

interface ChessBoardProps {
  fen: string;
  lastMove: Move | null;
  flipped?: boolean;
  onMakeMove?: (moveSan: string) => void;
  legalMoves?: string[];
  opponentName?: string;
  opponentRating?: string;
  opponentTimeSeconds?: number;
  playerTimeSeconds?: number;
  isOpponentThinking?: boolean;
  isPlayerTurn?: boolean;
  isListening?: boolean;
  onOpenSettings?: () => void;
}

const IBCA_LABELS: Record<string, string> = {
  a: 'Anna', b: 'Bella', c: 'Cesar', d: 'David', e: 'Eva', f: 'Felix', g: 'Gustav', h: 'Hector',
};

function parseFEN(fen: string): (string | null)[][] {
  const rows = fen.split(' ')[0].split('/');
  return rows.map(row => {
    const squares: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch); i++) squares.push(null);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        squares.push(color + ch.toLowerCase());
      }
    }
    return squares;
  });
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function ChessBoard({
  fen,
  lastMove,
  flipped = false,
  onMakeMove,
  opponentName = 'Opponent',
  opponentRating = '1500',
  opponentTimeSeconds = 600,
  playerTimeSeconds = 600,
  isOpponentThinking = false,
  isPlayerTurn = true,
  isListening = false,
  onOpenSettings,
}: ChessBoardProps) {
  const board = useMemo(() => parseFEN(fen), [fen]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [showPhonetics, setShowPhonetics] = useState(false);

  // Clear the selection when the position changes. Adjusting state during render
  // rather than in an effect — an effect here re-renders the whole board twice on
  // every move, and React flags it as a cascading render.
  const [renderedFen, setRenderedFen] = useState(fen);
  if (renderedFen !== fen) {
    setRenderedFen(fen);
    setSelectedSquare(null);
  }

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  const displayRanks = flipped ? [...ranks].reverse() : ranks;
  const displayFiles = flipped ? [...files].reverse() : files;

  const isHighlighted = (squareCoord: string) => {
    if (!lastMove) return false;
    return squareCoord === lastMove.from || squareCoord === lastMove.to;
  };

  const handleSquareClick = (squareCoord: string, piece: string | null) => {
    if (!onMakeMove) return;

    if (!selectedSquare) {
      // Select own piece (assuming player is White by default)
      if (piece && (isPlayerTurn ? piece.startsWith('w') : piece.startsWith('b'))) {
        setSelectedSquare(squareCoord);
      }
    } else {
      if (selectedSquare === squareCoord) {
        setSelectedSquare(null);
      } else {
        // Try move: e.g. e2e4 or piece algebraic
        const attemptedMove = `${selectedSquare}${squareCoord}`;
        onMakeMove(attemptedMove);
        setSelectedSquare(null);
      }
    }
  };

  return (
    <div className="flex flex-col w-full max-w-[620px] select-none">
      {/* ============================================================ */}
      {/* Opponent Profile Bar (Top of Board) */}
      {/* Matches the screenshot: Avatar, Opponent, Clock 10:00, Gear  */}
      {/* ============================================================ */}
      <header
        className="flex items-center justify-between px-3 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] rounded-t-xl"
        role="region"
        aria-label="Opponent details"
      >
        <div className="flex items-center gap-3">
          {/* Avatar container */}
          <div className="relative w-10 h-10 rounded-lg bg-[var(--surface-4)] flex items-center justify-center text-gray-400 overflow-hidden border border-[var(--border)]">
            <svg
              className="w-7 h-7 text-gray-400 mt-1"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            {isOpponentThinking && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[var(--surface-2)] animate-ping" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm sm:text-base tracking-tight">
                {opponentName}
              </span>
              <span className="text-[11px] font-semibold bg-[var(--surface-4)] text-gray-400 px-1.5 py-0.5 rounded font-mono">
                {opponentRating}
              </span>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              {isOpponentThinking ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Thinking...
                </span>
              ) : (
                <span>Voice Engine</span>
              )}
            </p>
          </div>
        </div>

        {/* Clock & Settings Gear */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-base sm:text-lg font-bold transition-all shadow-inner ${
              !isPlayerTurn && isOpponentThinking
                ? 'bg-[var(--surface-1)] text-emerald-400 border border-emerald-500/50 shadow-emerald-950/40'
                : 'bg-[var(--surface-1)] text-gray-200 border border-[var(--border)]'
            }`}
            aria-label={`Opponent clock: ${formatTime(opponentTimeSeconds)}`}
          >
            <span className="text-xs text-gray-500">⏱</span>
            <span>{formatTime(opponentTimeSeconds)}</span>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            tabIndex={0}
            aria-label="Game and board options"
            className="p-2 text-gray-400 hover:text-white hover:bg-[var(--surface-4)] rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            title="Options & Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* The Blue Marble Chessboard (Authentic Oceanic Theme) */}
      {/* ============================================================ */}
      <section
        role="region"
        aria-label="Chessboard with Blue Ocean Marble styling"
        className="relative w-full aspect-square bg-[var(--surface-1)] p-1 sm:p-2 border-x border-[var(--border)] shadow-2xl overflow-hidden"
      >
        {/* SVG Marble Filter Definitions */}
        <svg className="sr-only" aria-hidden="true">
          <filter id="ocean-marble-texture" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" result="noise" />
            <feColorMatrix
              type="matrix"
              values="0.2 0 0 0 0.08
                      0 0.45 0 0 0.32
                      0 0 0.7 0 0.58
                      0 0 0 0.35 0"
              in="noise"
              result="coloredNoise"
            />
            <feComposite operator="in" in2="SourceGraphic" />
          </filter>
        </svg>

        {/* Board 8x8 Grid */}
        <div
          className="w-full h-full grid grid-cols-8 grid-rows-8 rounded-lg overflow-hidden border border-[#2c3e50] shadow-[0_8px_30px_rgb(0,0,0,0.6)]"
          role="grid"
          aria-label="8 by 8 Chess Grid"
        >
          {displayRanks.map((_, rankDisplayIdx) => {
            const rankIdx = flipped ? 7 - rankDisplayIdx : rankDisplayIdx;
            const rankLabel = ranks[rankIdx];

            return displayFiles.map((_, fileDisplayIdx) => {
              const fileIdx = flipped ? 7 - fileDisplayIdx : fileDisplayIdx;
              const fileLabel = files[fileIdx];
              const piece = board[rankIdx]?.[fileIdx];
              const isLight = (rankIdx + fileIdx) % 2 === 0;
              const squareCoord = fileLabel + rankLabel;
              const highlighted = isHighlighted(squareCoord);
              const isSelected = selectedSquare === squareCoord;

              // Corner coordinates: Rank on left column, File on bottom row
              const showRankCoord = fileDisplayIdx === 0;
              const showFileCoord = rankDisplayIdx === 7;

              return (
                <div
                  key={`${rankIdx}-${fileIdx}`}
                  role="gridcell"
                  aria-label={`${squareCoord}: ${piece ? piece : 'empty'}`}
                  onClick={() => handleSquareClick(squareCoord, piece)}
                  className={`relative flex items-center justify-center cursor-pointer transition-colors duration-150 ${
                    isSelected
                      ? 'ring-4 ring-amber-400 ring-inset bg-amber-300/40 z-10'
                      : highlighted
                        ? isLight
                          ? 'bg-[#c3e387]/70'
                          : 'bg-[#82a844]/80'
                        : isLight
                          ? 'square-light'
                          : 'square-dark'
                  }`}
                >
                  {/* Subtle Coordinate Notation in corners */}
                  {showRankCoord && (
                    <span
                      className={`absolute top-0.5 left-1 text-[10px] sm:text-xs font-bold font-mono pointer-events-none select-none ${
                        isLight ? 'text-[#184f7b]' : 'text-[#a3d4ee]'
                      }`}
                      aria-hidden="true"
                    >
                      {rankLabel}
                    </span>
                  )}

                  {showFileCoord && (
                    <span
                      className={`absolute bottom-0.5 right-1 text-[10px] sm:text-xs font-bold font-mono pointer-events-none select-none ${
                        isLight ? 'text-[#184f7b]' : 'text-[#a3d4ee]'
                      }`}
                      aria-hidden="true"
                    >
                      {fileLabel}
                    </span>
                  )}

                  {/* Render High-Fidelity SVG Chess Piece */}
                  {piece && (
                    <div className="w-[84%] h-[84%] flex items-center justify-center z-1">
                      <ChessPiece piece={piece} />
                    </div>
                  )}

                  {/* Selection Indicator Dot */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-yellow-400/20 pointer-events-none" />
                  )}
                </div>
              );
            });
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/* Player Profile Bar (Bottom of Board) */}
      {/* Matches the top bar: Player avatar, Mic indicator, Clock     */}
      {/* ============================================================ */}
      <footer
        className="flex items-center justify-between px-3 py-2.5 bg-[var(--surface-2)] border-t border-[var(--border)] rounded-b-xl"
        role="region"
        aria-label="Player details"
      >
        <div className="flex items-center gap-3">
          {/* Avatar container with live mic status */}
          <div
            className={`relative w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden border transition-all ${
              isListening
                ? 'bg-red-950 border-red-500 shadow-lg shadow-red-900/40 scale-105'
                : 'bg-[var(--surface-4)] border-[var(--border)] text-gray-300'
            }`}
          >
            {isListening ? (
              <span className="text-red-400 text-lg animate-pulse" aria-hidden="true">
                🎙️
              </span>
            ) : (
              <svg
                className="w-7 h-7 text-gray-300 mt-1"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            )}
            {isListening && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm sm:text-base tracking-tight">
                You
              </span>
              <span className="text-[11px] font-semibold bg-[var(--surface-4)] text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                White
              </span>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              {isListening ? (
                <span className="text-red-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Listening to voice...
                </span>
              ) : isPlayerTurn ? (
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Your turn to move
                </span>
              ) : (
                <span>Waiting for opponent</span>
              )}
            </p>
          </div>
        </div>

        {/* Player Clock & Phonetics Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPhonetics(!showPhonetics)}
            tabIndex={0}
            aria-label="Toggle IBCA phonetic labels"
            className="px-2 py-1 text-xs font-semibold bg-[var(--surface-4)] hover:bg-[var(--border)] text-gray-300 rounded-md transition-colors border border-[var(--border)]"
            title="IBCA Phonetics (Anna, Bella, Cesar...)"
          >
            IBCA
          </button>

          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-base sm:text-lg font-bold transition-all shadow-inner ${
              isPlayerTurn
                ? 'bg-[var(--surface-1)] text-emerald-400 border border-emerald-500/50 shadow-emerald-950/40'
                : 'bg-[var(--surface-1)] text-gray-200 border border-[var(--border)]'
            }`}
            aria-label={`Your clock: ${formatTime(playerTimeSeconds)}`}
          >
            <span className="text-xs text-gray-500">⏱</span>
            <span>{formatTime(playerTimeSeconds)}</span>
          </div>
        </div>
      </footer>

      {/* Optional IBCA Phonetics Legend banner */}
      {showPhonetics && (
        <div className="mt-2 p-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-gray-300 grid grid-cols-4 sm:grid-cols-8 gap-1 text-center font-mono">
          {files.map(f => (
            <div key={f} className="p-1 bg-[var(--surface-1)] rounded">
              <span className="text-amber-400 font-bold uppercase mr-1">{f}</span>
              <span className="text-gray-400 text-[10px]">{IBCA_LABELS[f]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
