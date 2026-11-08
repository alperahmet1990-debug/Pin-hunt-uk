/**
 * Time budget for one scan.
 *
 * The app stops waiting after 35 s (SCAN_TIMEOUT_MS in
 * artifacts/pinhunt/utils/identifyPin.ts). The scan makes up to three AI
 * calls in a row; without a shared budget, three slow calls (each with its
 * own 25 s timeout and a retry) could run well past that, so the app showed
 * "That took too long" while the server was still working.
 *
 * The budget starts when the scan begins and ends SCAN_BUDGET_MS later,
 * leaving a margin for the upload and the response. Each AI call gets a
 * timeout from what is left; the optional last step (comparing against
 * catalogue photos) only runs when enough is left for it to be useful.
 */

/** Whole-scan budget on the server. The app's 35 s minus ~5 s for upload and response. */
export const SCAN_BUDGET_MS = 30_000;

/** Longest the first step (describing the pin) may take, so ranking always has time. */
export const DESCRIBE_MAX_MS = 12_000;

/** Time kept back for the ranking step while describing. */
export const RANK_RESERVE_MS = 8_000;

/** Below this much time left, comparing against catalogue photos is skipped. */
export const VERIFY_MIN_MS = 6_000;

/** Time kept back after the last AI call to finish up and send the response. */
export const FINISH_RESERVE_MS = 1_000;

export interface ScanBudget {
  /** Milliseconds left in the budget (never negative). */
  remaining(): number;
  /**
   * Timeout for the next AI call: what's left minus `reserveMs`, capped at
   * `maxMs`. 0 means there isn't time for it.
   */
  timeoutFor(maxMs: number, reserveMs?: number): number;
}

export function createScanBudget(
  totalMs: number = budgetFromEnv(),
  now: () => number = () => performance.now(),
): ScanBudget {
  const deadline = now() + totalMs;
  const remaining = () => Math.max(0, Math.round(deadline - now()));
  return {
    remaining,
    timeoutFor(maxMs, reserveMs = FINISH_RESERVE_MS) {
      return Math.max(0, Math.min(maxMs, remaining() - reserveMs));
    },
  };
}

/** SCAN_BUDGET_MS can be lowered (never raised past the app's wait) with an env var. */
function budgetFromEnv(): number {
  const n = Number(process.env.SCAN_BUDGET_MS);
  return Number.isFinite(n) && n >= 5_000 && n <= SCAN_BUDGET_MS ? n : SCAN_BUDGET_MS;
}
