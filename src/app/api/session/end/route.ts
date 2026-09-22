// ============================================================
// VoiceChessmate — session reconciliation
//
// A mint reserves the full MAX_SESSION_SECONDS pessimistically. This hands
// back the difference when the client reports how long the session actually
// ran, so a 90-second game does not cost a player ten minutes of allowance.
//
// Contract cases 10-13 in contracts/identity-and-quota.md.
// ============================================================

import { NextResponse, NextRequest } from 'next/server';
import { refundFor, subjectKey, type Tier } from '@/lib/quota';
import { DEVICE_COOKIE, resolveIdentity } from '@/lib/identity';
import { serviceClient, currentUserId, applyCookies, type CookieJar } from '@/lib/supabase/server';
import { stageLog } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const jar: CookieJar = [];
  const db = serviceClient();
  if (!db) {
    // Nothing was reserved durably, so there is nothing to give back.
    return NextResponse.json({ ok: true, degraded: true });
  }

  let body: { ledgerId?: string; actualSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed body', code: 'bad_request' }, { status: 400 });
  }

  const ledgerId = typeof body.ledgerId === 'string' ? body.ledgerId : null;
  const actualSeconds = Number(body.actualSeconds);
  if (!ledgerId || !Number.isFinite(actualSeconds) || actualSeconds < 0) {
    return NextResponse.json({ error: 'Malformed body', code: 'bad_request' }, { status: 400 });
  }

  const secret = process.env.DEVICE_SECRET || '';
  const userId = await currentUserId(request, jar);
  const identity = resolveIdentity({
    cookieValue: request.cookies.get(DEVICE_COOKIE)?.value,
    userId,
    secret,
  });
  const tier: Tier = identity.kind === 'user' ? 'user' : 'anon';
  const subject = subjectKey({ kind: tier, id: identity.id });

  const { data: entry } = await db
    .from('voice_ledger')
    .select('id, subject, reserved_seconds, reconciled_at')
    .eq('id', ledgerId)
    .single();

  if (!entry) {
    return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 });
  }

  // Case 13: you may only reconcile your own reservation. Checked against both
  // the current subject and the device, because signing in mid-session moves
  // the subject while the reservation stays where it was made.
  const deviceSubject = subjectKey({ kind: 'anon', id: identity.deviceId });
  if (entry.subject !== subject && entry.subject !== deviceSubject) {
    stageLog('session.end', 'refused', { subject, reason: 'ownership' });
    return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 });
  }

  // Cases 10-12: the pure policy decides; this route only applies it.
  const refund = refundFor({
    reservedSeconds: entry.reserved_seconds,
    actualSeconds,
    alreadyReconciled: Boolean(entry.reconciled_at),
  });

  if (refund > 0) {
    await db.rpc('release_voice_seconds', { p_subject: entry.subject, p_seconds: refund });
  }

  // Case 11: mark reconciled only if it was not already, so a replayed request
  // cannot refund twice.
  if (!entry.reconciled_at) {
    await db
      .from('voice_ledger')
      .update({
        actual_seconds: Math.min(Math.max(0, Math.round(actualSeconds)), entry.reserved_seconds),
        reconciled_at: new Date().toISOString(),
      })
      .eq('id', entry.id)
      .is('reconciled_at', null);
  }

  stageLog('session.end', 'ok', {
    subject: entry.subject,
    reserved: entry.reserved_seconds,
    actual: Math.round(actualSeconds),
    refund,
    replay: Boolean(entry.reconciled_at),
  });

  return applyCookies(NextResponse.json({ ok: true, refundedSeconds: refund }), jar);
}
