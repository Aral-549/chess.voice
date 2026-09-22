# Contract: Game persistence and rating

## Purpose
Makes a game survive a refresh, a dropped connection, and a closed laptop, and
turns finished games into a rating. Owns the `games` and `profiles` tables and
the Elo calculation. Does not own chess legality (that is `chess-engine`), the
voice pipeline, or quota (that is `identity-and-quota`).

**Why this matters more here than in a typical chess app:** the target user
cannot glance at the board to rebuild context. Losing a game in progress is not
a minor annoyance — it costs them the position they were holding in memory.
Resume is an accessibility feature.

## Inputs
- `identity`: the resolved device id or user id from `identity-and-quota`.
- `pgn`: full move history, the authoritative record.
- `fen`: current position, denormalised for cheap resume.
- `difficulty`: `beginner | intermediate | advanced | master`.
- `timeControl`: mode string, or `casual`.
- `result`: `win | loss | draw | abandoned`, set on completion.

## Outputs
- `games` rows owned by exactly one identity.
- `profiles.rating` updated once per completed game.
- Resume payload: the most recent unfinished game for the identity, or `null`.

## Engine ratings

The opponent's rating comes from the difficulty already shown in the UI, so the
number a player sees and the number that moves their rating agree:

| Difficulty | Rating |
|---|---|
| beginner | 800 |
| intermediate | 1400 |
| advanced | 1800 |
| master | 2200 |

New players start at **1200**. K-factor is **32** under 30 games, **16** after.

## Behaviour cases (input → expected output)

| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | Move played, game unsaved | A `games` row is created, status `in_progress` | First move creates the record, not page load — an abandoned empty board is not a game |
| 2 | Move played, game already saved | Existing row updated; no second row | Idempotent on game id |
| 3 | Reload mid-game | Resume returns that game; board and move history restore from `pgn` | The core feature |
| 4 | Two unfinished games exist | Resume returns the most recently updated one | Should not normally happen; must be deterministic |
| 5 | No unfinished game | Resume returns `null`; a new game starts | Not an error |
| 6 | Game ends in checkmate, player won | `result: win`, status `complete`; rating rises | |
| 7 | Game ends, player lost | `result: loss`; rating falls | |
| 8 | Draw or stalemate | `result: draw`; rating moves toward the engine rating | |
| 9 | Player resigns | `result: loss`, `end_reason: resign`; rating falls | A resignation is a loss |
| 10 | A completed game is submitted again | Rating is **not** applied twice | `rated_at` is set once; the write is a no-op thereafter |
| 11 | Anonymous player signs in | Games on that device are re-owned to the user id; rating recomputed from them | The claim path |
| 12 | Player requests another identity's game | 404, not 403 | Do not confirm the id exists |
| 13 | `pgn` fails to parse | 400; nothing written | A corrupt record is worse than no record |
| 14 | Supabase unconfigured or unreachable | Game continues in memory; save is skipped; a non-blocking notice is announced once | Play must never depend on the database |
| 15 | Rating would fall below 100 | Clamped to 100 | No negative or absurd ratings |
| 16 | Game abandoned, untouched 7+ days | Swept to `abandoned`, unrated | Housekeeping; never rated |

## Edge cases that must be covered
- Two tabs playing the same game — last write wins, and neither may create a
  duplicate row.
- A game completed while offline and submitted later.
- `pgn` for a game that ended by timeout rather than on the board.
- Claiming device games when the account already has a rating — recompute, do
  not sum.
- Very long games: `pgn` must stay within a sane column size.

## Accessibility requirements
- Resume must be announced through an ARIA live region on load: *"Resuming your
  game from move 14. It is your turn."* — never only a visual banner.
- Every save is silent. Success must not interrupt; only a persistent failure
  is announced, once.
- Sign-in is a magic link: one labelled email field, one button, status through
  a live region. No password, no CAPTCHA, no timed redirect.

## Explicitly out of scope
- Human-vs-human play and matchmaking.
- Analysis, engine evaluation history, opening classification.
- Leaderboards and any public exposure of one user's data to another.

## Status
- [x] Drafted
- [ ] Reviewed by a human
- [ ] Implementation matches this contract
- [ ] Tests exist for every behaviour case above
