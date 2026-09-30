// ============================================================
// chess.voice — narrated games
//
// A small library of famous games you can listen to the way you'd listen to a
// podcast. This is the most voice-native thing in the app: on a board it is
// just a PGN viewer, out loud it is a story with a shape.
//
// PROVENANCE. The two historical games were verified on 2026-09-23 against
// pgnmentor.com's Morphy and Anderssen collections and match move for move.
// The reference writes the final move "Rd8+" / "Be7+" where we write "#";
// ours is the more precise notation and chess.js confirms checkmate in both.
//
// `library-and-modes.test.ts` pins the reference movetext inline, so the check
// survives without network access and fails if anyone edits these.
//
// Before ADDING a game: verify it the same way. A move sequence you cannot
// confirm does not get a famous name attached to it — a wrong attribution in
// front of a listener who trusts you is worse than a smaller library.
//
// See contracts/coaching-and-modes.md, "Provenance rule".
// ============================================================

export interface LibraryGame {
  id: string;
  /** What a player is likely to say out loud. Matched case-insensitively. */
  aliases: string[];
  title: string;
  white: string;
  black: string;
  event: string;
  year: number;
  result: string;
  /** One sentence of context, spoken before the first move. */
  blurb: string;
  pgn: string;
}

export const LIBRARY: LibraryGame[] = [
  {
    id: 'opera',
    aliases: ['opera game', 'the opera game', 'morphy', 'opera box game'],
    title: 'The Opera Game',
    white: 'Paul Morphy',
    black: 'Duke of Brunswick and Count Isouard',
    event: 'Paris Opera House',
    year: 1858,
    result: '1-0',
    blurb:
      'Morphy played this in a box at the Paris Opera, reportedly while trying to watch the performance. ' +
      'It is the game most often used to teach development, because every move does something.',
    pgn: [
      '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5',
      '6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5',
      '11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6',
      '15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#',
    ].join(' '),
  },
  {
    id: 'immortal',
    aliases: ['immortal game', 'the immortal game', 'anderssen', 'immortal'],
    title: 'The Immortal Game',
    white: 'Adolf Anderssen',
    black: 'Lionel Kieseritzky',
    event: 'London',
    year: 1851,
    result: '1-0',
    blurb:
      'Anderssen gives up both rooks, a bishop and the queen, and mates with three minor pieces. ' +
      'It was a casual game played during a break in a tournament.',
    pgn: [
      '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6',
      '6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6',
      '11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6',
      '16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6',
      '21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#',
    ].join(' '),
  },
  {
    id: 'scholars',
    aliases: ["scholar's mate", 'scholars mate', 'four move mate', 'scholar mate'],
    title: "Scholar's Mate",
    white: 'Example',
    black: 'Example',
    event: 'Teaching line',
    year: 0,
    result: '1-0',
    blurb:
      'Not a famous game — the four-move mate every beginner meets, included so you can hear the trap ' +
      'being set and learn to answer it.',
    pgn: '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#',
  },
];

/** Find a game from something a player said. Returns null rather than guessing
 *  — offering the wrong game is worse than asking again. */
export function findGame(spoken: string): LibraryGame | null {
  const needle = spoken.toLowerCase().trim();
  if (!needle) return null;

  // Exact alias first, so "immortal game" cannot be beaten by a longer partial.
  for (const game of LIBRARY) {
    if (game.aliases.some((a) => a === needle)) return game;
  }
  for (const game of LIBRARY) {
    if (game.aliases.some((a) => needle.includes(a))) return game;
    if (needle.includes(game.title.toLowerCase())) return game;
  }
  return null;
}

/** Spoken list of what is available, for when a request does not match. */
export function describeLibrary(): string {
  const titles = LIBRARY.map((g) => g.title);
  const last = titles.pop();
  return `I can replay ${titles.join(', ')} or ${last}. Which would you like?`;
}

/** The sentence spoken before the first move. */
export function introduce(game: LibraryGame): string {
  const who = `${game.white} against ${game.black}`;
  const where = game.year > 0 ? `, ${game.event}, ${game.year}` : '';
  return `${game.title}. ${who}${where}. ${game.blurb}`;
}
