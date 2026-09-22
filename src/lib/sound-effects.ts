// ============================================================
// VoiceChessmate — Chess.com-style Sound Engine
// Pure Web Audio API synthesis — no external files needed.
//
// All sounds are designed to closely match chess.com's audio:
//   - Move:       woody percussive thud (piece hitting board)
//   - Capture:    sharper crack + thud
//   - Check:      two-tone metallic alert
//   - Castle:     two soft clunks in quick succession
//   - Promote:    ascending shimmer
//   - Game start: warm three-note welcome chime
//   - Win:        ascending triumphant arpeggio
//   - Loss:       descending somber chord
//   - Draw:       neutral two-tone resolve
//   - Illegal:    low buzz
// ============================================================

let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx) {
      const C = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      _ctx = new C();
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  } catch {
    return null;
  }
}

export function getAudioContext() { return ctx(); }
export function resumeAudioContext() { ctx(); }

// ── Low-level helpers ─────────────────────────────────────────

/** Sine/triangle/sawtooth/square tone with smooth attack & exponential decay. */
function tone(
  freq: number,
  start: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
  freqEnd?: number,
  pan = 0,
): void {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  let out: AudioNode = amp;
  if (pan !== 0 && typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start);
    amp.connect(p);
    out = p;
  }
  osc.connect(amp);
  out.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
  osc.onended = () => { try { osc.disconnect(); amp.disconnect(); } catch { /**/ } };
}

/**
 * Percussive wood thud — the signature chess.com piece-placement sound.
 * Built from filtered white noise shaped like a drum transient.
 *
 * freq:   centre of the bandpass filter (higher = brighter / lighter piece)
 * attack: noise decay time in seconds
 * gain:   overall loudness
 */
function woodThud(start: number, freq: number, attack: number, gain: number, pan = 0): void {
  const c = ctx();
  if (!c) return;
  const frames = Math.ceil(c.sampleRate * attack * 1.5);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // exponential decay envelope on white noise
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (frames * 0.35));
  }
  const src = c.createBufferSource();
  src.buffer = buf;

  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 80;

  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.2;

  const amp = c.createGain();
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + attack);

  let out: AudioNode = amp;
  if (pan !== 0 && typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start);
    amp.connect(p);
    out = p;
  }

  src.connect(hp);
  hp.connect(bp);
  bp.connect(amp);
  out.connect(c.destination);
  src.start(start);
  src.onended = () => { try { src.disconnect(); hp.disconnect(); bp.disconnect(); amp.disconnect(); } catch { /**/ } };
}

/** Short metallic click transient — used for lighter sounds like the "lift" of a piece. */
function click(start: number, freq: number, gain: number, pan = 0): void {
  woodThud(start, freq, 0.025, gain, pan);
}

// ── Chess.com-style move sounds ──────────────────────────────

/**
 * Standard piece move — soft woody thud, just like chess.com's default "Move" sound.
 * Two layers: a deep body resonance + a mid surface knock.
 */
export function playMoveSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  woodThud(t,        280, 0.12, 0.55);  // deep body resonance
  woodThud(t + 0.01, 900, 0.05, 0.30);  // surface knock transient
}

/**
 * Capture — same as move but with a sharper initial crack,
 * mirroring chess.com's distinct "Capture" sound.
 */
export function playCaptureSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  woodThud(t,        600, 0.06, 0.70);  // sharp strike (displaced piece)
  woodThud(t + 0.05, 280, 0.14, 0.60);  // thud of capturing piece landing
}

/**
 * Check — chess.com's check sound: two urgent metallic pings, ascending.
 */
export function playCheckSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  tone(1046.5, t,        0.10, 0.22, 'triangle');  // C6 — first alert
  tone(1318.5, t + 0.12, 0.14, 0.25, 'sine');     // E6 — second (higher urgency)
}

/**
 * Castle — two soft clunks (king then rook), slightly separated,
 * matching chess.com's castle sound.
 */
export function playCastleSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  woodThud(t,        320, 0.10, 0.50);  // king slides
  woodThud(t + 0.12, 320, 0.10, 0.42);  // rook follows
}

/**
 * Promotion — an ascending shimmer chime, like chess.com's promotion fanfare.
 */
export function playPromotionSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  // Rising arpeggio: C5 → E5 → G5 → B5
  [523.25, 659.25, 783.99, 987.77].forEach((f, i) => {
    tone(f, t + i * 0.08, 0.20, 0.18, 'sine');
    tone(f * 2, t + i * 0.08, 0.12, 0.06, 'triangle'); // octave shimmer
  });
}

/**
 * Checkmate — the full playMoveEarcon already handles this via blips,
 * but callers can also trigger this standalone.
 */
export function playCheckmateSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  [880, 1108, 1318].forEach((f, i) =>
    tone(f, t + i * 0.13, 0.15, 0.20, 'triangle')
  );
}

// ── Game lifecycle sounds ────────────────────────────────────

/**
 * Game start — a warm, welcoming two-note chime.
 * Chess.com plays a gentle "ready" sound when a game begins.
 */
export function playGameStartSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.05;
  // G4 → B4 — a warm, inviting perfect third
  tone(392.00, t,        0.30, 0.18, 'sine');
  tone(493.88, t + 0.18, 0.45, 0.20, 'sine');
  // Soft harmonic layer
  tone(784.00, t,        0.20, 0.07, 'triangle');
  tone(987.77, t + 0.18, 0.35, 0.08, 'triangle');
}

/**
 * Win / Checkmate delivered — chess.com's triumphant ascending fanfare.
 * Four-note C major arpeggio that feels satisfying.
 */
