# Contract: Identity and voice quota

## Purpose
Decides **who is asking** for an AssemblyAI session token and **whether they are
still allowed one**, then records what they took. It is the only thing standing
between a public URL and an unbounded bill.

It owns identity resolution, budget accounting, and the mint decision. It does
not own the AssemblyAI request itself (that stays in the token route), the chess
engine, or the UI.

**Why this is mandatory, not an upgrade:** the previous limiter kept counts in a
module-level `Map` inside a serverless function. Vercel runs many concurrent
lambda instances, each with its own `Map`, so the documented "10 mints/minute
per IP" was really "10 per minute per IP *per instance*" — an unbounded number
in aggregate. Each mint granted `max_session_duration_seconds=3600`. A public
URL could therefore be turned into an arbitrary quantity of paid agent time by
anyone, with no record of who did it.

## Identity model

Anonymous play must keep working — judges click the demo link and play without
signing up — so identity has two tiers.

- **Device.** Every visitor gets `vcm_device`: an httpOnly, Secure, SameSite=Lax
  cookie holding `<uuid>.<hmac>`, signed server-side with `DEVICE_SECRET`.
  Unsigned or badly-signed cookies are replaced, never trusted.
- **Account.** A Supabase magic-link sign-in. The device row is then linked to
  the user id, and games played on that device before sign-in are claimable.

Identity resolution order: valid session user → valid device cookie → issue a
new device cookie.

## Inputs
- `request`: the incoming `NextRequest` — cookies, headers.
- `supabase`: server client using the **service role** key. Never reaches the
  browser.
