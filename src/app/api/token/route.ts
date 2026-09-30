// ============================================================
// chess.voice — Token Minting API Route
//
// Mints short-lived AssemblyAI tokens for browser WebSocket auth, against a
// durable per-identity budget. The API key never reaches the client, and
// nothing derived from it is ever logged.
//
// This route is the only thing between a public URL and an unbounded bill, so
// it is specified in contracts/identity-and-quota.md rather than described
// here. Behaviour case numbers below refer to that file.
// ============================================================

import { NextResponse, NextRequest } from 'next/server';
import {
  MAX_SESSION_SECONDS,
  TOKEN_TTL_SECONDS,
  WINDOW_SECONDS,
  allowanceFor,
  subjectKey,
  GLOBAL_SUBJECT,
  globalDailySeconds,
  type Tier,
} from '@/lib/quota';
import {
  DEVICE_COOKIE,
  deviceCookieOptions,
  formatDeviceCookie,
  resolveIdentity,
} from '@/lib/identity';
import {
  serviceClient,
  currentUserId,
  isSupabaseConfigured,
  applyCookies,
  type CookieJar,
} from '@/lib/supabase/server';
import { stageLog } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- Degraded-mode limiter -------------------------------------------------
// Only used when Supabase is unreachable (case 15). It is per-instance and
// therefore weak — that is precisely why it is the fallback and not the
// mechanism. Do not "improve" this into the primary path.
const fallbackHits = new Map<string, { count: number; resetAt: number }>();
const FALLBACK_MAX = 6;
const FALLBACK_WINDOW_MS = 60_000;

function fallbackLimited(key: string): boolean {
  const now = Date.now();
  const entry = fallbackHits.get(key);
  if (!entry || now > entry.resetAt) {
    fallbackHits.set(key, { count: 1, resetAt: now + FALLBACK_WINDOW_MS });
    if (fallbackHits.size > 5000) {
      for (const [k, v] of fallbackHits) if (now > v.resetAt) fallbackHits.delete(k);
    }
    return false;
  }
  entry.count++;
  return entry.count > FALLBACK_MAX;
}

