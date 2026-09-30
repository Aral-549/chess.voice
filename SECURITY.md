# Security Policy

## Reporting a vulnerability

Please report security issues privately via
[GitHub Security Advisories](https://github.com/Aral-549/chess.voice/security/advisories/new)
rather than opening a public issue.

We aim to acknowledge reports within 72 hours.

## Credential handling

chess.voice never exposes an AssemblyAI API key to the browser.

- `ASSEMBLYAI_API_KEY` is read **server-side only**, inside
  `src/app/api/token/route.ts`.
- The browser receives a short-lived token (300s TTL, 3600s max session)
  minted by that route. It never sees the long-lived key.
- The token route enforces a same-origin check in production and a durable,
  per-identity voice budget held in Postgres — see
  `contracts/identity-and-quota.md`. The previous in-memory limiter was
  per-serverless-instance and therefore close to meaningless in production; it
  survives only as a labelled degraded fallback for a database outage.
- A single session is capped at 10 minutes (`max_session_duration_seconds`),
  down from 60, so one leaked token has a bounded cost.
- The anonymous device cookie is HMAC-signed and httpOnly. A forged or replayed
  cookie cannot inherit another identity's budget; it is issued a fresh one.
- The route deliberately logs **nothing** derived from the API key — not its
  length, not a prefix. Server logs are a disclosure surface.

`SUPABASE_SERVICE_ROLE_KEY` bypasses row level security. It is read only by
`src/lib/supabase/server.ts`, never prefixed `NEXT_PUBLIC_`, and never imported
into a `"use client"` module. The browser receives only the anon key, and every
application table has RLS enabled with no permissive policy — so that key grants
no read or write access to application data.

If you fork this project, set `ASSEMBLYAI_API_KEY`, `DEVICE_SECRET` and the
Supabase keys as environment secrets in your host (Vercel project settings, or
repository secrets for CI). Never commit `.env.local`; it is git-ignored.

## Scope

In scope: credential exposure, token-minting abuse, quota or rate-limit bypass,
device-cookie forgery, cross-origin token theft, row level security bypass, and
any path that reads or writes another identity's games.

Out of scope: chess engine strength, speech recognition accuracy, and
denial-of-service against your own deployment.
