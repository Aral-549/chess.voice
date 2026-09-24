# Demo video — shot-by-shot script

**Target: 4:15.** The rubric caps Pillar 1 at "Limited" for anything under 3
minutes, and the hard limit is 5. Aim for 4:00–4:30 so a slow take still lands
inside the window.

**Format:** 1920×1080 MP4, screen recording with voiceover.
**Recording:** OBS, or `wf-recorder -f demo.mkv` on Hyprland. Record system
audio too — the coach's voice and the earcons are half the product.

**Before you record**

- Run the production build, not `npm run dev` — no dev overlay, no compile
  flashes: `npm run build && npm start`
- Close notifications. Full-screen the browser at 1920×1080.
- Confirm `ASSEMBLYAI_API_KEY` is live and you have credits — the whole demo is
  the voice path.
- Do a throwaway take first to warm the mic and check levels.
- Have the deck PDF open in a second window for the architecture beat.

A note on narration: everything below is written to be *said*, not read. If a
line feels stiff in your mouth, change it. Your own phrasing beats a script.

---

## 0:00 – 0:20 · Cold open, no preamble

**Screen:** App already open, board visible, a game a few moves in. You are
holding J.

**You say, on camera audio:** "Knight to Felix three."

Let the coach respond. Let the earcon play. Then, without narrating:

**Play a blunder** — `Qxf7` into a defended square — and **press W**.

Let it say: *"That was a blunder. Queen to Felix seven gives up about seven
point eight pawns of advantage. Nc3 was stronger."*

Say nothing over any of it.

> Do not open with your name, the hackathon name, or "hi everyone". Open with
> the product working. Judges watch a lot of these; the first ten seconds are
> the only ones you are guaranteed.
>
> The blunder beat is the strongest ten seconds this product has: it is the
> moment the app stops being a board you talk to and becomes something that
> talks back with a real number behind it. Lead with it.

---

## 0:20 – 0:55 · The problem

**Screen:** Slide 2 of the deck, then slide 3.

**Narration:**

"That was a full chess move, played without touching anything.

Forty-three million people are blind. Two hundred and ninety-five million live
with serious visual impairment. And chess is one of the few games where they
compete on completely equal terms — the game itself needs no sight at all.

Chess *software* does. Open any mainstream chess site with a screen reader and
you get a grid of sixty-four empty cells. The hard part stops being your
opponent and starts being the interface.

The workarounds are all compromises. A physical board needs a sighted helper in
the room. A braille board can't reach anyone online. A text interface makes you
hold the whole position in your head with no way to ask a question about it."

---

## 0:55 – 1:35 · Architecture

**Screen:** Slide 5 (architecture), then cut to the code — `tool-handlers.ts`
with the tool definitions visible.

**Narration:**

"So here's how it works.

Microphone audio goes through an AudioWorklet in twenty-five millisecond
buffers, as PCM sixteen at twenty-four kilohertz, straight over a WebSocket to
AssemblyAI's Voice Agent API. That one connection handles speech-to-text with
Universal-3 Pro, turn detection, the language model, and the voice coming back.

The important part is what the model is *allowed* to do. It never describes the
board. It can only call these — eighteen typed JSON-schema tools, executed
against a real chess engine. `apply_move`, `describe_board`,
`explain_last_move`, `set_play_mode`, `replay_game`. The engine is the authority on what's legal and what's on the
board, so the model cannot invent a piece that isn't there.

One detail worth mentioning: playback runs on a *second* audio context at
forty-eight kilohertz. Force it to twenty-four and PulseAudio silently mutes
the stream — which is the platform a lot of screen reader users are on. That
one took a while to find."

---

## 1:35 – 3:30 · Live demo — the long beat, show everything

**Screen:** The app. This section carries Pillar 3, so every feature gets
shown working. Do it as one continuous game if you can.

That is twelve items in under two minutes, so roughly nine seconds each. Two of
them — the blunder explanation and the refusal — are worth more than that and
should take it from the others. If you run long, cut items 10 and 11 rather
than rushing 4 and 5.

Run through these, narrating lightly over the gaps:

1. **Speak a move in IBCA phonetics** — "Eva four."
   Say: *"That's the official blind-tournament alphabet. Anna, Bella, Cesar,
   David, Eva, Felix, Gustav, Hector."*

2. **Explain why it exists** — *"B, D, E and G sound nearly identical over a
   microphone, and that's exactly the alphabet chess uses. One misheard letter
   is a legal, different, losing move. So we use the notation blind players
   already use — and it doubles as a phonetically separated vocabulary the
   recogniser is biased toward."*

