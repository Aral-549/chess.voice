// ============================================================
// Regression: BUGLOG 2026-09-16 — hydration mismatch on the
// voice-support warning.
//
// The bug: `engine.isSupported` reads `window.SpeechRecognition`. During SSR
// there is no `window`, so it was false and the server rendered a "voice
// unavailable" alert. In the browser it was true, so the first client render
// took the opposite branch and React discarded the whole tree.
//
// The BUGLOG entry is explicit that the regression case must assert the
// *invariant*, not the symptom:
//
//   "a server render and a first client render must produce the same branch,
//    for both a browser that supports SpeechRecognition and one that does not."
//
// Testing only "the warning is hidden in Chromium" would pass while still
// being wrong elsewhere.
//
// These tests need no DOM: they render on the server, which is exactly the
// side the bug lived on.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, useSyncExternalStore } from 'react';
import { renderToString } from 'react-dom/server';

const NO_SUBSCRIBE = () => () => {};

/**
 * Mirrors the real gate in `app/page.tsx`: the warning renders when voice is
 * unsupported. `clientSupported` stands in for whatever the browser reports.
 */
function VoiceGate({ clientSupported }: { clientSupported: boolean }) {
  const isVoiceSupported = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => clientSupported,
    () => true, // server snapshot — must not depend on the browser
  );

  return createElement(
    'div',
    null,
    isVoiceSupported ? null : createElement('p', { role: 'alert' }, 'Voice input isn\'t available in this browser'),
  );
}

describe('SSR/hydration invariant: voice-support branch', () => {
  it('renders identical server HTML whether or not the browser supports speech', () => {
    // This is the invariant. The server cannot know the browser's capability,
    // so its output must not vary with it. Before the fix, these two differed.
    const supported = renderToString(createElement(VoiceGate, { clientSupported: true }));
    const unsupported = renderToString(createElement(VoiceGate, { clientSupported: false }));

    expect(supported).toBe(unsupported);
  });

  it('does not emit the unsupported-voice alert during server render', () => {
    // The original symptom: the server emitted role="alert" that the client
    // then contradicted. The server must take the optimistic branch, because
    // that is the branch hydration will also take.
    for (const clientSupported of [true, false]) {
      const html = renderToString(createElement(VoiceGate, { clientSupported }));
      expect(html).not.toContain('role="alert"');
      expect(html).not.toContain('available in this browser');
    }
  });

  it('reads a browser-independent constant as the server snapshot', () => {
    // Architectural guard. The invariant above holds only while the third
    // argument to useSyncExternalStore stays a constant. If someone
    // "simplifies" it back to `() => engine.isSupported`, the rendered
    // assertions above still pass in this probe but the real hook regresses —
    // so pin the real source.
    const src = readFileSync(
      resolve(__dirname, '../../hooks/useVoiceChessCoach.ts'),
      'utf8',
    );

    const call = src.match(/useSyncExternalStore\(([\s\S]*?)\);/);
    expect(call, 'useVoiceChessCoach must read isVoiceSupported through useSyncExternalStore').not.toBeNull();

    const args = call![1];
    const serverSnapshot = args.split(',').map((a) => a.trim()).filter(Boolean)[2];

    // A literal, not a read of engine/window/navigator.
    expect(serverSnapshot).toMatch(/^\(\)\s*=>\s*(true|false)$/);
    expect(serverSnapshot).not.toMatch(/engine|window|navigator|isSupported/);
  });
});
