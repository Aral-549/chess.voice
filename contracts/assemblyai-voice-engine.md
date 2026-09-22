# Contract: AssemblyAIVoiceEngine

## Purpose
Adapts `voicechessmate`'s `VoiceAgentManager` (AssemblyAI Voice Agent WebSocket)
to the `VoiceEngine` interface that `voice-chess-frontend`'s UI already depends
on, so `useVoiceChessCoach` can drive the real backend instead of
`WebSpeechVoiceEngine`.

It owns **transport and event translation only**. It does not parse moves, does
not decide what the coach says, and does not touch the chess engine — those
belong to `move-parser`/`tool-handlers` and `chess-announcer`/`chess-engine`
respectively.

**Why this is mandatory, not an upgrade:** `WebSpeechVoiceEngine` requires both
`SpeechRecognition` and `speechSynthesis`. Verified on this machine
(2026-09-16): Chromium/Brave have STT but zero TTS voices; Zen (Firefox-based)
has TTS but no `SpeechRecognition`. No installed browser has both, so the demo
engine cannot complete a single turn here.

## Inputs
- `sessionConfig`: `SessionConfig` — system prompt, greeting, `input.keyterms`
  (**max 100 items**, server rejects more), `turn_detection`, `tools`.
- `start()`: no args. Opens mic + WebSocket, mints a token via `/api/token`.
- `stop()`: no args. Ends the current listening turn (VAD finalises).
- `cancel()`: no args. Abandons the turn; no transcript is emitted.
- `speak(text, { rate? })`: text the coach should say.
- `stopSpeaking()`: barge-in; flush buffered agent audio immediately.
- Incoming server events: `session.ready`, `transcript.user.delta`,
  `transcript.user`, `reply.started`, `reply.audio`, `reply.done`,
  `tool.call`, `session.error`.

## Outputs
Events emitted to subscribers, matching `VoiceEngineEventPayload` exactly:
- `listening-start` / `listening-stop`: `undefined`
- `partial-transcript`: `{ text: string }` — non-final user speech
- `final-transcript`: `{ text: string }` — end of user turn
- `agent-speaking-start` / `agent-speaking-end`: `undefined`
- `agent-speaking-text`: `{ text: string }` — see Open Question 1
- `error`: `{ message: string }`
- `isSupported`: `boolean` — false when `getUserMedia` or `WebSocket` is absent.

## Behavior cases (input → expected output)
| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | `start()` with a valid token | `listening-start` emitted once; mic streaming as base64 PCM16 24kHz | Must not emit before `session.ready` |
| 2 | `start()` when `/api/token` returns 429 | `error` with the rate-limit message; **no** `listening-start` | Limiter is 10/min/IP |
| 3 | `start()` when mic permission denied | `error`; `isSupported` stays true (supported ≠ permitted) | |
| 4 | Server sends `transcript.user.delta` "e" then "e4" | Two `partial-transcript` events, `{text:"e"}` then `{text:"e4"}` | Never `final-transcript` |
| 5 | Server sends final user transcript "e4" | Exactly one `final-transcript` `{text:"e4"}`, then `listening-stop` | Order matters; UI parses on final |
| 6 | `reply.audio` arrives (N chunks) | `agent-speaking-start` emitted **once**, not per chunk | Chunked stream; per-chunk emit floods the UI |
| 7 | `reply.done` `status:"completed"` | `agent-speaking-end` | |
| 8 | `reply.done` `status:"interrupted"` | `agent-speaking-end` **and** playback buffer flushed | Stale audio must stop |
| 9 | `stopSpeaking()` mid-reply | Buffered audio flushed; `agent-speaking-end` | Barge-in |
| 10 | `cancel()` while listening | `listening-stop`; **no** transcript event of any kind | Distinct from `stop()` |
| 11 | `session.error` code `authentication_error` | `error`; status → error; no reconnect | Fatal |
| 12 | `session.error` code `invalid_value` | `error` emitted; session **stays open** | Non-fatal; e.g. keyterms overflow |
| 13 | WebSocket closes with code ≠ 1000/1005 | Reconnect, max 3 attempts, exponential backoff | Existing behaviour, must survive |
| 14 | `speak(text)` called | Coach audio plays | See Open Question 1 |
| 15 | Two `start()` calls with no intervening stop | Second is a no-op; one `listening-start` total | Idempotent |

## Edge cases that must be covered
- `input.keyterms` longer than 100 entries — server returns `invalid_value` and
  silently drops keyterm boosting; must surface, not swallow.
- `reply.audio` chunks arriving *after* `reply.done` (out-of-order delivery).
- `stop()` called when never started.
- Token expiry mid-session (tokens are 300s).
- Mic device removed mid-session.
- Unsubscribe returned by `on()` actually detaches — no leak across remounts.

## Explicitly out of scope
- **Move parsing.** `lib/move-parser.ts` (frontend) and
  `fuzzyMatchMove` + confidence thresholds (`tool-handlers.ts`) both do this
  today. Which survives is Open Question 2 — this engine calls neither.
- **Move narration wording.** `chess-announcer.ts` vs `chess-engine.narrateMove`
  — Open Question 3.
- **Opponent move generation.** `demo-opponent.ts` (random/prefers-captures) vs
  `chess-engine.makeEngineMove` (minimax + PST). Not this module's concern.
- **Earcons.** `sound-effects.playMoveEarcon` already covers this; frontend's
  `lib/earcon.ts` is listening-state only.

## Open questions — need a human decision before implementation

1. **Live captions.** Voice Agent API (Path A) emits **no text delta for the
   agent's own speech** — only `reply.audio` and `reply.done`. The frontend's
   `CaptionBar` expects `agent-speaking-text`. Options:
   (a) emit the text we already computed locally (tool `narration`) at the
   moment we send the tool result — accurate and instant, but it's *our* text,
   not the agent's actual words; (b) leave captions empty on Path A.
   Recommend (a): the narration is the source of truth anyway.
2. **Which move parser wins** — frontend's `move-parser.ts` or
   `tool-handlers.fuzzyMatchMove`? The latter has 337 tests, confidence
   thresholds, the confirmation gate, and premove resolution behind it.
3. **Which repo is canonical** — does `voice-chess-frontend` become
   `voicechessmate`'s UI, or vice versa? All existing tests live in
   `voicechessmate`.

## Status
- [x] Drafted
- [ ] Reviewed by a human
- [ ] Implementation matches this contract
- [ ] Golden tests exist for every behavior case above
