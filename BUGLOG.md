# Bug Log

Every entry here must result in a permanent case in `src/lib/__tests__/`
before it is marked resolved. A patched bug without a regression case is not
resolved — it is hidden until the next rewrite.

Entries are newest first.

---

## 2026-09-30 — The conversation had 51 pixels to live in

Reported from real use while recording the demo: "same scrolling problem for
the chat section". The scrolling was not the problem.

- **Symptom:** the conversation scrolled a message out of view as soon as the
  next one arrived, so it read as a broken auto-scroll.
- **What was actually measured:** the scroll behaviour was correct. Only the
  `<ol>` scrolls (no scrollable ancestor), it follows the bottom when at the
  bottom, and it stays put when the reader has scrolled up. Verified on the
  live deployment. The real number was the height:

  | viewport | conversation height (before) | after |
  |---|---|---|
  | 1920x1080 | 363px | 483px |
  | 1440x900  | 183px | 303px |
  | 1366x768  | **51px** | 171px |

  51px is one line. Any new message necessarily scrolled the previous one out
  of view, which is indistinguishable from a scrolling bug.
- **Root cause:** the microphone button is a fixed 176px whether or not a game
  is under way, and the caption bar keeps its full padding and a 64px minimum.
  On arrival that is right, since the microphone is the thing you are looking
  for. Once you are playing it is the conversation you need to see, and nothing
  ever handed the space back.
- **Stage/module:** `components/voice/ListenButton.tsx`,
  `components/voice/CaptionBar.tsx`, `app/page.tsx`
- **Fix:** both take a `compact` prop driven by `inPlay`, the same signal the
  header collapse already uses. Microphone 176px to 112px, caption padding and
  minimum height reduced, column gap tightened. Deliberately keyed on game
  state and not on viewport height: a narrow window before the first move still
  gets the full-size microphone.
- **Verified live:** 0 axe violations, no horizontal scroll, no console errors,
  microphone 176px before the first move and 112px after.
- **Regression case added:** `src/lib/__tests__/compact-play-layout.test.ts`
- **Status:** verified

---

## 2026-09-30 — Captions showed recogniser noise the moment the mic opened

- **Symptom:** pressing J put a fragment like `3'` on screen in quotation
  marks, as if the player had said it, before they had spoken.
- **Root cause:** partial transcripts stream character by character and include
  whatever the recogniser makes of a breath, a click or the room. With 92 chess
  keyterms biasing it toward notation, that noise comes back shaped like
  notation. The caption bar rendered every partial verbatim.
- **Stage/module:** `hooks/useVoiceChessCoach.ts`, the `partial-transcript`
  handler
- **Fix:** `meaningfulPartial()` withholds a partial with no letter in it.
  Every real command in this app contains one: "e4", "knight to f3", "castle",
  "Anna 4". A letterless fragment cannot become a move, so showing it only
  makes the app look like it is mishearing badly.
- **Deliberate limit:** display only. The audio still streams to the agent and
  the final transcript is never filtered, so nothing is dropped from the actual
  conversation. A test asserts the filter is not applied to `final-transcript`.
- **Not reproduced headlessly:** a fake-audio Playwright run produced no
  transcript events at all, so this fix is reasoned from the event path rather
  than from a captured instance of the fragment. If `3'` still appears, the
  next step is capturing the raw `transcript.user` payload from a real session.
- **Regression case added:** `src/lib/__tests__/compact-play-layout.test.ts`
- **Status:** fixed, pending confirmation on real hardware

## 2026-09-30 — The chessboard was thirty-two anonymous tab stops

Found by running axe-core against the production build. It had been there from
the first commit, in every state of the app.

- **Symptom:** `aria-command-name` (serious) on 32 nodes, in all five states
  tested. Every piece is wrapped by react-chessboard in
  `role="button" tabindex="0"` with no accessible name. Measured with
  Playwright: a screen reader announces thirty-two anonymous "button"s, and a
  keyboard user crossing the board hits thirty-two dead tab stops.
