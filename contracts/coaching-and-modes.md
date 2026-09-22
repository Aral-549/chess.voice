# Contract: Coaching and play modes

## Purpose
The four capabilities that exist **because** the interface is a conversation,
and could not exist in a click interface without becoming a wall of text
nobody reads.

1. **Move analysis** — "why was that bad?", answered from the engine's real
   evaluation rather than invented by a language model.
2. **Blindfold mode** — the board is hidden and stays hidden. A training
   discipline, scored.
3. **Narrated games** — listen to a famous game the way you'd listen to a
   podcast.
4. **Hands-free mode** — continuous listening with no keyboard at all.

This module owns classification, blindfold scoring, the game library, and mode
state. It does not own chess legality (`chess-engine`), the voice transport
(`assemblyai-voice-engine`), or quota (`identity-and-quota`).

**Why these four and not a chess.com feature list:** a click interface already
wins at boards, clocks and puzzle grids. Rebuilding those would be a worse
version of a solved product. What a board cannot do is *answer a question*. All
four below are that.

---

## 1. Move analysis

### Inputs
- The position before the player's move (FEN).
- The move actually played (SAN).
- Search depth (default **1**). Measured on a 39-move position: depth 1 =
  277ms, depth 2 = 2491ms, with *identical* classifications on every case
  tested. Two and a half seconds of silence before synthesis even begins is not
  a conversation, so the extra ply is not bought.

### Outputs
`{ classification, centipawnLoss, bestMove, playedMove, spoken }`

Classification is derived from centipawn loss — how much worse the played move
is than the engine's best, both evaluated from the mover's perspective:

| Loss (centipawns) | Classification |
|---|---|
| 0 | `best` |
| 1–49 | `good` |
| 50–149 | `inaccuracy` |
| 150–299 | `mistake` |
| ≥ 300 | `blunder` |

A pawn is 100. The bands are the ones used by mainstream analysis tools, so a
player who knows the vocabulary gets the meaning they expect.

### Behaviour cases

| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | Player hangs a queen for nothing | `blunder`; loss ≥ 300; names a better move | The headline case |
| 2 | Player plays the engine's own top choice | `best`; loss 0 | Must not manufacture criticism |
| 3 | Only one legal move exists | `best`; loss 0; spoken text says it was forced | Criticising a forced move is nonsense |
| 4 | Player finds a mate in one | `best`; never negative loss | A win is never an error |
| 5 | Player misses a mate in one and plays something quiet | `blunder` | Missing a win is a real error |
| 6 | Loss is negative (played move beats the search's "best") | Clamped to 0, classified `best` | A shallow search must never insult a good move |
| 7 | Asked about a move in a finished game | Analysis of the final move; no crash | |
| 8 | Asked before any move has been played | `null`; spoken text says there is nothing to analyse | Not an error |
| 9 | Illegal or unparseable move given | `null`; nothing analysed | Garbage in, silence out |
| 10 | Analysis of the *opponent's* last move | Classified from the opponent's perspective | "Why did it play that?" is a fair question |

### Explicitly NOT in scope
- Naming opening theory or ECO codes.
- Multi-move tactical explanation ("this loses to a fork in three"). The engine
  gives a number and a better move; it does not narrate a variation it cannot
  reliably see at conversational depth.
- Claiming a *reason* the model cannot verify. The spoken text may say what was
  lost and what was better. It may not invent a motif.

---

## 2. Blindfold mode

The board is hidden and **cannot be revealed** without ending the attempt. This
is the difference between "I turned the board off" and a discipline.

The real failure mode in blindfold chess is not losing on the board — it is
losing *the position in your head*. That is what gets measured.

### Behaviour cases

| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 11 | Blindfold enabled | Board hidden; the show/hide control is disabled and says why | Not merely hidden |
| 12 | Player asks to show the board mid-game | Attempt ends; the game continues sighted; the score is kept and marked broken | Peeking is allowed; pretending you did not is not |
| 13 | Player names a move for a piece that is not on that square | Counted as a **position error**; refused as usual | The metric that matters |
| 14 | Player names a legal move | Not an error, whatever its quality | Blindfold scoring measures memory, not skill |
| 15 | Player asks "describe the board" | Allowed, counted as an **assist** | A crutch, not a failure |
| 16 | Game ends in blindfold mode | Summary: moves played, position errors, assists used | |
| 17 | Blindfold disabled mid-game | Attempt ends as at case 12 | |

### Accessibility note
For a screen reader user the board is *always* effectively hidden, so blindfold
mode must not present itself as "experience what blind players experience." It
is a training mode, announced as one. The summary text says "played without the
board", never anything about sight.

---

## 3. Narrated games

A small library of famous games, replayed move by move with spoken narration,
at a pace the listener controls.

### Behaviour cases

| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 18 | "Replay the Opera Game" | Loads it; narrates from move 1; playable/pausable by voice | |
| 19 | Named game not in the library | Lists what is available; loads nothing | |
| 20 | "Next move" / "previous move" | Steps one ply, narrating it | |
| 21 | Every shipped PGN | Parses as legal chess at load time | Guarded by a test, not by hope |
| 22 | Player asks a board question mid-replay | Answered against the replay position | Same tools, different board |
| 23 | Replay ends | Says the result and who played it | |

### Provenance rule
Every game in the library carries players, event and year. A game whose PGN
does not parse is not shipped. **A move sequence that cannot be verified is not
attributed to a famous game** — the library is small and correct rather than
large and approximate.

---

## 4. Hands-free mode

No keyboard, no push-to-talk. Continuous listening with server-side turn
detection, for playing while walking, cooking, or with the screen off.

### Behaviour cases

| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 24 | Hands-free enabled | `input.turn_detection` set to continuous; J no longer required | The API allows this mid-session |
| 25 | Hands-free enabled | Every move requires spoken confirmation before it plays | No visual check is possible, so the bar rises |
| 26 | Ambient speech not addressed to the app | No move played | Confirmation is what makes this safe |
| 27 | Hands-free disabled | Returns to push-to-talk; confirmation returns to its normal threshold | |
| 28 | Voice budget exhausted while hands-free | Falls back to keyboard, announced once | Continuous listening spends faster |

### Why confirmation is mandatory here
Push-to-talk means the player chose to speak. Continuous listening means the
microphone decided. The governing rule — prefer no move over a wrong move —
therefore requires an explicit yes before anything touches the board, and the
existing `setConfirmEverySpokenMove` switch is forced on for the duration.

---

## Edge cases that must be covered
- Analysis requested on a position with a single legal reply (case 3).
- Blindfold + hands-free enabled together: both constraints apply.
- A replay loaded while a real game is in progress — the real game must be
  saved first, never silently discarded.
- Position errors counted while the player is *correcting themselves* mid-
  sentence should not double-count.

## Status
- [x] Drafted
- [ ] Reviewed by a human
- [ ] Implementation matches this contract
- [ ] Tests exist for every behaviour case above
