# Bug Log

Every entry here must result in a permanent case in `src/lib/__tests__/`
before it is marked resolved. A patched bug without a regression case is not
resolved — it is hidden until the next rewrite.

Entries are newest first.

---

## 2026-09-22 — Token rate limiter did nothing in production

- **Symptom:** No visible symptom, which is the point. `/api/token` appeared to
  enforce 10 mints/minute per IP. In production it enforced almost nothing.
- **Root cause:** The limiter kept its counters in a module-level `Map` inside a
  serverless route handler. Vercel runs many lambda instances concurrently and
  each gets its own module scope, so the real limit was *10 per minute per IP
  **per instance***, with no bound on instance count. The `setInterval` cleanup
  at module scope compounded it: serverless instances freeze and are reclaimed,
  so it ran unpredictably and held a timer handle open.

  Worse than the weak limit: every mint granted
  `max_session_duration_seconds=3600`. One token bought an hour of paid agent
  time, with nothing recording who took it. A public URL was an open tap on the
  project's AssemblyAI credits.
- **Stage/module:** `src/app/api/token/route.ts`.
- **Fix:** Rewritten around a durable, attributable budget:
  - Identity is a signed httpOnly device cookie (HMAC over a uuid) or a
    Supabase account. A forged cookie cannot inherit another identity's budget.
  - Budget lives in Postgres and is decremented inside `reserve_voice_seconds`
    under a `SELECT … FOR UPDATE`, so two concurrent mints cannot both spend the
    last of it.
  - `max_session_duration_seconds` cut from 3600 to **600**, capping the blast
    radius of a single leaked token at ten minutes.
  - Mints reserve pessimistically and refund on a reported session end, so a
    client that stays silent costs the user, never the operator.
  - Every mint writes a `voice_ledger` row, so spend is attributable.
  - The in-memory limiter survives only as an explicitly-labelled degraded
    fallback for a database outage, at 6/min. Its comment says not to promote it
    back to the primary path.
- **Regression case added:** `src/lib/__tests__/quota-and-identity.test.ts` —
  25 cases covering grant boundaries, window rollover, refund idempotency,
  hostile durations, forged and stolen cookies, and account-over-device
  precedence.
- **Status:** **verified** for the policy layer. The route handler itself is
  still covered only by manual exercise (see *Known gaps*).

---

## 2026-09-22 — Every token request returned 500 after minting

- **Symptom:** `GET /api/token` returned 500 on every call. The stage log showed
  `token.mint status:ok` immediately before the failure — so the upstream
  AssemblyAI call had already succeeded and a real token had been spent.
- **Root cause:** The new route used `NextResponse.next()` as a scratch object
  to collect cookies from the Supabase SSR client before building the real
  response. `NextResponse.next()` is middleware-only; in an App Route handler it
  throws at runtime. Typecheck, lint and the whole unit suite passed — none of
  them execute a route handler.
- **Stage/module:** `src/app/api/token/route.ts`, and the same pattern in
  `/api/games`, `/api/session/end`, `/api/auth/claim`, `/auth/callback`.
- **Fix:** Introduced an explicit `CookieJar` (`src/lib/supabase/server.ts`):
  the Supabase client pushes refreshed cookies into an array, and `applyCookies`
  writes them onto the real response at the end. No scratch response exists.
- **Regression case added:** NOT YET — see *Known gaps*. Found by running the
  server and calling the endpoint, which is the only thing that would have
  caught it.
- **Status:** fixed, **not verified**
- **Note:** the failure ordering is the lesson. The response was constructed
  *after* the paid upstream call, so every 500 still cost a token. Side effects
  that cost money belong after everything that can throw, not before.

---

## 2026-09-22 — Illegal SAN move played as a different piece

- **Symptom:** Found while driving the running app to capture screenshots. The
  move `Be2` was submitted while White was in check from a knight on f3. `Be2`
  is illegal there — a knight check can only be answered by capturing the
  knight or moving the king. Instead of refusing, the app moved the **king** to
  e2 and reported *"White king to Eva 2."* The notation history recorded
  `4. Ke2`. The player named a bishop.
