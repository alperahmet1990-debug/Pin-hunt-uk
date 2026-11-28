/**
 * When the scan's last step (comparing the photo with catalogue photos) is
 * worth its time.
 *
 * Staging timings on 8 Nov 2026: with low reasoning effort (#532), that step
 * took 8–12 s, about half of each scan. It only changes the answer when the
 * ranking is unsure between plausible pins:
 *   - 'confident': the top match is already clear (85+ and 20+ ahead of the
 *     next), so comparing photos would only confirm it.
 *   - 'implausible': nothing scored even 25, so the pin is very likely not in
 *     the catalogue; comparing photos can't find a pin that isn't there.
 * Otherwise 'compare'.
 */

/** Top match at or above this, and clearly ahead, needs no photo check. */
export const VERIFY_CONFIDENT_MIN = 85;
/** How far ahead of the second match "clearly ahead" means. */
export const VERIFY_CONFIDENT_LEAD = 20;
/** Below this, no candidate is plausible enough to compare. */
export const VERIFY_PLAUSIBLE_MIN = 25;
/** Catalogue photos shown in the comparison (was 6): fewer downloads, and the right pin is nearly always in the top 3. */
export const VERIFY_MAX_REFERENCES = 3;

export type VerifyDecision = "compare" | "confident" | "implausible";

export function verifyDecision(matches: ReadonlyArray<{ confidence: unknown }>): VerifyDecision {
  const scores = matches
    .map((m) => Number(m.confidence))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  const top = scores[0];
  if (top === undefined || top < VERIFY_PLAUSIBLE_MIN) return "implausible";
  const second = scores[1] ?? 0;
  if (top >= VERIFY_CONFIDENT_MIN && top - second >= VERIFY_CONFIDENT_LEAD) return "confident";
  return "compare";
}

// ── Always compare, with more pictures when there's time (app-scan PR 2) ──
//
// Only a picture comparison can make a match confident (applyConfidenceRules
// in routes/scan.ts), so the comparison now runs on "confident" rankings too
// (SCAN_ALWAYS_COMPARE, default on): a confident text ranking is still the
// wrong pin when the art is shared across formats. "implausible" is still
// skipped: no reference can find a pin that isn't there.
//
// The board scanner shows every candidate's picture at high detail; the
// collector scan has a 30 s budget, so it scales with the time left.

/** With at least this much time left, the comparison gets more pictures (some at high detail). */
export const RICH_VERIFY_MIN_MS = 14_000;
/** Pictures in a rich comparison (SCAN_MAX_REFERENCES, 1–8). */
export const SCAN_RICH_REFERENCES = 5;
/** Of those, the first this many (the ranking's best) are sent at high detail. */
export const HIGH_DETAIL_REFERENCES = 3;

export function alwaysCompare(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.SCAN_ALWAYS_COMPARE ?? "true").toLowerCase() !== "false";
}

/** Whether to run the comparison for this ranking. */
export function shouldCompare(decision: VerifyDecision, env: NodeJS.ProcessEnv = process.env): boolean {
  return decision === "compare" || (decision === "confident" && alwaysCompare(env));
}

export function richReferenceCount(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SCAN_MAX_REFERENCES);
  return Number.isFinite(n) && n >= 1 ? Math.min(8, Math.floor(n)) : SCAN_RICH_REFERENCES;
}

/**
 * How many reference pictures to show, and how many of them at high detail,
 * for the time left: plenty → SCAN_RICH_REFERENCES with the top
 * HIGH_DETAIL_REFERENCES at high detail; otherwise the old 3 at low detail.
 */
export function referencePlan(timeLeftMs: number, env: NodeJS.ProcessEnv = process.env): { count: number; highDetail: number } {
  if (timeLeftMs >= RICH_VERIFY_MIN_MS) {
    const count = richReferenceCount(env);
    return { count, highDetail: Math.min(HIGH_DETAIL_REFERENCES, count) };
  }
  return { count: VERIFY_MAX_REFERENCES, highDetail: 0 };
}