- **Root cause:** the drag layer is a pointer affordance that the library also
  puts in the keyboard path. The project never overrode it. In an app whose
  claim is "no screen, no mouse, no sighted help", the board was the least
  accessible thing on the page, and it is the first thing any reviewer running
  an accessibility check would find.
- **Stage/module:** `components/board/ChessBoardPanel.tsx`
- **Fix:** an effect keyed on `fen` takes the drag nodes out of the tab order
  and gives each a real name in IBCA — "White pawn on Eva 4" — so a screen
  reader navigating by element gets the same vocabulary the coach speaks. A
  MutationObserver reapplies it, because the library rebuilds those nodes on
  drag and hover and would otherwise restore the unnamed originals. The
  keyboard and screen-reader path remains what it always was: voice, D, G, T
  and the transcript.
- **Also fixed in the same pass:** two `color-contrast` failures below WCAG AA
  — `text-fg-muted/70` on every shortcut hint in the settings menu, and
  `text-fg-muted/60` on the captured-piece rails. Alpha applied to an already
  muted token fell under the threshold at 11px; the full token passes. Shipping
  a "high-contrast AAA mode" while failing AA by default is a claim the product
  cannot support.
- **Verified live:** axe-core over the production build, five states (board,
  first-run intro, settings open, high-contrast theme, 390px phone):
  **0 violations, 0 console errors**, down from 2 violation types in every
  state. 32 pieces, 0 in the tab order, 0 unnamed; labels follow the piece
  after a move (e4 reads "White pawn on Eva 4", e2 becomes empty).
- **Regression case added:** `src/lib/__tests__/board-accessibility.test.ts` —
  6 cases, including that the effect stays keyed on `fen` and that the
  MutationObserver survives, since without it the fix lapses the first time
  anyone touches a piece.
- **Status:** verified

## 2026-09-24 — The voice pipeline logged nothing at its stage boundaries

Not a defect report so much as a standing violation of AGENTS.md rule 5, found
while building the latency instrumentation.

- **Symptom:** a slow turn was untraceable. The path from a player speaking to
  the board changing crosses five boundaries — speech end, final transcript,
  tool call, move applied, first reply audio — and none of them emitted
  anything structured. "It felt slow" could not be attributed to a stage.
- **Root cause:** the pipeline logged with ad-hoc `console.log` strings
  (`[VoiceAgent] Sent silence burst to finalize turn`) rather than structured
  records. Rule 5 exists precisely so a scattered delay is traceable to a stage
  instead of "somewhere in the app", and the most latency-sensitive path in the
  project was the one not following it.
- **Stage/module:** `lib/voice-agent.ts`, all five boundaries
- **Fix:** `stageLatency()` emits one JSON object per boundary with the turn id
  and a monotonic timestamp. `scripts/latency-report.mjs` reconstructs per-turn
  intervals from a saved console log, so the same records that make a bug
  traceable also produce the published figures.
- **Regression case added:** none as such — this is new instrumentation, and
  `latency.test.ts` (32 cases) covers the ledger it feeds, including five
  mutation checks. The most important of those is that a turn with no move is
  never counted as a 0 ms move, which would have quietly flattered the headline
  number in a published report.
- **Status:** fixed

## 2026-09-24 — First-run intro failed the two users it was written for

The intro itself was new work; these are the defects an adversarial pass over it
found, both by driving the production build rather than by re-reading the code.

- **Symptom 1:** in a private window — or anywhere site data is blocked — a
  brand-new user got **no tutorial at all**. Verified by overriding the
  `localStorage` getter to throw: the dialog never appeared.
- **Root cause 1:** `hasSeenFirstRun()` returned `true` whenever storage threw,
  on the reasoning that it was safer not to trap someone in a tutorial they
  could not dismiss. That is backwards. A private window is exactly what
  somebody evaluating an unfamiliar app opens, so the rule silenced the
  onboarding for the audience most likely to need it. Now the "seen" flag falls
  back to module-level memory: shown once per page load, never twice in a
  session, and a failed write costs a repeat rather than a silence.
- **Symptom 2:** advancing a step threw the keyboard user off the Next button.
  Playwright, Tab-and-Enter only: `Next` → focus `"Why the coach says Eva 4"`
  (the heading), so reaching Next again meant Tabbing back, three times in a
  three-step tutorial.
