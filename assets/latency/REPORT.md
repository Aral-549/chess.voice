# Turn latency — method and results

> **Status: method fixed, instrumentation shipped, live numbers not yet
> collected.** This file deliberately contains no measurements. Everything
> below describes how they will be produced and what they will and will not
> mean. Numbers get pasted in only after a real session, by the procedure in
> "Collecting a run".

## Why measure this at all

AssemblyAI's own guidance is that a voice agent lives or dies on the 300 ms
rule — the natural gap between speakers in human conversation — and that the
way to measure it is **end to end, not per layer**, because per-layer figures
hide the network transit and serialisation between the layers.

For this project the framing is sharper than "is the agent snappy". A sighted
player glances at the board and knows where everything is in about a tenth of a
second. A blind player's alternative has been a screen reader walking a table of
squares, or asking the person opposite. **Time-to-move is a measurement of what
replaces that glance.** That is the number this project leads with, and as far
as we know nobody has published it for voice chess.

## What is measured

Five marks per turn, all `performance.now()` in the player's own browser:

| Mark | Taken when |
|---|---|
| `speechEnd` | the player releases **J** (or server VAD ends the turn) |
| `transcriptFinal` | the final `transcript.user` arrives |
| `toolCall` | the agent's `tool.call` arrives |
| `moveApplied` | the board has actually changed |
| `firstReplyAudio` | the first `reply.audio` chunk arrives |

Three reported intervals, all from `speechEnd`:

- **`timeToMove`** — voice in, board changed. **The headline.**
- `timeToTranscript` — voice in, words recognised.
- `timeToFirstAudio` — voice in, the player starts hearing an answer. This is
  the figure comparable to AssemblyAI's published ~1 s for a full
  conversational turn.

Contract: [`contracts/latency-measurement.md`](../../contracts/latency-measurement.md).
Implementation: `src/lib/latency.ts`, 32 tests, five mutation checks.

## What these numbers may NOT claim

Stated here because a latency figure in a hackathon submission is a claim, and
an unqualified one is a bad claim.

1. **They are single-machine, client-side, end-to-end.** They include the
   player's own network path, CPU and audio stack. They are not a datacentre
   benchmark.
2. **`timeToTranscript` under push-to-talk is not a measure of AssemblyAI's
   endpointing.** `speechEnd` is when the player let go of J — a human
   decision. Only hands-free mode (server VAD) measures endpointing, and runs
   in that mode must be labelled separately.
3. **Nothing here compares AssemblyAI to any other provider.** No competitor
   was measured, so no comparison may be drawn from these numbers.
4. **Sample size travels with every figure.** A median over four turns is not a
   performance characteristic. Report `n` or do not report the median.
5. `timeToMove` includes this project's own work — fuzzy move matching, the
   confidence gate and a minimax reply — not only AssemblyAI's. That is the
   point: it is what the player waits for. But it means a slow number is as
   likely to be our engine as their API, which is exactly why the breakdown is
   recorded alongside it.

## Collecting a run

The instrumentation is always on; only the readout is hidden.

1. `npm run build && npm run start`, open the app, play a normal game aloud —
   at least 20 turns, mixing moves with questions ("what are my threats?").
2. Press **L** at any point to see and hear the running figures.
3. Every stage boundary also emits one structured line to the console:
   `{"ch":"latency","stage":"move.applied","turnId":"turn-7","t":48213}`
   Save the console output to a file.
4. `node scripts/latency-report.mjs <saved-console-log>` prints the table to
   paste below, computed with the same nearest-rank percentile the app uses.

Record alongside any results: date, browser and version, OS, approximate
connection, whether the session was push-to-talk or hands-free, and `n`.

## Results

_Not yet collected. See status note at the top of this file._

| Metric | p50 | p95 | n |
|---|---|---|---|
| Time to move (voice → board changed) | — | — | — |
| Time to transcript | — | — | — |
| Time to first reply audio | — | — | — |

Conditions: _(date, browser, OS, network, mode)_
