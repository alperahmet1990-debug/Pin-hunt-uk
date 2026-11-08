/**
 * How much the scan's AI model "thinks" before answering.
 *
 * Staging timings on 8 Nov 2026 showed the three scan calls taking 3–11 s
 * each (20–29 s per scan), almost all of it model time. Reasoning models
 * spend much of that reasoning; for describing and matching a pin photo,
 * a low effort is usually enough and much faster.
 *
 * OPENAI_SCAN_REASONING_EFFORT on the server sets it: none, minimal, low
 * (default), medium or high; "off" sends nothing (the model's own default).
 * If the model rejects the option, it is switched off for this server
 * process and the call is retried once without it, so a scan never fails
 * because of this setting.
 */

export type ScanReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";

const EFFORTS: readonly ScanReasoningEffort[] = ["none", "minimal", "low", "medium", "high"];

/** The configured effort, or null to send none. Unknown values fall back to "low". */
export function scanReasoningEffort(env: NodeJS.ProcessEnv = process.env): ScanReasoningEffort | null {
  const value = (env.OPENAI_SCAN_REASONING_EFFORT ?? "low").trim().toLowerCase();
  if (value === "" || value === "off" || value === "default") return null;
  return (EFFORTS as readonly string[]).includes(value) ? (value as ScanReasoningEffort) : "low";
}

/** True when the API refused the call because of the reasoning_effort option. */
export function isReasoningEffortRejected(err: unknown): boolean {
  const e = err as { status?: number; message?: string; param?: string } | null;
  if (!e || e.status !== 400) return false;
  return e.param === "reasoning_effort" || /reasoning[_ ]effort/i.test(String(e.message ?? ""));
}

let rejected = false;

/** For tests: forget that the model rejected the option. */
export function resetScanReasoningForTests() {
  rejected = false;
}

/**
 * Run one AI call with the configured reasoning effort. `call` receives the
 * extra request fields to spread into its body.
 */
export async function withScanReasoning<T>(
  call: (extra: { reasoning_effort?: ScanReasoningEffort }) => Promise<T>,
): Promise<T> {
  const effort = rejected ? null : scanReasoningEffort();
  if (!effort) return call({});
  try {
    return await call({ reasoning_effort: effort });
  } catch (err) {
    if (!isReasoningEffortRejected(err)) throw err;
    rejected = true;
    console.warn("[scan] the model rejected reasoning_effort; continuing without it");
    return call({});
  }
}
