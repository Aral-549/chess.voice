// ============================================================
// VoiceChessmate — what to say when voice fails
//
// Failure messages are the one piece of copy guaranteed to be read by someone
// having a bad time, and here they are *heard* rather than read: they go
// through an ARIA live region to a player who may have no other signal that
// anything went wrong.
//
// Two rules follow from that.
//
// 1. Never surface a raw error. The token route already returns sentences
//    written for a person ("You have used your voice time for today"), and the
//    client was wrapping them in `Token minting failed (429): {"error":…}` —
//    which reads aloud as punctuation soup.
// 2. Always say what to do next. "Permission denied" tells a blind player
//    nothing; "the browser blocked the microphone, use the text box" tells
//    them how to keep playing.
// ============================================================

export interface VoiceFailure {
  /** Spoken and shown. One or two sentences, plain, actionable. */
  message: string;
  /** True when the player can fix it themselves (permissions, quota wait). */
  recoverable: boolean;
  /** Short machine tag, for logs. Never shown. */
  code: string;
}

/**
 * An error that already knows how it should be said out loud.
 *
 * Throwing this instead of a bare Error is what stops a raw browser string or
 * an HTTP envelope reaching the live region: anything that catches it can ask
 * for `failure.message` and trust that a person wrote it.
 */
export class VoiceAgentError extends Error {
  readonly failure: VoiceFailure;

  constructor(failure: VoiceFailure, options?: { cause?: unknown }) {
    super(failure.message, options as ErrorOptions);
    this.name = 'VoiceAgentError';
    this.failure = failure;
  }
}

/**
 * Get a speakable failure out of anything at all.
 *
 * The fallback matters as much as the lookup: an unrecognised error must still
 * produce a sentence, never `[object Object]` or an empty announcement.
 */
export function toVoiceFailure(err: unknown): VoiceFailure {
  if (err instanceof VoiceAgentError) return err.failure;
  return describeConnectionError(err);
}

/**
 * Refusal codes from /api/token whose `error` text was written for a player.
 * Keep this in step with `refuse(...)` in app/api/token/route.ts — a code
 * missing here is safe (it gets our own copy); a developer-facing code wrongly
 * added here gets read aloud to a player.
 */
const PLAYER_FACING_TOKEN_CODES = new Set(['quota_exhausted', 'service_at_capacity', 'rate_limited']);

/** Map a getUserMedia rejection to something worth hearing. */
export function describeMicError(err: unknown): VoiceFailure {
  const name = (err as { name?: string })?.name ?? '';
  const raw = err instanceof Error ? err.message : String(err ?? '');

  if (name === 'NotAllowedError' || /permission|denied|dismissed/i.test(raw)) {
    return {
      code: 'mic_denied',
      recoverable: true,
      message:
        'The browser blocked the microphone. Allow it in the address bar and press J again, ' +
        'or keep playing by typing your moves in the text box below.',
    };
  }

  if (name === 'NotFoundError' || /no.*(device|microphone)|not found/i.test(raw)) {
    return {
      code: 'mic_missing',
      recoverable: true,
      message:
        'No microphone was found. Plug one in and press J again, or type your moves in the ' +
        'text box below — everything works by keyboard.',
    };
  }

  if (name === 'NotReadableError' || /in use|busy|could not start/i.test(raw)) {
    return {
      code: 'mic_busy',
      recoverable: true,
      message:
        'Another application is using the microphone. Close it and press J again, or type ' +
        'your moves instead.',
    };
  }

  if (/https|secure|localhost/i.test(raw)) {
    return {
      code: 'insecure_context',
      recoverable: false,
      message:
        'Microphone access needs a secure connection. Open this page over HTTPS. You can still ' +
        'play by typing your moves.',
    };
  }

  return {
    code: 'mic_unknown',
    recoverable: true,
    message: 'The microphone could not be started. You can play by typing your moves in the text box below.',
  };
}

/**
 * Turn a failed /api/token response into something a person can act on.
 *
 * The route already writes human sentences; the job here is to use them
 * instead of the HTTP envelope around them.
 */
