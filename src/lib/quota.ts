// ============================================================
// VoiceChessmate — voice budget policy
//
// Pure decisions only: how much a caller may reserve, and how much to refund
// when a session is reconciled. No database, no request, no clock reads that
// the caller did not hand in — so every case in
// contracts/identity-and-quota.md is testable without a server.
// ============================================================

/** Ceiling on a single agent session. Was 3600; a leaked token used to buy an
 *  hour of paid time. See BUGLOG 2026-09-22. */
export const MAX_SESSION_SECONDS = 600;

/** How long the minted token stays usable to *open* a session. */
export const TOKEN_TTL_SECONDS = 300;

/** Rolling window over which an allowance is spent. */
export const WINDOW_SECONDS = 24 * 60 * 60;

export type Tier = 'anon' | 'user';

/** Daily allowance per tier. Anonymous is deliberately generous enough to play
 *  several full games — judges must be able to try the demo — and deliberately
 *  too small to be worth farming. */
export const ALLOWANCE_SECONDS: Record<Tier, number> = {
  anon: 30 * 60,
  user: 120 * 60,
};

export function allowanceFor(tier: Tier): number {
  return ALLOWANCE_SECONDS[tier] ?? ALLOWANCE_SECONDS.anon;
}

/** Budget key for the whole deployment, not any one identity. Unambiguous
 *  against per-identity keys, which are always `device:<uuid>` / `user:<uuid>`. */
export const GLOBAL_SUBJECT = 'global';

/** Default ceiling on voice time granted across ALL identities in a window.
 *  10 hours/day: generous for a demo and for early real usage, and a hard stop
 *  on what a traffic spike or a determined abuser can cost in one day.
 *  Override with VOICE_GLOBAL_DAILY_SECONDS. */
export const DEFAULT_GLOBAL_DAILY_SECONDS = 10 * 60 * 60;

/**
 * The deployment-wide ceiling.
 *
 * Per-identity quota bounds what one caller takes; it does nothing about
 * 5,000 callers each taking their full allowance. This is the circuit breaker
 * for that case. When it trips, voice stops for everyone until the window
 * rolls — the app stays fully playable by keyboard and text, which is why
 * tripping it is a degradation rather than an outage.
 */
export function globalDailySeconds(): number {
  const raw = Number(process.env.VOICE_GLOBAL_DAILY_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_GLOBAL_DAILY_SECONDS;
}

export interface GrantDecision {
  /** Seconds to reserve. 0 means refuse with 429. */
  granted: number;
  /** What is left for this identity after this grant. */
  remainingSeconds: number;
  /** When the window rolls over and the allowance resets. */
  resetAt: Date;
}

/**
 * Decide how much to grant, given what the identity has already reserved.
 *
 * Contract cases 5-9. A partial grant is a grant (case 7): a player with four
 * minutes left gets four minutes, not a refusal.
 */
export function decideGrant(params: {
  tier: Tier;
  reservedSeconds: number;
  windowStart: Date;
  now: Date;
  want?: number;
}): GrantDecision {
  const { tier, now, windowStart } = params;
  const want = params.want ?? MAX_SESSION_SECONDS;
  const allowance = allowanceFor(tier);

  // Case 9: the window has elapsed, so the slate is clean.
  const windowElapsed = now.getTime() - windowStart.getTime() >= WINDOW_SECONDS * 1000;
  const reserved = windowElapsed ? 0 : Math.max(0, params.reservedSeconds);
  const effectiveStart = windowElapsed ? now : windowStart;

  const remainingBefore = Math.max(0, allowance - reserved);
  const granted = Math.max(0, Math.min(want, remainingBefore));

  return {
    granted,
    remainingSeconds: remainingBefore - granted,
    resetAt: new Date(effectiveStart.getTime() + WINDOW_SECONDS * 1000),
  };
}

/**
 * How many seconds to hand back when a session is reported finished.
 *
 * Contract cases 10-12. A client that over-reports cannot mint budget (12),
 * and one that never reports keeps the full pessimistic reservation — silence
 * costs the user, never the operator.
 */
export function refundFor(params: {
  reservedSeconds: number;
  actualSeconds: number;
  alreadyReconciled: boolean;
}): number {
  // Case 11: reconciling twice is a no-op.
  if (params.alreadyReconciled) return 0;

  const reserved = Math.max(0, params.reservedSeconds);
  // Case 12: clamp a hostile or buggy duration into the reservation.
  const actual = Math.min(Math.max(0, params.actualSeconds), reserved);

  return reserved - actual;
}

/** `device:<uuid>` / `user:<uuid>` — one key space for both identity tiers. */
export function subjectKey(identity: { kind: Tier; id: string }): string {
  return `${identity.kind === 'user' ? 'user' : 'device'}:${identity.id}`;
}