- **Root cause 2:** the step effect called `headingRef.current?.focus()`.
  Moving focus to new dialog content is the textbook pattern, but the same
  effect already pushes the full step text through the polite live region, so
  the focus move bought nothing and cost the whole point of a keyboard-first
  intro. Announcement kept, focus move removed. After the fix the same run
  reads `Next` → `Next` → `Start playing`: three presses, no Tabbing.
- **Stage/module:** `components/onboarding/FirstRun.tsx`
- **Regression case added:** `src/lib/__tests__/first-run.test.ts` — 12 cases.
  The storage rules are exercised against a fake `window` whose `localStorage`
  getter throws; the focus rule is a source guard, since this project has no
  jsdom. Both verified to fail when reverted.
- **Status:** verified

## 2026-09-24 — Four advertised keyboard shortcuts did nothing

Found by auditing the project against its own documentation while planning the
hackathon submission, not by using it — pressing H and hearing silence is
indistinguishable from the coach having nothing to say.

- **Symptom:** `ShortcutsModal` advertised **H** (tactical hint), **F** (flip
  board), **I** (IBCA phonetic guide) and **1-4** (difficulty). None of the four
  were bound in the `useHotkeys` map in `app/page.tsx`. Pressing them did
  nothing at all, silently.
- **Root cause:** three separate drifts, all in the same direction — the promise
  was written and the binding never was:
  1. The hotkey map carried the comment *"Shift is not required: 1-4 are
     difficulty, 5-9 are the clock"* directly above code that bound only 5-9.
     The comment described behaviour that had never existed.
  2. `IBCAGuideModal.tsx` — a finished explainer with pronunciation, IBCA
     history and worked examples — had **zero importers**. All three advertised
     routes to it (the I key, the Settings item gated behind an
     `onOpenIBCAGuide` prop `page.tsx` never passed, and the shortcuts list)
     pointed at nothing.
  3. `onBoardAction` declared `"flip"` in its type and then handled only
     `show`/`hide`, so the `control_board` voice tool announced a flip that
     never happened — the narration was lying, which is worse than silence for
     a player who cannot see the board.
- **Stage/module:** `app/page.tsx` (hotkey map, board-action handler),
  `components/a11y/ShortcutsModal.tsx`, `components/a11y/IBCAGuideModal.tsx`
- **Why nothing caught it:** the promise and the binding live in different
  files, and nothing compared them. 562 tests passed throughout.
- **Fix:** bound all four; added `getHint()` and `flipBoard()` to the coach hook
  routed through the existing `get_hint` / `control_board` tools so a flip is
  spoken like any other board change; lifted board orientation into `page.tsx`
  so the keyboard, the voice tool and the on-screen button drive one state;
  documented **G** (tactical glance), which was bound but undocumented.
- **Regression case added:** `src/lib/__tests__/keyboard-contract.test.ts` —
  parses the advertised keys out of `ShortcutsModal` and the bound keys out of
  `page.tsx` and asserts the sets match, in both directions, with an explicit
  allowlist for the `=` alias. Verified to fail, naming all seven missing keys,
  when the bindings are removed; a second case catches 1-4 being bound to the
  wrong difficulty levels, which would otherwise pass while still misleading.
- **Verified live:** against the production build — I opens the guide with focus
  trapped and Escape restoring it, H announces *"I'd suggest knight to Cesar 3"*,
  F actually inverts the board (checked by comparing the rendered positions of
  a1 and a8, not by trusting the narration) and stays in sync with the on-screen
  Flip button, and 1/2/4 announce beginner/intermediate/master.
- **Status:** verified

---

## 2026-09-24 — README made three claims a judge could check and disprove

- **Symptom:** the README advertised a **live demo URL belonging to a different
  hackathon's deployment**, a test badge reading "413 passing" against an actual
  568, and "Universal-3 Pro STT" in both the architecture diagram and the tech
  stack table.