- **Root cause:** `fuzzyMatchMove` scores each legal move against the spoken
  description. A mentioned destination square is worth +10, and there is an
  existing −15 penalty for "a piece was named but this move is a different
  piece" — but that check only consulted `PIECE_ALIASES`, which contains piece
  *words* (`bishop`, `knight`, `horse`, `bish`…) and no SAN piece letters. So
  in `Be2` the leading `B` carried no meaning at all: `Ke2` matched on the
  destination square alone, scored +10, reached confidence 0.9 — exactly
  `AUTOPLAY_MIN_CONFIDENCE` — and was played with no confirmation.

  Compounding it, `normalizeIBCASpeech` lowercases its input, which is what
  destroys the signal: case is the only thing distinguishing `Bxc3` (bishop
  takes c3) from `bxc3` (b-file pawn takes c3).

  Every `[KQRBN]<square>` input was affected, not just bishops: `Ne2`, `Re2`
  and `Qe2` all resolved to `Ke2` in the same position.
- **Stage/module:** `src/lib/tool-handlers.ts` → `fuzzyMatchMove` (move
  parsing). The chess engine below it was never at fault — `ChessEngine.makeMove('Be2')`
  correctly returned `success: false` and left the board untouched. The
  substitution happened above it, in the parser that chooses *which* legal move
  to hand the engine.
- **Fix:** An explicit SAN piece letter is now read from the **raw**
  description (before lowercasing) and treated as a constraint rather than a
  hint. A legal move whose piece type differs is disqualified outright
  (−100), so no combination of destination or capture bonuses can let a
  different piece win the match. `Be2` in that position now falls to confidence
  0.2, below `CONFIRM_MIN_CONFIDENCE`, and the app reads back the real legal
  options instead of moving anything.
- **Regression case added:** `src/lib/__tests__/san-piece-constraint.test.ts`
  — 13 cases. Four piece letters against the check position, matcher-level
  assertions that the king move never wins, and six cases pinning what must
  keep working: legal SAN, lowercase `bxc3` as a pawn capture, spoken piece
  names, IBCA phonetics, castling, and disambiguation when several pieces can
  reach one square. **Verified: 7 of the 13 fail against the unfixed parser.**
- **Status:** **verified**
- **Note:** This is the failure mode the whole project is built to prevent, and
  it survived 355 passing tests. It was found by playing the actual app, not by
  reading code. Integration against real input is in the definition of done for
  a reason.

---

## 2026-09-22 — Defeat announced as victory

- **Symptom:** When the player was checkmated, the app played the defeat sound
  and then, 200ms later, the victory fanfare. On a draw, the draw sound played
  twice. For a player using the app without sight, the last thing heard after
  losing a game was the sound for winning it.
- **Root cause:** Two modules played game-over sounds.
  `useVoiceChessCoach.soundLastMove` fires after *every* move and has no way to
  know who won, so its checkmate branch played `playVictorySound()`
  unconditionally — its own comment said so: *"we always play victory here"*.
  Meanwhile `app/page.tsx` independently derived the correct verdict from
  `turn` and played defeat at +200ms. Both ran. Neither knew about the other.
- **Stage/module:** `src/hooks/useVoiceChessCoach.ts` (per-move audio) and
  `src/app/page.tsx` (game-over audio) — a boundary with two owners and no
  contract between them.
- **Fix:** The verdict moved into one pure module, `src/lib/game-verdict.ts`,
  and the hook's game-over branch was deleted entirely. `page.tsx` is now the
  only caller. `gameOverVerdict` returns `null` — say nothing — whenever the
  outcome is not determinable from the snapshot, rather than falling back to a
  cheerful default. That matches the project's governing rule: prefer no
  announcement over a wrong one.
- **Regression case added:** `src/lib/__tests__/game-verdict.test.ts` — 17
  cases. Covers both colours, resignation precedence, contradictory snapshots,
  and four "refuses to guess" cases. Includes a guard asserting the hook no
  longer references the victory/defeat/draw sounds at all. **Verified to fail
  against the reintroduced bug** before being accepted.
- **Status:** **verified**

---

## 2026-09-22 — Token route rate limit contradicted its contract

- **Symptom:** No user-visible symptom. Found by auditing the token route
  against its contract before submission.
- **Root cause:** `RATE_LIMIT_MAX` in `src/app/api/token/route.ts` had drifted
  to `60`, while the file's own header comment said 10/min and
  `contracts/assemblyai-voice-engine.md` behaviour case 2 specified
  "Limiter is 10/min/IP". Three sources of truth, two of them wrong. At 60
  mints/minute/IP the limiter provided little practical protection for the
  API credits behind it.
- **Stage/module:** `src/app/api/token/route.ts` (token minting boundary).
- **Fix:** Code corrected to `10` to match the contract. Per `CONTRIBUTING.md`,
  where code and contract disagree the contract is the specification and the
  code is the bug — so the contract was not amended. The constant now
  references the contract inline so the next drift is visible at the callsite.
