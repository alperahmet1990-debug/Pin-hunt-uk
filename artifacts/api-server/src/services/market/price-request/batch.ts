/**
 * Capped batch pricing (maintainer-run): ask for eBay UK/US sold prices for
 * many pins through the same path a collector's "Get a price" uses
 * (startPriceRequest with origin "batch"). Run only from
 * scripts/market-price-batch.mjs, behind the staging guard. No route reaches
 * this module. Staging by default; --production <ref> targets production
 * through scripts/lib/production-guard.mjs (the maintainer runs that, never
 * an agent).
 *
 * Spend control, in order:
 *   1. An explicit pin set: verified, non-archived pins with release_year in
 *      --years (default 2025,2026), or those of an --ids-file (same filters).
 *      --offset/--limit page it. --markets (required) must be markets the
 *      host already publishes (MARKET_VALUATION_PUBLISHED_MARKETS).
 *   2. Skip: a pin with a finished request (priced or no sales) inside
 *      --cache-days (default 180) that searched these sources costs nothing
 *      and isn't asked again. Re-running the same command resumes where the
 *      last run stopped.
 *   3. A dry run prints the worst case (pins to price × credits per pin), the
 *      run ceiling, the month's budget and an approximate cost. Nothing is
 *      called.
 *   4. --apply needs --max-credits (the run ceiling, at most 10,000) and
 *      --confirm-credits equal to the planned credits the dry run printed. It
 *      refuses when that is more than the month's hard-stop budget allows
 *      after the configured reserve (MARKET_PRICE_REQUEST_BUDGET_RESERVE) and
 *      --leave-credits. A batch skips only the collector daily caps.
 *   5. Pins are priced one at a time. The run stops before a pin whose worst
 *      case would pass the ceiling, on the monthly budget or kill switch, or
 *      after --stop-after-errors failures in a row.
 *   Every credit is still reserved against the monthly cap in the database
 *   (reserve_provider_credit, 049), and every request is logged in
 *   market_price_requests (079) with origin "batch".
 *
 * Output is counts only: no titles, prices of listings, links or keys.
 */
import type { MarketCode } from "@workspace/pin-repository";
import { PRICE_REQUEST_FLAG_ENV, PRICE_REQUEST_SOURCES, priceRequestLimits, requestMarkets } from "./config";
import { startPriceRequest, type PriceRequestDeps, type StartInput, type StartResult } from "./service";

export const DEFAULT_YEARS = [2025, 2026];
export const DEFAULT_BATCH_CACHE_DAYS = 180;
export const MAX_RUN_CREDITS = 10_000;
export const DEFAULT_STOP_AFTER_ERRORS = 5;
const PINHUNT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DAY_MS = 86_400_000;

export class BatchUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchUsageError";
  }
}

export interface BatchOptions {
  years: number[];
  /** Explicit PinHunt IDs instead of --years (e.g. the most-collected pins). */
  pinhuntIds: string[] | null;
  /** Markets to price: required, and only ones the host already publishes. */
  markets: MarketCode[];
  offset: number;
  limit: number | null;
  cacheDays: number;
  maxCredits: number | null;
  confirmCredits: number | null;
  leaveCredits: number;
  stopAfterErrors: number;
  apply: boolean;
  /**
   * --production <ref>: run against production. The script checks it with
   * scripts/lib/production-guard.mjs (the ref must equal PRODUCTION_PROJECT_REF);
   * null means staging, through the staging guard.
   */
  production: string | null;
}

export interface BatchPin {
  uuid: string;
  pinhuntId: string;
}

/** What the batch reads besides the request path itself. */
export interface BatchStore {
  /** Candidate pins in a stable order (pinhunt_id), paged by offset/limit. */
  listPins(q: { years: number[]; pinhuntIds: string[] | null; offset: number; limit: number | null }): Promise<BatchPin[]>;
  /** Pins with a completed request since `sinceIso` covering every source given. */
  recentlyAnswered(pinUuids: string[], sources: string[], sinceIso: string): Promise<Set<string>>;
  /** The month's Soldgraph budget (same as the refresh store's). */
  budget(month: string): Promise<{ usedCredits: number; limitCredits: number; hardStop: boolean }>;
}