function refuse(jar: CookieJar, status: number, code: string, error: string) {
  return applyCookies(NextResponse.json({ error, code }, { status }), jar);
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  // App Route handlers cannot use NextResponse.next() as a scratch response.
  const jar: CookieJar = [];

  // --- Origin check: same-origin only in production (case 18) ---
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return refuse(jar, 403, 'cross_origin', 'Forbidden: cross-origin token request');
      }
    } catch {
      return refuse(jar, 403, 'cross_origin', 'Forbidden: malformed origin');
    }
  }

  // --- Config (case 14): a missing key is an error, not a spend event ---
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return refuse(jar, 500, 'not_configured',
      'ASSEMBLYAI_API_KEY not configured. Edit .env.local and restart the dev server.',
    );
  }

  const secret = process.env.DEVICE_SECRET || '';
  if (!secret) {
    // Without a secret the device cookie is forgeable, which makes the whole
    // anonymous budget meaningless. Fail loudly rather than pretend.
    return refuse(jar, 500, 'not_configured',
      'DEVICE_SECRET not configured. See .env.local.example.',
    );
  }

  // --- Who is asking (cases 1-4, 6) ---
  const userId = await currentUserId(request, jar);
  const identity = resolveIdentity({
    cookieValue: request.cookies.get(DEVICE_COOKIE)?.value,
    userId,
    secret,
  });
  const tier: Tier = identity.kind === 'user' ? 'user' : 'anon';
  const subject = subjectKey({ kind: tier, id: identity.id });

  // --- Reserve budget ---
  const db = serviceClient();
  let granted = MAX_SESSION_SECONDS;
  let remaining = allowanceFor(tier) - MAX_SESSION_SECONDS;
  let degraded = false;
  let ledgerId: string | null = null;

  if (db) {
    const { data, error } = await db.rpc('reserve_voice_seconds', {
      p_subject: subject,
      p_want: MAX_SESSION_SECONDS,
      p_allowance: allowanceFor(tier),
      p_window_secs: WINDOW_SECONDS,
    });

    if (error) {
      // Case 15: a database problem must not take the demo down with it.
      degraded = true;
      stageLog('token.reserve', 'degraded', { subject, reason: error.message });
      if (fallbackLimited(subject)) {
        return refuse(jar, 429, 'rate_limited', 'Too many requests. Please wait a moment.');
      }
    } else {
      granted = Number(data ?? 0);
      if (granted <= 0) {
        // Cases 5 and 8.
        stageLog('token.reserve', 'refused', { subject, tier, granted: 0 });
        return refuse(jar, 429, 'quota_exhausted',
          'You have used your voice time for today. It resets within 24 hours.',
        );
      }
      // --- Deployment-wide circuit breaker ---
      // Per-identity quota bounds one caller; it says nothing about thousands
      // of callers each taking their full allowance. Reserve the same seconds
      // against a global budget, and hand back the identity's reservation if
      // the deployment is out of room.
      const { data: globalData, error: globalError } = await db.rpc('reserve_voice_seconds', {
        p_subject: GLOBAL_SUBJECT,
        p_want: granted,
        p_allowance: globalDailySeconds(),
        p_window_secs: WINDOW_SECONDS,
      });

      if (!globalError) {
        const globalGranted = Number(globalData ?? 0);

        if (globalGranted <= 0) {
          await db.rpc('release_voice_seconds', { p_subject: subject, p_seconds: granted });
          stageLog('token.reserve', 'refused', { subject, reason: 'global_capacity' });
          return refuse(
            jar, 503, 'service_at_capacity',
            'Voice is temporarily unavailable — the daily limit for everyone has been reached. ' +
            'You can keep playing with the keyboard, and voice returns within 24 hours.',
          );
        }

        // A partial global grant shrinks this session; give the identity back
        // the seconds it will not get to use.
        if (globalGranted < granted) {
          await db.rpc('release_voice_seconds', {
            p_subject: subject,
            p_seconds: granted - globalGranted,
          });
          granted = globalGranted;
        }
      }
      // A global-budget error is not fatal: the per-identity reservation above
      // already holds, so the cap degrades open rather than blocking play.

      remaining = Math.max(0, allowanceFor(tier) - granted);

      const { data: led } = await db
        .from('voice_ledger')
        .insert({ subject, reserved_seconds: granted })
        .select('id')
        .single();
      ledgerId = led?.id ?? null;
    }
  } else {
    degraded = true;
    if (!isSupabaseConfigured()) {
      stageLog('token.reserve', 'unconfigured', { subject });
    }
    if (fallbackLimited(subject)) {
      return refuse(jar, 429, 'rate_limited', 'Too many requests. Please wait a moment.');
    }
  }

  /** Give the seconds back when the mint itself fails (case 16). */
  const release = async () => {
    if (!db || !ledgerId) return;
    await db.rpc('release_voice_seconds', { p_subject: subject, p_seconds: granted });
    // The global budget was charged too, so it has to be credited too —
    // otherwise failed mints would slowly exhaust the deployment's ceiling.
    await db.rpc('release_voice_seconds', {
      p_subject: GLOBAL_SUBJECT,
      p_seconds: granted,
    });
    await db.from('voice_ledger').delete().eq('id', ledgerId);
  };

  // --- Mint ---
  try {
    const upstream = await fetch(
      `https://agents.assemblyai.com/v1/token` +
        `?expires_in_seconds=${TOKEN_TTL_SECONDS}` +
        `&max_session_duration_seconds=${granted}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (!upstream.ok) {
      await release();
      stageLog('token.mint', 'upstream_error', { subject, status: upstream.status });
      return refuse(jar, upstream.status, 'upstream_error', 'Failed to mint token');
    }

    const payload = await upstream.json();

    const body = NextResponse.json(
      {
        ...payload,
        ledgerId,
        degraded,
        budget: {
          tier,
          grantedSeconds: granted,
          remainingSeconds: remaining,
          resetAt: new Date(Date.now() + WINDOW_SECONDS * 1000).toISOString(),
        },
      },
    );
    applyCookies(body, jar);

    // Cases 1-2: write the cookie only when the identity is new.
    if (identity.isNewDevice) {
      body.cookies.set(
        DEVICE_COOKIE,
        formatDeviceCookie(identity.deviceId, secret),
        deviceCookieOptions(isProduction),
      );
    }

    if (db) {
      await db.from('devices')
        .upsert({ id: identity.deviceId, user_id: userId, last_seen: new Date().toISOString() },
                { onConflict: 'id' });
    }

    stageLog('token.mint', 'ok', {
      subject, tier, granted, remaining, degraded, ms: Date.now() - started,
    });
    return body;
  } catch (err) {
    await release();
    stageLog('token.mint', 'error', {
      subject,
      reason: err instanceof Error ? err.message : 'unknown',
    });
    return refuse(jar, 500, 'internal', 'Internal server error');
  }
}
