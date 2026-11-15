/**
 * The request log behind "Get a price" (market_price_requests, migration 079).
 * The Supabase implementation is store.ts; tests use an in-memory fake that
 * follows claim_market_price_request() step for step.
 */
import type { MarketCode } from "@workspace/pin-repository";

export type RequestOrigin = "user" | "batch";
export type FinishedOutcome = "priced" | "no_sales";
export type FailedOutcome = "stopped" | "error";

export interface ClaimInput {
  pinUuid: string;
  /** Required for "user"; null for "batch". */
  userId: string | null;
  origin: RequestOrigin;
  sources: string[];
  worstCaseCredits: number;
  userDailyLimit: number;
  globalDailyLimit: number;
  cacheDays: number;
  pendingTimeoutMinutes: number;
}

export type ClaimDecision =
  | { decision: "claimed"; requestId: string }
  | { decision: "in_flight" }
  | { decision: "cached"; outcome: FinishedOutcome; finishedAt: string; retryAfter: string | null }
  | { decision: "user_cap" | "global_cap"; retryAfter: string | null };

export type FinishInput =
  | {
      requestId: string;
      status: "complete";
      outcome: FinishedOutcome;
      soldCounts: Partial<Record<MarketCode, number>>;
      creditsSpent: number;
    }
  | {
      requestId: string;
      status: "failed";
      outcome: FailedOutcome;
      soldCounts: Partial<Record<MarketCode, number>> | null;
      creditsSpent: number;
    };

export interface PriceRequestRecord {
  id: string;
  status: "pending" | "complete" | "failed";
  outcome: FinishedOutcome | FailedOutcome | null;
  sources: string[];
  createdAt: string;
  finishedAt: string | null;
}

export interface PriceRequestStore {
  /** One locked step: in-flight, cache, caps, then a pending row. */
  claim(input: ClaimInput): Promise<ClaimDecision>;
  /** Close a pending request. Never changes a request that is already closed. */
  finish(input: FinishInput): Promise<void>;
  /** The newest request for a pin, or null. */
  latest(pinUuid: string): Promise<PriceRequestRecord | null>;
}
