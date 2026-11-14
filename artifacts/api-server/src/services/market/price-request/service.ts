/**
 * On-demand sold-price request for one pin ("Get a price").
 *
 * It reuses the maintainer refresh (refresh/refresh.ts) unchanged in what it
 * searches, stores and revalues; this module only adds who may start a paid
 * search and when:
 *
 *   1. Switches: MARKET_PRICE_REQUEST_ENABLED, MARKET_VALUATION_V2_ENABLED,
 *      SOLDGRAPH_ENABLED + key, and at least one published market with an
 *      eBay sold source (UK → soldgraph:ebay_gb_sold, US → ebay_us_sold).
 *   2. A dry-run plan of the refresh for this one pin: the worst-case credit
 *      cost (0 when both sources are still inside the refresh's own 7-day
 *      listing cache), the month's budget, and that the sources are enabled
 *      in market_sources. Refused unless the budget is a hard stop and the
 *      worst case fits in what is left (minus the configured reserve).
 *   3. claim_market_price_request() (079): rejects a duplicate in-flight
 *      request, answers from a request finished within the cache window
 *      (including one that found no sales), and enforces the per-user and
 *      global daily caps. Batch requests skip the daily caps only.
 *   4. The refresh with --apply semantics and a credit ceiling equal to that
 *      worst case. The Soldgraph client still reserves every credit against
 *      the monthly cap (reserve_provider_credit, 049).
 *   5. The request row is closed with counts only: complete (priced or
 *      no_sales; both cached) or failed (stopped or error; never cached, so
 *      the pin can be asked again).
 *
 * The same entry point serves a future capped batch (origin "batch"); see
 * scripts/PRICE-REQUEST.md. Nothing here returns listing rows, titles,
 * prices of individual listings or links.
 */
import type { MarketCode } from "@workspace/pin-repository";
import type { SoldgraphClient } from "../../soldgraph/client";
import { valuationV2Enabled } from "../valuation-v2-service";
import {
  DEFAULT_ACTIVE_TTL_DAYS,
  DEFAULT_SOLD_TTL_DAYS,
  runRefresh,
  type RefreshDeps,
  type RefreshOptions,
  type RefreshResult,
} from "../refresh/refresh";
import type { RefreshStore } from "../refresh/types";
import {
  MAX_CREDITS_PER_REQUEST,
  PENDING_TIMEOUT_MINUTES,
  priceRequestEnabled,
  priceRequestLimits,
  requestMarkets,
  requestSources,
} from "./config";
import type { FinishInput, FinishedOutcome, PriceRequestStore, RequestOrigin } from "./types";

export interface PriceRequestLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface PriceRequestDeps {
  requests: PriceRequestStore;
  refresh: RefreshStore;
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /** Builds the real Soldgraph client; only called when a search will run. */
  createClient?: () => SoldgraphClient;
  log?: PriceRequestLogger;
}

export type UnavailableReason =
  | "disabled"
  | "no_markets"
  | "provider_off"
  | "sources_off"
  | "budget_not_hard_stop"
  | "too_costly";

export interface FinishSummary {
  status: "complete" | "failed";
  outcome: FinishInput["outcome"];
  soldCounts: Partial<Record<MarketCode, number>> | null;
  creditsSpent: number;
}

export type StartResult =
  | { kind: "unavailable"; reason: UnavailableReason }
  | { kind: "not_found" }
  | { kind: "budget"; remainingCredits: number; worstCaseCredits: number }
  | { kind: "in_flight" }
  | { kind: "cached"; outcome: FinishedOutcome; checkedAt: string; nextRequestAt: string | null }
  | { kind: "capped"; scope: "user" | "global"; retryAfter: string | null }
  | { kind: "started"; requestId: string; worstCaseCredits: number; done: Promise<FinishSummary> };

export interface StartInput {
  pinhuntId: string;
  origin: RequestOrigin;
  /** The signed-in collector; null only for a batch. */
  userId: string | null;
}

