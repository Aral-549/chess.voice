// ============================================================
// Contract: contracts/latency-measurement.md — all 14 behaviour cases.
//
// Written as an ADVERSARIAL pass, not a confirming one. The brief was to find
// inputs that make this module report a number that is wrong, because a wrong
// latency figure published in a submission is worse than publishing none: it
// is a claim, and someone may check it.
//
// The invariant block at the end is the part that must survive any rewrite —
// no NaN, no Infinity, no negative duration, and never 0 standing in for
// "nothing measured".
// ============================================================

import { describe, it, expect } from 'vitest';
import { LatencyLedger, percentile, describeLatency, CAPACITY } from '../latency';

/** Drive a whole turn in one call. `undefined` means that phase never fired. */
function turn(
  l: LatencyLedger,
  id: string,
  marks: Partial<Record<'speechEnd' | 'transcriptFinal' | 'toolCall' | 'moveApplied' | 'firstReplyAudio', number>>,
) {
  for (const [phase, at] of Object.entries(marks)) {
    if (at !== undefined) l.mark(id, phase as never, at);
  }
}

describe('contract cases 1-7 — a single turn', () => {
  it('case 1: the normal path', () => {
    const l = new LatencyLedger();
    turn(l, 't1', {
      speechEnd: 1000,
      transcriptFinal: 1300,
      toolCall: 1350,
      moveApplied: 1400,
      firstReplyAudio: 1800,
    });
    const t = l.last()!;
    expect(t.timeToTranscript).toBe(300);
    expect(t.timeToMove).toBe(400);
    expect(t.timeToFirstAudio).toBe(800);
    expect(t.complete).toBe(true);
  });

  it('case 2: a turn in flight has no derived values', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 1000 });
    const t = l.last()!;
    expect(t.timeToTranscript).toBeUndefined();
    expect(t.timeToMove).toBeUndefined();
    expect(t.complete).toBe(false);
  });

  it('case 3: a question produces no timeToMove', () => {
    // "What's on the clock?" is a turn, not a move. It must not contribute a
    // zero to the move statistic, which would flatter the headline number.
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 1000, transcriptFinal: 1300, firstReplyAudio: 1700 });
    const t = l.last()!;
    expect(t.timeToTranscript).toBe(300);
    expect(t.timeToMove).toBeUndefined();
    expect(t.timeToFirstAudio).toBe(700);
    expect(l.summary().timeToMove).toEqual({ p50: null, p95: null, n: 0 });
  });

  it('case 4: a repeated phase keeps the first — reply.audio is chunked', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 1000 });
    l.mark('t1', 'firstReplyAudio', 1500);
    l.mark('t1', 'firstReplyAudio', 1600);
    l.mark('t1', 'firstReplyAudio', 1700);
    expect(l.last()!.timeToFirstAudio).toBe(500);
  });

  it('case 5: a phase before speechEnd is discarded, not negative', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 1000 });
    l.mark('t1', 'moveApplied', 900); // out-of-order delivery
    expect(l.last()!.timeToMove).toBeUndefined();
  });

  it('case 6: non-finite stamps never reach the arithmetic', () => {
    const l = new LatencyLedger();
    for (const bad of [NaN, Infinity, -Infinity]) {
      l.mark(`bad-${bad}`, 'speechEnd', bad);
    }
    expect(l.summary().count).toBe(0);

    turn(l, 't1', { speechEnd: 1000 });
    for (const bad of [NaN, Infinity, -Infinity]) {
      l.mark('t1', 'moveApplied', bad);
    }
    expect(l.last()!.timeToMove).toBeUndefined();
  });

  it('case 7: a backwards clock is not a 0ms turn', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 5000 });
    l.mark('t1', 'moveApplied', 4000);
    expect(l.last()!.timeToMove).toBeUndefined();
    expect(l.summary().timeToMove.n).toBe(0);
  });

  it('a phase for a turn that never started is ignored', () => {
    const l = new LatencyLedger();
    l.mark('never-started', 'moveApplied', 1000);
    expect(l.summary().count).toBe(0);
    expect(l.last()).toBeNull();
  });
});

