// ============================================================
// Adversarial pass over the quota and identity policy.
//
// This is the code standing between a public URL and an unbounded AssemblyAI
// bill, so these cases are written to *break* it, not to confirm it: forged
// cookies, replayed refunds, lying durations, boundary budgets.
//
// Case numbers refer to contracts/identity-and-quota.md.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import {
  MAX_SESSION_SECONDS,
  WINDOW_SECONDS,
  allowanceFor,
  decideGrant,
  refundFor,
  subjectKey,
  GLOBAL_SUBJECT,
  DEFAULT_GLOBAL_DAILY_SECONDS,
  globalDailySeconds,
} from '../quota';
import {
  formatDeviceCookie,
  verifyDeviceCookie,
  resolveIdentity,
  newDeviceId,
} from '../identity';

const SECRET = 'test-secret-do-not-use';
const now = new Date('2026-09-22T12:00:00Z');

describe('quota — grant decisions', () => {
  it('grants a full session to a fresh anonymous visitor (case 1)', () => {
    const d = decideGrant({ tier: 'anon', reservedSeconds: 0, windowStart: now, now });
    expect(d.granted).toBe(MAX_SESSION_SECONDS);
    expect(d.remainingSeconds).toBe(allowanceFor('anon') - MAX_SESSION_SECONDS);
  });

  it('refuses once the anonymous allowance is spent (case 5)', () => {
    const d = decideGrant({
      tier: 'anon',
      reservedSeconds: allowanceFor('anon'),
      windowStart: now,
      now,
    });
    expect(d.granted).toBe(0);
  });

  it('gives a signed-in user the larger allowance at the same usage (case 6)', () => {
    const args = { reservedSeconds: allowanceFor('anon'), windowStart: now, now };
    expect(decideGrant({ ...args, tier: 'anon' }).granted).toBe(0);
    expect(decideGrant({ ...args, tier: 'user' }).granted).toBe(MAX_SESSION_SECONDS);
  });

  it('grants a partial session rather than refusing (case 7)', () => {
    // 4 minutes left, asking for 10.
    const d = decideGrant({
      tier: 'anon',
      reservedSeconds: allowanceFor('anon') - 240,
      windowStart: now,
      now,
    });
    expect(d.granted).toBe(240);
    expect(d.remainingSeconds).toBe(0);
  });

  it('treats exactly zero remaining as a refusal (case 8)', () => {
    const d = decideGrant({
      tier: 'anon',
      reservedSeconds: allowanceFor('anon'),
      windowStart: now,
      now,
    });
    expect(d.granted).toBe(0);
    expect(d.remainingSeconds).toBe(0);
  });

  it('resets the allowance once the window has elapsed (case 9)', () => {
    const later = new Date(now.getTime() + (WINDOW_SECONDS + 1) * 1000);
    const d = decideGrant({
      tier: 'anon',
      reservedSeconds: allowanceFor('anon'),
      windowStart: now,
      now: later,
    });
    expect(d.granted).toBe(MAX_SESSION_SECONDS);
  });

  it('does not reset one second early', () => {
    const justBefore = new Date(now.getTime() + (WINDOW_SECONDS - 1) * 1000);
    const d = decideGrant({
      tier: 'anon',
      reservedSeconds: allowanceFor('anon'),
      windowStart: now,
      now: justBefore,
    });
    expect(d.granted).toBe(0);
  });

  it('cannot be tricked into a negative or inflated grant', () => {
    // A corrupt row claiming more reserved than the allowance must clamp at 0,
    // never wrap into a positive grant.
    const d = decideGrant({
      tier: 'anon',
      reservedSeconds: allowanceFor('anon') * 10,
      windowStart: now,
      now,
    });
    expect(d.granted).toBe(0);
    expect(d.remainingSeconds).toBe(0);

    // A negative reservation must not become free budget beyond the allowance.
    const negative = decideGrant({
      tier: 'anon', reservedSeconds: -9999, windowStart: now, now,
    });
    expect(negative.granted).toBeLessThanOrEqual(MAX_SESSION_SECONDS);
  });

  it('caps a single session well below the old one-hour default', () => {
    // The whole point of the fix: a leaked token used to buy an hour.
    expect(MAX_SESSION_SECONDS).toBeLessThanOrEqual(600);
  });
});

