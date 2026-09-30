"use client";

// ============================================================
// chess.voice — save and resume
//
// Losing a game in progress costs a blind player the position they were
// holding in memory. Resume is an accessibility feature, so the rules here are
// stricter than "sync some state":
//
//   - Saving is silent and never blocks a move.
//   - A save failure is announced once, not on every retry.
//   - Resume is announced through a live region, because a visual banner
//     reaches nobody who needs this most.
//
// Contract: contracts/game-persistence.md
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { announce } from "@/lib/announce";
import type { Difficulty } from "@/types";

const SAVE_DEBOUNCE_MS = 1200;

export interface ResumePayload {
  id: string;
  pgn: string;
  fen: string;
  move_count: number;
  difficulty: Difficulty;
  time_control: string;
}

interface Snapshot {
  pgn: string;
  isGameOver: boolean;
}

export interface PersistenceArgs {
  snapshot: Snapshot;
  difficulty: Difficulty;
  timeControl: string;
  /** Verdict for a finished game, or null while it is still running. */
  outcome: "win" | "loss" | "draw" | null;
  endReason?: string;
  /** Called once, early, if there is a game to resume. */
  onResume: (resume: ResumePayload) => void;
}

export function useGamePersistence(args: PersistenceArgs) {
  const gameIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureAnnouncedRef = useRef(false);
  const completedRef = useRef(false);
  const lastSavedPgnRef = useRef<string>("");

  const [degraded, setDegraded] = useState(false);

  const { snapshot, outcome } = args;

  // Keep the newest values available to the debounced save without making it
  // a dependency of every effect. Written in an effect, not during render: a
  // render can be discarded, which would leave the ref ahead of the committed
  // tree. The debounce is far longer than the commit, so the save always reads
  // current values.
  const latest = useRef(args);
  useEffect(() => {
    latest.current = args;
  });

  const save = useCallback(async (complete: boolean) => {
    const current = latest.current;
    const pgn = current.snapshot.pgn ?? "";

    // Nothing has changed, and this is not the completion write.
    if (!complete && pgn === lastSavedPgnRef.current) return;
    if (!pgn.trim() && !gameIdRef.current) return;

    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gameIdRef.current,
          pgn,
          difficulty: current.difficulty,
          timeControl: current.timeControl,
          status: complete ? "complete" : "in_progress",
          result: complete ? current.outcome : undefined,
          endReason: complete ? current.endReason : undefined,
        }),
      });

      if (!res.ok) throw new Error(String(res.status));

      const data = await res.json();
      if (data.id) gameIdRef.current = data.id;
      if (data.degraded) setDegraded(true);
      lastSavedPgnRef.current = pgn;
      failureAnnouncedRef.current = false;
    } catch {
      // Case 14: play must never depend on the database. Announce once so a
      // player knows their progress is not being kept, then stay quiet.
      if (!failureAnnouncedRef.current) {
        failureAnnouncedRef.current = true;
        setDegraded(true);
        announce(
          "Your game is not being saved right now. You can keep playing.",
          "polite",
        );
      }
    }
  }, []);

  // --- Resume, once, on mount -------------------------------------------
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/games", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.degraded) setDegraded(true);

        const resume: ResumePayload | null = data.resume ?? null;
        // Case 5: no unfinished game is a normal answer, not an error.
        if (!resume || !resume.pgn?.trim()) return;

        gameIdRef.current = resume.id;
        lastSavedPgnRef.current = resume.pgn;
        latest.current.onResume(resume);

        // The announcement is the feature. A sighted player sees the board
        // repopulate; everyone else needs to be told.
        announce(
          `Resuming your game from move ${Math.ceil(resume.move_count / 2)}. ` +
            `${resume.move_count} moves played.`,
          "polite",
        );
      } catch {
        /* offline — start fresh, silently */
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately mount-only: resuming twice would clobber live play.
  }, []);

  // --- Debounced save on every position change ---------------------------
  useEffect(() => {
    if (completedRef.current) return;
    if (!snapshot.pgn?.trim()) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(false), SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [snapshot.pgn, save]);

  // --- Completion: write immediately, exactly once ------------------------
  useEffect(() => {
    if (!snapshot.isGameOver || !outcome) return;
    if (completedRef.current) return;
    completedRef.current = true;

    if (timerRef.current) clearTimeout(timerRef.current);
    void save(true);
  }, [snapshot.isGameOver, outcome, save]);

  // --- A new game clears the record so the next save creates a new row ----
  const startNewGame = useCallback(() => {
    gameIdRef.current = null;
    lastSavedPgnRef.current = "";
    completedRef.current = false;
    failureAnnouncedRef.current = false;
  }, []);

  // Best-effort flush when the tab goes away mid-game.
  useEffect(() => {
    const flush = () => {
      if (completedRef.current) return;
      const pgn = latest.current.snapshot.pgn;
      if (!pgn?.trim() || pgn === lastSavedPgnRef.current) return;
      navigator.sendBeacon?.(
        "/api/games",
        new Blob(
          [
            JSON.stringify({
              id: gameIdRef.current,
              pgn,
              difficulty: latest.current.difficulty,
              timeControl: latest.current.timeControl,
              status: "in_progress",
            }),
          ],
          { type: "application/json" },
        ),
      );
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return { degraded, startNewGame };
}
