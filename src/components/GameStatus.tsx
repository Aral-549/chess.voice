// ============================================================
// VoiceChessmate — Modern Game Status Bar
// Shows turn, check/checkmate, captures, difficulty, and voice agent status
// Fully accessible with ARIA live regions and semantic landmarks
// ============================================================

'use client';

import type { GameState, Difficulty } from '@/types';
import type { VoiceAgentStatus } from '@/lib/voice-agent';
import { ChessPiece } from './ChessPiece';

interface GameStatusProps {
  gameState: GameState | null;
  agentStatus: VoiceAgentStatus;
  difficulty?: Difficulty;
}

const STATUS_CONFIG: Record<VoiceAgentStatus, { label: string; color: string; badge: string }> = {
  disconnected: { label: 'Voice Agent Offline', color: 'text-gray-400', badge: 'bg-gray-700/50' },
  connecting: { label: 'Connecting...', color: 'text-amber-400', badge: 'bg-amber-900/50' },
  ready: { label: 'Voice Agent Active', color: 'text-emerald-400', badge: 'bg-emerald-950/60' },
  listening: { label: 'Listening to speech...', color: 'text-red-400', badge: 'bg-red-950/80' },
  error: { label: 'Connection Error', color: 'text-rose-400', badge: 'bg-rose-950/80' },
};

export function GameStatus({ gameState, agentStatus, difficulty }: GameStatusProps) {
  const status = STATUS_CONFIG[agentStatus];

  return (
    <section
      role="region"
      aria-label="Game and Connection Status"
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#21201d] border-b border-[#312e2b] text-xs"
    >
      {/* Left: Agent status & Voice Indicator */}
      <div
        className={`flex items-center gap-2 px-2.5 py-1 rounded-full ${status.badge} ${status.color} border border-white/5`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          className={`w-2 h-2 rounded-full ${
            agentStatus === 'ready'
              ? 'bg-emerald-400'
              : agentStatus === 'listening'
                ? 'bg-red-500 animate-ping'
                : agentStatus === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-gray-500'
          }`}
          aria-hidden="true"
        />
        <span className="font-medium tracking-tight">{status.label}</span>
      </div>

      {/* Center: Game info (Turn, Check, Mate) */}
      {gameState && (
        <div
          className="flex items-center gap-3"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-gray-400 font-mono">
            Move {gameState.moveNumber}
          </span>
          <span
            className={`font-semibold px-2 py-0.5 rounded ${
              gameState.turn === 'w' ? 'bg-[#312e2b] text-white' : 'bg-[#181715] text-gray-300'
            }`}
          >
            {gameState.turn === 'w' ? '⬜ White to move' : '⬛ Black to move'}
          </span>

          {gameState.isCheck && (
            <span
              className="text-red-300 bg-red-950/80 border border-red-700/60 px-2 py-0.5 rounded font-bold animate-pulse"
              role="alert"
              aria-live="assertive"
            >
              ⚠ CHECK
            </span>
          )}

          {gameState.isCheckmate && (
            <span
              className="text-white bg-red-600 px-2.5 py-0.5 rounded font-bold shadow-lg shadow-red-950"
              role="alert"
              aria-live="assertive"
            >
              ♚ CHECKMATE
            </span>
          )}

          {gameState.isDraw && (
            <span
              className="text-amber-300 bg-amber-950/80 border border-amber-600/50 px-2 py-0.5 rounded font-bold"
              role="alert"
              aria-live="polite"
            >
              ½ DRAW
            </span>
          )}

          {difficulty && (
            <span
              className="hidden md:inline-block px-2 py-0.5 rounded text-[11px] bg-[#312e2b] text-amber-300 font-medium capitalize"
              aria-label={`Current difficulty: ${difficulty}`}
            >
              {difficulty}
            </span>
          )}
        </div>
      )}

      {/* Right: Captured pieces */}
      {gameState && (
        <div
          className="flex items-center gap-3"
          role="region"
          aria-label="Captured pieces"
        >
          <div
            className="flex items-center h-5 gap-0.5"
            title="Captured by White"
          >
            {gameState.capturedPieces.white.map((p, i) => (
              <div key={i} className="w-4 h-4">
                <ChessPiece piece={`b${p}`} className="w-full h-full" />
              </div>
            ))}
          </div>

          <span className="text-gray-600 select-none">|</span>

          <div
            className="flex items-center h-5 gap-0.5"
            title="Captured by Black"
          >
            {gameState.capturedPieces.black.map((p, i) => (
              <div key={i} className="w-4 h-4">
                <ChessPiece piece={`w${p}`} className="w-full h-full" />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
