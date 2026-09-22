// ============================================================
// Adversarial pass over the game library and the play modes.
//
// The library's failure mode is shipping a famous name attached to moves that
// are not that game. The modes' failure mode is scoring a player for something
// that was not their mistake, or letting ambient speech move a piece.
//
// Case numbers refer to contracts/coaching-and-modes.md.
// ============================================================

import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { LIBRARY, findGame, describeLibrary, introduce } from '../game-library';
import {
  newBlindfoldScore,
  recordAttempt,
  recordAssist,
  breakAttempt,
  summariseBlindfold,
  isPositionError,
  policyFor,
  turnDetectionFor,
} from '../play-modes';

describe('game library — every shipped game is real chess (case 21)', () => {
  it('ships at least one game', () => {
    expect(LIBRARY.length).toBeGreaterThan(0);
  });

  it.each(LIBRARY.map((g) => [g.id, g] as const))('%s parses as legal chess', (_id, game) => {
    const chess = new Chess();
    expect(() => chess.loadPgn(game.pgn)).not.toThrow();
    expect(chess.history().length).toBeGreaterThan(0);
  });

  it.each(LIBRARY.map((g) => [g.id, g] as const))(
    '%s ends the way its recorded result says',
    (_id, game) => {
      const chess = new Chess();
      chess.loadPgn(game.pgn);

      // Every game currently shipped is a checkmate. If a draw or resignation
      // is ever added this assertion must be widened deliberately, not deleted.
      expect(chess.isGameOver()).toBe(true);
      expect(chess.isCheckmate()).toBe(true);
      expect(game.result).toBe('1-0');
    },
  );

  it.each(LIBRARY.map((g) => [g.id, g] as const))('%s carries its provenance', (_id, game) => {
    // The provenance rule: a game without attribution is not shipped.
    expect(game.title.trim()).not.toBe('');
    expect(game.white.trim()).not.toBe('');
    expect(game.black.trim()).not.toBe('');
    expect(game.event.trim()).not.toBe('');
    expect(game.blurb.trim().length).toBeGreaterThan(20);
  });

  it('has unique ids and no alias claimed by two games', () => {
    const ids = LIBRARY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);

    const aliases = LIBRARY.flatMap((g) => g.aliases.map((a) => a.toLowerCase()));
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe('game library — lookup refuses to guess (cases 18, 19)', () => {
  it('finds a game by its natural spoken name', () => {
    expect(findGame('the opera game')?.id).toBe('opera');
    expect(findGame('immortal game')?.id).toBe('immortal');
  });

  it('is case and whitespace insensitive', () => {
    expect(findGame('  THE Opera Game  ')?.id).toBe('opera');
  });

  it('finds a game inside a longer sentence', () => {
    expect(findGame('can you replay the immortal game for me')?.id).toBe('immortal');
  });

  it('returns null for an unknown game rather than the nearest thing (case 19)', () => {
    expect(findGame('the game of the century')).toBeNull();
    expect(findGame('kasparov versus deep blue')).toBeNull();
    expect(findGame('')).toBeNull();
    expect(findGame('   ')).toBeNull();
  });

  it('prefers an exact alias over a longer partial match', () => {
    // 'immortal' is an alias of one game and a substring of another's title.
    // The exact match must win, deterministically.
    expect(findGame('immortal')?.id).toBe('immortal');
  });

  it('offers what it does have when it cannot match', () => {
    const spoken = describeLibrary();
    for (const game of LIBRARY) expect(spoken).toContain(game.title);
  });

  it('introduces a game with who played it and when', () => {
    const opera = LIBRARY.find((g) => g.id === 'opera')!;
    const intro = introduce(opera);
    expect(intro).toContain('Morphy');
    expect(intro).toContain('1858');
  });

  it('omits a meaningless year rather than announcing year zero', () => {
    const teaching = LIBRARY.find((g) => g.year === 0);
    if (teaching) expect(introduce(teaching)).not.toContain('0');
  });
});

describe('blindfold scoring (cases 13-17)', () => {
  it('counts a played move and nothing else (case 14)', () => {
    const s = recordAttempt(newBlindfoldScore(), 'played');
    expect(s.movesPlayed).toBe(1);
    expect(s.positionErrors).toBe(0);
  });

  it('counts naming a piece that is not there as a position error (case 13)', () => {
    const s = recordAttempt(newBlindfoldScore(), 'position-error');
    expect(s.positionErrors).toBe(1);
    expect(s.movesPlayed).toBe(0);
  });

  it('does NOT score an ordinary rejection as a memory failure', () => {
    // An illegal move with a real piece, or unparsed speech, is not the player
    // losing the position. Scoring it would punish a bad move, or a misheard
    // word, as amnesia.
    const s = recordAttempt(newBlindfoldScore(), 'other-rejection');
    expect(s).toEqual(newBlindfoldScore());
  });

  it('counts an assist without counting it as a failure (case 15)', () => {
    const s = recordAssist(newBlindfoldScore());
    expect(s.assists).toBe(1);
    expect(s.positionErrors).toBe(0);
  });

  it('keeps the score when the board is revealed, and marks it (case 12)', () => {
    let s = recordAttempt(newBlindfoldScore(), 'played');
    s = breakAttempt(s);
    expect(s.broken).toBe(true);
    expect(s.movesPlayed).toBe(1);
  });

  it('never mutates the score it was given', () => {
    const original = newBlindfoldScore();
    const snapshot = { ...original };
    recordAttempt(original, 'played');
    recordAssist(original);
    breakAttempt(original);
    expect(original).toEqual(snapshot);
  });
});

describe('blindfold summary wording (case 16)', () => {
  it('reports moves and clean recall', () => {
    let s = newBlindfoldScore();
    for (let i = 0; i < 12; i++) s = recordAttempt(s, 'played');
    const text = summariseBlindfold(s);
    expect(text).toContain('12 moves');
    expect(text).toMatch(/never lost track/i);
  });

  it('singularises one move and one error', () => {
    let s = recordAttempt(newBlindfoldScore(), 'played');
    s = recordAttempt(s, 'position-error');
    const text = summariseBlindfold(s);
    expect(text).toContain('1 move without the board');
    expect(text).toMatch(/1 time\b/);
    expect(text).not.toContain('1 times');
  });

  it('says the attempt is unranked once the board was revealed', () => {
    const s = breakAttempt(recordAttempt(newBlindfoldScore(), 'played'));
    expect(summariseBlindfold(s)).toMatch(/unranked/i);
  });

  it('never frames this as simulating blindness', () => {
    // The mode is training, for anyone. For a screen reader user the board is
    // always hidden anyway, so this framing would be both wrong and patronising.
    const states = [
      newBlindfoldScore(),
      recordAttempt(newBlindfoldScore(), 'played'),
      breakAttempt(recordAssist(recordAttempt(newBlindfoldScore(), 'position-error'))),
    ];
    for (const s of states) {
      const text = summariseBlindfold(s).toLowerCase();
      expect(text).not.toMatch(/blind|sight|see|vision|eyes/);
      expect(text).toContain('without the board');
    }
  });
});

describe('isPositionError — only real memory failures count', () => {
  it('is true when the named square holds nothing', () => {
    expect(isPositionError({ namedPiece: 'n', namedSquare: 'f3', actualPieceOnSquare: null }))
      .toBe(true);
  });

  it('is true when the named square holds a different piece', () => {
    expect(isPositionError({ namedPiece: 'n', namedSquare: 'f3', actualPieceOnSquare: 'b' }))
      .toBe(true);
  });

  it('is false when the piece really is there', () => {
    expect(isPositionError({ namedPiece: 'n', namedSquare: 'f3', actualPieceOnSquare: 'n' }))
      .toBe(false);
  });

  it('is false when the player never claimed a specific source', () => {
    // "knight takes" or a misheard fragment makes no claim about a square, so
    // there is nothing to be wrong about.
    expect(isPositionError({ namedPiece: 'n', actualPieceOnSquare: null })).toBe(false);
    expect(isPositionError({ namedSquare: 'f3', actualPieceOnSquare: null })).toBe(false);
    expect(isPositionError({ actualPieceOnSquare: null })).toBe(false);
  });
});

describe('hands-free policy (cases 24-27)', () => {
  it('requires confirmation on every move when listening continuously', () => {
    const p = policyFor('handsfree');
    expect(p.continuousListening).toBe(true);
    // The whole safety argument for this mode.
    expect(p.requireConfirmation).toBe(true);
  });

  it('does not force confirmation in normal push-to-talk play', () => {
    expect(policyFor('normal').requireConfirmation).toBe(false);
    expect(policyFor('normal').continuousListening).toBe(false);
  });

  it('keeps the keyboard alive in every mode, without exception', () => {
    // Voice complements the keyboard; it never replaces it.
    for (const mode of ['normal', 'blindfold', 'handsfree'] as const) {
      expect(policyFor(mode).keyboardStillActive).toBe(true);
    }
  });

  it('asks the agent for server-side turn detection only when hands-free', () => {
    expect(turnDetectionFor('handsfree').type).toBe('server_vad');
    expect(turnDetectionFor('normal').type).toBe('manual');
    expect(turnDetectionFor('blindfold').type).toBe('manual');
  });

  it('blindfold does not silently enable continuous listening', () => {
    // Blindfold is about the board being hidden, not about how you talk.
    expect(policyFor('blindfold').continuousListening).toBe(false);
  });
});
