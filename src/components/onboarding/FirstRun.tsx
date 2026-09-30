"use client";

// ============================================================
// VoiceChessmate — the first thirty seconds
//
// Until now the app opened straight onto a live board. The one instruction was
// a "Hold J to speak" line in the header that is `hidden sm:block`, so on a
// narrow screen there was none at all, and the coach's first spoken sentence
// says "Eva 4" to someone who has never been told that Eva means the e-file.
//
// That is a bad first minute for anyone, and a dead end for the two people who
// matter most: a blind player arriving without a sighted helper, and a judge
// deciding in twenty seconds whether this is worth their time.
//
// Three rules shaped this:
//
// 1. It teaches by doing. Step one is not "here is the alphabet", it is "press
//    J and say e4". You can complete the whole thing without reading a table.
// 2. It is never a wall. Escape skips at any point, it appears only when no
//    move has been played, and it is recoverable from Settings afterwards —
//    partly so it can be re-run on camera for the demo video.
// 3. Every step is spoken. The text goes through the polite live region, so a
//    screen reader user gets the same tutorial as everyone else rather than a
//    dialog they have to go hunting through.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "@/lib/announce";

const STORAGE_KEY = "voice-chess-first-run-v1";

/**
 * Fallback for when localStorage is unavailable — a private window, blocked
 * site data, an embedded webview.
 *
 * The first version returned "already seen" whenever storage threw, reasoning
 * that it was safer not to trap anyone in a tutorial. That was backwards: it
 * meant a brand-new user in a private window got no tutorial at all, and
 * private windows are exactly what someone evaluating an unfamiliar app tends
 * to open. Remembering it in memory instead shows it once per page load and
 * never twice in a session.
 */
let seenThisSession = false;

/** Has the player already been through this? Never throws. */
export function hasSeenFirstRun(): boolean {
  if (typeof window === "undefined") return true; // never render it server-side
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    return seenThisSession;
  }
}

export function markFirstRunSeen(): void {
  seenThisSession = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "done");
  } catch {
    /* storage blocked — the in-memory flag above carries it for this session */
  }
}

interface Step {
  title: string;
  /** Spoken and shown. Written to be heard, so no bullet fragments. */
  body: string;
  /** Optional command the player can fire from the step itself. */
  tryCommand?: { label: string; command: string };
}

const STEPS: Step[] = [
  {
    title: "Say a move",
    body:
      "Hold the J key and say a move, then let go. Plain chess works — \"e4\", " +
      "\"knight to f3\", \"castle kingside\". You never need the mouse, and you " +
      "never need to see the board.",
    tryCommand: { label: "Try it for me: play e4", command: "e4" },
  },
  {
    title: "Why the coach says \"Eva 4\"",
    body:
      "The coach answers in the phonetic alphabet used at every blind chess " +
      "tournament: Anna, Bella, Cesar, David, Eva, Felix, Gustav, Hector for the " +
      "files a to h. It exists because \"b\" and \"d\" and \"e\" sound alike across " +
      "a table. You can speak it too, but you do not have to — say it whichever " +
      "way you like and the coach will follow.",
    tryCommand: { label: "Try it for me: play Cesar 4", command: "Cesar 4" },
  },
  {
    title: "Four keys worth knowing",
    body:
      "D describes the whole board. W asks the coach why the last move was good " +
      "or bad. K reads both clocks. I opens the full phonetic guide. Press " +
      "question mark at any time for every shortcut.",
  },
];

interface FirstRunProps {
  onClose: () => void;
  /** Runs a spoken command through the same path the text box uses. */
  onTryCommand: (command: string) => void;
}

export function FirstRun({ onClose, onTryCommand }: FirstRunProps) {
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = useCallback(() => {
    markFirstRunSeen();
    onClose();
  }, [onClose]);

  // Focus in on mount, and back out on unmount. Same contract as the other
  // dialogs in the app, so keyboard behaviour is not a special case here.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, []);

  // Speak each step as it arrives. This is the reason the tutorial works at
  // all for the primary audience: the dialog is not something they have to
  // find, it is something they are told.
  //
  // Focus deliberately does NOT move to the heading here. Doing that is the
  // textbook way to announce new dialog content, but the live region above
  // already delivers it, and moving focus meant every press of Next threw the
  // keyboard user off the button — they had to Tab back to it for all three
  // steps. Announce the content, leave the hands where they are.
  useEffect(() => {
    announce(`Step ${step + 1} of ${STEPS.length}. ${current.title}. ${current.body}`);
  }, [step, current]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        announce("Intro skipped. Press question mark any time for the shortcuts.");
        finish();
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
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [finish]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        aria-describedby="first-run-body"
        tabIndex={-1}
        className="panel-float w-full max-w-lg p-6 focus:outline-none"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          Getting started · {step + 1} of {STEPS.length}
        </p>

        <h2
          id="first-run-title"
          className="mt-1 font-display text-2xl font-semibold tracking-tight"
        >
          {current.title}
        </h2>

        <p id="first-run-body" className="mt-3 text-sm leading-relaxed text-fg">
          {current.body}
        </p>

        {current.tryCommand && (
          <button
            type="button"
            onClick={() => onTryCommand(current.tryCommand!.command)}
            className="mt-4 w-full rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm font-medium hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {current.tryCommand.label}
          </button>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              announce("Intro skipped. Press question mark any time for the shortcuts.");
              finish();
            }}
            className="rounded-lg px-3 py-2 text-sm text-fg-muted underline decoration-dotted underline-offset-4 hover:text-fg focus-visible:outline focus-visible:outline-2"
          >
            Skip <span className="font-mono text-xs">(Esc)</span>
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg focus-visible:outline focus-visible:outline-2"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {isLast ? "Start playing" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