- **Regression case added:** NOT YET — see *Known gaps* below.
- **Status:** fixed, **not verified**

---

## 2026-09-22 — API key metadata written to server logs

- **Symptom:** Every request to `/api/token` logged
  `API key present: true, length: 32, starts with: abcd...`.
- **Root cause:** A debugging line left in from diagnosing a misconfigured
  environment variable. It leaked the key's exact length and first four
  characters into server logs, which on a hosted platform are a broader
  disclosure surface than the environment itself — and the repo is public.
- **Stage/module:** `src/app/api/token/route.ts` (token minting boundary).
- **Fix:** Line removed entirely. The route's error paths already distinguish
  "not configured" from "upstream rejected" without touching the key's value,
  so nothing diagnostic was lost. `SECURITY.md` now states the no-key-logging
  rule explicitly so it is not reintroduced.
- **Regression case added:** NOT YET — see *Known gaps* below.
- **Status:** fixed, **not verified**

---

## 2026-09-16 — Hydration mismatch on the voice-support warning

- **Symptom:** React "Hydration failed because the server rendered HTML didn't
  match the client" on first load of `/`. Server emitted
  `<p role="alert" …>` ("Voice input isn't available in this browser") where
  the client rendered the listen control. The whole tree was regenerated
  client-side.
- **Root cause:** The voice engine's support check reads
  `window.SpeechRecognition` / `window.webkitSpeechRecognition`. During SSR
  there is no `window`, so support was always `false` and the server always
  rendered the "unsupported" branch. In a browser that does expose
  `SpeechRecognition`, the first client render took the opposite branch.
  `isVoiceSupported` was being read directly during render, which is never
  safe for a value that only exists in the browser.
- **Stage/module:** `src/hooks/useVoiceChessCoach.ts` (state) →
  `src/app/page.tsx` (conditional render).
- **Fix:** `isVoiceSupported` is read through `useSyncExternalStore` with a
  constant server snapshot of `true`. Server render and hydration now agree by
  construction; the real capability lands after mount. `app/page.tsx` renders
  the warning only on an explicit negative, so there is no banner flash.
- **Regression case added:** `src/lib/__tests__/ssr-hydration-invariant.test.ts`
  — 3 cases. Asserts the invariant the entry called for, not the symptom:
  server HTML must be identical whether or not the browser supports speech.
  Includes an architectural guard pinning the server snapshot to a literal, so
  reverting it to `() => engine.isSupported` fails the suite. **Verified to
  fail against the reintroduced bug** before being accepted.
- **Status:** **verified**

---

## Known gaps

Tracked honestly rather than quietly closed.

1. **No route-handler tests exist.** Everything under `src/app/api/` is covered
   only by its extracted pure logic (`lib/quota.ts`, `lib/identity.ts`,
   `lib/elo.ts`, all well covered) plus manual exercise with `curl`. The suite
   runs in a pure Node environment with no HTTP harness, so a handler test needs
   a `NextRequest` fixture, a fetch mock and a Supabase double — infrastructure
   that does not exist yet.

   This gap is not theoretical: the `NextResponse.next()` bug above passed
   typecheck, lint and 413 unit tests, and failed on the first real request.

   The cases to write when that harness lands:
   - A mint returns 200 with a `budget` block and sets a signed `vcm_device`
     cookie; a second mint reuses it and sets none.
   - The allowance is enforced: session N+1 past the budget returns 429
     `quota_exhausted` and never calls upstream.
   - A failed upstream mint releases the reservation (nothing is charged).
   - `/api/session/end` refunds once and is a no-op when replayed.
   - `/api/games` rejects an unparseable PGN with 400 and writes nothing.
   - A game completed twice is rated once.
   - A cross-origin request in production returns 403 and never calls upstream.
   - No response body, header, or log line contains any substring of
     `ASSEMBLYAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
   - Every route returns a well-formed response — the regression case for the
     `NextResponse.next()` failure.

2. **`src/lib/speech.ts` is not wired into the application.** The browser
   `speechSynthesis` path was removed in favour of AssemblyAI agent audio,
   which is now the only spoken-output channel. The module and its tests were
   retained rather than deleted: its tests are interleaved with chess-engine
   and tool-handler cases in
   `src/lib/__tests__/speech-and-audio-pipeline.test.ts`, and separating them
   is a refactor that should not happen days before a deadline. It is dead
   weight, it is tested, and it is not on any shipping path — documented here
   so no reader mistakes it for live code.
