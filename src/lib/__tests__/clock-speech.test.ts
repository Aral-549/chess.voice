// ============================================================
// How the clock sounds.
//
// This is text a player hears under time pressure, so the cases that matter
// are the boundaries: the singular, the flag falling, and anything malformed
// that must be spoken rather than swallowed.
// ============================================================

import { describe, it, expect } from 'vitest';
import { spokenClock } from '../clock-speech';

describe('spokenClock', () => {
  it('reads a normal clock the way a person says it', () => {
    expect(spokenClock('04:56')).toBe('4 minutes 56 seconds');
    expect(spokenClock('10:00')).toBe('10 minutes');
    expect(spokenClock('00:42')).toBe('42 seconds');
  });

  it('never emits the raw colon form, which reads as "zero four colon"', () => {
    expect(spokenClock('04:56')).not.toContain(':');
  });

  it('singularises one minute and one second', () => {
    expect(spokenClock('01:00')).toBe('1 minute');
    expect(spokenClock('00:01')).toBe('1 second');
    expect(spokenClock('01:01')).toBe('1 minute 1 second');
  });

  it('says the flag has fallen plainly rather than "0 minutes 0 seconds"', () => {
    expect(spokenClock('00:00')).toBe('no time left');
  });

  it('drops the empty half rather than saying zero', () => {
    expect(spokenClock('05:00')).not.toMatch(/0 seconds/);
    expect(spokenClock('00:30')).not.toMatch(/0 minutes/);
  });

  it('speaks a malformed value back instead of swallowing it', () => {
    // Silence would be the worst outcome: the player asked and heard nothing.
    for (const bad of ['', 'soon', '12', '1:2:3', 'ab:cd', '-1:30', '1:-5']) {
      expect(spokenClock(bad)).toBe(bad);
    }
  });

  it('handles long clocks without wrapping', () => {
    expect(spokenClock('90:07')).toBe('90 minutes 7 seconds');
  });
});
