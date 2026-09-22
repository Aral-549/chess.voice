// ============================================================
// Route-handler tests for /api/token.
//
// This closes BUGLOG "Known gaps" #1. The gap was not theoretical: the
// NextResponse.next() bug passed typecheck, lint and 413 unit tests, then
// returned 500 on the first real request — after the paid upstream call had
// already succeeded.
//
// These run without a database on purpose. The degraded path (no Supabase) is
// a supported, shipped mode, and it exercises everything that broke: identity,
// cookie issuance, upstream call ordering, and response construction.
//
// Case numbers refer to contracts/identity-and-quota.md.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GET } from '@/app/api/token/route';
import { verifyDeviceCookie, DEVICE_COOKIE, formatDeviceCookie, newDeviceId } from '../identity';
import { MAX_SESSION_SECONDS } from '../quota';

const SECRET = 'route-test-secret';
const UPSTREAM = 'https://agents.assemblyai.com/v1/token';

const ENV = { ...process.env };
let fetchSpy: ReturnType<typeof vi.fn>;

function req(opts: { cookie?: string; origin?: string; host?: string } = {}) {
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.origin) headers.set('origin', opts.origin);
  headers.set('host', opts.host ?? 'localhost:3000');
  return new NextRequest('http://localhost:3000/api/token', { headers });
}

beforeEach(() => {
  process.env.ASSEMBLYAI_API_KEY = 'test-key-not-real';
  process.env.DEVICE_SECRET = SECRET;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  fetchSpy = vi.fn(async () =>
    new Response(JSON.stringify({ token: 'fake-token', expires_in_seconds: 300 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/api/token — the response is actually constructible', () => {
  it('returns 200 and a JSON body, not a runtime error', async () => {
    // THE regression case. NextResponse.next() threw here, and every unit test
    // in the suite still passed.
    const res = await GET(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('fake-token');
  });

  it('reports the budget it granted', async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(body.budget.tier).toBe('anon');
    expect(body.budget.grantedSeconds).toBe(MAX_SESSION_SECONDS);
    expect(typeof body.budget.resetAt).toBe('string');
    expect(Number.isNaN(Date.parse(body.budget.resetAt))).toBe(false);
  });

  it('flags degraded mode when there is no database', async () => {
    // Honesty matters here: without this the client cannot tell a durable
    // budget from a per-instance guess.
    const body = await (await GET(req())).json();
    expect(body.degraded).toBe(true);
    expect(body.ledgerId).toBeNull();
  });
});

describe('/api/token — identity (cases 1-3)', () => {
  it('issues a signed device cookie to a first-time visitor (case 1)', async () => {
    const res = await GET(req());
    const cookie = res.cookies.get(DEVICE_COOKIE);

    expect(cookie).toBeDefined();
    // It must be a real signature, not just any string.
    expect(verifyDeviceCookie(cookie!.value, SECRET)).not.toBeNull();
    expect(cookie!.httpOnly).toBe(true);
  });

  it('does not reissue a cookie to a returning visitor (case 2)', async () => {
    const id = newDeviceId();
    const res = await GET(req({ cookie: `${DEVICE_COOKIE}=${formatDeviceCookie(id, SECRET)}` }));

    expect(res.status).toBe(200);
    expect(res.cookies.get(DEVICE_COOKIE)).toBeUndefined();
  });

  it('replaces a forged cookie instead of honouring it (case 3)', async () => {
    const victim = newDeviceId();
    const res = await GET(req({ cookie: `${DEVICE_COOKIE}=${victim}.forged-signature` }));

    expect(res.status).toBe(200);
    const issued = res.cookies.get(DEVICE_COOKIE);
    expect(issued).toBeDefined();
    // Critically: it must not adopt the id the caller asked for.
    expect(verifyDeviceCookie(issued!.value, SECRET)).not.toBe(victim);
  });
});

describe('/api/token — refuses before spending (cases 14, 18)', () => {
  it('returns 500 and never calls upstream when the API key is missing (case 14)', async () => {
    delete process.env.ASSEMBLYAI_API_KEY;

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('not_configured');
    // The ordering that matters: a config error must not cost a token.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses when DEVICE_SECRET is missing rather than issuing forgeable ids', async () => {
    delete process.env.DEVICE_SECRET;

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes the placeholder key through as unconfigured', async () => {
    process.env.ASSEMBLYAI_API_KEY = 'your_api_key_here';

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('/api/token — upstream handling (case 16)', () => {
  it('propagates an upstream failure without leaking its body', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('upstream said no, and mentioned test-key-not-real', { status: 429 }),
    );

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.code).toBe('upstream_error');
    // The upstream body is not forwarded — it can echo request details.
    expect(JSON.stringify(body)).not.toContain('test-key-not-real');
  });

  it('survives an upstream that throws', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('socket hang up'));

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('internal');
  });

  it('asks upstream for the capped session length, not an hour', async () => {
    await GET(req());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain(UPSTREAM);
    expect(url).toContain(`max_session_duration_seconds=${MAX_SESSION_SECONDS}`);
    // The original bug: one token bought 3600 seconds of paid time.
    expect(url).not.toContain('max_session_duration_seconds=3600');
  });
});

describe('/api/token — never leaks the key', () => {
  it('keeps the API key out of the response in every path', async () => {
    const paths = [
      async () => GET(req()),
      async () => {
        fetchSpy.mockResolvedValueOnce(new Response('no', { status: 401 }));
        return GET(req());
      },
      async () => {
        fetchSpy.mockRejectedValueOnce(new Error('boom'));
        return GET(req());
      },
    ];

    for (const run of paths) {
      const res = await run();
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain('test-key-not-real');
      // Nor a prefix of it — the old route logged the first four characters.
      expect(text).not.toContain('test-key'.slice(0, 4));
    }
  });

  it('sends the key upstream as a bearer header and nowhere else', async () => {
    await GET(req());

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-key-not-real');
    // Not smuggled into the URL, where it would land in access logs.
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain('test-key-not-real');
  });
});

describe('no route handler may use NextResponse.next()', () => {
  // The harness above cannot catch this one. NextResponse.next() constructs
  // fine under vitest and only throws inside the real Next.js server, so the
  // bug reproduces at runtime and nowhere else. A source-level guard is the
  // honest way to pin it: it is a banned API in this directory, not a value
  // to assert about.
  const ROUTES = [
    '../../app/api/token/route.ts',
    '../../app/api/games/route.ts',
    '../../app/api/session/end/route.ts',
    '../../app/api/auth/claim/route.ts',
    '../../app/auth/callback/route.ts',
  ];

  it.each(ROUTES)('%s does not call NextResponse.next()', (rel) => {
    const src = readFileSync(resolve(__dirname, rel), 'utf8');
    const code = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');

    expect(code).not.toMatch(/NextResponse\s*\.\s*next\s*\(/);
  });

  it('every route file exists, so the list above cannot silently rot', () => {
    for (const rel of ROUTES) {
      expect(() => readFileSync(resolve(__dirname, rel), 'utf8')).not.toThrow();
    }
  });
});
