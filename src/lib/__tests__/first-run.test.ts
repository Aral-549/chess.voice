// ============================================================
// Regression: BUGLOG 2026-09-24 — the first-run intro, two ways it failed the
// people it was written for.
//
// Both were found by an adversarial pass driving the production build, not by
// writing the implementation and then checking it did what I meant.
//
// 1. In a private window a brand-new user got no tutorial at all.
// 2. Focus jumped to the step heading on every advance, so a keyboard user was
//    thrown off the Next button three times in a three-step tutorial.
//
// The storage behaviour is testable directly — `hasSeenFirstRun` only needs a
// `window` with a `localStorage` getter, which is cheap to fake. There is no
// jsdom in this project, so the focus rule is pinned as a source guard instead;
// the real proof for that one is the Playwright run recorded in BUGLOG.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentSrc = readFileSync(
  resolve(process.cwd(), 'src/components/onboarding/FirstRun.tsx'),
  'utf8',
);

/** Install a fake `window` whose localStorage behaves as described. */
function withWindow(storage: 'working' | 'throws' | 'empty') {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  const win: Record<string, unknown> = {};
  Object.defineProperty(win, 'localStorage', {
    get() {
      if (storage === 'throws') throw new DOMException('denied', 'SecurityError');
      return localStorage;
    },
    configurable: true,
  });
  (globalThis as unknown as { window?: unknown }).window = win;
  return store;
}

describe('first-run persistence', () => {
  beforeEach(() => {
    // `seenThisSession` is module-level: one page load in the browser, one
    // module instance here. Without this the tests leak into each other.
    vi.resetModules();
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('a returning player is not shown the intro again', async () => {
    const store = withWindow('working');
    const mod = await import('../../components/onboarding/FirstRun');
    expect(mod.hasSeenFirstRun()).toBe(false);
    mod.markFirstRunSeen();
    expect(store.get('voice-chess-first-run-v1')).toBe('done');
    expect(mod.hasSeenFirstRun()).toBe(true);
  });

  it('never renders during a server render', async () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    const mod = await import('../../components/onboarding/FirstRun');
    // `true` means "already seen", i.e. do not render. Rendering a modal on the
    // server and not on the client is the hydration mismatch of 2026-09-16.
    expect(mod.hasSeenFirstRun()).toBe(true);
  });
});

describe('REGRESSION: storage being unavailable must not silence the tutorial', () => {
  beforeEach(() => {
    vi.resetModules();
    withWindow('throws');
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('reading blocked storage does not throw', async () => {
    const mod = await import('../../components/onboarding/FirstRun');
    expect(() => mod.hasSeenFirstRun()).not.toThrow();
  });

  it('writing to blocked storage does not throw', async () => {
    const mod = await import('../../components/onboarding/FirstRun');
    expect(() => mod.markFirstRunSeen()).not.toThrow();
  });

  it('a brand-new user in a private window still gets the intro', async () => {
    // The bug: `hasSeenFirstRun()` returned true whenever storage threw, on the
    // reasoning that it was safer not to trap anyone in a tutorial. Backwards —
    // it meant the one audience most likely to be evaluating the app in a
    // private window never saw the thing written for them.
    const mod = await import('../../components/onboarding/FirstRun');
    expect(mod.hasSeenFirstRun()).toBe(false);
  });

  it('but it is not shown twice in the same session', async () => {
    // The in-memory fallback has to actually hold, or dismissing it would do
    // nothing and every client re-render would put it back.
    const mod = await import('../../components/onboarding/FirstRun');
    expect(mod.hasSeenFirstRun()).toBe(false);
    mod.markFirstRunSeen();
    expect(mod.hasSeenFirstRun()).toBe(true);
  });
});

describe('REGRESSION: advancing a step must not steal focus', () => {
  // Source guards below — no module state involved.
  it('the step effect announces without moving focus', () => {
    // Focusing the heading on each step is the textbook pattern, and here it
    // cost the keyboard user the Next button three times in three steps. The
    // live region already carries the content, so the announcement stays and
    // the focus move goes.
    const effect = componentSrc.slice(
      componentSrc.indexOf('announce(`Step ${step + 1}'),
      componentSrc.indexOf('}, [step, current]);'),
    );
    expect(effect, 'the step effect moves focus again').not.toMatch(/\.focus\(\)/);
  });

  it('there is no heading ref left to focus', () => {
    expect(componentSrc).not.toContain('headingRef');
  });

  it('focus is still trapped and restored on close', () => {
    // Removing the per-step focus must not have removed the dialog's own focus
    // contract, which is what keeps the rest of the page unreachable.
    expect(componentSrc).toContain('previouslyFocused.current?.focus()');
    expect(componentSrc).toContain('dialogRef.current?.focus()');
    expect(componentSrc).toMatch(/aria-modal="true"/);
  });
});

describe('the intro says what it needs to say', () => {
  it('teaches the phonetic alphabet, which appears nowhere else on arrival', () => {
    for (const name of ['Anna', 'Bella', 'Cesar', 'David', 'Eva', 'Felix', 'Gustav', 'Hector']) {
      expect(componentSrc, `the intro never mentions ${name}`).toContain(name);
    }
  });

  it('says plain chess notation works too', () => {
    // The single most important reassurance: you do not have to learn anything
    // before your first move.
    expect(componentSrc).toMatch(/Plain chess works/i);
  });

  it('is escapable', () => {
    expect(componentSrc).toMatch(/e\.key === "Escape"/);
  });
});