- **Root cause:** the counts were never updated as suites were added. The model
  name was aspirational: `grep -rn "Universal-3\|speech_model" src/` returns
  nothing — the Voice Agent API is opened with no model selection at all, so it
  uses whatever the service defaults to. The URL was inherited from the repo
  this project was branched from.
- **Stage/module:** `README.md`
- **Fix:** removed the foreign live-demo link rather than guessing a URL that
  does not exist yet; corrected the counts; replaced the model claim with what
  the code actually configures (streaming STT, TTS, turn detection and tool
  calling over WebSocket). Moved `assets/` into the repo and put the cover and
  four screenshots above the fold, so the GitHub page shows the product.
- **Note:** no regression case. This is documentation drift, not a code defect,
  and a test asserting a number in a badge would be pinning trivia. The test
  count is now checked by nothing — if it drifts again it is cosmetic.
- **Status:** fixed

## 2026-09-23 — announce() announced nothing, app-wide

The most serious bug found in this project so far, and it had been there the
whole time. Found by Playwright while verifying something else: the live region
the mic-denied message should have landed in did not exist.

- **Symptom:** `document.getElementById('sr-polite')` returned null on the live
  production build. Every one of the 20 `announce()` call sites was a silent
  no-op, so an app whose entire purpose is narrating a chessboard to people who
  cannot see it announced **nothing at all** to a screen reader.
- **Root cause:** `lib/announce.ts` resolves its target with `getElementById`
  and returns quietly when the element is missing:

      const el = document.getElementById(id);
      if (el) { ... }

  No file rendered `#sr-polite` or `#sr-assertive`. The guard that was there to
  make the helper SSR-safe also made a completely unwired feature look healthy.
- **Stage/module:** `lib/announce.ts` → (missing) `app/layout.tsx`
- **Why nothing caught it:** it typechecked, linted, and passed 532 tests. The
  helper is correct in isolation; the wiring it depends on is in a server
  component that no unit test renders. Only driving the real page found it.
- **Fix:** Render both regions in the root layout, so they exist before
  anything can announce into them and survive every re-render.
- **Regression case added:** `src/lib/__tests__/live-region-wiring.test.ts` —
  asserts every id `announce()` targets is rendered by the layout, carries the
  matching `aria-live`, is a separate element, and is clipped rather than
  `hidden`. Verified to fail when the regions are removed.
- **Status:** verified

---

## 2026-09-23 — Keyboard commands went silent when voice was offline

Direct consequence of handling the failure states: once a denied mic was
survivable, the question was what the survivor actually gets.

- **Symptom:** With no live agent session — denied microphone, exhausted quota,
  or no API key — pressing **K** (clock), **D** (describe board) or any other
  spoken command produced no audio and no announcement. A transcript entry
  appeared, which is no use to someone who cannot see it. The failure message
  promised "everything still works by keyboard"; the board did, the speech
  did not.
- **Root cause:** `speak()` in `useVoiceChessCoach` called only
  `engine.speak()`, which requires a connected WebSocket session. There was no
  path from a keyboard command to the screen reader.
- **Stage/module:** `hooks/useVoiceChessCoach.ts`, `speak()`
- **Fix:** Branch on `engine.isLive` — the agent speaks when it can, otherwise
  the text goes to the polite live region. Conditional on purpose: announcing
  unconditionally would make the screen reader talk over the TTS.
- **Verified live:** with voice offline, K announces "You have 5 minutes. The
  coach has 5 minutes. Your move.", D announces the full rank-by-rank board in
  IBCA phonetics, and a typed move announces the coach's reply.
- **Regression case added:** `live-region-wiring.test.ts` — asserts the
  `engine.isLive` branch exists and that `announce()` appears exactly once in
  `speak()`. Verified to fail when reverted.
- **Status:** verified

## 2026-09-23 — Voice failures read raw JSON and internals aloud

Found by tracing the failure path end to end rather than by a test — the whole
chain typechecked, linted and passed 532 tests while doing this.

- **Symptom:** Every voice failure reached the player through
  `Voice error: ${message}. Use the text box to play instead.` For a quota
  refusal `message` was the raw HTTP body, so a screen reader announced:
  *"Voice error: Token minting failed 429: open brace quote error quote colon
  quote You have used your voice time for today…"* — the server's carefully
  written sentence, wrapped in punctuation that gets spoken.
