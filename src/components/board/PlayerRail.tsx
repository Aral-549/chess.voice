"use client";

// ============================================================
// VoiceChessmate — the column beside the board
//
// Clock, identity and captured material for one side. This lives to the left
// and right of the board because the space was already there and empty, and
// because stacking it above and below was pushing the board smaller — the
// board is the thing sighted players actually look at.
//
// Nothing here is the only route to anything: the clock is spoken on request,
// captured material is in `describe_board`, and both rails collapse under the
// board on narrow screens.
// ============================================================

import { cn } from "@/lib/utils";
import { PIECE_GLYPH, describeCaptured } from "@/lib/captured";
import type { PieceSymbol } from "@/types";

interface PlayerRailProps {
  /** Which side this rail belongs to. */
  side: "white" | "black";
  name: string;
  subtitle: string;
  /** Pieces this player has taken. */
  captured: PieceSymbol[];
  /** Material lead in pawns; only shown when positive. */
  advantage: number;
  /** Formatted clock, or null in casual games. */
  clock: string | null;
  isTurn: boolean;
  isLowTime?: boolean;
  isUrgent?: boolean;
  thinking?: boolean;
}

export function PlayerRail({
  side,
  name,
  subtitle,
  captured,
  advantage,
  clock,
  isTurn,
  isLowTime,
  isUrgent,
  thinking,
}: PlayerRailProps) {
  const glyph = side === "white" ? "♔" : "♚";

  return (
    <aside
      aria-label={`${name}, ${subtitle}`}
      className={cn(
        "flex shrink-0 flex-col gap-3 rounded-xl border p-3 transition-colors",
        "w-full lg:w-[168px] xl:w-[184px]",
        isTurn ? "border-accent/45 bg-accent/[0.06]" : "border-border/50 bg-bg-raised/30",
      )}
    >
      {/* Identity */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm",
            side === "white"
              ? "bg-stone-100 border-stone-300 text-stone-900"
              : "bg-stone-900 border-stone-700 text-stone-100",
          )}
        >
          {glyph}
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-fg">{name}</div>
          <div className="truncate text-[10px] text-fg-muted">{subtitle}</div>
        </div>
      </div>

      {/* Clock. Tabular numerals so the digits do not jitter each second. */}
      {clock && (
        <div
          role="timer"
          aria-label={`${name} clock`}
          className={cn(
            "rounded-lg border px-2 py-1.5 text-center font-mono text-xl font-bold tabular-nums tracking-wider transition-colors",
            isTurn
              ? isUrgent
                ? "border-rose-500/60 bg-rose-500/15 text-rose-400"
                : isLowTime
                  ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                  : "border-accent/40 bg-accent/10 text-accent"
              : "border-border/40 bg-bg/40 text-fg-muted",
          )}
        >
          {clock}
        </div>
      )}

      {/* Turn state */}
      <div className="text-[10px] min-h-[1.1rem]">
        {isTurn ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-medium text-accent">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
            {thinking ? "Thinking…" : "To play"}
          </span>
        ) : (
          <span className="text-fg-muted">Waiting</span>
        )}
      </div>

      {/* Captured material */}
      <div className="mt-auto">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-fg-muted">Captured</span>
          {advantage > 0 && (
            <span className="font-mono text-[11px] font-semibold text-accent">+{advantage}</span>
          )}
        </div>

        {/* The glyph row is decorative; the sentence below it is what a screen
            reader gets, because a run of ♟♟♞ announces as noise. */}
        <p
          aria-hidden="true"
          className={cn(
            "flex flex-wrap gap-x-0.5 gap-y-1 text-lg leading-none",
            side === "white" ? "text-stone-300" : "text-stone-500",
          )}
        >
          {captured.length === 0 ? (
            <span className="text-[11px] leading-normal text-fg-muted">None</span>
          ) : (
            captured.map((piece, i) => <span key={`${piece}-${i}`}>{PIECE_GLYPH[piece]}</span>)
          )}
        </p>
        <span className="sr-only">
          {name} has captured {describeCaptured(captured)}
          {advantage > 0 ? `, and is ${advantage} ${advantage === 1 ? "pawn" : "pawns"} ahead` : ""}.
        </span>
      </div>
    </aside>
  );
}
