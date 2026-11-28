/**
 * Bulk Image Matcher — daily AI-call budget (migration 087).
 *
 * Before matching a photo (from the upload queue, a re-match after a set
 * change or a learned set, or the accuracy check), the server reserves that
 * match's OpenAI calls for the UTC day with bulk_reserve_ai_calls(). The
 * function adds them only if the day stays within the limit, in one
 * statement, so parallel matches can't both take the last calls. When the
 * budget is spent, matching pauses with a clear message until the next day.
 *
 * Fails closed: if the budget can't be checked (e.g. migration 087 isn't
 * applied yet), matching doesn't run, and the message says why.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** OpenAI calls one photo's match makes at most: describe, rank, picture check. */
export const CALLS_PER_MATCH = 3;

/** OpenAI calls the bulk matcher may make per UTC day (BULK_AI_DAILY_CALLS, default 4500 ≈ 1500 photos). */
export function dailyCallLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.BULK_AI_DAILY_CALLS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 4500;
}

export type Reservation =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; used: number | null; limit: number; reason: string };

export const BUDGET_SPENT = "Daily AI limit for the bulk matcher reached (BULK_AI_DAILY_CALLS). Remaining photos will be matched tomorrow.";
export const BUDGET_UNAVAILABLE = "Couldn't check the bulk matcher's daily AI limit, so matching is paused. Has migration 087 been applied?";

/** Reserve `calls` OpenAI calls for today, or say why not. */
export async function reserveAiCalls(db: SupabaseClient, calls = CALLS_PER_MATCH, env: NodeJS.ProcessEnv = process.env): Promise<Reservation> {
  const limit = dailyCallLimit(env);
  const { data, error } = await db.rpc("bulk_reserve_ai_calls", { p_calls: calls, p_limit: limit });
  if (error) {
    console.warn("[bulk-images] AI budget check failed:", error.message);
    return { allowed: false, used: null, limit, reason: BUDGET_UNAVAILABLE };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; used?: number } | null;
  if (row?.allowed) return { allowed: true, used: row.used ?? 0, limit };
  return { allowed: false, used: row?.used ?? null, limit, reason: BUDGET_SPENT };
}