const silentLog: PriceRequestLogger = { warn() {}, error() {} };

function refreshOptions(pinhuntId: string, sources: string[]): RefreshOptions {
  return {
    command: "refresh",
    pinhuntIds: [pinhuntId],
    sources,
    queriesPerSource: 1,
    soldTtlDays: DEFAULT_SOLD_TTL_DAYS,
    activeTtlDays: DEFAULT_ACTIVE_TTL_DAYS,
    apply: false,
    confirmCredits: null,
  };
}

/** Switch checks that need no database. Null when a request may be planned. */
export function unavailableReason(env: NodeJS.ProcessEnv): UnavailableReason | null {
  if (!priceRequestEnabled(env) || !valuationV2Enabled(env)) return "disabled";
  if (requestSources(env).length === 0) return "no_markets";
  if (env.SOLDGRAPH_ENABLED !== "true" || !env.SOLDGRAPH_API_KEY) return "provider_off";
  return null;
}

/**
 * Start a price request for one pin. Resolves as soon as the request is
 * claimed (or refused); the paid search runs in `done`, which never rejects.
 */
export async function startPriceRequest(input: StartInput, deps: PriceRequestDeps): Promise<StartResult> {
  if (input.origin === "user" && !input.userId) throw new Error("price request: user required");
  const off = unavailableReason(deps.env);
  if (off) return { kind: "unavailable", reason: off };

  const sources = requestSources(deps.env);
  const limits = priceRequestLimits(deps.env);
  const refreshDeps: RefreshDeps = { store: deps.refresh, env: deps.env, now: deps.now, createClient: deps.createClient };

  const dry = await runRefresh(refreshOptions(input.pinhuntId, sources), refreshDeps);
  const plan = dry.plan;
  if (plan.missingPins.length > 0 || plan.pins.length !== 1) return { kind: "not_found" };
  if (plan.missingSources.length > 0 || plan.disabledSources.length > 0) return { kind: "unavailable", reason: "sources_off" };
  if (plan.worstCaseCredits > MAX_CREDITS_PER_REQUEST) return { kind: "unavailable", reason: "too_costly" };
  if (!plan.budget.hardStop || plan.remainingCredits === null) return { kind: "unavailable", reason: "budget_not_hard_stop" };
  const spendable = Math.max(0, plan.remainingCredits - limits.budgetReserve);
  if (plan.worstCaseCredits > spendable) {
    return { kind: "budget", remainingCredits: spendable, worstCaseCredits: plan.worstCaseCredits };
  }

  const claim = await deps.requests.claim({
    pinUuid: plan.pins[0].uuid,
    userId: input.origin === "user" ? input.userId : null,
    origin: input.origin,
    sources,
    worstCaseCredits: plan.worstCaseCredits,
    userDailyLimit: limits.userDaily,
    globalDailyLimit: limits.globalDaily,
    cacheDays: limits.cacheDays,
    pendingTimeoutMinutes: PENDING_TIMEOUT_MINUTES,
  });
  switch (claim.decision) {
    case "in_flight":
      return { kind: "in_flight" };
    case "cached":
      return { kind: "cached", outcome: claim.outcome, checkedAt: claim.finishedAt, nextRequestAt: claim.retryAfter };
    case "user_cap":
      return { kind: "capped", scope: "user", retryAfter: claim.retryAfter };
    case "global_cap":
      return { kind: "capped", scope: "global", retryAfter: claim.retryAfter };
    case "claimed":
      break;
  }

  const done = runClaimed(claim.requestId, input.pinhuntId, sources, plan.worstCaseCredits, deps, refreshDeps);
  return { kind: "started", requestId: claim.requestId, worstCaseCredits: plan.worstCaseCredits, done };
}

