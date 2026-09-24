# Submission assets — VoiceChessmate

Everything needed for the lablab.ai / AssemblyAI submission. Nothing here lives
in the code repo; the repo is at `../voicechessmate-assemblyai/` and pushes to
`github.com/Aral-549/chess.voice`.

## What to upload where

| Submission field | File |
|---|---|
| Cover image (16:9 PNG) | `cover/voicechessmate-cover-16x9.png` — 3840×2160 |
| Slide presentation (PDF) | `deck/VoiceChessmate_Pitch_Deck.pdf` — 10 slides, 16:9 |
| Video presentation (MP4) | **You still need to record this** — see `submission/DEMO_VIDEO_SCRIPT.md` |
| Title / descriptions / tags | `submission/SUBMISSION.md` — copy/paste ready, limits verified |

## Contents

```
cover/
  voicechessmate-cover-16x9.png   the cover image to upload
  cover.html                      source; re-render to change it
  board.png                       captured board panel used in the cover

deck/
  VoiceChessmate_Pitch_Deck.pdf   the deck to upload
  deck.html                       source; all 10 slides in one file
  slide-01..10.png                individual slides, 3840×2160

submission/
  SUBMISSION.md                   every form field, character counts verified
  DEMO_VIDEO_SCRIPT.md            shot-by-shot script for the required 3–5 min video

video/
  voicechessmate-launch-film.mp4  2:44 launch film — music + captions, no voiceover
  voicechessmate-promo-24s.mp4    24s cutdown for social
  NARRATION.md                    per-scene narration script to add later
  share-copy.txt                  X / LinkedIn / Discord copy
  brag-plan.md                    the creative plan both videos were built from
  composition/                    Hyperframes source for the long film
  short/                          Hyperframes source for the cutdown

screenshots/
  01-home.png … 08-clean-game.png captured from the running app
```

## Two videos, two jobs

- **`voicechessmate-launch-film.mp4` (2:44)** — the startup film, 17 scenes.
  Built around one centrepiece: scene 11, *"Why was that bad?"*, where the
  music ducks to its quietest point and the verdict lands. Runs on music and
  on-screen text with no voiceover, so it works muted and on a loop, and is
  narration-ready — drop a voice track in and nothing needs retiming. See
  `video/NARRATION.md` for the per-scene script and the exact steps.
- **`voicechessmate-promo-24s.mp4` (0:24)** — the social cutdown, which is what
  `/brag` is designed to produce. It leads with the same blunder beat, because
  that is the moment that makes someone stop scrolling.

**Neither is the submission video.** The rubric wants a 3–5 minute demo that
shows the features actually working, which means a screen recording with your
voice over it. `submission/DEMO_VIDEO_SCRIPT.md` is the script for that — it is
the one deliverable here that needs you rather than the machine.

## Rebuilding any of it

```bash
# app must be running for screenshot/board captures
cd ../voicechessmate-assemblyai && npm run build && npm start

# cover and deck are plain HTML rendered through headless Chromium
# (see the scratch scripts referenced in the session, or re-shoot with any
#  1920×1080 headless screenshot at deviceScaleFactor 2)

# videos
cd video/composition && npx hyperframes check && npx hyperframes render --output ../voicechessmate-launch-film.mp4
cd video/short       && npx hyperframes check && npx hyperframes render --output ../voicechessmate-promo-24s.mp4
```

## Claims check

Everything asserted in the deck, cover and copy traces to something real:

- **507 tests / 22 files** — `npm test` in the repo.
- **18 typed tools** — counted in `src/lib/tool-handlers.ts`.
- **43M blind / 295M moderate-to-severe** — Lancet Global Health / GBD Vision
  Loss Expert Group prevalence estimates.
- **Market SAM/SOM figures** — labelled on the slide as bottom-up estimates
  from a stated participation assumption, not measured demand. Keep that
  labelling if you edit the deck; a judge who checks will respect the reasoning
  and punish an invented number.
- **"1985" IBCA attribution** — this comes from the app's own IBCA guide modal,
  which predates this session. It is consistent across the app, deck and README,
  but it was not independently verified here. If you want it airtight before
  judging, confirm the date or soften it to "the IBCA tournament alphabet"
  everywhere.
