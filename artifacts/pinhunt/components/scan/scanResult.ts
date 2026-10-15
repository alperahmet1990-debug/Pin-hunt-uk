/**
 * Scan result state (UX-005, #112): one best match compared with the
 * collector's photo; "Not it" reveals the other candidates, and tapping one
 * promotes it into the comparison. Pure, so it can be tested without the
 * camera or the paid identify API.
 */

/** Below this every candidate is a guess: the result asks rather than asserts. */
export const LOW_CONFIDENCE = 40;

export interface Candidate {
  confidence: number;
}

export interface ScanResultState {
  /** Index (into the candidates array) shown beside the photo. */
  best: number;
  /** "Not it" pressed: the other candidates and "None of these" are showing. */
  showAlternatives: boolean;
  /**
   * Candidates the collector said "Not it" to (#299). They leave the
   * comparison and the strip, so a rejected pin is never offered again.
   */
  rejected: number[];
}

/** Every candidate under LOW_CONFIDENCE. */
export function allLowConfidence(candidates: Candidate[]): boolean {
  return candidates.length > 0 && candidates.every(c => c.confidence < LOW_CONFIDENCE);
}

/**
 * Start on the most confident candidate. When every candidate is a guess the
 * alternatives show straight away, so the collector picks rather than
 * confirms a weak answer.
 */
export function initialResult(candidates: Candidate[]): ScanResultState {
  let best = 0;
  candidates.forEach((c, i) => { if (c.confidence > candidates[best].confidence) best = i; });
  return { best, showAlternatives: allLowConfidence(candidates), rejected: [] };
}

/**
 * "Not it": reject the pin being compared and show the others (and "None of
 * these"). Nothing is compared, and "That's it" can't be pressed, until the
 * collector picks one of the others (#299).
 */
export function notIt(state: ScanResultState): ScanResultState {
  const rejected = state.rejected.includes(state.best) ? state.rejected : [...state.rejected, state.best];
  return { ...state, showAlternatives: true, rejected };
}

/** The pin being compared was rejected and nothing else is picked yet. */
export function awaitingPick(state: ScanResultState): boolean {
  return state.rejected.includes(state.best);
}

/** Tapping an alternative makes it the one compared with the photo. */
export function promote(state: ScanResultState, index: number, count: number): ScanResultState {
  if (index < 0 || index >= count || index === state.best || state.rejected.includes(index)) return state;
  return { ...state, best: index };
}

/** The candidates shown in the strip: everything except the best and the rejected, in order. */
export function alternatives(state: ScanResultState, count: number): number[] {
  return Array.from({ length: count }, (_, i) => i).filter(i => i !== state.best && !state.rejected.includes(i));
}

/** Heading above the comparison. */
export function resultHeading(candidates: Candidate[], state?: ScanResultState): string {
  if (state && awaitingPick(state)) {
    return alternatives(state, candidates.length).length > 0 ? 'Is it one of these?' : 'No other close matches';
  }
  if (allLowConfidence(candidates)) return 'Not sure. Is it one of these?';
  return 'Is this your pin?';
}
