# Contract: turn latency measurement (`lib/latency.ts`)

## Purpose

Measure how long it takes to go from *the player stopping speaking* to *the
board having changed*, and report it honestly.

AssemblyAI's own guidance is explicit — *"measure end to end, not per layer,"*
because per-layer numbers hide network transit and serialisation between the
layers. So this module measures the whole path a player actually waits through,
and reports the sub-intervals only as a breakdown of that total, never as the
headline.

It owns arithmetic and bookkeeping only. It does not time anything itself: it is
handed timestamps by `voice-agent.ts`, which is where the events arrive.

## Inputs

- `mark(turnId: string, phase: Phase, at: number)` — a timestamp in
  **milliseconds from `performance.now()`**, not `Date.now()`.
  `Phase` is one of:
  | Phase | Fired when |
  |---|---|
  | `speechEnd` | the player stops speaking — J released, or server VAD ends the turn |
  | `transcriptFinal` | the final `transcript.user` for that turn arrives |
  | `toolCall` | a `tool.call` for that turn arrives |
  | `moveApplied` | the board has actually changed |
  | `firstReplyAudio` | the first `reply.audio` chunk of the answer arrives |
- `turnId` — opaque, unique per turn, allocated by the caller.

## Outputs

- `TurnLatency { turnId, speechEnd, timeToTranscript?, timeToMove?, timeToFirstAudio?, complete }`
- `summary(): { count, timeToTranscript: Stats, timeToMove: Stats, timeToFirstAudio: Stats }`
  where `Stats = { p50: number | null, p95: number | null, n: number }`

All durations are whole milliseconds, measured from `speechEnd`.

**`timeToMove` is the headline number.** It is the one that matters in chess:
voice in, board changed. `timeToFirstAudio` is the conversational figure
comparable to AssemblyAI's published ~1s per full turn.

## Behaviour cases (input → expected output)

| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | speechEnd 1000, transcriptFinal 1300, toolCall 1350, moveApplied 1400, firstReplyAudio 1800 | ttTranscript 300, ttMove 400, ttFirstAudio 800 | the normal path |
| 2 | speechEnd only | all derived values `undefined`, `complete` false | turn in flight |
| 3 | speechEnd 1000, transcriptFinal 1300, firstReplyAudio 1700, **no tool call** | ttTranscript 300, ttMove `undefined`, ttFirstAudio 700 | "what's the clock?" — a question, not a move |
| 4 | a phase marked twice for one turn | the **first** wins; later marks ignored | `reply.audio` is chunked; only the first chunk counts |
| 5 | a phase arriving before `speechEnd` | that phase is discarded, turn kept | out-of-order socket delivery |
| 6 | any mark with a non-finite `at` | ignored entirely, no NaN reaches a stat | |
| 7 | a derived duration that would be negative | clamped away — treated as not measured | a clock that went backwards is not a 0ms turn |
| 8 | 4 turns of ttMove 100, 200, 300, 400 | p50 200, p95 400 | see percentile rule below |
| 9 | 1 turn | p50 = p95 = that value, n 1 | |
| 10 | 0 turns | every stat `{p50: null, p95: null, n: 0}` | **never** 0; 0ms is a claim, null is an absence |
| 11 | more than `CAPACITY` turns | oldest dropped, newest kept | bounded memory in a long session |
| 12 | `reset()` | summary returns the empty shape of case 10 | new game, new numbers |
| 13 | turns where only some have a `moveApplied` | `timeToMove.n` counts only those | a stat's `n` is per metric, not per turn |
| 14 | a turn marked `speechEnd` twice | first wins (case 4); no duplicate turn created | |

**Percentile rule.** Nearest-rank on the sorted sample: index
`ceil(p/100 × n) - 1`, clamped to `[0, n-1]`. No interpolation — with the tens
of samples a real session produces, interpolating invents precision that is not
there.

## Edge cases that must be covered

- A turn that never completes (player cancels, connection drops) must not block
  the summary or leak — it simply contributes to no metric.
- Barge-in: a new turn can start before the previous one finished. Turns are
  keyed by `turnId`, so overlapping turns never mix marks.
- `performance.now()` is monotonic per document but **not** comparable across a
  page reload. `reset()` on reconnect.
- The summary must be cheap enough to call on every render.
- No `NaN`, no `Infinity`, and no negative duration may ever reach a caller.

## What the reported numbers may and may not claim

Stated wherever these are published:

- They are **client-side, end-to-end, single-machine** measurements: they
  include the player's own network path and hardware.
- `speechEnd` is when *this client* believes speech ended. Under manual
  push-to-talk that is the J release, which is a human decision, not an
  endpointing measurement — so `timeToTranscript` under PTT is not a measure of
  AssemblyAI's endpointing.
- They are **not** a benchmark of AssemblyAI against anything. No competitor is
  measured, so no comparison may be drawn.
- Sample size must be reported with any figure.

## Explicitly out of scope

- Deciding *when* the phases happen — `lib/voice-agent.ts` owns the events.
- Displaying the numbers — `components/voice/LatencyReadout.tsx`.
- Server-side or aggregate telemetry. Nothing here is transmitted anywhere; the
  measurements live and die in the tab.

## Status

- [x] Drafted
- [ ] Reviewed by a human
- [ ] Implementation matches this contract
- [ ] Golden tests exist for every behaviour case above
