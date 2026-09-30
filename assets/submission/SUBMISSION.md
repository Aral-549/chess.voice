# lablab.ai submission — copy/paste fields

Everything below is ready to paste into the submission form. Character counts
are noted where the platform enforces a limit.

---

## Project title

```
chess.voice
```

Alternative if a more descriptive title is preferred:

```
chess.voice — Tournament Chess, Played Entirely by Voice
```

---

## Short description

*Limit: 255 characters. This version is 252.*

```
Chess played entirely by voice. Speak moves in official IBCA phonetics, ask why a move was bad and hear the engine's real evaluation, or play blindfold. Built for blind players on AssemblyAI's Voice Agent — 18 typed tools, a real engine, never a guess.
```

Backup, 194 characters:

```
Chess you play entirely by voice — no screen, no mouse, no sighted help. Built for blind players on AssemblyAI's Voice Agent API, with official IBCA tournament phonetics and a real chess engine.
```

---

## Long description

*Minimum 100 words. This version is 757 words.*

```
An estimated 43 million people are blind and 295 million live with
moderate-to-severe visual impairment. Chess is one of the few competitive
arenas where they compete on genuinely equal terms — the game itself needs no
sight at all. Chess software does. Mainstream platforms are built around a
drag-and-drop board; a screen reader announces a grid of 64 empty cells. The
hard part becomes the interface, not the opponent.

chess.voice removes the interface. You hold a key, say "knight to Felix 3",
and the coach plays, responds and explains. You can ask "what's attacking my
queen?" and get an answer computed from the real position. Ask "why was that
bad?" after a mistake and it answers from the engine's own evaluation: "That
was a blunder. Queen to Felix 7 gives up about 7.8 pawns of advantage. Nc3 was
stronger." It may say what was lost and what was better, because both are
computed; it will not assert a tactic it cannot verify.

Because the interface is a conversation rather than a board, three things
follow that a click interface cannot really offer. Blindfold mode hides the
board and scores the thing blindfold chess is actually about — naming a piece
that is not on that square, which is losing the position in your head rather
than playing badly. Hands-free mode listens continuously so you can play while
walking or cooking, and confirms every move first, because continuous listening
means the microphone decided rather than the player. And you can simply listen
to a famous game move by move, the way you would listen to a podcast.

That is also the reframe: what was built as an accommodation turns out to be
elite training for sighted players and a way to play chess in places it has
never been playable. Same product, three audiences.

Architecture: microphone audio streams through an AudioWorklet as PCM16 at
24kHz over a WebSocket to AssemblyAI's Voice Agent API, which handles
speech-to-text with Universal-3 Pro, turn detection, LLM routing and voice
output. The agent acts only through 18 typed JSON-schema tools — apply_move,
describe_board, explain_last_move, set_play_mode, replay_game, get_hint,
undo_move, set_premove, resign_game and others — executed against a
deterministic chess.js engine. The model never
asserts a board state, so it cannot hallucinate a piece that isn't there.
Playback runs on a second AudioContext at the hardware's native 48kHz, because
forcing 24kHz output silently mutes the stream on PulseAudio and PipeWire —
the platform many screen reader users are on.

The key insight is phonetic. "b", "d", "e" and "g" are nearly
indistinguishable over a microphone, and that is exactly the alphabet chess
uses; one misheard letter is a legal, different, losing move. chess.voice
speaks and understands the IBCA/FIDE tournament alphabet — Anna, Bella, Cesar,
David, Eva, Felix, Gustav, Hector — which blind players already use, and which
doubles as a phonetically separated vocabulary registered as AssemblyAI
keyterms.

The governing engineering rule is that a wrong move is worse than no move. A
sighted player undoes an error instantly; a blind player may not find it for
several moves. So ambiguity refuses: uncertain input reads back the real legal
options instead of guessing, a named piece constrains which piece may move, and
an outcome that cannot be determined is not announced at all.

Games persist. Position, move history and captured pieces restore from PGN and
the resume is announced aloud, because losing a game in progress costs a blind
player the position they were holding in memory. Accounts are optional and
sign-in is a magic link only — no password, no CAPTCHA, since a password flow
means a hidden field, an unlabelled strength meter and errors that often never
get announced. Anonymous play is never gated.

Because voice minutes are the real marginal cost, spend control is built in:
every session token is minted against a per-identity daily budget and a
deployment-wide ceiling, both held in Postgres and decremented under a row
lock, with a ledger making spend attributable. Sessions reserve pessimistically
and refund what they do not use. When the ceiling trips, voice pauses and the
app stays fully playable by keyboard — a degradation, not an outage.

The repo carries 507 tests across 22 files, contracts specifying behaviour
before implementation, and a bug log where every fix ships with a regression
case — including open gaps documented rather than hidden.

Target users are blind and visually impaired players, chess clubs and schools
for the blind. Next: human-vs-human play over WebRTC, Spanish and German
phonetic sets, and licensing the voice layer to existing chess platforms.
```