/** Turn a refresh result into the request's closing row. Counts only. */
export function summarise(r: RefreshResult, markets: readonly MarketCode[]): FinishSummary {
  const creditsSpent = r.creditsSpent;
  if (!r.applied) return { status: "failed", outcome: r.blockers.some(b => /credit|SOLDGRAPH/.test(b)) ? "stopped" : "error", soldCounts: null, creditsSpent };
  const pin = r.pins[0];
  if (r.stoppedBy || pin?.stoppedBy) return { status: "failed", outcome: "stopped", soldCounts: null, creditsSpent };
  // A search that failed outright (provider error after retries) must not be
  // cached as "no sales": the pin may well have sales.
  if (!pin || pin.searchesFailed > 0) return { status: "failed", outcome: "error", soldCounts: null, creditsSpent };
  const v = pin.valuation;
  if (!v || v.status !== "saved") return { status: "failed", outcome: "error", soldCounts: null, creditsSpent };
  const soldCounts: Partial<Record<MarketCode, number>> = {};
  let priced = false;
  for (const m of markets) {
    const mv = v.valuations.find(x => x.market === m);
    const n = mv?.soldCount ?? 0;
    soldCounts[m] = n;
    if (n > 0 && mv?.fair != null) priced = true;
  }
  return { status: "complete", outcome: priced ? "priced" : "no_sales", soldCounts, creditsSpent };
}

async function runClaimed(
  requestId: string,
  pinhuntId: string,
  sources: string[],
  worstCaseCredits: number,
  deps: PriceRequestDeps,
  refreshDeps: RefreshDeps,
): Promise<FinishSummary> {
  const log = deps.log ?? silentLog;
  let summary: FinishSummary;
  try {
    const r = await runRefresh({ ...refreshOptions(pinhuntId, sources), apply: true, creditCeiling: worstCaseCredits }, refreshDeps);
    summary = summarise(r, requestMarkets(deps.env));
  } catch (err) {
    log.error({ requestId, err: err instanceof Error ? err.name : "unknown" }, "price request failed");
    summary = { status: "failed", outcome: "error", soldCounts: null, creditsSpent: 0 };
  }
  try {
    await deps.requests.finish({ requestId, ...summary } as FinishInput);
  } catch (err) {
    // The row stays pending until PENDING_TIMEOUT_MINUTES, then is closed as an error.
    log.error({ requestId, err: err instanceof Error ? err.name : "unknown" }, "price request close failed");
  }
  return summary;
}

// ─── Status ──────────────────────────────────────────────────────────────────

export type RequestState = "none" | "pending" | FinishedOutcome;

export interface StatusResult {
  state: RequestState;
  /** When the last finished request was checked; null when none counts. */
  checkedAt: string | null;
  /** When a new request would be accepted for this pin (cache window end). */
  nextRequestAt: string | null;
  /** True when "Get a price" can be offered at all (switches, markets, provider). */
  requestsOpen: boolean;
}

const DAY_MS = 86_400_000;

/** What the app shows for a pin. Reads the request log only: never a provider call. */
export async function priceRequestStatus(pinUuid: string, deps: Pick<PriceRequestDeps, "requests" | "env" | "now">): Promise<StatusResult> {
  const now = (deps.now ?? Date.now)();
  const requestsOpen = unavailableReason(deps.env) === null;
  const none: StatusResult = { state: "none", checkedAt: null, nextRequestAt: null, requestsOpen };
  const latest = await deps.requests.latest(pinUuid);
  if (!latest) return none;
  if (latest.status === "pending") {
    const age = now - Date.parse(latest.createdAt);
    return age < PENDING_TIMEOUT_MINUTES * 60_000 ? { ...none, state: "pending" } : none;
  }
  if (latest.status !== "complete" || !latest.finishedAt) return none;
  const sources = requestSources(deps.env);
  if (!sources.every(s => latest.sources.includes(s))) return none;
  const { cacheDays } = priceRequestLimits(deps.env);
  const until = Date.parse(latest.finishedAt) + cacheDays * DAY_MS;
  if (!(until > now)) return none;
  return {
    state: latest.outcome === "priced" ? "priced" : "no_sales",
    checkedAt: latest.finishedAt,
    nextRequestAt: new Date(until).toISOString(),
    requestsOpen,
  };
}
