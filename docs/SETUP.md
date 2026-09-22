# Setup

Two levels. The first gets a playable app; the second adds accounts, saved
games and the durable voice budget.

---

## 1. Minimum — a playable app (~3 minutes)

```bash
npm install
cp .env.local.example .env.local
```

Fill in two values:

```bash
# from https://www.assemblyai.com/dashboard
ASSEMBLYAI_API_KEY=...

# any long random string
DEVICE_SECRET=$(openssl rand -base64 32)
```

```bash
npm run dev
```

That is a fully working voice chess app. Games are not saved, and the voice
budget falls back to a weak per-instance limiter — fine locally, **not fine in
production**. See below.

---

## 2. Production — accounts, saved games, real quota (~10 minutes)

### Why this part is not optional in production

The token route mints AssemblyAI session tokens. Without a shared datastore the
rate limiter lives in a single serverless instance's memory, and Vercel runs
many instances concurrently — so the limit is per-instance, not global. A public
URL with no durable budget is an open tap on your API credits.

With Supabase configured, every mint reserves time against a per-identity daily
budget in Postgres, enforced with a row lock so two simultaneous requests cannot
both spend the last of it.

### 2.1 Create the project

1. Go to <https://supabase.com> → **New project**. The free tier (50k monthly
   active users, 500MB) covers far more than 5,000 players.
2. Choose a region near your users. Save the database password somewhere.

### 2.2 Run the migration

Supabase dashboard → **SQL Editor** → **New query**. Paste the entire contents
of `supabase/migrations/0001_init.sql` and run it.

It creates `profiles`, `devices`, `games`, `voice_budget`, `voice_ledger`, the
two budget functions, and enables row level security on everything.

Verify:

```sql
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public';
```

Every row must show `rowsecurity = true`. If any says false, stop and re-run the
migration — an unprotected table plus the public anon key is a data leak.

### 2.3 Copy the keys

Supabase → **Project Settings → API**:

| Supabase field | Goes into |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

> The `service_role` key bypasses row level security. It must never be prefixed
> `NEXT_PUBLIC_`, never committed, and never referenced from a `"use client"`
> file. `src/lib/supabase/server.ts` is the only module that reads it.

### 2.4 Configure auth redirects

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://your-domain.vercel.app`
- **Redirect URLs**: add both
  - `https://your-domain.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

Under **Authentication → Providers**, confirm **Email** is enabled. Turn *off*
"Confirm email" if you want magic links to sign people straight in.

> Supabase's built-in email sender is rate limited to a handful per hour — fine
> for judging and early users. Attach your own SMTP provider under
> **Project Settings → Auth → SMTP** before any real launch.

### 2.5 Deploy

Add all five variables in **Vercel → Project → Settings → Environment
Variables**, then redeploy. Vercel does not pick up new variables without one.

---

## Verifying it works

```bash
# 1. A token mint returns a budget block
curl -i localhost:3000/api/token

# Expect 200 and a body containing:
#   "budget": { "tier": "anon", "grantedSeconds": 600, ... }
# and a Set-Cookie: vcm_device=...
```

```bash
# 2. The budget is actually enforced. 30 min allowance / 10 min per session
#    = 3 sessions, so the fourth must be refused.
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "%{http_code} " -b jar -c jar localhost:3000/api/token
done; echo
# Expect: 200 200 200 429
```

If the fourth returns 200, Supabase is not wired up — the app fell back to the
weak limiter. Check the server log for a `token.reserve` line with
`"status":"degraded"` or `"unconfigured"`.

```bash
# 3. Saved games
#    Play a few moves, reload the page. The board should restore and a screen
#    reader should announce "Resuming your game from move N."
```

---

## What runs without Supabase

Deliberately, everything that matters for a demo:

| Feature | No Supabase | With Supabase |
|---|---|---|
| Play a full game by voice | yes | yes |
| Keyboard + screen reader support | yes | yes |
| Voice budget | per-instance, weak | durable, per identity |
| Save / resume a game | no | yes |
| Accounts and rating | hidden | yes |

The account panel renders nothing at all when auth is unconfigured, rather than
offering a button that cannot work.

---

## Operational notes

- **Budget tuning** lives in `src/lib/quota.ts`: `MAX_SESSION_SECONDS` (600),
  `ANON_DAILY_SECONDS` (30 min), `USER_DAILY_SECONDS` (2 h). Changing these
  changes the contract — update `contracts/identity-and-quota.md` with them.
- **Spend is attributable.** Every mint writes a `voice_ledger` row. To see
  today's heaviest users:

  ```sql
  select subject, sum(coalesce(actual_seconds, reserved_seconds)) as seconds
    from voice_ledger
   where created_at > now() - interval '24 hours'
   group by subject
   order by seconds desc
   limit 20;
  ```

- **Structured logs.** Every stage boundary emits one JSON line with a `stage`
  and `status` field (`token.reserve`, `token.mint`, `session.end`,
  `game.save`, `game.claim`, `auth.callback`). Filter on `"status":"refused"`
  to see quota rejections. Anything matching key names like `key`, `token`,
  `secret` or `email` is redacted before it is written.
- **Abandoned games** are swept by status, not deleted. Nothing removes rows
  automatically yet.