- **Root cause:** `voice-agent.ts` threw `new Error("Token minting failed
  (status): body")` and a bare `getUserMedia` rejection; the engine
  flattened whatever it caught to `err.message`. Nothing between the throw and
  the live region was responsible for how a failure should *sound*.
- **Stage/module:** `lib/voice-agent.ts` → `lib/assemblyai-voice-engine.ts` →
  `hooks/useVoiceChessCoach.ts` → `announce()`
- **Fix:** New `lib/voice-errors.ts` owns the wording. `VoiceAgentError` carries
  a prepared `VoiceFailure` from the throw site; the hook speaks it verbatim.
- **Regression case added:** `src/lib/__tests__/voice-errors.test.ts` — the
  `invariants` block, which asserts no message can contain JSON punctuation, a
  DOMException name, an env var name or an HTTP status.
- **Status:** verified

---

## 2026-09-23 — Developer-facing error text would have been read to players

Found while writing `contracts/voice-failure-messages.md` — enumerating the
token route's refusals is what exposed it.

- **Symptom:** A deployment missing its API key would announce to the player:
  *"ASSEMBLYAI_API_KEY not configured. Edit .env.local and restart the dev
  server."* Same class for `upstream_error` ("Failed to mint token"),
  `cross_origin` ("Forbidden: cross-origin token request") and `internal`.
- **Root cause:** My first version of `describeTokenError` trusted the server's
  `error` string whenever a `code` was present, on the reasoning that the route
  writes human sentences. Only three of its ten refusals actually do; the rest
  are addressed to whoever deploys it.
- **Stage/module:** `lib/voice-errors.ts`, against `app/api/token/route.ts`
- **Fix:** Inverted to an allowlist (`PLAYER_FACING_TOKEN_CODES`), plus a
  `looksLikeData` check on the string that actually arrived, so an approved
  code still cannot speak something shaped like JSON.
- **Regression case added:** `voice-errors.test.ts` — case 12, cases 13-15,
  "a friendly-looking message under a non-allowlisted code is NOT forwarded".
- **Status:** verified

---

## 2026-09-23 — A `null` response body crashed the error handler

Found by the adversarial pass over `voice-errors.ts`, fuzzing body shapes.

- **Symptom:** `describeTokenError(500, 'null')` threw
  `TypeError: Cannot read properties of null (reading 'code')`.
- **Root cause:** `JSON.parse("null")` returns `null`, not an object, and the
  code read `.code` straight off the parse result. The throw landed inside the
  one code path whose entire job is to keep a failure speakable, so instead of
  a bad-news sentence the player would have got silence.
- **Stage/module:** `lib/voice-errors.ts`, `describeTokenError`
- **Fix:** Accept the parse result only when it is a non-null, non-array object.
- **Regression case added:** `voice-errors.test.ts` — "REGRESSION: a body of
  literal `null` does not crash the handler" and "non-object JSON bodies are
  ignored rather than trusted". Both verified to fail when the guard is removed.
- **Status:** verified

---

## 2026-09-23 — Capacity refusal offered the keyboard twice

- **Symptom:** *"…the daily limit for everyone has been reached. You can keep
  playing with the keyboard, and voice returns within 24 hours. You can keep
  playing by typing your moves."*
- **Root cause:** `describeTokenError` appended a fallback instruction to every
  allowlisted server message, including the one that already contained one.
  Visible on screen as mild redundancy; at speech rate it is a whole extra
  sentence repeating what was just said, during bad news.
- **Stage/module:** `lib/voice-errors.ts`
- **Fix:** Append only when the server text does not already mention the
  keyboard or typing.
- **Regression case added:** `voice-errors.test.ts` — case 9, which asserts
  `/keep playing/gi` matches exactly once. Verified to fail when reverted.
- **Status:** verified

## 2026-09-23 — Two UI defects found by running the app

- **Symptom 1:** Every new transcript entry scrolled the whole left column,
  dragging the microphone button off screen while nobody was touching the page.