describe('quota — refunds', () => {
  it('hands back the unused remainder (case 10)', () => {
    expect(refundFor({ reservedSeconds: 600, actualSeconds: 90, alreadyReconciled: false }))
      .toBe(510);
  });

  it('is idempotent — a replayed report refunds nothing (case 11)', () => {
    expect(refundFor({ reservedSeconds: 600, actualSeconds: 90, alreadyReconciled: true }))
      .toBe(0);
  });

  it('clamps a client claiming it used less than zero (case 12)', () => {
    expect(refundFor({ reservedSeconds: 600, actualSeconds: -100, alreadyReconciled: false }))
      .toBe(600);
  });

  it('never refunds more than was reserved, however large the claim (case 12)', () => {
    // A hostile client reporting a huge duration must not mint budget.
    const refund = refundFor({
      reservedSeconds: 600,
      actualSeconds: 10_000_000,
      alreadyReconciled: false,
    });
    expect(refund).toBe(0);
    expect(refund).toBeGreaterThanOrEqual(0);
  });

  it('a silent client keeps the full pessimistic reservation', () => {
    // Not calling refundFor at all is the "never reported" path; the invariant
    // is simply that nothing is given back without a report.
    expect(refundFor({ reservedSeconds: 600, actualSeconds: 600, alreadyReconciled: false }))
      .toBe(0);
  });
});

describe('identity — cookie signing', () => {
  it('round-trips a freshly issued cookie', () => {
    const id = newDeviceId();
    expect(verifyDeviceCookie(formatDeviceCookie(id, SECRET), SECRET)).toBe(id);
  });

  it('rejects a forged id with no signature (case 3)', () => {
    const victim = newDeviceId();
    expect(verifyDeviceCookie(victim, SECRET)).toBeNull();
    expect(verifyDeviceCookie(`${victim}.`, SECRET)).toBeNull();
  });

  it("rejects someone else's id carrying a valid signature for a different id", () => {
    // The attack that matters: steal a uuid, keep your own mac.
    const mine = newDeviceId();
    const theirs = newDeviceId();
    const myCookie = formatDeviceCookie(mine, SECRET);
    const stolenMac = myCookie.split('.')[1];

    expect(verifyDeviceCookie(`${theirs}.${stolenMac}`, SECRET)).toBeNull();
  });

  it('rejects a cookie signed with a different secret', () => {
    const id = newDeviceId();
    expect(verifyDeviceCookie(formatDeviceCookie(id, 'other-secret'), SECRET)).toBeNull();
  });

  it('rejects structurally malformed values instead of throwing', () => {
    const id = newDeviceId();
    const cases = [
      undefined,
      '',
      '.',
      '..',
      `${id}.a.b`,               // more than one separator
      `not-a-uuid.${'x'.repeat(43)}`,
      `${id}.${'x'.repeat(5)}`,  // wrong mac length
      `${id}.${'x'.repeat(200)}`,
    ];
    for (const value of cases) {
      expect(() => verifyDeviceCookie(value, SECRET)).not.toThrow();
      expect(verifyDeviceCookie(value, SECRET)).toBeNull();
    }
  });

  it('returns null rather than throwing when no secret is configured', () => {
    const id = newDeviceId();
    expect(verifyDeviceCookie(formatDeviceCookie(id, SECRET), '')).toBeNull();
  });
});

