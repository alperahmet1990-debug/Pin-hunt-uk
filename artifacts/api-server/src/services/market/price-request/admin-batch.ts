/**
 * Admin "Price pins": the capped batch (batch.ts) run on the API server from
 * the app, so the maintainer needs no local env file or script. App Creator
 * only (routes/price-batch.ts). Same spend controls as the script: the
 * planned credits must be confirmed, the month's Soldgraph budget must be a
 * hard stop, every credit is reserved in the database, and pins answered
 * within the re-check window are skipped for free.
 *
 * One run at a time per server process. The run lives in memory: a restart
 * or deploy ends it, and running the same selection again carries on, since
 * answered pins are skipped.
 *
 * State and results are counts only: no titles, listing prices or links.
 */
import type { MarketCode } from "@workspace/pin-repository";
import { PRICE_REQUEST_SOURCES, requestMarkets } from "./config";
import {
  BatchUsageError,
  DEFAULT_STOP_AFTER_ERRORS,
  MAX_RUN_CREDITS,
  batchBlockers,
  runBatch,
  type BatchCounts,
  type BatchDeps,
  type BatchOptions,
  type BatchPlan,
  type BatchResult,
} from "./batch";

export { BatchUsageError };

/** Default re-check window: a pin answered in the last 30 days is skipped. */
export const DEFAULT_ADMIN_CACHE_DAYS = 30;
export const MAX_POPULAR = 5_000;
export const MAX_IDS = 5_000;
const PINHUNT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export type PinSelection =
  | { kind: "popular"; count: number }
  | { kind: "ids"; pinhuntIds: string[] };

export interface AdminBatchInput {
  pins: PinSelection;
  markets: MarketCode[];
  cacheDays: number;
  maxCredits: number;
  /** Required to run: must equal the plan's plannedCredits. */
  confirmCredits: number | null;
}

export interface AdminBatchDeps extends Omit<BatchDeps, "progress" | "onPin" | "shouldStop"> {
  /** Most collected verified pins, most first (SupabaseBatchStore.popularPinhuntIds). */
  popularPinhuntIds(count: number): Promise<string[]>;
}

export interface AdminBatchJob {
  state: "running" | "finished" | "failed";
  startedAt: string;
  finishedAt?: string;
  selection: string;
  markets: MarketCode[];
  cacheDays: number;
  plannedCredits: number;
  pinsToTry: number;
  tried: number;
  creditsSpent: number;
  counts: BatchCounts;
  stopRequested: boolean;
  stoppedBy?: BatchResult["stoppedBy"];
  stopDetail?: string;
  budgetAfter?: { usedCredits: number; limitCredits: number };
}

const emptyCounts = (): BatchCounts => ({ priced: 0, noSales: 0, cached: 0, inFlight: 0, failed: 0, notFound: 0 });

