// ============================================================
// Contract: contracts/voice-failure-messages.md
//
// These tests were written as an ADVERSARIAL pass over voice-errors.ts, not a
// confirming one — the brief was to find inputs that produce something you
// would not want read aloud. Two did, and both are pinned below as regression
// cases (BUGLOG 2026-09-23): a body of literal `null` crashed the handler, and
// the capacity message offered the keyboard fallback twice.
//
// The invariant block at the bottom is the important part. Individual wording
// may be revised; "no failure ever speaks JSON, an env var name, an HTTP status
// or the empty string" is the property that must survive any rewrite.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  describeMicError,
  describeTokenError,
  describeConnectionError,
  toVoiceFailure,
  VoiceAgentError,
  type VoiceFailure,
} from '../voice-errors';

/** A DOMException-shaped error, which is what getUserMedia actually rejects with. */
const domError = (name: string, message: string) => Object.assign(new Error(message), { name });

describe('describeMicError — contract cases 1-7', () => {
  it('case 1: a denied permission says how to undo it', () => {
    const f = describeMicError(domError('NotAllowedError', 'Permission denied'));
    expect(f.code).toBe('mic_denied');
    expect(f.recoverable).toBe(true);
    expect(f.message).toMatch(/address bar/i);
    expect(f.message).toMatch(/press J again/i);
  });

  it('case 2: matches on message text when the error carries no name', () => {
    expect(describeMicError(new Error('Permission denied')).code).toBe('mic_denied');
  });

  it('case 3: a missing device is distinguished from a denied one', () => {
    const f = describeMicError(domError('NotFoundError', 'Requested device not found'));
    expect(f.code).toBe('mic_missing');
    expect(f.message).toMatch(/no microphone/i);
  });

  it('case 4: a busy device names the real cause — another app', () => {
    const f = describeMicError(domError('NotReadableError', 'Could not start audio source'));
    expect(f.code).toBe('mic_busy');
    expect(f.message).toMatch(/another application/i);
  });

  it('case 5: an insecure context is NOT recoverable by retrying', () => {
    const f = describeMicError(new Error('Microphone access requires localhost or HTTPS'));
    expect(f.code).toBe('insecure_context');
    expect(f.recoverable).toBe(false);
    expect(f.message).toMatch(/HTTPS/);
  });

  it('cases 6-7: junk input still produces a usable sentence', () => {
    for (const junk of [null, undefined, {}, 'boom', 42, [], new Error('')]) {
      const f = describeMicError(junk);
      expect(f.code).toBe('mic_unknown');
      expect(f.message).toMatch(/typing your moves/i);
    }
  });
});

describe('describeTokenError — contract cases 8-16', () => {
  it('case 8: the quota refusal keeps the server’s own sentence', () => {
    const f = describeTokenError(
      429,
      JSON.stringify({
        code: 'quota_exhausted',
        error: 'You have used your voice time for today. It resets within 24 hours.',
      }),
    );
    expect(f.code).toBe('quota_exhausted');
    expect(f.message).toMatch(/used your voice time for today/);
    expect(f.message).toMatch(/typing your moves/);
  });

  it('case 9: REGRESSION — the capacity message offers the fallback only once', () => {
    // The server text already ends "you can keep playing with the keyboard".
    // Appending ours unconditionally said it twice, which at speech rate is
    // a full redundant sentence in the middle of bad news.
    const f = describeTokenError(
      503,
      JSON.stringify({
        code: 'service_at_capacity',
        error:
          'Voice is temporarily unavailable — the daily limit for everyone has been reached. ' +
          'You can keep playing with the keyboard, and voice returns within 24 hours.',
      }),
    );
    expect(f.code).toBe('service_at_capacity');
    expect(f.message.match(/keep playing/gi)).toHaveLength(1);
  });

  it('case 11: a non-JSON body falls back on the status', () => {
    const f = describeTokenError(429, 'not json at all');
    expect(f.code).toBe('http_429');
    expect(f.message).toMatch(/resets within 24 hours/);
  });

  it('case 12: a misconfigured deployment never leaks the env var name', () => {
    const f = describeTokenError(
      500,
      JSON.stringify({
        code: 'not_configured',
        error: 'ASSEMBLYAI_API_KEY not configured. Edit .env.local and restart the dev server.',
      }),
    );
    expect(f.code).toBe('not_configured');
    expect(f.recoverable).toBe(false);
    expect(f.message).not.toMatch(/ASSEMBLYAI_API_KEY|\.env|dev server/);
    expect(f.message).toMatch(/still play/i);
  });

  it('cases 13-15: developer-facing wording is replaced, not forwarded', () => {
    const upstream = describeTokenError(500, JSON.stringify({ code: 'upstream_error', error: 'Failed to mint token' }));
    expect(upstream.message).not.toMatch(/mint|token/i);

    const origin = describeTokenError(
      403,
      JSON.stringify({ code: 'cross_origin', error: 'Forbidden: cross-origin token request' }),
    );
    expect(origin.message).not.toMatch(/forbidden|cross-origin/i);

    const internal = describeTokenError(500, JSON.stringify({ code: 'internal', error: 'Internal server error' }));
    expect(internal.message).not.toMatch(/internal server error/i);
  });

  it('case 16: an HTML error page never reaches the listener', () => {
    const f = describeTokenError(503, '<html><body>502 Bad Gateway</body></html>');
    expect(f.message).not.toMatch(/html|gateway|502/i);
  });

  it('REGRESSION: a body of literal `null` does not crash the handler', () => {
    // BUGLOG 2026-09-23. `JSON.parse("null")` returns null, and the old code
    // read `.code` off it. The throw happened inside the only code path whose
    // job is to keep a failure speakable, so the player got silence.
    expect(() => describeTokenError(500, 'null')).not.toThrow();
    expect(describeTokenError(500, 'null').message).toBeTruthy();
  });

  it('non-object JSON bodies are ignored rather than trusted', () => {
    for (const body of ['null', '[1,2,3]', '"a string"', '5', 'true']) {
      const f = describeTokenError(500, body);
      expect(f.message).toBeTruthy();
      expect(f.code).toBe('http_500');
    }
  });

  it('an allowlisted code still cannot speak text shaped like data', () => {
    const f = describeTokenError(429, JSON.stringify({ code: 'quota_exhausted', error: '{"nested":"json"}' }));
    expect(f.message).not.toMatch(/[{}]/);
  });

  it('a friendly-looking message under a non-allowlisted code is NOT forwarded', () => {
    // The allowlist is the control, not how the sentence reads.
    const f = describeTokenError(500, JSON.stringify({ code: 'some_new_code', error: 'Everything is fine, honestly.' }));
    expect(f.message).not.toMatch(/honestly/);
  });
});