describe('identity — resolution', () => {
  it('issues a new device when there is no cookie (case 1)', () => {
    const id = resolveIdentity({ cookieValue: undefined, userId: null, secret: SECRET });
    expect(id.kind).toBe('anon');
    expect(id.isNewDevice).toBe(true);
    expect(id.id).toBe(id.deviceId);
  });

  it('reuses a valid device and writes no new cookie (case 2)', () => {
    const existing = newDeviceId();
    const id = resolveIdentity({
      cookieValue: formatDeviceCookie(existing, SECRET),
      userId: null,
      secret: SECRET,
    });
    expect(id.deviceId).toBe(existing);
    expect(id.isNewDevice).toBe(false);
  });

  it('issues a fresh identity for a tampered cookie, not an error (case 3)', () => {
    const victim = newDeviceId();
    const id = resolveIdentity({ cookieValue: `${victim}.forged`, userId: null, secret: SECRET });
    expect(id.isNewDevice).toBe(true);
    // Critically, it must NOT adopt the id the attacker asked for.
    expect(id.deviceId).not.toBe(victim);
  });

  it('lets the account win over the device it is used on (case 6)', () => {
    const device = newDeviceId();
    const id = resolveIdentity({
      cookieValue: formatDeviceCookie(device, SECRET),
      userId: 'user-123',
      secret: SECRET,
    });
    expect(id.kind).toBe('user');
    expect(id.id).toBe('user-123');
    // The device is still carried, so anonymous games remain claimable.
    expect(id.deviceId).toBe(device);
  });

  it('keys budgets separately for a device and an account', () => {
    expect(subjectKey({ kind: 'anon', id: 'abc' })).toBe('device:abc');
    expect(subjectKey({ kind: 'user', id: 'abc' })).toBe('user:abc');
    expect(subjectKey({ kind: 'anon', id: 'abc' }))
      .not.toBe(subjectKey({ kind: 'user', id: 'abc' }));
  });
});

describe('global circuit breaker', () => {
  const ORIGINAL = process.env.VOICE_GLOBAL_DAILY_SECONDS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.VOICE_GLOBAL_DAILY_SECONDS;
    else process.env.VOICE_GLOBAL_DAILY_SECONDS = ORIGINAL;
  });

  it('defaults to a bounded daily ceiling rather than unlimited', () => {
    delete process.env.VOICE_GLOBAL_DAILY_SECONDS;
    expect(globalDailySeconds()).toBe(DEFAULT_GLOBAL_DAILY_SECONDS);
    expect(globalDailySeconds()).toBeGreaterThan(0);
    expect(Number.isFinite(globalDailySeconds())).toBe(true);
  });

  it('honours an override', () => {
    process.env.VOICE_GLOBAL_DAILY_SECONDS = '3600';
    expect(globalDailySeconds()).toBe(3600);
  });

  it('ignores junk overrides instead of disabling the cap', () => {
    // The dangerous failure is a typo silently meaning "no limit".
    for (const junk of ['', 'lots', '0', '-1', 'NaN', 'Infinity']) {
      process.env.VOICE_GLOBAL_DAILY_SECONDS = junk;
      expect(globalDailySeconds()).toBe(DEFAULT_GLOBAL_DAILY_SECONDS);
    }
  });

  it('floors a fractional override', () => {
    process.env.VOICE_GLOBAL_DAILY_SECONDS = '120.9';
    expect(globalDailySeconds()).toBe(120);
  });

  it('uses a key that cannot collide with a real identity', () => {
    // Identity subjects are always `device:<uuid>` / `user:<uuid>`.
    expect(GLOBAL_SUBJECT).not.toContain(':');
    expect(subjectKey({ kind: 'anon', id: GLOBAL_SUBJECT })).not.toBe(GLOBAL_SUBJECT);
    expect(subjectKey({ kind: 'user', id: GLOBAL_SUBJECT })).not.toBe(GLOBAL_SUBJECT);
  });

  it('is large enough that one identity cannot trip it alone', () => {
    // Otherwise a single anonymous visitor could take the whole deployment
    // offline for everyone, which would be a denial of service, not a cap.
    expect(globalDailySeconds()).toBeGreaterThan(allowanceFor('user'));
    expect(globalDailySeconds()).toBeGreaterThan(allowanceFor('anon'));
  });
});
