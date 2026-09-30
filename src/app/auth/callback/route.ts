// ============================================================
// chess.voice — magic link callback
//
// Supabase redirects here with a one-time code. We exchange it for a session,
// then send the player straight back to the board.
//
// Deliberately has no UI of its own: an interstitial "signing you in…" page is
// one more thing for a screen reader to land on and read out. The redirect
// happens before anything renders, and the board announces the result.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';
import { userClient, applyCookies, type CookieJar } from '@/lib/supabase/server';
import { stageLog } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';

  // Only ever redirect within this origin — an open redirect here would let a
  // crafted magic link bounce a signed-in user off-site.
  const destination = new URL(next.startsWith('/') ? next : '/', url.origin);

  if (!code) {
    destination.searchParams.set('auth', 'failed');
    return NextResponse.redirect(destination);
  }

  const jar: CookieJar = [];
  const supabase = userClient(request, jar);

  if (!supabase) {
    destination.searchParams.set('auth', 'unavailable');
    return NextResponse.redirect(destination);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    stageLog('auth.callback', 'refused', { reason: error.message });
    destination.searchParams.set('auth', 'failed');
    return NextResponse.redirect(destination);
  }

  stageLog('auth.callback', 'ok', {});
  destination.searchParams.set('auth', 'ok');
  return applyCookies(NextResponse.redirect(destination), jar);
}
