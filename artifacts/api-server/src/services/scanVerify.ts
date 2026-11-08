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