describe('contract cases 8-14 — aggregation', () => {
  it('case 8: nearest-rank percentiles', () => {
    const l = new LatencyLedger();
    [100, 200, 300, 400].forEach((d, i) =>
      turn(l, `t${i}`, { speechEnd: 0, moveApplied: d }),
    );
    expect(l.summary().timeToMove).toEqual({ p50: 200, p95: 400, n: 4 });
  });

  it('case 9: a single sample is its own p50 and p95', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 0, moveApplied: 250 });
    expect(l.summary().timeToMove).toEqual({ p50: 250, p95: 250, n: 1 });
  });

  it('case 10: nothing measured reports null, never 0', () => {
    // The whole point. A readout showing "0 ms" would be a spectacular claim.
    const s = new LatencyLedger().summary();
    expect(s.count).toBe(0);
    for (const metric of [s.timeToTranscript, s.timeToMove, s.timeToFirstAudio]) {
      expect(metric).toEqual({ p50: null, p95: null, n: 0 });
      expect(metric.p50).not.toBe(0);
    }
  });

  it('case 11: the ledger is bounded and keeps the newest', () => {
    const l = new LatencyLedger();
    for (let i = 0; i < CAPACITY + 20; i++) {
      turn(l, `t${i}`, { speechEnd: 0, moveApplied: i + 1 });
    }
    const all = l.all();
    expect(all).toHaveLength(CAPACITY);
    expect(all[0].turnId).toBe('t20'); // the first 20 were evicted
    expect(all.at(-1)!.turnId).toBe(`t${CAPACITY + 19}`);
  });

  it('case 12: reset empties everything', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 0, moveApplied: 100 });
    l.reset();
    expect(l.summary().count).toBe(0);
    expect(l.last()).toBeNull();
    expect(l.summary().timeToMove.p50).toBeNull();
  });

  it('case 13: each metric counts only the turns that produced it', () => {
    const l = new LatencyLedger();
    turn(l, 'move', { speechEnd: 0, transcriptFinal: 200, moveApplied: 400, firstReplyAudio: 900 });
    turn(l, 'question', { speechEnd: 0, transcriptFinal: 300, firstReplyAudio: 700 });
    const s = l.summary();
    expect(s.count).toBe(2);
    expect(s.timeToMove.n).toBe(1); // only the turn that moved
    expect(s.timeToTranscript.n).toBe(2);
    expect(s.timeToFirstAudio.n).toBe(2);
  });

  it('case 14: a second speechEnd does not restart or duplicate the turn', () => {
    const l = new LatencyLedger();
    l.mark('t1', 'speechEnd', 1000);
    l.mark('t1', 'speechEnd', 2000);
    l.mark('t1', 'moveApplied', 1400);
    expect(l.summary().count).toBe(1);
    expect(l.last()!.timeToMove).toBe(400); // measured from the first, not the second
  });

  it('overlapping turns never mix marks (barge-in)', () => {
    const l = new LatencyLedger();
    l.mark('a', 'speechEnd', 1000);
    l.mark('b', 'speechEnd', 1100);
    l.mark('a', 'moveApplied', 1500); // 500
    l.mark('b', 'moveApplied', 1300); // 200
    const all = l.all();
    expect(all.find((t) => t.turnId === 'a')!.timeToMove).toBe(500);
    expect(all.find((t) => t.turnId === 'b')!.timeToMove).toBe(200);
  });

  it('lastWithMove skips turns that never moved', () => {
    const l = new LatencyLedger();
    turn(l, 'moved', { speechEnd: 0, moveApplied: 300 });
    turn(l, 'asked', { speechEnd: 0, firstReplyAudio: 500 });
    expect(l.last()!.turnId).toBe('asked');
    expect(l.lastWithMove()!.turnId).toBe('moved');
  });

  it('returned turns are copies — a caller cannot corrupt the ledger', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 0, moveApplied: 300 });
    const t = l.last()!;
    t.timeToMove = 1;
    expect(l.last()!.timeToMove).toBe(300);
  });
});

describe('percentile', () => {
  it('is nearest-rank, not interpolated', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([10], 95)).toBe(10);
  });

  it('never indexes out of range at either end', () => {
    const xs = [1, 2, 3];
    for (const p of [0, 1, 50, 99, 100]) {
      expect(xs).toContain(percentile(xs, p));
    }
  });

  it('is null for an empty sample', () => {
    expect(percentile([], 50)).toBeNull();
  });
});