3. **Ask a board question** — "What's attacking my queen?" Then "Describe the
   board." Let the full readout play; don't cut it short.

4. **Ask why a move was bad** — blunder deliberately, then say *"why was that
   bad?"* or press **W**.
   Say: *"That number is not a language model's opinion. It's the engine's own
   evaluation — how much worse my move was than the best one, in pawns. It will
   tell me what I lost and what was better, because both are computed. It won't
   claim a fork it can't actually see."*
   **This and the refusal below are the two beats that matter most. Do not rush
   either.**

5. **Show the refusal.** Type an illegal move naming a piece — `Be2` while in
   check from a knight.
   Say: *"It doesn't guess. It reads back the real legal options. A sighted
   player undoes a wrong move instantly; a blind player might not find it for
   several moves. So the rule is: prefer making no move over making a wrong
   one."*

6. **Switch to Blindfold mode** in the Mode control — the board disappears.
   Play two or three moves without it.
   Say: *"This is the reframe. Blindfold chess is a discipline every serious
   club player trains, and there's no good tool for it. What we built as an
   accommodation turns out to be training for sighted players too. It scores
   the thing that actually matters — naming a piece that isn't on that square,
   which is losing the position in your head, not playing badly."*
   Then reveal the board and note that the attempt ends and is marked unranked:
   *"You can peek. You just can't pretend you didn't."*

7. **Mention Hands-free mode** (you do not have to demo it walking):
   *"Continuous listening, no key at all — for playing while you walk or cook.
   It confirms every move first, because continuous listening means the
   microphone decided, not me."*

8. **Replay a famous game** — *"replay the Opera Game"* — and let two or three
   moves narrate.
   Say: *"You can just listen to chess."*

9. **Press T for threats, G for tactical summary.**
   Say: *"Every one of these has a keyboard path. Voice complements the
   keyboard — it never replaces it. Blind players are expert keyboard users,
   and a keypress can't be misheard."*

10. **Change difficulty by voice**, and **undo a move**.

11. **Turn on high contrast** and bump the font scale, briefly.

12. **Finish a game** so the game-over verdict and sound play.

---

## 3:30 – 4:00 · Business value

**Screen:** Slides 8 and 9.

**Narration:**

"On the business side. The addressable population is two hundred ninety-five
million people with moderate-to-severe visual impairment. Applying a
conservative chess-participation assumption gives a serviceable market around
four million, and a three-year target around sixty thousand — reachable because
this audience is *organised*: blind associations, schools for the blind,
national chess federations.

Four revenue streams. The free tier stays genuinely free — putting
accessibility behind a paywall would defeat the product. Pro subscription for
tournament mode, an opening trainer and spoken tactics drills. Licensing the
voice layer to existing chess platforms, whose accessibility gap this closes.
And institutional site licences, where there are real budgets and a mandate.

Those market numbers are bottom-up estimates with stated assumptions, not
forecasts. I'd rather show you the reasoning than a number I made up."

---

## 4:00 – 4:15 · Close

**Screen:** Slide 10, then the live app.

**Narration:**

"It's live at voicechessmate dot vercel dot app, MIT licensed, five hundred and
seven tests, CI on every push.

Next up: human versus human over WebRTC, Spanish and German phonetic sets, and
licensing the voice layer to the platforms that need it.

Chess never needed sight. Its software just assumed it."

**End card:** URL + repo link. Hold 3 seconds. Cut.

---

## If a live voice take keeps failing

Do not fake it. A judge can tell, and Pillar 3 explicitly rewards a demo where
the features are genuinely shown working.

Fallback order:
1. Record the voice section in several short takes and cut them together —
   continuous is nicer, not required.
2. If the API is down or credits are out, record the keyboard and text-entry
   paths live, and say plainly that the voice path is shown in the first
   segment. Honesty reads better than a staged take.
3. Keep the cold open genuine no matter what — it is the one moment that has
   to be real.

## Checklist

- [ ] Total runtime between 3:00 and 5:00 (target 4:15)
- [ ] Every feature in the 1:50–3:20 block actually demonstrated
- [ ] The blunder / "why was that bad?" beat is in and not rushed
- [ ] The refusal beat is in and not rushed
- [ ] Blindfold mode demonstrated with the board actually disappearing
- [ ] System audio captured — coach voice and earcons audible
- [ ] Live URL and GitHub link both visible on screen at some point
- [ ] Exported as MP4, 1920×1080
