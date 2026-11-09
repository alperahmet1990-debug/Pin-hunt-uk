/**
 * What the collector picked after a scan (#113, UX-006): "That's it" on the
 * best match, an alternative, or "None of these". Stored on the scan's own
 * usage row (contributor_ai_usage, migration 069), so top-1 / top-3
 * accuracy can be measured (#263). No photo, no location: the pin id the
 * collector chose, its rank in what the scan returned, and when.
 *
 * The scan's id (`scanId`) is a random UUID the identify route puts in the
 * usage row's `result` and returns to the app. Only the collector who ran
 * the scan can record its outcome, and only within a day.
 *
 * Fire-and-forget from the app: nothing here blocks or slows a scan. If 069
 * isn't applied yet, or the database errors, the outcome is dropped and
 * logged server-side.
 */
import { usageClient } from "./usage-caps";

export type ScanOutcome = "confirmed" | "picked_alternative" | "none";

/** How long after a scan its outcome can be recorded. */
export const OUTCOME_WINDOW_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isScanId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * The outcome and the chosen pin's rank (1-based) among the scan's matches.
 * The rank is worked out here from what the scan returned, never taken from
 * the app. `null` when the chosen pin wasn't one of the matches.
 */
export function outcomeFor(
  matches: ReadonlyArray<{ pinId?: unknown }>,
  chosenPinId: string | null,
): { outcome: ScanOutcome; rank: number | null } | null {
  if (chosenPinId === null) return { outcome: "none", rank: null };
  const index = matches.findIndex(m => m?.pinId === chosenPinId);
  if (index < 0) return null;
  return { outcome: index === 0 ? "confirmed" : "picked_alternative", rank: index + 1 };
}

export type RecordOutcomeResult = "saved" | "not_found" | "invalid" | "unavailable";

/** Record the collector's choice for their own scan. Never throws. */
export async function recordScanOutcome(
  userId: string,
  scanId: string,
  chosenPinId: string | null,
): Promise<RecordOutcomeResult> {
  const db = usageClient();
  if (!db) return "unavailable";
  try {
    const { data, error } = await db.from("contributor_ai_usage")
      .select("id, result")
      .eq("user_id", userId)
      .eq("kind", "scan")
      .eq("result->>scanId", scanId)
      .gte("created_at", new Date(Date.now() - OUTCOME_WINDOW_MS).toISOString())
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const row = data as { id: number; result?: { matches?: unknown } | null } | null;
    if (!row) return "not_found";

    const matches = Array.isArray(row.result?.matches) ? (row.result!.matches as Array<{ pinId?: unknown }>) : [];
    const decided = outcomeFor(matches, chosenPinId);
    if (!decided) return "invalid";

    const { error: updateError } = await db.from("contributor_ai_usage")
      .update({
        outcome: decided.outcome,
        chosen_pin_id: chosenPinId,
        chosen_rank: decided.rank,
        outcome_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (updateError) throw updateError;
    return "saved";
  } catch (err) {
    console.warn("[scan-outcome] record failed, dropping:", err instanceof Error ? err.message : err);
    return "unavailable";
  }
}
