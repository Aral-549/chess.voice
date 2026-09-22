// ============================================================
// VoiceChessmate — anonymous device identity
//
// A signed cookie that says "this is the same browser as last time", so an
// anonymous player has a budget and can resume a game without signing up.
//
// The signature is the whole point: without it, anyone could set
// vcm_device=<someone else's uuid> and spend their budget, or mint a fresh
// uuid per request and bypass quota entirely.
//
// See contracts/identity-and-quota.md
// ============================================================

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export const DEVICE_COOKIE = 'vcm_device';
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~13 months

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('base64url');
}

/** `<uuid>.<hmac>` */
export function formatDeviceCookie(id: string, secret: string): string {
  return `${id}.${sign(id, secret)}`;
}

/**
 * Returns the device id if the cookie is intact, else null.
 *
 * Contract case 3: a bad signature is not an error — the caller issues a fresh
 * identity. Returning null rather than throwing is what keeps a forged cookie
 * from being a denial of service.
 */
export function verifyDeviceCookie(raw: string | undefined, secret: string): string | null {
  if (!raw || !secret) return null;

  // Exactly one separator. A uuid contains no '.', so more than one means the
  // value was tampered with or double-encoded.
  const parts = raw.split('.');
  if (parts.length !== 2) return null;

  const [id, mac] = parts;
  if (!UUID_RE.test(id)) return null;

  const expected = sign(id, secret);
  // Compare in constant time. Lengths must match first — timingSafeEqual
  // throws on a length mismatch rather than returning false.
  if (mac.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  return id.toLowerCase();
}

export function newDeviceId(): string {
  return randomUUID();
}

export interface Identity {
  kind: 'anon' | 'user';
  /** device uuid, or the Supabase user id */
  id: string;
  /** Always present: the device this request came from, even when signed in. */
  deviceId: string;
  /** True when a fresh cookie must be written on the response. */
  isNewDevice: boolean;
}

/**
 * Resolve who is asking.
 *
 * Order is account → device → new device (contract, "Identity model"). A
 * signed-in user's tier wins over the device they happen to be on, which is
 * what makes case 6 work.
 */
export function resolveIdentity(params: {
  cookieValue: string | undefined;
  userId: string | null;
  secret: string;
}): Identity {
  const verified = verifyDeviceCookie(params.cookieValue, params.secret);
  const deviceId = verified ?? newDeviceId();
  const isNewDevice = verified === null;

  if (params.userId) {
    return { kind: 'user', id: params.userId, deviceId, isNewDevice };
  }
  return { kind: 'anon', id: deviceId, deviceId, isNewDevice };
}

/** Cookie attributes. httpOnly so script cannot read or forge it client-side. */
export function deviceCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  };
}
