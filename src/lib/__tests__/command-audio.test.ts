import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { wavToPcm16 } from '../voice-agent';

const CMD_DIR = join(process.cwd(), 'public', 'cmd');

function riff(chunks: [string, Uint8Array][]): ArrayBuffer {
  const body = chunks.flatMap(([id, data]) => {
    const head = new Uint8Array(8);
    new DataView(head.buffer).setUint32(0, id.split('').reduce((a, c) => (a << 8) | c.charCodeAt(0), 0), false);
    new DataView(head.buffer).setUint32(4, data.length, true);
    const pad = data.length & 1 ? new Uint8Array(1) : new Uint8Array(0);
    return [head, data, pad];
  });
  const total = body.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(12 + total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x52494646, false); // RIFF
  dv.setUint32(4, 4 + total, true);
  dv.setUint32(8, 0x57415645, false); // WAVE
  let p = 12;
  for (const a of body) { out.set(a, p); p += a.length; }
  return out.buffer;
}

describe('wavToPcm16', () => {
  it('finds data after a LIST chunk, not at a hardcoded byte 44', () => {
    const fmt = new Uint8Array(16);
    const list = new Uint8Array(26);
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 0x80, 0xff]); // 1,2,3,-128
    const out = wavToPcm16(riff([['fmt ', fmt], ['LIST', list], ['data', pcm]]));
    expect(out).not.toBeNull();
    expect(Array.from(out!)).toEqual([1, 2, 3, -128]);
  });

  it('rejects non-WAV input instead of emitting garbage audio', () => {
    expect(wavToPcm16(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
    expect(wavToPcm16(new Uint8Array(64).buffer)).toBeNull();
  });

  it('never reads past the buffer when data size is overstated', () => {
    const head = new Uint8Array(8);
    new DataView(head.buffer).setUint32(0, 0x64617461, false);
    new DataView(head.buffer).setUint32(4, 0xffff, true); // lies: claims 65535 bytes
    const buf = new Uint8Array(12 + 8 + 4);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, 0x52494646, false);
    dv.setUint32(8, 0x57415645, false);
    buf.set(head, 12);
    expect(wavToPcm16(buf.buffer)!.length).toBe(2); // clamped to the 4 real bytes
  });

  it('every shipped command clip parses to non-empty audio', () => {
    const files = readdirSync(CMD_DIR).filter((f) => f.endsWith('.wav'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const b = readFileSync(join(CMD_DIR, f));
      const pcm = wavToPcm16(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      expect(pcm, `${f} failed to parse`).not.toBeNull();
      // 24kHz mono: a real spoken phrase is at least a quarter second
      expect(pcm!.length, `${f} too short`).toBeGreaterThan(6000);
      expect(pcm!.some((s) => s !== 0), `${f} is silent`).toBe(true);
    }
  });
});