export interface BatchDeps {
  store: BatchStore;
  request: Omit<PriceRequestDeps, "env">;
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /** Defaults to startPriceRequest; replaceable in tests. */
  start?: (input: StartInput, deps: PriceRequestDeps) => Promise<StartResult>;
  /** Progress lines while applying (counts only). */
  progress?: (line: string) => void;
  /** Called after every pin while applying (the admin "Price pins" screen polls this). */
  onPin?: (p: { tried: number; total: number; creditsSpent: number; counts: BatchCounts }) => void;
  /** Checked before each pin; true stops the run there (the admin Stop button). */
  shouldStop?: () => boolean;
}

// ─── Arguments ───────────────────────────────────────────────────────────────

function intFlag(flag: string, raw: string, min: number, max: number): number {
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(n) || n < min || n > max) {
    throw new BatchUsageError(`${flag} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

export function parseBatchArgs(argv: string[], readFile: (p: string) => string): BatchOptions {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith("--")) throw new BatchUsageError(`Unexpected argument "${flag}".`);
    if (flags.has(flag)) throw new BatchUsageError(`${flag} given twice.`);
    if (flag === "--apply") {
      flags.set(flag, true);
      continue;
    }
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) throw new BatchUsageError(`${flag} needs a value.`);
    flags.set(flag, v);
  }
  const take = (name: string): string | undefined => {
    const v = flags.get(name);
    flags.delete(name);
    return typeof v === "string" ? v : undefined;
  };
  const apply = flags.delete("--apply");

  const yearsRaw = take("--years");
  const idsFile = take("--ids-file");
  if (yearsRaw && idsFile) throw new BatchUsageError("Give --years or --ids-file, not both.");
  const years = yearsRaw
    ? [...new Set(yearsRaw.split(",").map(s => intFlag("--years", s.trim(), 2000, 2100)))]
    : DEFAULT_YEARS;
  let pinhuntIds: string[] | null = null;
  if (idsFile) {
    const ids = [...new Set(readFile(idsFile).split(/\r?\n/).map(l => l.replace(/#.*/, "").trim()).filter(Boolean))];
    const bad = ids.filter(id => !PINHUNT_ID_RE.test(id));
    if (bad.length) throw new BatchUsageError(`Not a PinHunt ID: ${bad.slice(0, 3).join(", ")}`);
    if (ids.length === 0) throw new BatchUsageError("--ids-file has no PinHunt IDs.");
    pinhuntIds = ids;
  }


  const marketsRaw = take("--markets");
  if (!marketsRaw) throw new BatchUsageError("Give --markets UK, US or UK,US (only markets that passed the pilot and are in MARKET_VALUATION_PUBLISHED_MARKETS).");
  const markets = [...new Set(marketsRaw.split(",").map(s => s.trim().toUpperCase()))];
  const unknown = markets.filter(m => !(m in PRICE_REQUEST_SOURCES));
  if (unknown.length || markets.length === 0) throw new BatchUsageError(`--markets takes UK and/or US, not ${unknown.join(", ") || "nothing"}.`);

  const productionRaw = take("--production");
  if (productionRaw !== undefined && !/^[a-z0-9]{20}$/.test(productionRaw)) {
    throw new BatchUsageError("--production needs the 20-character production project ref, typed exactly.");
  }

  const num = (name: string, min: number, max: number) => {
    const v = take(name);
    return v === undefined ? null : intFlag(name, v, min, max);
  };
  const opts: BatchOptions = {
    years,
    pinhuntIds,
    markets: (["UK", "US"] as MarketCode[]).filter(m => markets.includes(m)),
    offset: num("--offset", 0, 1_000_000) ?? 0,
    limit: num("--limit", 1, 1_000_000),
    cacheDays: num("--cache-days", 1, 365) ?? DEFAULT_BATCH_CACHE_DAYS,
    maxCredits: num("--max-credits", 1, MAX_RUN_CREDITS),
    confirmCredits: num("--confirm-credits", 0, MAX_RUN_CREDITS),
    leaveCredits: num("--leave-credits", 0, 1_000_000) ?? 0,
    stopAfterErrors: num("--stop-after-errors", 1, 100) ?? DEFAULT_STOP_AFTER_ERRORS,
    apply,
    production: productionRaw ?? null,
  };
  const left = [...flags.keys()];
  if (left.length) throw new BatchUsageError(`Unknown option ${left[0]}.`);
  if (apply && opts.maxCredits === null) throw new BatchUsageError("--apply needs --max-credits (the most this run may spend).");
  return opts;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

export interface BatchPlan {
  candidates: number;
  /** Answered (priced or no sales) within --cache-days: skipped, free. */
  alreadyAnswered: number;
  toPrice: number;
  markets: MarketCode[];
  sources: string[];
  creditsPerPin: number;
  /** Every pin still to price, at full cost. */
  worstCaseAll: number;
  /** Pins this run would reach under --max-credits (all of them without it). */
  pinsThisRun: number;
  /** Worst case for this run: what --confirm-credits must equal. */
  plannedCredits: number;
  month: string;
  budget: { usedCredits: number; limitCredits: number; hardStop: boolean };
  /** MARKET_PRICE_REQUEST_BUDGET_RESERVE: kept back by every request, batch included. */
  reserve: number;
  /** Credits this run may use: hard-stop budget left minus the reserve and --leave-credits. */
  spendable: number | null;
}

export interface BatchCounts {
  priced: number;
  noSales: number;
  /** Answered by the request cache at claim time (another run or a collector). */
  cached: number;
  /** Another request for the pin was running; skipped. */
  inFlight: number;
  failed: number;
  notFound: number;
}

export interface BatchResult {
  plan: BatchPlan;
  applied: boolean;
  blockers: string[];
  counts: BatchCounts;
  pinsTried: number;
  creditsSpent: number;
  stoppedBy?: "ceiling" | "budget" | "unavailable" | "errors" | "stopped";
  stopDetail?: string;
  budgetAfter?: { usedCredits: number; limitCredits: number };
}

const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/**
 * The env the request path sees for a batch: the collector button's flag is
 * not required, the batch's own cache window applies, and the published
 * markets are narrowed to --markets (which must already be published: a
 * batch never widens them). The budget reserve is the host's, unchanged: a
 * batch skips only the collector daily caps.
 */
export function batchEnv(env: NodeJS.ProcessEnv, opts: Pick<BatchOptions, "cacheDays" | "markets">): NodeJS.ProcessEnv {
  const published = new Set<string>(requestMarkets(env));
  const outside = opts.markets.filter(m => !published.has(m));
  if (outside.length) {
    throw new BatchUsageError(
      `--markets ${outside.join(",")} is not in MARKET_VALUATION_PUBLISHED_MARKETS (${[...published].join(",") || "none"}). A batch only prices published markets.`,
    );
  }
  return {
    ...env,
    [PRICE_REQUEST_FLAG_ENV]: "true",
    MARKET_VALUATION_PUBLISHED_MARKETS: opts.markets.join(","),
    MARKET_PRICE_REQUEST_CACHE_DAYS: String(opts.cacheDays),
  };
}

async function plan(opts: BatchOptions, deps: BatchDeps, now: number): Promise<{ plan: BatchPlan; todo: BatchPin[] }> {
  batchEnv(deps.env, opts); // refuses --markets outside the published list, before anything is read
  const markets = opts.markets;
  const sources = markets.map(m => PRICE_REQUEST_SOURCES[m]!);
  const reserve = priceRequestLimits(deps.env).budgetReserve;
  const pins = await deps.store.listPins({ years: opts.years, pinhuntIds: opts.pinhuntIds, offset: opts.offset, limit: opts.limit });
  const answered = pins.length
    ? await deps.store.recentlyAnswered(pins.map(p => p.uuid), sources, new Date(now - opts.cacheDays * DAY_MS).toISOString())
    : new Set<string>();
  const todo = pins.filter(p => !answered.has(p.uuid));
  const creditsPerPin = sources.length;
  const worstCaseAll = todo.length * creditsPerPin;
  const pinsThisRun = opts.maxCredits === null ? todo.length : Math.min(todo.length, Math.floor(opts.maxCredits / creditsPerPin));
  const month = monthOf(now);
  const budget = await deps.store.budget(month);
  const spendable = budget.hardStop ? Math.max(0, budget.limitCredits - budget.usedCredits - reserve - opts.leaveCredits) : null;
  return {
    plan: {
      candidates: pins.length,
      alreadyAnswered: pins.length - todo.length,
      toPrice: todo.length,
      markets,
      sources,
      creditsPerPin,
      worstCaseAll,
      pinsThisRun,
      plannedCredits: pinsThisRun * creditsPerPin,
      month,
      budget,
      reserve,
      spendable,
    },
    todo: todo.slice(0, pinsThisRun),
  };
}

export function batchBlockers(p: BatchPlan, opts: BatchOptions, env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  if (env.SOLDGRAPH_ENABLED !== "true") out.push('SOLDGRAPH_ENABLED is not "true" for this command');
  if (!env.SOLDGRAPH_API_KEY) out.push("SOLDGRAPH_API_KEY is not set");
  if (env.MARKET_VALUATION_V2_ENABLED !== "true") out.push('MARKET_VALUATION_V2_ENABLED is not "true" for this command (values would not be saved)');
  if (!p.budget.hardStop || p.spendable === null) out.push(`the ${p.month} Soldgraph budget is not a hard stop`);
  else if (p.plannedCredits > p.spendable) {
    out.push(`planned ${p.plannedCredits} credit(s) is more than the ${p.spendable} this run may use (budget left minus the reserve and --leave-credits)`);
  }
  if (opts.confirmCredits === null) out.push(`--confirm-credits ${p.plannedCredits} is required with --apply`);
  else if (opts.confirmCredits !== p.plannedCredits) {
    out.push(`--confirm-credits must equal the planned credits shown (${p.plannedCredits}), not ${opts.confirmCredits}`);
  }
  return out;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const emptyCounts = (): BatchCounts => ({ priced: 0, noSales: 0, cached: 0, inFlight: 0, failed: 0, notFound: 0 });

export async function runBatch(opts: BatchOptions, deps: BatchDeps): Promise<BatchResult> {
  const clock = deps.now ?? Date.now;
  const { plan: p, todo } = await plan(opts, deps, clock());
  const base: BatchResult = { plan: p, applied: false, blockers: [], counts: emptyCounts(), pinsTried: 0, creditsSpent: 0 };
  if (!opts.apply) return base;
  const blockers = batchBlockers(p, opts, deps.env);
  if (blockers.length) return { ...base, blockers };

  const start = deps.start ?? startPriceRequest;
  const requestDeps: PriceRequestDeps = { ...deps.request, env: batchEnv(deps.env, opts), now: deps.now };
  const ceiling = p.plannedCredits;
  const counts = emptyCounts();
  let spent = 0;
  let tried = 0;
  let errorsInRow = 0;
  let stoppedBy: BatchResult["stoppedBy"];
  let stopDetail: string | undefined;

  for (const pin of todo) {
    if (deps.shouldStop?.()) {
      stoppedBy = "stopped";
      stopDetail = "stopped by the admin";
      break;
    }
    if (spent + p.creditsPerPin > ceiling) {
      stoppedBy = "ceiling";
      break;
    }
    tried += 1;
    let r: StartResult;
    try {
      r = await start({ pinhuntId: pin.pinhuntId, origin: "batch", userId: null }, requestDeps);
    } catch {
      r = { kind: "unavailable", reason: "disabled" };
      stopDetail = "request store error";
    }
    if (r.kind === "started") {
      const done = await r.done;
      spent += done.creditsSpent;
      if (done.status === "complete") {
        errorsInRow = 0;
        if (done.outcome === "priced") counts.priced += 1;
        else counts.noSales += 1;
      } else if (done.outcome === "stopped") {
        counts.failed += 1;
        stoppedBy = "budget";
        stopDetail = "Soldgraph stopped the run (monthly budget or kill switch)";
        break;
      } else {
        counts.failed += 1;
        errorsInRow += 1;
        if (errorsInRow >= opts.stopAfterErrors) {
          stoppedBy = "errors";
          stopDetail = `${errorsInRow} failures in a row`;
          break;
        }
      }
    } else if (r.kind === "cached") {
      counts.cached += 1;
    } else if (r.kind === "in_flight") {
      counts.inFlight += 1;
    } else if (r.kind === "not_found") {
      counts.notFound += 1;
    } else if (r.kind === "budget") {
      stoppedBy = "budget";
      stopDetail = `${r.remainingCredits} credit(s) left this month`;
      break;
    } else if (r.kind === "unavailable") {
      stoppedBy = "unavailable";
      stopDetail = stopDetail ?? r.reason;
      break;
    } else {
      // "capped" can't happen for a batch; treat it as a stop rather than loop.
      stoppedBy = "unavailable";
      stopDetail = "daily cap";
      break;
    }
    deps.onPin?.({ tried, total: todo.length, creditsSpent: spent, counts: { ...counts } });
    if (tried % 25 === 0) {
      deps.progress?.(`  ${tried}/${todo.length} pins · ${spent} credit(s) · priced ${counts.priced}, no sales ${counts.noSales}, failed ${counts.failed}`);
    }
  }

  let budgetAfter: BatchResult["budgetAfter"];
  try {
    const b = await deps.store.budget(p.month);
    budgetAfter = { usedCredits: b.usedCredits, limitCredits: b.limitCredits };
  } catch {
    budgetAfter = undefined;
  }
  return {
    ...base,
    applied: true,
    counts,
    pinsTried: tried,
    creditsSpent: spent,
    ...(stoppedBy ? { stoppedBy } : {}),
    ...(stopDetail ? { stopDetail } : {}),
    ...(budgetAfter ? { budgetAfter } : {}),
  };
}

// ─── Output ──────────────────────────────────────────────────────────────────

export const USD_PER_CREDIT = 0.0045;

export function formatBatch(r: BatchResult, opts: BatchOptions): string[] {
  const p = r.plan;
  const usd = (credits: number) => `≈ $${(credits * USD_PER_CREDIT).toFixed(2)} at $${USD_PER_CREDIT}/credit`;
  const out = [
    ...(opts.production ? [`Target: PRODUCTION (${opts.production}). Prices and request rows are written to the live project.`] : []),
    `Pins: ${opts.pinhuntIds ? `${opts.pinhuntIds.length} from --ids-file` : `release year ${opts.years.join(", ")}, verified, not archived`}` +
      (opts.offset || opts.limit !== null ? ` (offset ${opts.offset}${opts.limit !== null ? `, limit ${opts.limit}` : ""})` : ""),
    `Markets: ${p.markets.join(", ")} · sources: ${p.sources.join(", ")} (${p.creditsPerPin} credit(s) per pin at most)`,
    `Candidates: ${p.candidates} · already answered in the last ${opts.cacheDays} days: ${p.alreadyAnswered} · to price: ${p.toPrice}`,
    `Worst case for all ${p.toPrice}: ${p.worstCaseAll} credit(s) (${usd(p.worstCaseAll)})`,
    `This run: ${p.pinsThisRun} pin(s), planned ${p.plannedCredits} credit(s) (${usd(p.plannedCredits)})` +
      (opts.maxCredits !== null ? ` under --max-credits ${opts.maxCredits}` : ""),
    `Month ${p.month}: ${p.budget.usedCredits} of ${p.budget.limitCredits} credits used` +
      (p.spendable === null
        ? ", NOT a hard stop"
        : `, ${p.spendable} this run may use${p.reserve || opts.leaveCredits ? ` (after the reserve ${p.reserve} and --leave-credits ${opts.leaveCredits})` : ""}`),
  ];
  if (!opts.apply) {
    out.push("Dry run: nothing was called. Add --apply --max-credits N --confirm-credits <planned> to run.");
    return out;
  }
  if (!r.applied) {
    out.push("Not run:", ...r.blockers.map(b => `  - ${b}`));
    return out;
  }
  const c = r.counts;
  out.push(
    `Done: ${r.pinsTried} pin(s) tried, ${r.creditsSpent} credit(s) spent.`,
    `  priced ${c.priced} · no sales ${c.noSales} · answered from cache ${c.cached} · running elsewhere ${c.inFlight} · failed ${c.failed} · not found ${c.notFound}`,
  );
  if (r.stoppedBy) out.push(`Stopped early (${r.stoppedBy}${r.stopDetail ? `: ${r.stopDetail}` : ""}). Re-run the same command to continue; answered pins are skipped.`);
  if (r.budgetAfter) out.push(`Budget after: ${r.budgetAfter.usedCredits} of ${r.budgetAfter.limitCredits} credits used.`);
  return out;
}