function whole(name: string, raw: unknown, min: number, max: number, fallback?: number): number {
  if ((raw === undefined || raw === null || raw === "") && fallback !== undefined) return fallback;
  const n = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw new BatchUsageError(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

/** Validates a request body. Markets default to every published market with a sold source. */
export function parseAdminBatchInput(body: unknown, env: NodeJS.ProcessEnv): AdminBatchInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const pinsRaw = (b.pins && typeof b.pins === "object" ? b.pins : {}) as Record<string, unknown>;
  let pins: PinSelection;
  if (pinsRaw.kind === "popular") {
    pins = { kind: "popular", count: whole("Number of pins", pinsRaw.count, 1, MAX_POPULAR) };
  } else if (pinsRaw.kind === "ids") {
    const list = Array.isArray(pinsRaw.pinhuntIds)
      ? pinsRaw.pinhuntIds
      : typeof pinsRaw.pinhuntIds === "string" ? pinsRaw.pinhuntIds.split(/[\s,]+/) : [];
    const ids = [...new Set(list.map(v => String(v).trim()).filter(Boolean))];
    if (ids.length === 0) throw new BatchUsageError("Give at least one PinHunt ID.");
    if (ids.length > MAX_IDS) throw new BatchUsageError(`At most ${MAX_IDS} PinHunt IDs at a time.`);
    const bad = ids.filter(id => !PINHUNT_ID_RE.test(id));
    if (bad.length) throw new BatchUsageError(`Not a PinHunt ID: ${bad.slice(0, 3).join(", ")}`);
    pins = { kind: "ids", pinhuntIds: ids };
  } else {
    throw new BatchUsageError('Choose which pins: "popular" or "ids".');
  }

  const published = requestMarkets(env);
  let markets: MarketCode[];
  if (b.markets === undefined || b.markets === null) {
    markets = published;
  } else if (Array.isArray(b.markets)) {
    const asked = new Set(b.markets.map(m => String(m).toUpperCase()));
    const unknown = [...asked].filter(m => !(m in PRICE_REQUEST_SOURCES));
    if (unknown.length) throw new BatchUsageError(`Markets are UK and/or US, not ${unknown.join(", ")}.`);
    markets = (["UK", "US"] as MarketCode[]).filter(m => asked.has(m));
  } else {
    throw new BatchUsageError("markets must be a list such as [\"UK\", \"US\"].");
  }
  if (markets.length === 0) {
    throw new BatchUsageError("No market to price: set MARKET_VALUATION_PUBLISHED_MARKETS (UK and/or US) on the API server.");
  }

  return {
    pins,
    markets,
    cacheDays: whole("Re-check after (days)", b.cacheDays, 1, 365, DEFAULT_ADMIN_CACHE_DAYS),
    maxCredits: whole("Credit ceiling", b.maxCredits, 1, MAX_RUN_CREDITS),
    confirmCredits: b.confirmCredits === undefined || b.confirmCredits === null
      ? null
      : whole("Confirmed credits", b.confirmCredits, 0, MAX_RUN_CREDITS),
  };
}

async function toOptions(input: AdminBatchInput, deps: AdminBatchDeps, apply: boolean): Promise<BatchOptions> {
  const pinhuntIds = input.pins.kind === "ids" ? input.pins.pinhuntIds : await deps.popularPinhuntIds(input.pins.count);
  return {
    years: [],
    // An explicit list, even an empty one: never the release-year default.
    pinhuntIds,
    markets: input.markets,
    offset: 0,
    limit: null,
    cacheDays: input.cacheDays,
    maxCredits: input.maxCredits,
    confirmCredits: input.confirmCredits,
    leaveCredits: 0,
    stopAfterErrors: DEFAULT_STOP_AFTER_ERRORS,
    apply,
    production: null,
  };
}

const describeSelection = (p: PinSelection) =>
  p.kind === "popular" ? `${p.count} most collected pins` : `${p.pinhuntIds.length} listed ${p.pinhuntIds.length === 1 ? "pin" : "pins"}`;

export interface AdminPlanResult {
  plan: BatchPlan;
  /** Why a run would be refused now (empty: it can run). Confirmation is not listed. */
  blockers: string[];
}

/** Why a run with this plan would be refused, confirmation aside. */
function planBlockers(plan: BatchPlan, opts: BatchOptions, env: NodeJS.ProcessEnv): string[] {
  const out = batchBlockers(plan, { ...opts, confirmCredits: plan.plannedCredits }, env);
  if (plan.candidates === 0) out.push("no pins matched (none in collections or ISO lists, or the IDs aren't verified pins)");
  else if (plan.plannedCredits === 0) out.push("nothing to price: every pin was answered within the re-check window");
  return out;
}

/** Free: works out what a run would price and spend. Calls nothing paid. */
export async function planAdminBatch(input: AdminBatchInput, deps: AdminBatchDeps): Promise<AdminPlanResult> {
  const opts = await toOptions(input, deps, false);
  const r = await runBatch(opts, deps);
  return { plan: r.plan, blockers: planBlockers(r.plan, opts, deps.env) };
}

// ─── The one running job ─────────────────────────────────────────────────────

let current: AdminBatchJob | null = null;

export function adminBatchStatus(): AdminBatchJob | null {
  return current ? { ...current, counts: { ...current.counts } } : null;
}

/** Asks the running job to stop before its next pin. False when nothing is running. */
export function stopAdminBatch(): boolean {
  if (current?.state !== "running") return false;
  current.stopRequested = true;
  return true;
}

/** For tests. */
export function resetAdminBatchForTests() {
  current = null;
}

export type StartAdminBatchResult =
  | { kind: "started"; job: AdminBatchJob; done: Promise<void> }
  | { kind: "running"; job: AdminBatchJob }
  | { kind: "refused"; plan: BatchPlan; blockers: string[] };

/**
 * Starts a run in the background after re-checking the plan, the budget and
 * the confirmed credits. Never more than one at a time.
 */
export async function startAdminBatch(input: AdminBatchInput, deps: AdminBatchDeps): Promise<StartAdminBatchResult> {
  if (current?.state === "running") return { kind: "running", job: adminBatchStatus()! };
  const opts = await toOptions(input, deps, true);
  const dry = await runBatch({ ...opts, apply: false }, deps);
  const blockers = planBlockers(dry.plan, opts, deps.env);
  if (input.confirmCredits === null) blockers.push(`confirm the planned ${dry.plan.plannedCredits} credit(s) to run`);
  else if (input.confirmCredits !== dry.plan.plannedCredits) {
    blockers.push(`the plan changed: it is now ${dry.plan.plannedCredits} credit(s), not ${input.confirmCredits}. Check the cost again.`);
  }
  if (blockers.length) return { kind: "refused", plan: dry.plan, blockers };
  // Re-checked after the awaits above: two clicks can't start two runs.
  if (adminBatchStatus()?.state === "running") return { kind: "running", job: adminBatchStatus()! };

  const job: AdminBatchJob = {
    state: "running",
    startedAt: new Date((deps.now ?? Date.now)()).toISOString(),
    selection: describeSelection(input.pins),
    markets: input.markets,
    cacheDays: input.cacheDays,
    plannedCredits: dry.plan.plannedCredits,
    pinsToTry: dry.plan.pinsThisRun,
    tried: 0,
    creditsSpent: 0,
    counts: emptyCounts(),
    stopRequested: false,
  };
  current = job;

  const done = runBatch(opts, {
    ...deps,
    onPin: p => {
      job.tried = p.tried;
      job.creditsSpent = p.creditsSpent;
      job.counts = p.counts;
    },
    shouldStop: () => job.stopRequested,
  })
    .then(r => {
      job.state = r.applied ? "finished" : "failed";
      job.tried = r.pinsTried;
      job.creditsSpent = r.creditsSpent;
      job.counts = r.counts;
      if (r.stoppedBy) job.stoppedBy = r.stoppedBy;
      if (r.stopDetail) job.stopDetail = r.stopDetail;
      else if (!r.applied) job.stopDetail = r.blockers.join("; ");
      if (r.budgetAfter) job.budgetAfter = r.budgetAfter;
    })
    .catch(() => {
      job.state = "failed";
      job.stopDetail = "the run failed; answered pins are kept, so running it again carries on";
    })
    .finally(() => {
      job.finishedAt = new Date((deps.now ?? Date.now)()).toISOString();
    });
  return { kind: "started", job: adminBatchStatus()!, done };
}
