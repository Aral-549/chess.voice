# Contract: voice failure messages (`lib/voice-errors.ts`)

> PROCESS NOTE. This contract was written *after* the implementation, which
> inverts the repo's contract-before-code rule. It is recorded here rather than
> quietly backdated. The behaviour below was read off the implementation and
> then checked against `app/api/token/route.ts`; writing it is what surfaced the
> `not_configured` leak (case 12), so the exercise was not ceremonial.

## Purpose
Turn any voice-session failure into one or two sentences that a person can act
on, and that make sense **read aloud**. Owns wording and recoverability only.

It explicitly hands off:
- *deciding* to refuse (quota, capacity, origin) → `app/api/token/route.ts`
- *announcing* the sentence → `announce()` and `useVoiceChessCoach`
- *displaying* it → `ListenButton`, `TextFallbackForm`

## Inputs
- `describeMicError(err: unknown)` — a `getUserMedia` rejection. `DOMException`
  with a `name`, an `Error`, or anything at all including `null`/`undefined`.
- `describeTokenError(status: number, body: string)` — the HTTP status and raw
  response body from `/api/token`. Body may be JSON, may be HTML, may be empty.
- `describeConnectionError(err: unknown)` — a post-connection failure.
- `toVoiceFailure(err: unknown)` — any throw, from anywhere.

## Outputs
`VoiceFailure { message: string; recoverable: boolean; code: string }`

- `message` — non-empty, ends in a full stop, contains no JSON, no HTTP status,
  no `NotAllowedError`-style identifier, no file path, no env-var name.
- `recoverable` — true when pressing J again could plausibly work, or when
  waiting will fix it. False when the deployment itself is wrong.
- `code` — short machine tag for logs. Never rendered.

## Behaviour cases (input → expected output)

### Microphone
| # | Input | Expected `code` | Message must convey |
|---|-------|------------------|---------------------|
| 1 | `DOMException(name: 'NotAllowedError')` | `mic_denied` | browser blocked it; allow in address bar; press J again; or type |
| 2 | `Error('Permission denied')` (no `name`) | `mic_denied` | same as case 1 — matched on text |
| 3 | `DOMException(name: 'NotFoundError')` | `mic_missing` | no microphone found; plug one in; or type |
| 4 | `DOMException(name: 'NotReadableError')` | `mic_busy` | another app holds the mic; close it; or type |
| 5 | `Error('Microphone access requires localhost or HTTPS')` | `insecure_context` | needs HTTPS; **not** recoverable; typing still works |
| 6 | `null` | `mic_unknown` | generic, still names the text box |
| 7 | `{}` (no name, no message) | `mic_unknown` | generic, still names the text box |

### Token / quota
| # | Input | Expected `code` | Message must convey |
|---|-------|------------------|---------------------|
| 8 | `429`, `{"code":"quota_exhausted","error":"You have used your voice time for today. It resets within 24 hours."}` | `quota_exhausted` | the server's own sentence, plus the typing fallback |
| 9 | `503`, `{"code":"service_at_capacity","error":"…daily limit for everyone…"}` | `service_at_capacity` | server's sentence + fallback |
| 10 | `429`, `{"code":"rate_limited","error":"Too many requests. Please wait a moment."}` | `rate_limited` | server's sentence + fallback |
| 11 | `429`, `not json at all` | `http_429` | out of voice time; resets in 24h; type instead |
| 12 | `500`, `{"code":"not_configured","error":"ASSEMBLYAI_API_KEY not configured. Edit .env.local and restart the dev server."}` | `not_configured` | **must NOT contain `ASSEMBLYAI_API_KEY` or `.env.local`**; not recoverable |
| 13 | `500`, `{"code":"upstream_error","error":"Failed to mint token"}` | `upstream_error` | **must NOT say "mint" or "token"**; try again shortly |
| 14 | `403`, `{"code":"cross_origin","error":"Forbidden: cross-origin token request"}` | `cross_origin` | **must NOT say "Forbidden" or "cross-origin"** |
| 15 | `500`, `{"code":"internal","error":"Internal server error"}` | `internal` | **must NOT say "Internal server error"** |
| 16 | `503`, `<html>502 Bad Gateway</html>` | `http_503` | capacity wording; **no HTML** |

### Connection / catch-all
| # | Input | Expected `code` | Message must convey |
|---|-------|------------------|---------------------|
| 17 | `Error('Failed to fetch')` | `offline` | connection dropped; the game is safe; type instead |
| 18 | `Error('socket hang up')` | `offline` | as 17 |
| 19 | `Error('something weird')` | `connection` | generic; names the typing fallback |
| 20 | `toVoiceFailure(VoiceAgentError(f))` | `f.code` | returns `f` unchanged — no double-wrapping |
| 21 | `toVoiceFailure('a bare string')` | `connection` | still a sentence |

## Edge cases that must be covered
- Every branch returns a non-empty `message`; no input produces `undefined`,
  `[object Object]`, `null`, or the empty string.
- No message contains `{`, `}`, `NotAllowedError`, `.env`, `API_KEY`, or an
  HTTP status number — these are the shapes that read as noise aloud.
- `describeTokenError` never throws on a malformed body (case 11, 16).
- A code absent from `PLAYER_FACING_TOKEN_CODES` never has its server text
  passed through, even when `error` is present and looks friendly.
- `VoiceAgentError` round-trips: `toVoiceFailure(new VoiceAgentError(f)) === f`.

## Explicitly out of scope
- **Deciding** whether to refuse — `app/api/token/route.ts` owns quota, rate
  limiting, capacity and origin checks.
- **Retry policy** — `voice-agent.ts` owns backoff and reconnection.
- **When to announce** — `useVoiceChessCoach` owns the live region; this module
  never speaks, it only supplies words.
- **Server-side logging** — `stageLog` in the route.

## Status
- [x] Drafted
- [ ] Reviewed by a human
- [x] Implementation matches this contract
- [x] Golden tests exist for every behaviour case above
