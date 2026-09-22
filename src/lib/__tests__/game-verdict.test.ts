// ============================================================
// Regression: BUGLOG 2026-09-22 — "Defeat announced as victory".
//
// Two modules played game-over sounds. `useVoiceChessCoach.soundLastMove`
// fired on every move and had no way to know who won, so it played VICTORY on
// every checkmate — including ones the player lost — while `app/page.tsx`
// played the correct verdict 200ms earlier. A checkmated player heard defeat,
// then victory.
//
// This is an audio-first app for players who cannot see the board. The sound
// IS the result. These cases pin the verdict itself, and pin the fact that
// only one module owns it.
//
// Written as an adversarial pass: the cases below are attempts to make the
// function announce a wrong or confident-but-unknowable result.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gameOverVerdict } from '../game-verdict';

describe('gameOverVerdict — checkmate', () => {
  it('calls defeat when the player is the one with no legal reply', () => {
    // `turn` after the mating move is the side that cannot move: the loser.
    expect(
      gameOverVerdict({ isGameOver: true, isCheckmate: true, turn: 'w', playerColor: 'w' }),
    ).toBe('defeat');
  });

  it('calls victory when the opponent is the one with no legal reply', () => {
    expect(
      gameOverVerdict({ isGameOver: true, isCheckmate: true, turn: 'b', playerColor: 'w' }),
    ).toBe('victory');
  });

  it('inverts correctly when the player is Black', () => {
    // Guards against `turn === "w" ? defeat : victory` being hardcoded, which
    // is exactly the shape the original bug had.
    expect(
      gameOverVerdict({ isGameOver: true, isCheckmate: true, turn: 'b', playerColor: 'b' }),
    ).toBe('defeat');
    expect(
      gameOverVerdict({ isGameOver: true, isCheckmate: true, turn: 'w', playerColor: 'b' }),
    ).toBe('victory');
  });

  it('defaults the player to White when playerColor is omitted', () => {
    expect(gameOverVerdict({ isGameOver: true, isCheckmate: true, turn: 'w' })).toBe('defeat');
  });
});

describe('gameOverVerdict — draws', () => {
  it.each(['isDraw', 'isStalemate'] as const)('calls draw on %s', (flag) => {
    expect(gameOverVerdict({ isGameOver: true, [flag]: true, turn: 'w' })).toBe('draw');
  });

  it('does not let a draw depend on whose turn it is', () => {
    const asWhite = gameOverVerdict({ isGameOver: true, isDraw: true, turn: 'w' });
    const asBlack = gameOverVerdict({ isGameOver: true, isDraw: true, turn: 'b' });
    expect(asWhite).toBe(asBlack);
    expect(asWhite).toBe('draw');
  });
});

describe('gameOverVerdict — resignation', () => {
  it('calls defeat when the player resigned', () => {
    expect(
      gameOverVerdict({ isGameOver: true, resignedColor: 'w', playerColor: 'w' }),
    ).toBe('defeat');
  });

  it('calls victory when the opponent resigned', () => {
    expect(
      gameOverVerdict({ isGameOver: true, resignedColor: 'b', playerColor: 'w' }),
    ).toBe('victory');
  });

  it('lets resignation win over a stale checkmate flag', () => {
    // A player may resign in a position the engine still has flags set for.
    // Resignation is unambiguous; it must not be overridden.
    expect(
      gameOverVerdict({
        isGameOver: true,
        isCheckmate: true,
        turn: 'b', // would otherwise read as victory
        resignedColor: 'w',
        playerColor: 'w',
      }),
    ).toBe('defeat');
  });
});

describe('gameOverVerdict — refuses to guess', () => {
  // The governing project rule: prefer saying nothing over saying something
  // wrong. Every case here must return null, never a cheerful default.

  it('returns null when the game is not over, whatever else is set', () => {
    expect(
      gameOverVerdict({ isGameOver: false, isCheckmate: true, turn: 'w', playerColor: 'w' }),
    ).toBeNull();
    expect(gameOverVerdict({ isGameOver: false, isDraw: true })).toBeNull();
    expect(gameOverVerdict({ isGameOver: false, resignedColor: 'w' })).toBeNull();
  });

  it('returns null on checkmate with no turn — it cannot know who was mated', () => {
    expect(gameOverVerdict({ isGameOver: true, isCheckmate: true })).toBeNull();
  });

  it('returns null when the game is over for an unmodelled reason', () => {
    // e.g. clock timeout or abandonment: no flag this function understands.
    expect(gameOverVerdict({ isGameOver: true, turn: 'w', playerColor: 'w' })).toBeNull();
  });

  it('prefers draw over checkmate on a contradictory snapshot', () => {
    // A position cannot be both, so the snapshot is malformed. Draw is the
    // safer announcement: it cannot tell a losing player they won.
    expect(
      gameOverVerdict({
        isGameOver: true,
        isCheckmate: true,
        isStalemate: true,
        turn: 'b',
        playerColor: 'w',
      }),
    ).toBe('draw');
  });

  it('never returns victory from an empty game-over snapshot', () => {
    // The original bug's failure mode was an unconditional victory. Assert the
    // absence of any such fallback.
    expect(gameOverVerdict({ isGameOver: true })).not.toBe('victory');
  });
});

describe('only one module owns the game-over verdict', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

  it('useVoiceChessCoach does not play victory/defeat/draw sounds', () => {
    // This is the actual regression. soundLastMove runs on every move and
    // cannot know the result; if these calls come back, the double-announce
    // returns with them.
    const hook = read('../../hooks/useVoiceChessCoach.ts');
    expect(hook).not.toMatch(/playVictorySound/);
    expect(hook).not.toMatch(/playDefeatSound/);
    expect(hook).not.toMatch(/playDrawSound/);
  });

  it('page.tsx decides the verdict through gameOverVerdict, not inline', () => {
    const page = read('../../app/page.tsx');
    expect(page).toMatch(/gameOverVerdict\(/);
    // The inline shape that caused the bug: branching straight off `turn`.
    expect(page).not.toMatch(/turn === "w"\s*\)?\s*setTimeout/);
  });
});
