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
  void emphasized;

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
      className="flex w-full max-w-sm items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value);
        setValue("");
      }}
    >
      <label htmlFor="text-move" className="sr-only">
        Type your move
      </label>
      <input
        id="text-move"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={emphasized ? "Voice input isn't supported here — type a move" : "e.g. knight to f3"}
        className="panel flex-1 px-3 py-2 text-sm outline-none placeholder:text-fg-muted"
      />
      <button
        type="submit"
        className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
      >
        Send
      </button>
    </form>
  );
}