- **Root cause 1:** `TranscriptLog` called `scrollIntoView`, which scrolls
  *every* scrollable ancestor. The message list had no overflow of its own, so
  the only scrollable ancestor was the left column — the entire control panel
  moved on each message.
- **Symptom 2:** Pressing **W** ("why was that bad?") after a blunder explained
  the engine's reply instead of the player's move: *"King to Felix 7 was
  forced — it was your only legal move."* That answers nobody's question.
- **Root cause 2:** `explain_last_move` analysed `lastMove`, the most recent
  move on the board. By the time a player asks why something was bad, the
  engine has already replied, so the most recent move is always the
  opponent's. The tool schema declared a `whose` parameter to select between
  them; the handler never read it.
- **Stage/module:** `src/components/voice/TranscriptLog.tsx` and
  `src/lib/tool-handlers.ts`.
- **Fix:** The message list owns its own scroll and is moved with `scrollTop`,
  which cannot escape the element. Following is sticky-by-default and pauses
  while the reader has scrolled up — measured from their scroll events, not
  from position at append time, because once content first overflows
  `scrollTop` is still 0 and reads as "scrolled away" forever. For the second,
  `whose` is now honoured and defaults to the player's most recent move.
- **Regression case added:** `src/lib/__tests__/move-analysis.test.ts` — 3
  cases pinning the default, the opt-in opponent path, and the empty-game
  message. **Verified to fail against the reintroduced bug.** The scroll
  behaviour is verified by driving the running app, not by unit test: it is a
  layout interaction with no DOM harness in this suite.
- **Status:** **verified** (analysis) / fixed, manually verified (scroll)

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
- **Regression case added:** `src/lib/__tests__/token-route.test.ts` — 20
  cases, including a source-level guard asserting no route handler calls
  `NextResponse.next()`.

  Worth stating plainly: the handler tests **cannot** reproduce this bug.
  `NextResponse.next()` constructs happily under vitest and only throws inside
  the real Next.js server, so a behavioural test passes either way — verified
  by reintroducing the call and watching all 14 behavioural cases still pass.
  The banned-API guard does catch it, and that is what a runtime-only failure
  mode honestly allows. The rest of the file covers what *is* testable:
  identity, cookie issuance, upstream call ordering, and the fact that a
  response can be constructed at all.
- **Status:** **verified** (by source guard; see the caveat above)
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

1. **Route-handler coverage is partial.** `/api/token` now has a real harness
   (`token-route.test.ts`, 20 cases) covering the degraded, no-database path:
   identity and cookie issuance, refusal before spending, upstream failures,
   and key non-leakage. What is still uncovered:

   - **Anything requiring a database.** The quota enforcement path, the ledger,
     the circuit breaker, the refund in `/api/session/end`, and all of
     `/api/games` and `/api/auth/claim` need a Supabase double. The policy
     underneath them (`lib/quota.ts`, `lib/elo.ts`) is well covered; the SQL
     and the wiring are not.
   - **`reserve_voice_seconds` concurrency.** Contract case 17 — two
     simultaneous mints with one session of budget left — depends on
     `SELECT … FOR UPDATE` behaving under real contention. That needs a live
     Postgres, not a mock, and has only been reasoned about.
   - **The cross-origin 403 (case 18),** which requires `NODE_ENV=production`
     inside the test process.
   - **Anything that only fails in the Next.js runtime**, as the
     `NextResponse.next()` entry above documents. Source-level guards are the
     available tool there.

   The honest summary: policy is tested, plumbing is tested where it can be
   reached without a database, and the database path has been exercised by hand
   but not automatically.

2. **`src/lib/speech.ts` is not wired into the application.** The browser
   `speechSynthesis` path was removed in favour of AssemblyAI agent audio,
   which is now the only spoken-output channel. The module and its tests were
   retained rather than deleted: its tests are interleaved with chess-engine
   and tool-handler cases in
   `src/lib/__tests__/speech-and-audio-pipeline.test.ts`, and separating them
   is a refactor that should not happen days before a deadline. It is dead
   weight, it is tested, and it is not on any shipping path — documented here
   so no reader mistakes it for live code.