export function describeTokenError(status: number, body: string): VoiceFailure {
  let parsed: { error?: string; code?: string } = {};
  try {
    const raw: unknown = JSON.parse(body);
    // `JSON.parse("null")` returns null, and `null.code` throws — which would
    // crash the handler whose whole job is to keep a failure speakable, so the
    // player would get silence instead of a sentence. Arrays, strings and
    // numbers are harmless here but equally not what we expect, so the guard
    // is "a real object or nothing".
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      parsed = raw as { error?: string; code?: string };
    }
  } catch {
    /* not JSON — fall through to the status-based defaults */
  }

  const code = parsed.code ?? `http_${status}`;

  // Only these codes carry text written for a player. The rest of the route's
  // messages are for whoever deploys it — "ASSEMBLYAI_API_KEY not configured.
  // Edit .env.local and restart the dev server", "Failed to mint token",
  // "Forbidden: cross-origin token request". Passing those through would read
  // a stack-trace fragment aloud to someone who just wanted to play chess, so
  // the allowlist is deliberately narrow: anything unrecognised gets our own
  // copy below, and the real text stays in the console for the developer.
  // Defence in depth behind the allowlist: even an approved code does not get
  // to speak text that looks like data. The allowlist is a promise about which
  // codes are player-facing; this is a check on the string that actually
  // arrived, which is the thing that reaches the ear.
  const looksLikeData = (text: string) => /[{}[\]]|":\s*"/.test(text);

  if (
    parsed.error &&
    parsed.code &&
    PLAYER_FACING_TOKEN_CODES.has(parsed.code) &&
    !looksLikeData(parsed.error)
  ) {
    // Only add the fallback when the server has not already offered one. The
    // capacity message ends "you can keep playing with the keyboard"; appending
    // ours produced "...with the keyboard. You can keep playing by typing your
    // moves." — the same sentence twice, which is merely wordy on screen and
    // genuinely irritating read aloud at speech rate.
    const alreadyOffersFallback = /keyboard|typ(e|ing)/i.test(parsed.error);
    const message = alreadyOffersFallback
      ? parsed.error
      : `${parsed.error} You can keep playing by typing your moves.`;
    return { code, recoverable: true, message };
  }

  if (parsed.code === 'not_configured') {
    return {
      code,
      recoverable: false,
      message:
        'Voice is not set up on this deployment. You can still play the full game by typing ' +
        'your moves and using the keyboard.',
    };
  }

  if (status === 429) {
    return {
      code,
      recoverable: true,
      message:
        'You have used your voice time for today. It resets within 24 hours — you can keep ' +
        'playing by typing your moves.',
    };
  }

  if (status === 503) {
    return {
      code,
      recoverable: true,
      message:
        'Voice is temporarily unavailable because the daily limit for everyone has been reached. ' +
        'The board and keyboard still work, and voice returns within 24 hours.',
    };
  }

  if (status === 403) {
    return {
      code,
      recoverable: false,
      message: 'Voice is not available from this address. You can still play by typing your moves.',
    };
  }

  if (status >= 500) {
    return {
      code,
      recoverable: true,
      message: 'Voice is not responding right now. Try again in a moment, or type your moves instead.',
    };
  }

  return {
    code,
    recoverable: true,
    message: 'Voice could not start. You can play by typing your moves in the text box below.',
  };
}

/** Connection-level failures once a session is already open. */
export function describeConnectionError(err: unknown): VoiceFailure {
  const raw = err instanceof Error ? err.message : String(err ?? '');

  if (/offline|network|failed to fetch|socket hang up/i.test(raw)) {
    return {
      code: 'offline',
      recoverable: true,
      message:
        'The connection dropped. Check your network — the board and your moves are safe, and ' +
        'you can keep playing by typing.',
    };
  }

  return {
    code: 'connection',
    recoverable: true,
    message: 'The voice connection failed. You can keep playing by typing your moves.',
  };
}
