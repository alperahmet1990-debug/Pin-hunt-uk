/**
 * Shared phrasing for "potential trade match" summaries, derived from real
 * getPotentialTrades() counts — never fabricated. Used by the Start
 * Conversation compose screen and the pin's collector-results list.
 */

/** True only when both directions have at least one matching pin. */
export function isReciprocalMatch(theyHaveCount: number, iHaveCount: number): boolean {
  return theyHaveCount > 0 && iHaveCount > 0;
}

/**
 * A short, concrete summary of why a collector may be a match, e.g.
 * "Potential match · 2 pins you want · 1 pin they want". Returns null when
 * there is nothing to report (no data either way).
 */
export function formatMatchSummary(theyHaveCount: number, iHaveCount: number): string | null {
  if (theyHaveCount > 0 && iHaveCount > 0) {
    return `Potential match · ${theyHaveCount} pin${theyHaveCount === 1 ? '' : 's'} you want · ${iHaveCount} pin${iHaveCount === 1 ? '' : 's'} they want`;
  }
  if (theyHaveCount > 0) {
    return `${theyHaveCount} pin${theyHaveCount === 1 ? '' : 's'} you want`;
  }
  if (iHaveCount > 0) {
    return `${iHaveCount} pin${iHaveCount === 1 ? '' : 's'} they want`;
  }
  return null;
}

/** Most matched pins pre-attached to a first message, per direction. */
export const MATCH_PINS_LIMIT = 8;

/**
 * Editable first line for a conversation started from a trade match.
 * Concrete counts, no promises; empty when there is no match.
 */
export function matchOpeningMessage(theyHaveCount: number, iHaveCount: number): string {
  const pins = (n: number) => `${n} pin${n === 1 ? '' : 's'}`;
  if (theyHaveCount > 0 && iHaveCount > 0) {
    return `Hi! Looks like we could trade: you have ${pins(theyHaveCount)} on my ISO, and I have ${pins(iHaveCount)} you're after. Fancy a swap?`;
  }
  if (theyHaveCount > 0) {
    return `Hi! You have ${pins(theyHaveCount)} on my ISO. Would you consider a trade?`;
  }
  if (iHaveCount > 0) {
    return `Hi! I have ${pins(iHaveCount)} you're looking for. Interested in a trade?`;
  }
  return '';
}
