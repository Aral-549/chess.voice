"use client";

import { useEffect, useRef } from "react";

interface IBCAGuideModalProps {
  onClose: () => void;
  onTryCommand?: (cmd: string) => void;
}

const IBCA_FILES = [
  { file: "a", name: "Anna", phonetic: "AH-nah", example: "Anna 4 (a4)" },
  { file: "b", name: "Bella", phonetic: "BELL-ah", example: "Bella 3 (b3)" },
  { file: "c", name: "Cesar", phonetic: "SAY-zar", example: "Cesar 4 (c4)" },
  { file: "d", name: "David", phonetic: "DAH-veed", example: "David 4 (d4)" },
  { file: "e", name: "Eva", phonetic: "AY-vah", example: "Eva 4 (e4)" },
  { file: "f", name: "Felix", phonetic: "FAY-leeks", example: "Felix 3 (f3)" },
  { file: "g", name: "Gustav", phonetic: "GOO-stahf", example: "Gustav 3 (g3)" },
  { file: "h", name: "Hector", phonetic: "HEK-tor", example: "Hector 4 (h4)" },
];

const SAMPLE_COMMANDS = [
  { title: "Opening Move", spoken: "Eva 4", desc: "Pushes king's pawn two squares forward (1. e4)" },
  { title: "Piece Development", spoken: "Knight to Felix 3", desc: "Develops knight to f3" },
  { title: "Captures", spoken: "Pawn takes Cesar 5", desc: "Pawn captures on c5 (cxd5/cxc5)" },
  { title: "Castling", spoken: "Castle kingside", desc: "Performs short castling (O-O)" },
  { title: "Pawn Promotion", spoken: "Pawn to Eva 8 queen", desc: "Promotes pawn on e8 to Queen" },
  { title: "Spatial Scan", spoken: "Scan board", desc: "Systematic Rank 1 to Rank 8 board reorientation" },
  { title: "Tactical Query", spoken: "What are my threats?", desc: "Identifies attacked or hanging friendly pieces" },
  { title: "Undo Move", spoken: "Take that back", desc: "Reverts the last pair of moves (player + coach)" },
];

export function IBCAGuideModal({ onClose, onTryCommand }: IBCAGuideModalProps) {
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
        aria-labelledby="ibca-guide-heading"
        tabIndex={-1}
        className="panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 outline-none shadow-2xl border-border"
      >
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 id="ibca-guide-heading" className="font-display text-xl sm:text-2xl">
              FIDE / IBCA Blind Chess Guide
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">
              The international tournament acoustic standard since 1985
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent cursor-pointer"
          >
            Close (Esc)
          </button>
        </div>

        {/* Explainer callout */}
        <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-3.5 text-xs sm:text-sm leading-relaxed text-fg">
          <p className="font-semibold text-accent mb-1">Why does Blind Chess use phonetic names?</p>
          <p className="text-fg-muted">
            Over microphones and telephone lines, letter pairs like <strong className="text-fg">B / C / D / E / G / P / T</strong> sound almost indistinguishable.
            The International Braille Chess Association (IBCA) solved this in 1985 by assigning unique names to each file: <span className="font-semibold text-accent">Anna, Bella, Cesar, David, Eva, Felix, Gustav, Hector</span>.
          </p>
        </div>

        {/* 8 Files Grid */}
        <div className="mb-6">
          <h3 className="font-mono text-xs uppercase tracking-wider text-fg-muted mb-2.5">
            The 8 Tournament Files
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {IBCA_FILES.map(({ file, name, phonetic, example }) => (
              <div
                key={file}
                className="panel p-3 bg-bg/50 border-border/70 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-accent text-base uppercase">{file}</span>
                  <span className="font-mono text-[10px] text-fg-muted font-normal">{phonetic}</span>
                </div>
                <div className="font-display font-semibold text-sm text-fg">{name}</div>
                <div className="font-mono text-[11px] text-fg-muted mt-1">{example}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Voice Command Examples */}
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wider text-fg-muted mb-2.5">
            Spoken Voice Commands
          </h3>
          <div className="space-y-2">
            {SAMPLE_COMMANDS.map(({ title, spoken, desc }) => (
              <div
                key={spoken}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg-raised/60 text-xs sm:text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">{title}:</span>
                    <span className="font-mono text-accent font-bold">&ldquo;{spoken}&rdquo;</span>
                  </div>
                  <p className="text-fg-muted text-xs mt-0.5">{desc}</p>
                </div>
                {onTryCommand && (
                  <button
                    type="button"
                    onClick={() => {
                      onTryCommand(spoken);
                      onClose();
                    }}
                    className="ml-3 shrink-0 rounded border border-border bg-bg px-2.5 py-1 text-xs font-medium text-fg hover:border-accent hover:text-accent transition-colors"
                  >
                    Try it
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
