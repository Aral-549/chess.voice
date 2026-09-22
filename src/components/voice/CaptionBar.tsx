"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface CaptionBarProps {
  caption: string;
  partialText: string;
  status?: string;
  onRepeat?: () => void;
}

/**
 * Large on-screen captions of what the coach is saying, and live transcription
 * of what the speech recognizer hears in real time.
 * Includes speaker labels, copy action, and smooth accessibility styling.
 */
export function CaptionBar({ caption, partialText, status, onRepeat }: CaptionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = partialText || caption || "Ready when you are.";
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isThinking = status === "thinking";
  const speaker = partialText ? "you" : isThinking ? "thinking" : caption ? "coach" : "idle";

  return (
    <div className="panel relative w-full p-5 sm:p-6 text-center transition-all duration-300 border-border/80 shadow-md">
      {/* Speaker header pill */}
      <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          {speaker === "you" ? (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/20 text-accent font-mono text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
              Live Speech (You)
            </span>
          ) : speaker === "thinking" ? (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Coach Thinking
            </span>
          ) : speaker === "coach" ? (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent-2/20 text-accent-2 font-mono text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-accent-2" />
              Voice Coach
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-bg text-fg-muted font-mono text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-fg-muted" />
              Ready
            </span>
          )}
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {(caption || partialText) && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded text-xs text-fg-muted hover:text-accent hover:bg-bg transition-colors cursor-pointer"
              title="Copy caption text"
              aria-label="Copy caption text"
            >
              {copied ? (
                <span className="text-[10px] text-accent font-mono">Copied!</span>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          )}
          {onRepeat && caption && !partialText && (
            <button
              type="button"
              onClick={onRepeat}
              className="p-1 rounded text-xs text-fg-muted hover:text-accent hover:bg-bg transition-colors cursor-pointer"
              title="Repeat last coach message"
              aria-label="Repeat last coach message"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main caption text — unblocked live streaming */}
      <div className="min-h-16 flex items-center justify-center px-1">
        {partialText ? (
          <p className="font-mono text-lg text-accent/90 italic tracking-wide break-words max-w-full">
            <span className="sr-only-live" aria-hidden="true">
              You said:
            </span>
            &ldquo;{partialText}&rdquo;
            <span className="inline-block w-1.5 h-4 ml-1.5 bg-accent animate-pulse align-middle rounded-full" />
          </p>
        ) : status === "listening" ? (
          // BUG 10 fix: show mic active prompt instead of stale coach caption
          <p className="font-display text-xl text-accent/80 sm:text-2xl flex items-center gap-2 animate-pulse">
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-ping" />
            Listening…
          </p>
        ) : isThinking && !caption ? (
          <p className="font-display text-lg text-amber-400/90 italic animate-pulse flex items-center gap-2">
            <span>Evaluating position and planning reply…</span>
          </p>
        ) : caption ? (
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="font-display text-xl leading-relaxed sm:text-2xl text-fg break-words max-w-full"
          >
            {caption}
          </motion.p>
        ) : (
          <p className="font-display text-xl text-fg-muted sm:text-2xl">
            Ready when you are. Hold <span className="text-accent font-mono font-semibold">J</span> to speak.
          </p>
        )}
      </div>
    </div>
  );
}
