"use client";

import { motion } from "framer-motion";
import type { CoachStatus } from "@/hooks/useVoiceChessCoach";

interface AudioVisualizerProps {
  status: CoachStatus;
  isHolding?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * Animated SVG soundwave visualizer that reflects real-time audio interaction states:
 * listening (microphone active or key held), thinking (engine calculating), or speaking (coach replying).
 * Respects prefers-reduced-motion automatically.
 */
export function AudioVisualizer({ status, isHolding = false, size = "md" }: AudioVisualizerProps) {
  const isListening = isHolding || status === "listening";
  const isSpeaking = !isHolding && status === "speaking";
  const isThinking = !isHolding && status === "thinking";
  const isConnecting = !isHolding && status === "connecting";

  const barCount = 9;
  const barDelays = [0.08, 0.22, 0.04, 0.3, 0.12, 0.26, 0.16, 0.34, 0.1];
  const multiplier = size === "sm" ? 0.7 : size === "lg" ? 1.4 : 1;
  const barHeights = [14, 28, 38, 30, 42, 34, 24, 18, 12].map((h) => Math.round(h * multiplier));

  return (
    <div className="flex items-center justify-center gap-1.5 h-12 px-4" aria-hidden="true">
      {isThinking ? (
        <div className="relative flex items-center justify-center w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-pulse" />
          <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-accent border-r-accent animate-spin" />
        </div>
      ) : isListening || isSpeaking ? (
        <div className="flex items-center gap-1.5 h-10">
          {Array.from({ length: barCount }).map((_, idx) => (
            <motion.span
              key={idx}
              className={`w-1.5 sm:w-2 rounded-full transition-colors ${
                isListening
                  ? "bg-accent shadow-sm shadow-accent/60"
                  : "bg-accent-2 shadow-sm shadow-accent-2/60"
              }`}
              animate={{
                height: [
                  "6px",
                  `${barHeights[idx % barHeights.length]}px`,
                  "10px",
                  `${barHeights[(idx + 3) % barHeights.length]}px`,
                  "6px",
                ],
              }}
              transition={{
                duration: 0.75 + barDelays[idx],
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      ) : isConnecting ? (
        /* Instant responsive audio wave syncing indicator */
        <div className="flex items-center gap-1.5 h-10">
          {Array.from({ length: barCount }).map((_, idx) => (
            <motion.span
              key={idx}
              className="w-1.5 sm:w-2 rounded-full bg-accent shadow-sm shadow-accent/50"
              animate={{
                height: ["8px", "24px", "8px"],
                opacity: [0.35, 1, 0.35],
              }}
              transition={{
                duration: 0.55,
                repeat: Infinity,
                delay: idx * 0.05,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 opacity-30">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-fg-muted" />
          ))}
        </div>
      )}
    </div>
  );
}