export function playVictorySound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.05;
  const notes = [
    { f: 523.25, dt: 0.00, dur: 0.12 },  // C5
    { f: 659.25, dt: 0.10, dur: 0.12 },  // E5
    { f: 783.99, dt: 0.20, dur: 0.14 },  // G5
    { f: 1046.5, dt: 0.33, dur: 0.50 },  // C6 (held)
  ];
  notes.forEach(({ f, dt, dur }) => {
    tone(f,     t + dt, dur, 0.22, 'triangle');
    tone(f,     t + dt, dur, 0.14, 'sine');
    tone(f * 2, t + dt, dur * 0.7, 0.05, 'sine'); // octave shimmer
  });
}

/**
 * Loss / Defeat — chess.com's somber descending tone.
 */
export function playDefeatSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.05;
  // Descending: E4 → C4 → A3
  [
    { f: 329.63, dt: 0.00, dur: 0.25 },
    { f: 261.63, dt: 0.22, dur: 0.28 },
    { f: 220.00, dt: 0.46, dur: 0.50 },
  ].forEach(({ f, dt, dur }) => {
    tone(f, t + dt, dur, 0.18, 'triangle');
    tone(f, t + dt, dur, 0.10, 'sine');
  });
}

/**
 * Draw / Stalemate — neutral two-tone resolve.
 */
export function playDrawSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.05;
  tone(392.00, t,        0.28, 0.16, 'sine');     // G4
  tone(440.00, t + 0.22, 0.40, 0.16, 'triangle'); // A4 (gentle unresolved feel)
}

/**
 * Illegal move / Error — chess.com plays a short buzz.
 */
export function playErrorSound(): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  tone(160, t, 0.18, 0.20, 'sawtooth', 110);
  tone(163, t, 0.18, 0.20, 'sawtooth', 112); // slight detuning = dissonant buzz
}

// ── Full move earcon (spatial audio for blind play) ──────────

const RANK_PITCH = [262, 294, 330, 392, 440, 523, 587, 659];
const PIECE_TIMBRE: Record<string, { type: OscillatorType; gain: number }> = {
  p: { type: 'sine',     gain: 0.22 },
  n: { type: 'triangle', gain: 0.20 },
  b: { type: 'square',   gain: 0.10 },
  r: { type: 'sawtooth', gain: 0.14 },
  q: { type: 'sawtooth', gain: 0.18 },
  k: { type: 'sine',     gain: 0.26 },
};

function squareToAudio(sq: string): { pan: number; freq: number } | null {
  if (!sq || sq.length < 2) return null;
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return { pan: -0.85 + (file / 7) * 1.7, freq: RANK_PITCH[rank] };
}

export interface EarconMove {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  san?: string;
  isCheck?: boolean;
  isCheckmate?: boolean;
}

/**
 * Spatial audio move earcon for accessibility (blind/VI players).
 * from-square plays first (soft), to-square lands (full).
 * File = stereo pan, rank = pitch, piece = timbre.
 * Returns approximate duration in ms so speech can be timed.
 */
export function playMoveEarcon(move: EarconMove): number {
  const c = ctx();
  if (!c) return 0;

  const t0 = c.currentTime + 0.01;
  const timbre = PIECE_TIMBRE[move.piece] ?? PIECE_TIMBRE.p;

  // Castling: two clunks at destination squares
  if (move.san === 'O-O' || move.san === 'O-O-O') {
    const kingTo = squareToAudio(move.san === 'O-O' ? 'g1' : 'c1');
    const rookTo = squareToAudio(move.san === 'O-O' ? 'f1' : 'd1');
    if (kingTo) tone(kingTo.freq, t0,        0.12, 0.26, 'sine',     undefined, kingTo.pan);
    if (rookTo) tone(rookTo.freq, t0 + 0.14, 0.12, 0.14, 'sawtooth', undefined, rookTo.pan);
    return 280;
  }

  const from = squareToAudio(move.from);
  const to   = squareToAudio(move.to);
  if (!to) return 0;

  // Lift sound (quiet)
  if (from) {
    click(t0, 900, timbre.gain * 0.3, from.pan);
    tone(from.freq, t0, 0.055, timbre.gain * 0.35, timbre.type, undefined, from.pan);
  }

  const land = t0 + 0.08;
  if (move.captured) {
    // Capture: sharp crack then thud
    woodThud(land,        600, 0.05, 0.55, to.pan);
    woodThud(land + 0.04, 280, 0.12, 0.50, to.pan);
  } else {
    // Move: softer woody thud
    woodThud(land,        320, 0.10, 0.45, to.pan);
  }
  // Tonal overlay so blind players hear the piece type and rank
  tone(to.freq, land, 0.18, timbre.gain, timbre.type, undefined, to.pan);
  if (move.piece === 'q') {
    tone(to.freq * 1.5, land, 0.18, 0.08, 'sine', undefined, to.pan);
  }

  let total = 260;
  if (move.isCheckmate) {
    [0, 0.13, 0.26].forEach((d, i) =>
      tone(880 + i * 220, land + 0.22 + d, 0.12, 0.12, 'square')
    );
    total = 650;
  } else if (move.isCheck) {
    tone(1046.5, land + 0.22, 0.10, 0.18, 'triangle');
    tone(1318.5, land + 0.34, 0.14, 0.20, 'sine');
    total = 500;
  }
  return total;
}

/** Board orientation calibration sweep (a→h, rank 4). */
export function playBoardOrientationCue(): void {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + 0.02;
  for (let file = 0; file < 8; file++) {
    const sq = squareToAudio(String.fromCharCode(97 + file) + '4');
    if (sq) tone(sq.freq, t0 + file * 0.10, 0.09, 0.18, 'sine', undefined, sq.pan);
  }
}
