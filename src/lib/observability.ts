// ============================================================
// chess.voice — structured stage logging
//
// Workflow rule: log structured input/output at every pipeline stage
// boundary, not print statements. That is what makes a scattered bug
// traceable to a stage instead of "somewhere in the app".
//
// Stages in this system:
//   token.reserve → token.mint → session.start → session.end
//   game.save → game.complete → game.claim
//
// One line of JSON per event so a log search can filter on `stage` and
// `status` without parsing prose.
// ============================================================

export type StageStatus =
  | 'ok'
  | 'refused'
  | 'error'
  | 'degraded'
  | 'unconfigured'
  | 'upstream_error'
  | 'skipped';

/** Keys whose values must never be written to a log, at any depth. */
const REDACT = /(key|token|secret|authorization|password|email)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

/**
 * Emit one structured event for a pipeline stage boundary.
 *
 * `subject` values (`device:<uuid>`) are identifiers, not personal data, and
 * are the thing that makes spend attributable — so they are logged. Anything
 * that looks like a credential is redacted by key name regardless of where it
 * appears in the payload.
 */
export function stageLog(
  stage: string,
  status: StageStatus,
  data: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    stage,
    status,
    ...(scrub(data) as Record<string, unknown>),
  });

  if (status === 'error' || status === 'upstream_error') console.error(line);
  else if (status === 'degraded' || status === 'refused') console.warn(line);
  else console.log(line);
}
