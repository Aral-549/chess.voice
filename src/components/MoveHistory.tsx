// ============================================================
// VoiceChessmate — Modern Move History Panel
// Displays moves in standard two-column chess notation
// Fully accessible with semantic table markup & keyboard scrolling
// ============================================================

'use client';

import { useEffect, useRef } from 'react';

interface MoveHistoryProps {
  pgn: string;
}

interface MovePair {
  number: number;
  white: string;
  black?: string;
}

function parsePGNMoves(pgn: string): MovePair[] {
  if (!pgn) return [];

  // Extract just the moves part (after any headers)
  const movesStr = pgn.replace(/\[.*?\]\s*/g, '').trim();
  if (!movesStr) return [];

  const tokens = movesStr.split(/\s+/);
  const pairs: MovePair[] = [];
  let current: Partial<MovePair> = {};

  for (const token of tokens) {
    // Skip result markers
    if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) continue;

    // Move number (e.g., "1.")
    const numMatch = token.match(/^(\d+)\./);
    if (numMatch) {
      current.number = parseInt(numMatch[1]);
      const move = token.replace(/^\d+\.\s*/, '');
      if (move) {
        current.white = move;
      }
      continue;
    }

    // It's a move
    if (current.number && !current.white) {
      current.white = token;
    } else if (current.number && current.white && !current.black) {
      current.black = token;
      pairs.push(current as MovePair);
      current = {};
    }
  }

  // Push incomplete pair
  if (current.number && current.white) {
    pairs.push(current as MovePair);
  }

  return pairs;
}

export function MoveHistory({ pgn }: MoveHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const moves = parsePGNMoves(pgn);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pgn]);

  return (
    <section
      role="region"
      aria-label="Game Move History"
      className="flex flex-col h-full bg-[#262522] text-white"
    >
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#21201d] border-b border-[#363430]">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <span>📋</span> Move History
        </h2>
        <span className="text-[11px] font-mono text-gray-400 bg-[#2d2b27] px-2 py-0.5 rounded">
          {moves.length} {moves.length === 1 ? 'turn' : 'turns'}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto max-h-[360px] focus:outline-none scrollbar-thin"
        tabIndex={0}
        aria-label="Move history scrollable table"
      >
        {moves.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <span className="text-3xl mb-2 opacity-40">♟</span>
            <p className="text-gray-400 text-xs leading-relaxed">
              No moves played yet.
              <br />
              <span className="text-emerald-400 font-medium">Hold &quot;J&quot;</span> to speak or press <span className="text-amber-400 font-mono">Enter</span> to type.
            </p>
          </div>
        ) : (
          <table className="w-full text-xs" aria-label="Moves played in algebraic notation">
            <caption className="sr-only">List of chess moves in standard algebraic notation</caption>
            <thead>
              <tr className="text-gray-400 text-[11px] bg-[#1d1c1a] border-b border-[#2d2b27]">
                <th scope="col" className="w-10 py-1.5 text-center font-mono">#</th>
                <th scope="col" className="py-1.5 text-left pl-3 font-semibold">White</th>
                <th scope="col" className="py-1.5 text-left pl-3 font-semibold">Black</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((pair, idx) => {
                const isLatest = idx === moves.length - 1;
                return (
                  <tr
                    key={pair.number}
                    className={`border-b border-[#2d2b27] transition-colors ${
                      idx % 2 === 0 ? 'bg-[#262522]' : 'bg-[#21201d]'
                    } hover:bg-[#312f2b]`}
                  >
                    <td className="py-2 text-center text-gray-400 font-mono select-none">
                      {pair.number}.
                    </td>
                    <td
                      className={`py-2 pl-3 font-mono font-medium ${
                        isLatest && !pair.black ? 'text-emerald-400 font-bold bg-[#1a3826]/40 rounded-sm' : 'text-gray-100'
                      }`}
                    >
                      {pair.white}
                    </td>
                    <td
                      className={`py-2 pl-3 font-mono font-medium ${
                        isLatest && pair.black ? 'text-emerald-400 font-bold bg-[#1a3826]/40 rounded-sm' : 'text-gray-300'
                      }`}
                    >
                      {pair.black || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
