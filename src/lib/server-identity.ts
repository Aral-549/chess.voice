// ============================================================
// chess.voice — request → identity, for route handlers
//
// Small shared wrapper so every route resolves identity the same way. The
// policy itself lives in lib/identity.ts (pure, tested); this only reads the
// request and the auth session.
// ============================================================

import type { NextRequest } from 'next/server';
import { DEVICE_COOKIE, resolveIdentity, type Identity } from '@/lib/identity';
import { subjectKey, type Tier } from '@/lib/quota';
import { currentUserId, type CookieJar } from '@/lib/supabase/server';

export interface ResolvedRequestIdentity {
  identity: Identity;
  tier: Tier;
  /** `user:<id>` when signed in, else `device:<id>`. */
  subject: string;
  /** Always the device subject, regardless of sign-in state. Used to find
   *  anonymous rows that predate an account. */
  deviceSubject: string;
  userId: string | null;
}

export async function identifyRequest(
  req: NextRequest,
  jar: CookieJar,
): Promise<ResolvedRequestIdentity> {
  const secret = process.env.DEVICE_SECRET || '';
  const userId = await currentUserId(req, jar);

  const identity = resolveIdentity({
    cookieValue: req.cookies.get(DEVICE_COOKIE)?.value,
    userId,
    secret,
  });

  const tier: Tier = identity.kind === 'user' ? 'user' : 'anon';

  return {
    identity,
    tier,
    subject: subjectKey({ kind: tier, id: identity.id }),
    deviceSubject: subjectKey({ kind: 'anon', id: identity.deviceId }),
    userId,
  };
}
