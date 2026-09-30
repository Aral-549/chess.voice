# lablab.ai submission - copy/paste fields

Rewritten 2026-09-30. Every number here is checked against the code as pushed:
618 tests, 30 files, 18 tools, zero axe-core WCAG violations across five states
of the app. No latency figure appears anywhere, because no session has been
measured yet and an invented one is the single easiest thing for a judge to
disprove.

---

## Live URL

```
https://chess-voice-weld.vercel.app
```

Verified on the deployed build: /api/token mints a real AssemblyAI token from
production, axe-core reports zero WCAG violations on both desktop and phone,
and the board contributes zero tab stops with every piece named in IBCA.

---

## Project title

```
VoiceChessmate
```

---

## Short description

Limit 255. This is 233.

```
Chess played entirely by voice. Say your move in the IBCA phonetics blind players already use, ask why a move was bad and hear the engine's own evaluation, or play blindfold. Built on AssemblyAI's Voice Agent API with 18 typed tools.
```

---

## Long description

Minimum 100 words, maximum 2000 characters. This is 1935 characters,
345 words.

```
An estimated 43 million people are blind and 295 million have moderate to severe visual impairment. Chess is one of the few games they play on completely equal terms, because the game itself needs no sight. The software does. Mainstream platforms are built around a drag and drop board, so a screen reader reads out 64 empty cells. Chess.com has been asked for accessibility for over a decade. Lichess built a real blind mode, and it still expects you to type your moves and run a screen reader.

VoiceChessmate gets the board out of the way. You hold one key, say "knight to Felix 3", and the coach plays it and says what changed. Ask why a move was bad and you get the engine's own number: "That was a blunder. Queen to Felix 7 gives up about 7.8 pawns. Knight to Cesar 3 was stronger." It says what you lost and what was better, because it can compute both. It will not claim a tactic it cannot verify.

Moves are spoken in the IBCA alphabet used at blind tournaments: Anna, Bella, Cesar, David, Eva, Felix, Gustav, Hector. That alphabet exists because B, D, E and G sound nearly identical over a microphone, and that is exactly the alphabet chess uses. A misheard letter is not an error message here. It is a legal, different, losing move. So when the match is not confident, the agent reads back the real legal options instead of guessing. A sighted player undoes a wrong move in a second. A blind player might not notice for several moves.

Blindfold mode hides the position and scores you on naming pieces that are not there. Hands free mode listens continuously and confirms each move first.

Audio streams as 24kHz PCM16 over one WebSocket to AssemblyAI's Voice Agent API, carrying speech to text, turn detection, the model and the voice on one connection. The agent acts through 18 typed tools run against a real minimax engine, never a description of the board. 618 tests cover it, and axe-core reports zero WCAG violations.
```

---

## Technologies used

The field is a tag list of AI technologies, so search it for "assembly" first.
If there is a free-text option, the accurate entry is:

```
AssemblyAI Voice Agent API
```

Supporting stack, if the field accepts more: Next.js, React, TypeScript,
Tailwind CSS, chess.js, Web Audio API, Supabase, Vercel.

Do not tag a specific language model as a product technology. The Voice Agent
API handles its own model routing and this project does not select one, so
naming a model is a claim that cannot be supported.

---

## Categories

Lead with accessibility. It is the argument the whole submission rests on.
Education or gaming second, depending on what the form offers.

---

## What is deliberately not claimed

- **No latency number.** The instrumentation ships (contracts/latency-measurement.md,
  src/lib/latency.ts, 32 tests) and assets/latency/REPORT.md documents the method
  and the caveats, but no run has been collected.
- **No comparison to other speech APIs.** None were measured.
- **No model name.** See above.
