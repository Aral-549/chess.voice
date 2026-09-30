"use client";

// ============================================================
// chess.voice — the latency readout
//
// Off by default, toggled with L. Two reasons it is not always on:
//
// 1. It is instrumentation, not gameplay. A number that changes every turn in
//    the corner of a chess board is a distraction for the player and a false
//    priority for a spectator.
// 2. It must never auto-announce. Speaking "412 milliseconds" into the polite
//    live region after every move would bury the thing the player actually
//    needs to hear — what the opponent played. It is announced once when
//    toggled on, and read on demand, and never otherwise.
//
// It polls rather than driving state from the hook, so a number updating
// several times a turn cannot re-render the board.
// ============================================================

import { useEffect, useState } from "react";
import { describeLatency, type LatencyLedger, type LatencySummary, type TurnLatency } from "@/lib/latency";

interface LatencyReadoutProps {
  ledger: LatencyLedger;
  visible: boolean;
}

const POLL_MS = 500;

export function LatencyReadout({ ledger, visible }: LatencyReadoutProps) {
  const [snapshot, setSnapshot] = useState<{ summary: LatencySummary; last: TurnLatency | null } | null>(
    null,
  );

  useEffect(() => {
    if (!visible) return;
    const read = () => setSnapshot({ summary: ledger.summary(), last: ledger.lastWithMove() ?? ledger.last() });
    read();
    const id = setInterval(read, POLL_MS);
    return () => clearInterval(id);
  }, [visible, ledger]);

  if (!visible) return null;

  const line = snapshot ? describeLatency(snapshot.summary, snapshot.last) : null;
  const move = snapshot?.summary.timeToMove;

  return (
    <div className="w-full max-w-xs rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-fg-muted">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-fg">Turn latency</span>
        <span className="text-[10px]">L to hide</span>
      </div>

      {line ? (
        <>
          <p className="mt-1 text-fg">{line}</p>
          {move && move.n >= 2 && move.p95 !== null && (
            <p className="mt-0.5">
              p95 {move.p95} ms · n={move.n}
            </p>
          )}
        </>
      ) : (
        // Deliberately not "0 ms" or a dash that reads as a measurement.
        <p className="mt-1">No turns measured yet — speak a move.</p>
      )}

      <p className="mt-1.5 text-[10px] leading-snug">
        Measured in this browser, end to end: from you releasing J to the board
        changing. Includes your own network and machine.
      </p>
    </div>
  );
}
