/**
 * Supabase implementation of PriceRequestStore (market_price_requests and
 * claim_market_price_request(), migration 079). Service role only: the table
 * and function have no client grants.
 *
 * Errors are generic (operation name only): no database detail or rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimDecision, ClaimInput, FinishInput, PriceRequestRecord, PriceRequestStore } from "./types";

export class PriceRequestStoreError extends Error {
  constructor(public readonly operation: string) {
    super(`price request: ${operation} failed`);
    this.name = "PriceRequestStoreError";
  }
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export class SupabasePriceRequestStore implements PriceRequestStore {
  constructor(private readonly db: SupabaseClient) {}

  async claim(input: ClaimInput): Promise<ClaimDecision> {
    const { data, error } = await this.db.rpc("claim_market_price_request", {
      p_pin_id: input.pinUuid,
      p_user_id: input.userId,
      p_origin: input.origin,
      p_sources: input.sources,
      p_worst_case_credits: input.worstCaseCredits,
      p_user_daily_limit: input.userDailyLimit,
      p_global_daily_limit: input.globalDailyLimit,
      p_cache_days: input.cacheDays,
      p_pending_timeout_mins: input.pendingTimeoutMinutes,
    });
    if (error) throw new PriceRequestStoreError("claim");
    const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
    switch (row?.decision) {
      case "claimed": {
        const id = str(row.request_id);
        if (!id) throw new PriceRequestStoreError("claim");
        return { decision: "claimed", requestId: id };
      }
      case "in_flight":
        return { decision: "in_flight" };
      case "cached": {
        const at = str(row.cached_at);
        if (!at || (row.cached_outcome !== "priced" && row.cached_outcome !== "no_sales")) throw new PriceRequestStoreError("claim");
        return { decision: "cached", outcome: row.cached_outcome, finishedAt: at, retryAfter: str(row.retry_after) };
      }
      case "user_cap":
      case "global_cap":
        return { decision: row.decision, retryAfter: str(row.retry_after) };
      default:
        throw new PriceRequestStoreError("claim");
    }
  }

  async finish(input: FinishInput): Promise<void> {
    const { error } = await this.db
      .from("market_price_requests")
      .update({
        status: input.status,
        outcome: input.outcome,
        sold_counts: input.soldCounts,
        credits_spent: Math.max(0, Math.min(20, Math.round(input.creditsSpent))),
        finished_at: new Date().toISOString(),
      })
      .eq("id", input.requestId)
      .eq("status", "pending");
    if (error) throw new PriceRequestStoreError("finish");
  }

  async latest(pinUuid: string): Promise<PriceRequestRecord | null> {
    const { data, error } = await this.db
      .from("market_price_requests")
      .select("id, status, outcome, sources, created_at, finished_at")
      .eq("pin_id", pinUuid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new PriceRequestStoreError("latest");
    const r = data as Row | null;
    if (!r || !str(r.id) || !str(r.created_at)) return null;
    const status = r.status === "pending" || r.status === "complete" || r.status === "failed" ? r.status : null;
    if (!status) return null;
    const outcome = ["priced", "no_sales", "stopped", "error"].includes(String(r.outcome))
      ? (r.outcome as PriceRequestRecord["outcome"])
      : null;
    return {
      id: str(r.id)!,
      status,
      outcome,
      sources: Array.isArray(r.sources) ? r.sources.filter((s): s is string => typeof s === "string") : [],
      createdAt: str(r.created_at)!,
      finishedAt: str(r.finished_at),
    };
  }
}
