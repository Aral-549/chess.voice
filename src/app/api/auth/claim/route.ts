// ============================================================
// VoiceChessmate — claim anonymous games after sign-in
//
// Games played before signing in belong to a device. This re-owns them to the
// account and recomputes the rating from the full history.
//
// Contract case 11 in contracts/game-persistence.md: recompute, never sum. An
// account that already had a rating must not have the device's games added on
// top of it — that would double-count anyone who signs in twice.
// ============================================================

import { NextResponse, NextRequest } from 'next/server';
import { serviceClient, applyCookies, type CookieJar } from '@/lib/supabase/server';
import { identifyRequest } from '@/lib/server-identity';
import { recomputeRating, type Outcome } from '@/lib/elo';
import { stageLog } from '@/lib/observability';
import type { Difficulty } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const jar: CookieJar = [];
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: true, degraded: true });

  const id = await identifyRequest(request, jar);
  if (!id.userId) {
    return NextResponse.json({ error: 'Not signed in', code: 'unauthenticated' }, { status: 401 });
  }

  // Move every game this device owns onto the account.
  const { data: claimed } = await db
    .from('games')
    .update({
      subject: id.subject,
      user_id: id.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('subject', id.deviceSubject)
    .select('id');

  await db
    .from('devices')
    .upsert({ id: id.identity.deviceId, user_id: id.userId, last_seen: new Date().toISOString() },
            { onConflict: 'id' });

  // Recompute from the whole history, oldest first, so the sequence of
  // K-factors matches how the games were actually played.
  const { data: completed } = await db
    .from('games')
    .select('difficulty, result')
    .eq('user_id', id.userId)
    .eq('status', 'complete')
    .not('result', 'is', null)
    .order('updated_at', { ascending: true });

  const sequence = (completed ?? []).map((g) => ({
    difficulty: (g.difficulty ?? 'intermediate') as Difficulty,
    outcome: g.result as Outcome,
  }));

  const { rating } = recomputeRating(sequence);

  await db
    .from('profiles')
    .update({
      rating,
      games_played: sequence.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id.userId);

  stageLog('game.claim', 'ok', {
    subject: id.subject,
    claimed: claimed?.length ?? 0,
    rating,
    gamesPlayed: sequence.length,
  });

  return applyCookies(
    NextResponse.json({
      ok: true,
      claimed: claimed?.length ?? 0,
      rating,
      gamesPlayed: sequence.length,
    }),
    jar,
  );
}
