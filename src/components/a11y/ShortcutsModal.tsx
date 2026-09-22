"use client";

import { useEffect, useRef } from "react";

const SHORTCUTS: [string, string][] = [
  ["J", "Hold to speak a move (push-to-talk), or press to toggle"],
  ["Esc", "Cancel listening"],
  ["R", "Repeat the coach's last message"],
  ["U", "Undo the last move"],
  ["H", "Ask the coach for a tactical hint"],
  ["T", "Threats — scan what pieces of yours are attacked"],
  ["D", "Spatial scan — systematic Rank 1 to Rank 8 occupied squares"],
  ["B", "Show or hide the visual board"],
  ["F", "Flip board perspective (White / Black)"],
  ["I", "Open official FIDE / IBCA Phonetic Notation Guide"],
  ["1 - 4", "Set coach engine difficulty (1: Beginner, 2: Inter, 3: Adv, 4: Master)"],
  ["C", "Toggle high-contrast AAA mode"],
  ["+ / -", "Increase or decrease text size"],
  ["?", "Open or close this shortcuts list"],
];

/**
 * Accessible keyboard shortcuts modal.
 * Implements focus trapping, Escape key dismiss, and focus restoration on close.
 */
export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-heading"
        tabIndex={-1}
        className="panel w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 outline-none shadow-2xl border-border scrollbar-thin"
      >
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <h2 id="shortcuts-heading" className="font-display text-xl font-semibold">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:border-accent hover:text-accent cursor-pointer"
          >
            Close (Esc)
          </button>
        </div>
        <dl className="space-y-2.5">
          {SHORTCUTS.map(([key, desc]) => (
            <div key={key} className="flex items-baseline gap-3 p-1 rounded hover:bg-bg/40">
              <dt className="w-20 shrink-0 rounded border border-border bg-bg px-2 py-1 text-center font-mono text-xs font-bold text-accent">
                {key}
              </dt>
              <dd className="text-xs sm:text-sm text-fg-muted">{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
