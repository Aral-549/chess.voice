#!/usr/bin/env node
// ============================================================
// Turn a saved browser console log into the latency table.
//
//   node scripts/latency-report.mjs console.log
//
// Reads the structured stage lines the app emits — one JSON object per stage
// boundary, `{"ch":"latency","stage":...,"turnId":...,"t":...}` — and
// reconstructs per-turn intervals from them.
//
// The percentile here is the same nearest-rank rule `src/lib/latency.ts` uses.
// It is reimplemented rather than imported so this script runs on a plain
// `node` with no build step, but if the two ever disagree the library is
// authoritative and this is the bug.
// ============================================================

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/latency-report.mjs <saved-console-log>');
  process.exit(2);
}

const STAGE_TO_PHASE = {
  'speech.end': 'speechEnd',
  'transcript.final': 'transcriptFinal',
  'tool.call': 'toolCall',
  'move.applied': 'moveApplied',
  'reply.audio.first': 'firstReplyAudio',
};

/** Pull the latency objects out of whatever else the console captured. */
function parse(text) {
  const turns = new Map();
  for (const line of text.split('\n')) {
    const start = line.indexOf('{"ch":"latency"');
    if (start === -1) continue;
    let row;
    try {
      row = JSON.parse(line.slice(start, line.lastIndexOf('}') + 1));
    } catch {
      continue; // a truncated or wrapped line — skip rather than guess
    }
    const phase = STAGE_TO_PHASE[row.stage];
    if (!phase || typeof row.t !== 'number' || !row.turnId) continue;

    if (!turns.has(row.turnId)) turns.set(row.turnId, {});
    const turn = turns.get(row.turnId);
    // First mark wins, matching the ledger: reply.audio is chunked.
    if (turn[phase] === undefined) turn[phase] = row.t;
  }
  return turns;
}

/** Same guards as the ledger: no negative, no non-finite. */
function interval(turn, phase) {
  if (turn.speechEnd === undefined || turn[phase] === undefined) return undefined;
  const d = turn[phase] - turn.speechEnd;
  return Number.isFinite(d) && d >= 0 ? Math.round(d) : undefined;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), n: sorted.length };
}

const turns = parse(readFileSync(file, 'utf8'));
if (turns.size === 0) {
  console.error(
    'No latency lines found. The app logs one JSON object per stage boundary;\n' +
      'make sure the whole console output was saved, not just errors.',
  );
  process.exit(1);
}

const metrics = [
  ['Time to move (voice → board changed)', 'moveApplied'],
  ['Time to transcript', 'transcriptFinal'],
  ['Time to first reply audio', 'firstReplyAudio'],
];

console.log(`\nTurns seen: ${turns.size}\n`);
console.log('| Metric | p50 | p95 | n |');
console.log('|---|---|---|---|');
for (const [label, phase] of metrics) {
  const values = [...turns.values()].map((t) => interval(t, phase)).filter((v) => v !== undefined);
  const s = stats(values);
  // An unmeasured metric prints a dash, never a zero.
  const cell = (v) => (v === null ? '—' : `${v} ms`);
  console.log(`| ${label} | ${cell(s.p50)} | ${cell(s.p95)} | ${s.n} |`);
}
console.log(
  '\nPaste into assets/latency/REPORT.md together with the run conditions:\n' +
    'date, browser and version, OS, connection, and push-to-talk vs hands-free.\n',
);