---

## Tags

```
AssemblyAI, Voice Agent, Accessibility, Speech Recognition, Chess,
Assistive Technology, Next.js, TypeScript, Real-time, WebSocket,
Blind and Low Vision, Voice AI, Tool Calling, Web Audio API, Supabase,
Postgres
```

---

## Links

| Field | Value |
|---|---|
| Working application URL | https://voicechessmate.vercel.app/ |
| Public GitHub repository | https://github.com/Aral-549/chess.voice — **currently private, must be made public before submitting** |
| Cover image | `assets/cover/voicechessmate-cover-16x9.png` (3840×2160, 16:9) |
| Slide presentation | `assets/deck/chess.voice_Pitch_Deck.pdf` (10 slides, 16:9) |
| Video presentation | *(see `DEMO_VIDEO_SCRIPT.md`)* |

---

## Which track

**Path A — AssemblyAI Voice Agent API (end-to-end managed).** Universal-3 Pro
speech-to-text, built-in turn detection and VAD, LLM routing, voice output, and
JSON-schema tool calling over a single WebSocket connection.

---

## Rubric coverage — a checklist before submitting

The four judged pillars, and where each is addressed.

**Pillar 1 · Presentation.** Deck covers problem, solution, value proposition,
competitive analysis (slide 3), market analysis (slide 8), revenue model
(slide 9) and future plans (slide 10). Video must run 3–5 minutes — under 3
caps this pillar at 2.

**Pillar 2 · Business value.** Slides 8 and 9. Market figures are presented as
bottom-up estimates with stated assumptions, not as forecasts — a judge who
checks will find the reasoning rather than an invented number.

**Pillar 3 · Application of technology.** Needs all three live: demo video
showing every feature, a working demo link, and public GitHub code. The repo
has CI, contracts, a bug log and 507 tests.

**Pillar 4 · Originality.** Three differentiators, in order of strength: the
spoken move analysis grounded in real engine evaluation, the IBCA phonetic
layer, and the refuse-rather-than-guess safety model. None is a wrapper around
an API — all three come from the constraints of the actual user. Blindfold and
hands-free modes are the proof that this is a new capability rather than an
accommodation.

### Before you submit

- [ ] New GitHub repo is **public** (private repos are penalised)
- [ ] `LICENSE` present and MIT — required
- [ ] Live URL loads and a full game is playable
- [ ] `ASSEMBLYAI_API_KEY` and `DEVICE_SECRET` set in Vercel project env (not committed)
- [ ] Supabase provisioned and its three keys set in Vercel — see `docs/SETUP.md`
- [ ] Quota verified on the live URL: four rapid token requests give `200 200 200 429`
- [ ] Video is 3–5 minutes and uploaded as MP4 or hosted embed
- [ ] Cover image uploaded as 16:9 PNG
- [ ] Deck uploaded as PDF
- [ ] Deadline: **30 September 2026, 15:00 UTC** (19:00 GST)
