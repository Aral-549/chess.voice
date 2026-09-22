// ============================================================
// VoiceChessmate — game persistence
//
// GET  /api/games            → resume payload + recent history
// POST /api/games            → create or update the current game
//
// Losing a game in progress costs a blind player the position they were
// holding in memory, so resume is an accessibility feature, not a convenience.
//
// Contract: contracts/game-persistence.md
// ============================================================

import { NextResponse, NextRequest } from 'next/server';
import { Chess } from 'chess.js';
import { serviceClient, applyCookies, type CookieJar } from '@/lib/supabase/server';
import { identifyRequest } from '@/lib/server-identity';
import { applyResult, STARTING_RATING, type Outcome } from '@/lib/elo';
import { stageLog } from '@/lib/observability';
import type { Difficulty } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced', 'master'];
const MAX_PGN_BYTES = 100_000;

/** Both the account subject and the device subject — a signed-in player still
 *  owns the games they played anonymously on this device until they are
 *  claimed. */
function ownedSubjects(id: { subject: string; deviceSubject: string }): string[] {
  return id.subject === id.deviceSubject ? [id.subject] : [id.subject, id.deviceSubject];
}

// ------------------------------------------------------------------ GET
export async function GET(request: NextRequest) {
  const jar: CookieJar = [];
  const db = serviceClient();
  // Case 14: no database is not an error. Play continues in memory.
  if (!db) return NextResponse.json({ resume: null, history: [], degraded: true });

  const id = await identifyRequest(request, jar);
  const subjects = ownedSubjects(id);

  // Case 4: most recently updated unfinished game wins, deterministically.
  const { data: resume } = await db
    .from('games')
    .select('id, pgn, fen, move_count, difficulty, time_control, updated_at')
    .in('subject', subjects)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: history } = await db
    .from('games')
    .select('id, result, difficulty, move_count, rating_delta, end_reason, updated_at')
    .in('subject', subjects)
    .eq('status', 'complete')
    .order('updated_at', { ascending: false })
    .limit(20);

  let rating = STARTING_RATING;
  let gamesPlayed = 0;
  if (id.userId) {
    const { data: profile } = await db
      .from('profiles')
      .select('rating, games_played, display_name')
      .eq('id', id.userId)
      .maybeSingle();
    rating = profile?.rating ?? STARTING_RATING;
    gamesPlayed = profile?.games_played ?? 0;
  }

  return applyCookies(
    NextResponse.json({
      resume: resume ?? null, // Case 5: null is a normal answer, not an error.
      history: history ?? [],
      profile: id.userId ? { rating, gamesPlayed } : null,
      signedIn: Boolean(id.userId),
    }),
    jar,
  );
}

// ------------------------------------------------------------------ POST
export async function POST(request: NextRequest) {
  const jar: CookieJar = [];
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: true, degraded: true });

  let body: {
    id?: string;
    pgn?: string;
    fen?: string;
    difficulty?: string;
    timeControl?: string;
    status?: 'in_progress' | 'complete';
    result?: Outcome;
    endReason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed body', code: 'bad_request' }, { status: 400 });
  }

  const pgn = typeof body.pgn === 'string' ? body.pgn : '';
  if (Buffer.byteLength(pgn, 'utf8') > MAX_PGN_BYTES) {
    return NextResponse.json({ error: 'Game too large', code: 'too_large' }, { status: 413 });
  }

  // Case 13: a corrupt record is worse than no record. Validate before writing,
  // and derive fen/move_count from the pgn rather than trusting the client.
  const probe = new Chess();
  try {
    if (pgn.trim()) probe.loadPgn(pgn);
  } catch {
    stageLog('game.save', 'refused', { reason: 'unparseable_pgn' });
    return NextResponse.json({ error: 'Unparseable PGN', code: 'bad_pgn' }, { status: 400 });
  }

  const fen = probe.fen();
  const moveCount = probe.history().length;

  // Case 1: the first move creates the record. An untouched board is not a game.
  if (moveCount === 0 && !body.id) {
    return NextResponse.json({ ok: true, skipped: 'empty_game' });
  }

  const id = await identifyRequest(request, jar);
  const difficulty = DIFFICULTIES.includes(body.difficulty as Difficulty)
    ? (body.difficulty as Difficulty)
    : 'intermediate';

  const isComplete = body.status === 'complete';
  const result: Outcome | null =
    isComplete && (['win', 'loss', 'draw'] as const).includes(body.result as Outcome)
      ? (body.result as Outcome)
      : null;

  if (isComplete && !result) {
    return NextResponse.json({ error: 'Completed game needs a result', code: 'bad_request' }, { status: 400 });
  }

  const row = {
    subject: id.subject,
    user_id: id.userId,
    device_id: id.identity.deviceId,
    pgn,
    fen,
    move_count: moveCount,
    difficulty,
    time_control: typeof body.timeControl === 'string' ? body.timeControl : 'casual',
    status: isComplete ? ('complete' as const) : ('in_progress' as const),
    result,
    end_reason: typeof body.endReason === 'string' ? body.endReason : null,
    updated_at: new Date().toISOString(),
  };

  // Case 2 / case 12: update only a row this identity owns. A miss returns 404
  // rather than 403 so the existence of someone else's id is not confirmed.
  let gameId = body.id ?? null;
  if (gameId) {
    const { data: updated } = await db
      .from('games')
      .update(row)
      .eq('id', gameId)
      .in('subject', ownedSubjects(id))
      .select('id, rated_at, difficulty')
      .maybeSingle();

    if (!updated) {
      return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 });
    }

    // Case 10: rate once, ever. `rated_at` is the guard.
    if (isComplete && result && !updated.rated_at) {
      await rateGame(db, { gameId: updated.id, userId: id.userId, difficulty, outcome: result });
    }
  } else {
    const { data: created, error } = await db
      .from('games')
      .insert(row)
      .select('id')
      .single();
    if (error || !created) {
      stageLog('game.save', 'error', { reason: error?.message });
      return NextResponse.json({ error: 'Could not save', code: 'db_error' }, { status: 500 });
    }
    const createdId: string = created.id;
    gameId = createdId;
    if (isComplete && result) {
      await rateGame(db, { gameId: createdId, userId: id.userId, difficulty, outcome: result });
    }
  }

  stageLog(isComplete ? 'game.complete' : 'game.save', 'ok', {
    subject: id.subject, gameId, moveCount, result,
  });

  return applyCookies(NextResponse.json({ ok: true, id: gameId }), jar);
}

/** Applies the Elo change exactly once and stamps `rated_at`. Anonymous games
 *  are recorded but unrated — there is no profile to move until sign-in, at
 *  which point the claim path recomputes from history. */
async function rateGame(
  db: NonNullable<ReturnType<typeof serviceClient>>,
  args: { gameId: string; userId: string | null; difficulty: Difficulty; outcome: Outcome },
) {
  if (!args.userId) {
    await db.from('games').update({ rated_at: new Date().toISOString() }).eq('id', args.gameId);
    return;
  }

  const { data: profile } = await db
    .from('profiles')
    .select('rating, games_played')
    .eq('id', args.userId)
    .maybeSingle();

  const change = applyResult({
    rating: profile?.rating ?? STARTING_RATING,
    gamesPlayed: profile?.games_played ?? 0,
    difficulty: args.difficulty,
    outcome: args.outcome,
  });

  await db
    .from('profiles')
    .update({
      rating: change.rating,
      games_played: (profile?.games_played ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.userId);

  await db
    .from('games')
    .update({ rating_delta: change.delta, rated_at: new Date().toISOString() })
    .eq('id', args.gameId)
    .is('rated_at', null);
}
