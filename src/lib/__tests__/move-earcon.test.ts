import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Records every oscillator/panner the earcon builds so we can assert on the
 *  actual sound: which pitches, which stereo positions, in what order. */
interface Played { freq: number; pan: number; type: string; start: number; gain: number }
const played: Played[] = [];

class FakeParam {
  value = 0;
  setValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
}

function makeCtx() {
  const pending: Partial<Played>[] = [];
  return {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: {},
    resume: () => Promise.resolve(),
    createOscillator() {
      const rec: Partial<Played> = {};
      pending.push(rec);
      const osc = {
        type: 'sine',
        frequency: new FakeParam(),
        connect: () => {},
        disconnect: () => {},
        start(t: number) {
          rec.freq = (osc.frequency as FakeParam).value;
          rec.type = osc.type;
          rec.start = t;
          if (rec.pan === undefined) rec.pan = 0;
          played.push(rec as Played);
        },
        stop: () => {},
        onended: null as null | (() => void),
      };
      Object.defineProperty(osc, '__rec', { value: rec });
      return osc;
    },
    createGain() {
      return { gain: new FakeParam(), connect: () => {}, disconnect: () => {} };
    },
    createStereoPanner() {
      const param = new FakeParam();
      return {
        pan: {
          setValueAtTime: (v: number) => {
            param.setValueAtTime(v);
            const target = pending[pending.length - 1];
            if (target) target.pan = v;
            return param;
          },
        },
        connect: () => {},
        disconnect: () => {},
      };
    },
    createBuffer(_c: number, frames: number) {
      return { getChannelData: () => new Float32Array(frames) };
    },
    createBufferSource() {
      return { buffer: null, connect: () => {}, disconnect: () => {}, start: () => {}, onended: null };
    },
    createBiquadFilter() {
      return { type: '', frequency: new FakeParam(), Q: new FakeParam(), connect: () => {}, disconnect: () => {} };
    },
  };
}

beforeEach(() => {
  played.length = 0;
  vi.resetModules();
  const ctx = makeCtx();
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = function () { return ctx; };
});

async function earcon() {
  return (await import('../sound-effects')).playMoveEarcon;
}

describe('move earcons encode the move, not just "something happened"', () => {
  it('maps files left-to-right across the stereo field', async () => {
    const play = await earcon();
    play({ from: 'a1', to: 'a4', piece: 'r' });
    const leftPan = played[played.length - 1].pan;

    played.length = 0;
    play({ from: 'h1', to: 'h4', piece: 'r' });
    const rightPan = played[played.length - 1].pan;

    expect(leftPan).toBeLessThan(-0.5); // a-file hard left
    expect(rightPan).toBeGreaterThan(0.5); // h-file hard right
    expect(rightPan).toBeGreaterThan(leftPan);
  });

  it('maps ranks low-to-high in pitch', async () => {
    const play = await earcon();
    play({ from: 'd1', to: 'd1', piece: 'p' });
    const low = played[played.length - 1].freq;

    played.length = 0;
    play({ from: 'd8', to: 'd8', piece: 'p' });
    const high = played[played.length - 1].freq;

    expect(high).toBeGreaterThan(low);
  });

  it('gives every square on a rank a distinct stereo position', async () => {
    const play = await earcon();
    const pans = new Set<number>();
    for (const f of 'abcdefgh') {
      played.length = 0;
      play({ from: `${f}2`, to: `${f}4`, piece: 'p' });
      pans.add(played[played.length - 1].pan);
    }
    expect(pans.size).toBe(8);
  });

  it('distinguishes pieces by timbre', async () => {
    const play = await earcon();
    const timbres = new Set<string>();
    for (const piece of ['p', 'n', 'b', 'r']) {
      played.length = 0;
      play({ from: 'e2', to: 'e4', piece });
      timbres.add(played[played.length - 1].type);
    }
    expect(timbres.size).toBe(4); // pawn/knight/bishop/rook must not sound alike
  });

  it('plays origin before destination so direction is audible', async () => {
    const play = await earcon();
    play({ from: 'a1', to: 'h8', piece: 'q' });
    expect(played.length).toBeGreaterThanOrEqual(2);
    expect(played[0].start).toBeLessThan(played[1].start);
  });

  it('adds an audible marker for check, and more for mate', async () => {
    const play = await earcon();
    play({ from: 'd1', to: 'h5', piece: 'q' });
    const quiet = played.length;

    played.length = 0;
    play({ from: 'd1', to: 'h5', piece: 'q', isCheck: true });
    const checked = played.length;

    played.length = 0;
    play({ from: 'd1', to: 'h5', piece: 'q', isCheckmate: true });
    const mated = played.length;

    expect(checked).toBeGreaterThan(quiet);
    expect(mated).toBeGreaterThan(checked);
  });

  it('is short enough to beat speech', async () => {
    const play = await earcon();
    const ms = play({ from: 'e2', to: 'e4', piece: 'p' });
    expect(ms).toBeLessThanOrEqual(400); // a spoken move is ~2000ms
  });
});