describe('describeLatency — the spoken and shown line', () => {
  it('is null when nothing has been measured', () => {
    const l = new LatencyLedger();
    expect(describeLatency(l.summary(), l.last())).toBeNull();
  });

  it('names the move path when a move was made', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 0, moveApplied: 412 });
    const line = describeLatency(l.summary(), l.last())!;
    expect(line).toContain('voice to move');
    expect(line).toContain('412');
  });

  it('falls back to the reply path for a question', () => {
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 0, firstReplyAudio: 700 });
    expect(describeLatency(l.summary(), l.last())!).toContain('voice to reply');
  });

  it('withholds a median until there is more than one sample', () => {
    // One turn is not a distribution, and "median 412 over 1 turn" reads as a
    // claim about typical performance that a single sample cannot support.
    const l = new LatencyLedger();
    turn(l, 't1', { speechEnd: 0, moveApplied: 412 });
    expect(describeLatency(l.summary(), l.last())!).not.toMatch(/median/i);

    turn(l, 't2', { speechEnd: 0, moveApplied: 380 });
    const line = describeLatency(l.summary(), l.last())!;
    expect(line).toMatch(/median/i);
    expect(line).toContain('2 turns');
  });

  it('always states the sample size alongside a median', () => {
    const l = new LatencyLedger();
    for (let i = 0; i < 5; i++) turn(l, `t${i}`, { speechEnd: 0, moveApplied: 300 + i });
    expect(describeLatency(l.summary(), l.last())!).toMatch(/over \d+ turns/);
  });
});

describe('invariants — no reported number may be nonsense', () => {
  /** A deliberately hostile stream: junk stamps, reordering, repeats, gaps. */
  function hostileLedger(): LatencyLedger {
    const l = new LatencyLedger();
    const junk = [NaN, Infinity, -Infinity, -1, 0];
    for (let i = 0; i < 40; i++) {
      const id = `t${i}`;
      l.mark(id, 'speechEnd', i * 1000);
      if (i % 3) l.mark(id, 'transcriptFinal', i * 1000 + (i % 7) * 50);
      if (i % 4) l.mark(id, 'moveApplied', i * 1000 - (i % 2 ? 0 : 500)); // some go backwards
      if (i % 5) l.mark(id, 'firstReplyAudio', i * 1000 + 800);
      l.mark(id, 'moveApplied', junk[i % junk.length]);
      l.mark(id, 'transcriptFinal', i * 1000 + 10); // repeat, must be ignored
    }
    return l;
  }

  it('no duration is negative, NaN or infinite', () => {
    for (const t of hostileLedger().all()) {
      for (const v of [t.timeToTranscript, t.timeToMove, t.timeToFirstAudio]) {
        if (v === undefined) continue;
        expect(Number.isFinite(v), `${t.turnId} produced ${v}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('no statistic is NaN, and n never exceeds the turn count', () => {
    const s = hostileLedger().summary();
    for (const m of [s.timeToTranscript, s.timeToMove, s.timeToFirstAudio]) {
      if (m.p50 !== null) expect(Number.isFinite(m.p50)).toBe(true);
      if (m.p95 !== null) expect(Number.isFinite(m.p95)).toBe(true);
      expect(m.n).toBeLessThanOrEqual(s.count);
      expect(m.n).toBeGreaterThanOrEqual(0);
    }
  });

  it('p95 is never below p50', () => {
    const s = hostileLedger().summary();
    for (const m of [s.timeToTranscript, s.timeToMove, s.timeToFirstAudio]) {
      if (m.p50 !== null && m.p95 !== null) expect(m.p95).toBeGreaterThanOrEqual(m.p50);
    }
  });

  it('the spoken line never contains NaN, undefined or a negative number', () => {
    const l = hostileLedger();
    const line = describeLatency(l.summary(), l.last());
    if (line !== null) {
      expect(line).not.toMatch(/NaN|undefined|Infinity|-\d/);
    }
  });
});

describe('wiring — the marks the agent takes without a socket', () => {
  it('releasing push-to-talk starts a turn, and a move ends it', async () => {
    // These two are reachable without a connection, so the wiring between the
    // agent and the ledger can be proved offline. The three socket-driven marks
    // (transcript, tool call, reply audio) are exercised by the live run
    // documented in assets/latency/REPORT.md.
    const { VoiceAgentManager } = await import('../voice-agent');
    const agent = new VoiceAgentManager();

    expect(agent.latency.summary().count).toBe(0);

    agent.setListening(true);
    agent.setListening(false); // J released — the player starts waiting
    expect(agent.latency.summary().count).toBe(1);
    expect(agent.latency.last()!.timeToMove).toBeUndefined();

    agent.markMoveApplied();
    const t = agent.latency.last()!;
    expect(t.timeToMove).toBeDefined();
    expect(t.timeToMove).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(t.timeToMove!)).toBe(true);
  });

  it('a move with no preceding turn is not measured as anything', () => {
    // markMoveApplied() is called from the game layer on every successful move,
    // including typed ones. A typed move is not a voice turn and must not be
    // counted as a suspiciously fast one.
    return import('../voice-agent').then(({ VoiceAgentManager }) => {
      const agent = new VoiceAgentManager();
      agent.markMoveApplied();
      expect(agent.latency.summary().count).toBe(0);
      expect(agent.latency.summary().timeToMove.n).toBe(0);
    });
  });
});