describe('describeConnectionError and toVoiceFailure — contract cases 17-21', () => {
  it('cases 17-18: network drops reassure that the game survived', () => {
    for (const msg of ['Failed to fetch', 'socket hang up', 'The network connection was lost']) {
      const f = describeConnectionError(new Error(msg));
      expect(f.code).toBe('offline');
      expect(f.message).toMatch(/safe/i);
    }
  });

  it('case 19: an unrecognised error still names the fallback', () => {
    const f = describeConnectionError(new Error('something weird'));
    expect(f.code).toBe('connection');
    expect(f.message).toMatch(/typing your moves/i);
  });

  it('case 20: VoiceAgentError round-trips without re-wrapping', () => {
    const original = describeMicError(domError('NotAllowedError', 'Permission denied'));
    const wrapped = new VoiceAgentError(original);
    expect(toVoiceFailure(wrapped)).toBe(original);
    expect(wrapped.message).toBe(original.message);
  });

  it('case 21: toVoiceFailure survives anything at all', () => {
    for (const junk of [null, undefined, 'a bare string', 0, {}, []]) {
      expect(toVoiceFailure(junk).message).toBeTruthy();
    }
  });
});

describe('invariants — these hold for every failure this module can produce', () => {
  // Every branch of every function, exercised through its real entry point.
  const everyFailure = (): VoiceFailure[] => [
    ...[
      domError('NotAllowedError', 'Permission denied'),
      domError('NotFoundError', 'Requested device not found'),
      domError('NotReadableError', 'Could not start audio source'),
      new Error('Microphone access requires localhost or HTTPS'),
      null,
      undefined,
      {},
      'boom',
    ].map(describeMicError),
    ...(
      [
        [429, JSON.stringify({ code: 'quota_exhausted', error: 'You have used your voice time for today. It resets within 24 hours.' })],
        [503, JSON.stringify({ code: 'service_at_capacity', error: 'Voice is temporarily unavailable — the daily limit for everyone has been reached. You can keep playing with the keyboard, and voice returns within 24 hours.' })],
        [429, JSON.stringify({ code: 'rate_limited', error: 'Too many requests. Please wait a moment.' })],
        [500, JSON.stringify({ code: 'not_configured', error: 'ASSEMBLYAI_API_KEY not configured. Edit .env.local and restart the dev server.' })],
        [500, JSON.stringify({ code: 'upstream_error', error: 'Failed to mint token' })],
        [403, JSON.stringify({ code: 'cross_origin', error: 'Forbidden: cross-origin token request' })],
        [500, JSON.stringify({ code: 'internal', error: 'Internal server error' })],
        [429, 'not json'],
        [503, '<html>502 Bad Gateway</html>'],
        [500, 'null'],
        [418, '{}'],
        [500, ''],
      ] as [number, string][]
    ).map(([s, b]) => describeTokenError(s, b)),
    ...[new Error('Failed to fetch'), new Error('socket hang up'), new Error('weird'), null].map(
      describeConnectionError,
    ),
  ];

  it('every message is a non-empty sentence', () => {
    for (const f of everyFailure()) {
      expect(f.message.trim()).not.toBe('');
      expect(f.message.trim()).toMatch(/[.!?]$/);
      expect(f.code).toBeTruthy();
    }
  });

  it('no message ever speaks data, internals or a status code', () => {
    // These are the shapes that turn an announcement into noise. A screen
    // reader reads "{" aloud; it reads "500" as a number in the middle of a
    // sentence; it reads NotAllowedError as a word.
    const banned: [RegExp, string][] = [
      [/[{}[\]]/, 'JSON punctuation'],
      [/Not(Allowed|Found|Readable)Error/, 'a DOMException name'],
      [/\.env|API_KEY|DEVICE_SECRET/, 'an environment variable'],
      [/\b[45]\d\d\b/, 'an HTTP status code'],
      [/undefined|\[object/i, 'a JS coercion artifact'],
      [/Forbidden|cross-origin/i, 'an HTTP-layer term'],
      [/\bmint\b/i, 'internal vocabulary'],
    ];
    for (const f of everyFailure()) {
      for (const [re, why] of banned) {
        expect(f.message, `${f.code} leaked ${why}: "${f.message}"`).not.toMatch(re);
      }
    }
  });

  it('every message tells the player what they can still do', () => {
    // The point of the module. A failure that does not name a way forward is
    // just bad news delivered politely.
    for (const f of everyFailure()) {
      expect(f.message, `${f.code} offered no way forward`).toMatch(
        /typ(e|ing)|keyboard|press J|HTTPS|plug one in/i,
      );
    }
  });
});
