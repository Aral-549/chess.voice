"use client";

import { useState } from "react";

/**
 * A typed-move fallback. Always available, not just when voice fails —
 * reliability matters more than purity here, and it's also how a Firefox
 * user (no SpeechRecognition support) plays at all.
 */
export function TextFallbackForm({
  onSubmit,
  emphasized,
}: {
  onSubmit: (text: string) => void;
  emphasized: boolean;
}) {
  const [value, setValue] = useState("");
  // Open by default. Typing is exact and always works; voice needs a mic, a
  // live session, and a correct transcription. Hiding the reliable path behind
  // a click costs a keyboard user a Tab stop and a discovery problem.
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-fg-muted underline decoration-dotted underline-offset-4 hover:text-accent"
      >
        Prefer to type a move instead?
      </button>
    );
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value);
        setValue("");
      }}
    >
      <div className="flex w-full items-center gap-2">
        <label htmlFor="text-move" className="sr-only">
          Type your move
        </label>
        <input
          id="text-move"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          // The old placeholder said "Voice input isn't supported here", which
          // is only one of the reasons this path gets emphasised — a denied mic
          // or an exhausted quota reach it too, and that sentence would be a
          // lie. The reason belongs in the hint below; the placeholder just
          // shows the shape of an answer.
          placeholder="e.g. knight to f3"
          aria-describedby={emphasized ? "text-move-hint" : undefined}
          className={`panel flex-1 px-3 py-2 text-sm outline-none placeholder:text-fg-muted ${
            emphasized ? "border-accent ring-1 ring-accent/40" : ""
          }`}
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          Send
        </button>
      </div>
      {/* Only rendered when typing is the working path. `aria-describedby`
          makes a screen reader read it as part of the field, which a styled
          border alone would never do. */}
      {emphasized && (
        <p id="text-move-hint" className="text-xs text-fg-muted">
          Voice is unavailable right now — type your moves here. Everything else
          still works by keyboard.
        </p>
      )}
    </form>
  );
}
