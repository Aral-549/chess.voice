'use client';

// ============================================================
// VoiceChessmate — browser Supabase client
//
// Auth only. This client carries the public anon key, which is safe to ship:
// every application table has RLS enabled with no permissive policy, so the
// anon key can read and write nothing. Application data moves through the
// route handlers instead.
// ============================================================

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Returns null when auth is not configured, so the UI can hide sign-in
 *  entirely rather than offering a button that cannot work. */
export function browserClient(): SupabaseClient | null {
  if (!isAuthConfigured()) return null;
  if (cached) return cached;

  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
