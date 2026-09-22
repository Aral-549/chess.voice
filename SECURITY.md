# Security Policy

## Reporting a vulnerability

Please report security issues privately via
[GitHub Security Advisories](https://github.com/Aral-549/chess.voice/security/advisories/new)
rather than opening a public issue.

We aim to acknowledge reports within 72 hours.

## Credential handling

VoiceChessmate never exposes an AssemblyAI API key to the browser.

- `ASSEMBLYAI_API_KEY` is read **server-side only**, inside
  `src/app/api/token/route.ts`.
- The browser receives a short-lived token (300s TTL, 3600s max session)
  minted by that route. It never sees the long-lived key.
- The token route enforces a same-origin check in production and a
  per-IP rate limit of 10 mints/minute, matching
  `contracts/assemblyai-voice-engine.md` (behaviour case 2).
- The route deliberately logs **nothing** derived from the API key — not its
  length, not a prefix. Server logs are a disclosure surface.

If you fork this project, set `ASSEMBLYAI_API_KEY` as an environment secret in
your host (Vercel project settings, or repository secrets for CI). Never commit
`.env.local`; it is git-ignored.

## Scope

In scope: credential exposure, token-minting abuse, rate-limit bypass,
cross-origin token theft.

Out of scope: chess engine strength, speech recognition accuracy, and
denial-of-service against your own deployment.
