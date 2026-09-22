"use client";

import { cn } from "@/lib/utils";
import type { CoachStatus } from "@/hooks/useVoiceChessCoach";
import { AudioVisualizer } from "./AudioVisualizer";

const STATUS_LABEL: Record<CoachStatus, string> = {
  idle: "Hold or press J to speak your move",
  connecting: "Connecting to AssemblyAI Voice Agent…",
  listening: "Listening — speak your move or query now",
  thinking: "Evaluating move with chess engine…",
  speaking: "Coach is speaking — press J to interrupt",
};

interface ListenButtonProps {
  status: CoachStatus;
  isHolding?: boolean;
  onPress: () => void;
  onStartHold?: () => void;
  onEndHold?: () => void;
  onCancel?: () => void;
  onRepeat?: () => void;
}

/**
 * The primary voice interaction hub.
 * Features animated audio wave visualization, high-visibility state indicators,
 * tactile mic controls, and secondary action buttons for cancellation & repeat.
 */
export function ListenButton({
  status,
  isHolding = false,
  onPress,
  onStartHold,
  onEndHold,
  onCancel,
  onRepeat,
}: ListenButtonProps) {
  const listening = isHolding || status === "listening";
  const connecting = !isHolding && status === "connecting";
  const thinking = !isHolding && status === "thinking";
  const speaking = !isHolding && status === "speaking";

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Primary Voice Action Button */}
      <div className="relative flex items-center justify-center">
        {/* Ambient audio glow ring */}
        {(connecting || listening || speaking) && (
          <div
            className={cn(
              "absolute -inset-3 rounded-full pointer-events-none transition-all duration-300",
              connecting
                ? "bg-accent/40 blur-lg animate-pulse"
                : listening
                  ? "bg-accent/50 blur-xl animate-pulse"
                  : "bg-accent-2/50 blur-xl animate-pulse",
            )}
          />
        )}

        {/* Instant outward radar ripple on connecting */}
        {connecting && (
          <div
            className="absolute -inset-2 rounded-full border-2 border-accent opacity-50 animate-ping pointer-events-none"
          />
        )}

        <button
          type="button"
          onClick={onPress}
          onMouseDown={onStartHold}
          onMouseUp={onEndHold}
          onMouseLeave={() => {
            if (isHolding && onEndHold) onEndHold();
          }}
          onTouchStart={onStartHold}
          onTouchEnd={onEndHold}
          aria-pressed={listening}
          aria-busy={connecting || thinking}
          aria-label={
            listening
              ? "Stop listening"
              : speaking
                ? "Interrupt coach speech"
                : "Hold or press J to speak chess move"
          }
          className={cn(
            "relative flex flex-col items-center justify-center rounded-full border-3 transition-all duration-200 shadow-xl cursor-pointer select-none",
            "h-36 w-36 sm:h-44 sm:w-44",
            listening
              ? "listening-pulse border-accent bg-accent text-bg scale-105 shadow-accent/50 shadow-2xl"
              : connecting
                ? "border-accent bg-bg-raised text-fg ring-4 ring-accent/40 scale-105 shadow-accent/30 shadow-lg animate-pulse"
                : speaking
                  ? "border-accent-2 bg-bg-raised text-fg ring-4 ring-accent-2/30 scale-102"
                  : thinking
                    ? "border-accent/70 bg-bg-raised text-fg ring-2 ring-accent/20"
                    : "border-border bg-bg-raised text-fg hover:border-accent hover:scale-102 hover:shadow-2xl active:scale-95",
          )}
        >
          {/* Keyboard shortcut indicator pill */}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute -top-2 right-2 rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold shadow-sm transition-all duration-200",
              connecting || listening
                ? "border-accent bg-accent text-bg font-bold scale-110 shadow-md shadow-accent/40"
                : "border-border bg-bg text-fg-muted",
            )}
          >
            J
          </span>

          {/* Icon / Centerpiece */}
          <div className="mb-1">
            {listening ? (
              <svg className="w-8 h-8 sm:w-10 sm:h-10 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            ) : connecting ? (
              <div className="relative flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 text-accent">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
                </span>
              </div>
            ) : speaking ? (
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-accent-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            ) : thinking ? (
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-accent animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ) : (
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </div>

          <span className="text-base sm:text-lg font-bold tracking-tight">
            {isHolding ? "Listening…" : listening ? "Listening" : connecting ? "Connecting…" : thinking ? "Thinking…" : speaking ? "Interrupt" : "Hold J to Talk"}
          </span>
        </button>
      </div>

      {/* Real-time audio waveform animation */}
      <AudioVisualizer status={status} isHolding={isHolding} />

      {/* Accessible Status Text & Micro Badges */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-bg-raised text-xs">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              listening
                ? "bg-accent animate-ping"
                : connecting
                  ? "bg-accent animate-ping"
                  : speaking
                    ? "bg-accent-2 animate-pulse"
                    : thinking
                      ? "bg-accent animate-spin"
                      : "bg-emerald-400",
            )}
            aria-hidden="true"
          />
          <span className="text-fg-muted font-medium">
            {isHolding ? "Listening — release J to send" : STATUS_LABEL[status]}
          </span>
        </div>


        {/* Secondary quick action buttons */}
        <div className="flex items-center gap-2">
          {listening && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-fg-muted hover:border-accent hover:text-accent transition-colors"
            >
              Cancel <span className="font-mono text-[10px]">(Esc)</span>
            </button>
          )}
          {onRepeat && !listening && (
            <button
              type="button"
              onClick={onRepeat}
              className="rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-fg-muted hover:border-accent hover:text-accent transition-colors"
            >
              Repeat Coach <span className="font-mono text-[10px]">(R)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
