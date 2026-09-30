// ============================================================
// chess.voice — server-side Supabase access
//
// Two clients, deliberately separate:
//
//   serviceClient()  — bypasses RLS. Used by route handlers for the tables the
//                      browser may never touch (budget, ledger, games).
//                      The key must never reach the client bundle.
//   userClient()     — acts as the signed-in user, for reading the session.
//
// Both return null when Supabase is unconfigured. Every caller must handle
// null by degrading rather than failing: the live demo has to keep working
// through an outage or a missing env var. See contract case 15.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

/** Cookies Supabase wants to refresh, collected during the request and applied
 *  to the real response at the end.
 *
 *  App Route handlers cannot use NextResponse.next() as a scratch response —
 *  it throws at runtime — so there is nowhere to write cookies until the final
 *  response object exists. This jar is that gap. */
export type CookieJar = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}[];

/** Apply collected cookies to the response being returned. */
export function applyCookies<T extends NextResponse>(res: T, jar: CookieJar): T {
  for (const c of jar) {
    res.cookies.set(c.name, c.value, c.options as never);
  }
  return res;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

let cached: SupabaseClient | null = null;

/** Service-role client. Server only — importing this into a client component
 *  would leak the key, so keep it out of anything with "use client". */
export function serviceClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;

  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cached;
}

/** Reads the auth session from request cookies, collecting refreshed ones into
 *  `jar`. Returns null when auth is not configured. */
export function userClient(req: NextRequest, jar: CookieJar): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  return createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value, options }) =>
          jar.push({ name, value, options: options as Record<string, unknown> }));
      },
    },
  });
}

/** The signed-in user's id, or null. Never throws — an auth outage must
 *  degrade to anonymous, not break the app. */
export async function currentUserId(
  req: NextRequest,
  jar: CookieJar,
): Promise<string | null> {
  try {
    const supabase = userClient(req, jar);
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