- Environment: `DEVICE_SECRET`, `ASSEMBLYAI_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.

## Outputs
- `{ token, expires_in, budget: { remainingSeconds, resetAt, tier } }` on success.
- `{ error, code }` plus an HTTP status on refusal.
- A `voice_ledger` row for every mint, and an updated `voice_budget` row.
- A `Set-Cookie` for `vcm_device` when a new device identity is issued.

## Budget model — reserve then refund

Actual consumed audio time is not observable server-side, and a client is free
not to report it. So the budget is **pessimistic on mint and reconciled on
report**:

1. A mint **reserves** `MAX_SESSION_SECONDS` from the identity's remaining
   budget, whatever the session actually turns out to be.
2. When the client reports a clean session end with a real duration, the
   difference is **refunded**.
3. A client that never reports keeps the full pessimistic reservation. Silence
   costs the user, never the operator.

Constants:

| Name | Value | Why |
|---|---|---|
| `MAX_SESSION_SECONDS` | 600 | Was 3600. Caps the blast radius of one leaked token at ten minutes. |
| `TOKEN_TTL_SECONDS` | 300 | Unchanged. The window to *open* a session. |
| `ANON_DAILY_SECONDS` | 1800 | 30 min/day. Enough to play several full games; not enough to be worth farming. |
| `USER_DAILY_SECONDS` | 7200 | 2 h/day for a signed-in account. |
| `WINDOW` | rolling 24 h | Per identity, from first mint in the window. |
| `GLOBAL_DAILY_SECONDS` | 36000 (10 h), env-overridable | Deployment-wide ceiling across **all** identities. Per-identity quota bounds one caller; this bounds the invoice. |

## Behaviour cases (input → expected output)

| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | No cookie, budget available | 200 + token; `Set-Cookie: vcm_device`; ledger row written; 600s reserved | First-time visitor, anonymous |
| 2 | Valid device cookie, budget available | 200 + token; **no** new cookie; 600s reserved | Returning anonymous |
| 3 | Cookie with a bad HMAC | Treated as absent: new identity issued, **not** an error | A forged id must never inherit someone's budget |
| 4 | Cookie for an unknown uuid | New budget row created at full allowance | Deleted rows must not grant infinite budget |
| 5 | Anonymous, 1800s already reserved in window | 429 `quota_exhausted`; body names `resetAt`; **no** mint, **no** upstream call | The core protection |
| 6 | Signed-in user, 1800s used | 200 + token — the user allowance is 7200s | Tier is read from the account, not the device |
| 7 | Remaining budget < `MAX_SESSION_SECONDS` but > 0 | 200 + token; reserve only what remains; response reports the smaller `remainingSeconds` | Do not refuse a user with 4 minutes left |
| 8 | Remaining budget is exactly 0 | 429 `quota_exhausted` | Boundary |
| 9 | Window has elapsed since first mint | Budget resets to the full tier allowance; 200 + token | Rolling window |
| 10 | Session end reported: reserved 600, actual 90 | 510s refunded; ledger row marked reconciled | The refund path |
| 11 | Session end reported twice for one ledger id | Second is a no-op; budget unchanged | Refund must be idempotent |
| 12 | Session end reports a duration > reserved | Clamped to the reservation; no negative spend | A lying client cannot mint budget |
| 13 | Session end for another identity's ledger id | 403; no budget change | Ownership is checked |
| 14 | `ASSEMBLYAI_API_KEY` missing | 500 `not_configured`; nothing written to the ledger | Config error, not a spend event |
| 15 | Supabase unreachable or unconfigured | 200 + token, degraded: in-process limiter only, response flags `degraded: true`, warning logged | The live demo must not hard-fail on a DB outage |
| 16 | Upstream AssemblyAI returns non-2xx | Upstream status propagated; **reservation released** | A failed mint must not cost the user |
| 17 | Two concurrent mints, 1 session of budget left | Exactly one succeeds; the other gets 429 | Enforced by an atomic DB decrement, not read-then-write |
| 18 | Cross-origin request in production | 403; no mint | Existing behaviour, must survive |
| 19 | Global budget exhausted, identity has budget | 503 `service_at_capacity`; identity's reservation **released**; no mint | The circuit breaker. Voice stops for everyone; keyboard play continues |
| 20 | Global budget has less left than the identity asked for | Session shrunk to the global remainder; identity credited the difference | A partial global grant is still a grant |
| 21 | Mint fails after both budgets were charged | **Both** identity and global reservations released | Otherwise failed mints ratchet the ceiling down permanently |
| 22 | Session reconciled early | Refund credited to **both** identity and global budgets | Same reason as 21 |
| 23 | Global budget query errors | Mint proceeds on the identity reservation alone; warning logged | The cap degrades open — it must not become a new single point of failure |

## Edge cases that must be covered
- Clock skew between reserve and refund — durations derive from stored
  timestamps, never from a client-supplied "now".
- A user signing in mid-session: the in-flight reservation stays on the device
  identity; only later mints use the account tier.
- `DEVICE_SECRET` rotated — every existing cookie fails its HMAC and is
  reissued. Acceptable (a budget reset), must not throw.
- A device cookie arriving with an account session for a *different* user: the
  account wins; the device is re-linked.
- Malformed `Set-Cookie` values, oversized cookies, and cookies containing `.`
  in the uuid segment.

## The circuit breaker

Per-identity quota answers "what can one person take". It does not answer "what
can five thousand people take", which is the question an invoice asks. Every
mint therefore reserves from two budgets: the identity's, and a single
deployment-wide row keyed `global`.

When the global ceiling is reached the app returns 503 `service_at_capacity`
and keeps working — the board, the keyboard shortcuts, the screen reader
announcements and text move entry are all unaffected, because none of them
touch the voice agent. Only the microphone path pauses. That is why tripping
this is a degradation and not an outage, and it is the reason the keyboard path
is a hard requirement elsewhere in this project rather than a nicety.

The ceiling is deliberately a blunt instrument. It is not fair-share, it is not
per-region, and an early-rising abuser can consume it before anyone else wakes
up. It exists to bound the worst case, not to allocate the good case.

## Explicitly out of scope
- Billing, plans, and payment — `profiles.tier` is a string this contract reads
  but does not set.
- Abuse detection beyond quota (no IP reputation, no bot scoring).
- Metering AssemblyAI's own billed usage. This meters *granted* session time,
  which is an upper bound on it, not a reconciliation of the invoice.

## Status
- [x] Drafted
- [ ] Reviewed by a human
- [ ] Implementation matches this contract
- [ ] Tests exist for every behaviour case above
