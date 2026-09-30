// ============================================================
// chess.voice — how long the player actually waited
//
// Contract: contracts/latency-measurement.md
//
// AssemblyAI's guidance on this is blunt: "measure end to end, not per layer",
// because per-layer numbers hide the network transit and serialisation between
// the layers, which is where the time often goes. So the number this module
// leads with is the whole path a player waits through — they stopped speaking,
// and then the board changed.
//
// For chess that framing matters more than usual. A sighted player glances at
// the board and knows. A blind player's alternative has been a screen reader
// walking a table of squares. `timeToMove` is the first honest measurement of
// what replaces that glance, which is why it is the headline rather than
// `timeToTranscript` — a fast transcript that has not moved a piece yet has not
// told anybody anything.
//
// This module does no timing of its own. It is handed `performance.now()`
// stamps by voice-agent.ts, where the events land. Keeping it a pure ledger is
// what makes the arithmetic testable without a socket.
// ============================================================

export type Phase =
  | 'speechEnd'
  | 'transcriptFinal'
  | 'toolCall'
  | 'moveApplied'
  | 'firstReplyAudio';

export interface TurnLatency {
  turnId: string;
  /** performance.now() at the moment the player stopped speaking. */
  speechEnd: number;
  /** ms from speechEnd to the final transcript. */
  timeToTranscript?: number;
  /** ms from speechEnd to the board changing. The headline. */
  timeToMove?: number;
  /** ms from speechEnd to the first audio of the reply. */
  timeToFirstAudio?: number;
  /** True once the reply has begun — the player is no longer waiting. */
  complete: boolean;
}

export interface Stats {
  /** null, never 0, when nothing has been measured: 0ms is a claim. */
  p50: number | null;
  p95: number | null;
  n: number;
}

export interface LatencySummary {
  count: number;
  timeToTranscript: Stats;
  timeToMove: Stats;
  timeToFirstAudio: Stats;
}

/** Turns retained. A long session should not grow without bound, and older
 *  turns stop being representative once conditions change anyway. */
export const CAPACITY = 50;

const EMPTY_STATS: Stats = { p50: null, p95: null, n: 0 };

/**
 * Nearest-rank percentile. Deliberately not interpolated: a real session yields
 * tens of samples, and interpolating between two of them reports a precision
 * the sample does not contain.
 */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

function statsOf(values: number[]): Stats {
  if (values.length === 0) return { ...EMPTY_STATS };
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), n: sorted.length };
}

export class LatencyLedger {
  private turns = new Map<string, TurnLatency>();
  /** Insertion order, so eviction is oldest-first without sorting. */
  private order: string[] = [];

  /**
   * Record a phase for a turn.
   *
   * Every guard here exists because the alternative is a plausible-looking
   * number that is wrong, and a wrong latency figure in a submission is worse
   * than no figure at all.
   */
  mark(turnId: string, phase: Phase, at: number): void {
    // Case 6: a non-finite stamp must never reach the arithmetic.
    if (!Number.isFinite(at)) return;

    if (phase === 'speechEnd') {
      // Case 14: the first speechEnd wins; a second does not restart the turn.
      if (this.turns.has(turnId)) return;
      this.turns.set(turnId, { turnId, speechEnd: at, complete: false });
      this.order.push(turnId);
      // Case 11: bounded memory.
      while (this.order.length > CAPACITY) {
        const evicted = this.order.shift();
        if (evicted !== undefined) this.turns.delete(evicted);
      }
      return;
    }

    const turn = this.turns.get(turnId);
    // A phase for a turn we never saw start is unmeasurable, not zero.
    if (!turn) return;

    // Case 5: sockets can deliver out of order. A phase that appears to precede
    // the start of the turn is bad data, not a negative duration.
    const elapsed = at - turn.speechEnd;
    if (elapsed < 0) return;

    const rounded = Math.round(elapsed);

    switch (phase) {
      case 'transcriptFinal':
        // Case 4: first wins throughout — reply.audio in particular is chunked,
        // and only the first chunk is when the player started hearing an answer.
        if (turn.timeToTranscript === undefined) turn.timeToTranscript = rounded;
        break;
      case 'toolCall':
        // Recorded for completeness; the player does not experience this
        // boundary, so it derives no reported metric of its own.
        break;
      case 'moveApplied':
        if (turn.timeToMove === undefined) turn.timeToMove = rounded;
        break;
      case 'firstReplyAudio':
        if (turn.timeToFirstAudio === undefined) {
          turn.timeToFirstAudio = rounded;
          turn.complete = true;
        }
        break;
    }
  }

  /** The most recently started turn, or null. */
  last(): TurnLatency | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const turn = this.turns.get(this.order[i]);
      if (turn) return { ...turn };
    }
    return null;
  }

  /** The most recent turn that actually produced a move. */
  lastWithMove(): TurnLatency | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const turn = this.turns.get(this.order[i]);
      if (turn?.timeToMove !== undefined) return { ...turn };
    }
    return null;
  }

  all(): TurnLatency[] {
    return this.order
      .map((id) => this.turns.get(id))
      .filter((t): t is TurnLatency => t !== undefined)
      .map((t) => ({ ...t }));
  }

  /**
   * Aggregate. Each metric counts only the turns that produced it — case 13:
   * a question with no move must not drag `timeToMove` toward zero, and it must
   * not inflate its sample size either.
   */
  summary(): LatencySummary {
    const turns = this.all();
    const pick = (f: (t: TurnLatency) => number | undefined) =>
      turns.map(f).filter((v): v is number => typeof v === 'number');

    return {
      count: turns.length,
      timeToTranscript: statsOf(pick((t) => t.timeToTranscript)),
      timeToMove: statsOf(pick((t) => t.timeToMove)),
      timeToFirstAudio: statsOf(pick((t) => t.timeToFirstAudio)),
    };
  }

  /** performance.now() is not comparable across a reload or a fresh socket. */
  reset(): void {
    this.turns.clear();
    this.order = [];
  }
}

/**
 * One line a person can read or hear.
 *
 * Returns null rather than a placeholder when nothing has been measured — the
 * readout should be absent, not display a zero that looks like a result.
 */
export function describeLatency(summary: LatencySummary, last: TurnLatency | null): string | null {
  const headline = last?.timeToMove ?? last?.timeToFirstAudio;
  if (headline === undefined) return null;

  const what = last?.timeToMove !== undefined ? 'voice to move' : 'voice to reply';
  const p50 = summary.timeToMove.p50 ?? summary.timeToFirstAudio.p50;
  const n = summary.timeToMove.n || summary.timeToFirstAudio.n;

  if (p50 === null || n < 2) return `Last turn: ${what} ${headline} ms.`;
  return `Last turn: ${what} ${headline} ms. Median ${p50} ms over ${n} turns.`;
}

/**
 * Structured stage-boundary log (AGENTS.md rule 5).
 *
 * The voice path crosses five boundaries between a player speaking and the
 * board changing, and until now none of them logged anything structured — a
 * slow turn was "somewhere in the app". One object per boundary, with the turn
 * id, makes a scattered delay traceable to a stage.
 */
export function stageLatency(stage: string, turnId: string, extra?: Record<string, unknown>): void {
  if (typeof console === 'undefined') return;
  console.log(
    JSON.stringify({ ch: 'latency', stage, turnId, t: Math.round(performance.now()), ...extra }),
  );
}
