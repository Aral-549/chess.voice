// ============================================================
// chess.voice — clock, said out loud
//
// A screen reader reads "04:56" as "zero four colon five six". Nobody says the
// time that way, and under time pressure the listener has to translate it. The
// clock is also the one piece of game state that changes without anything
// happening on the board, so it is the one thing a player cannot infer from
// the last move — which makes getting this right worth a module.
// ============================================================

/** "04:56" → "4 minutes 56 seconds". Returns the input unchanged if it is not
 *  a clock string, so a malformed value is spoken rather than swallowed. */
export function spokenClock(formatted: string): string {
  const parts = (formatted ?? "").split(":");
  if (parts.length !== 2) return formatted;

  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return formatted;
  if (minutes < 0 || seconds < 0) return formatted;

  const m = minutes > 0 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "";
  const s = seconds > 0 ? `${seconds} second${seconds === 1 ? "" : "s"}` : "";

  // Both zero means the flag has fallen. "0 minutes 0 seconds" is a worse way
  // to hear that than saying it plainly.
  if (!m && !s) return "no time left";
  return [m, s].filter(Boolean).join(" ");
}
