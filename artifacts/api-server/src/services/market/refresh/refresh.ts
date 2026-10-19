/**
 * Maintainer-run market refresh (SG-06, #409): plan, cache, dedupe, store and
 * revalue. Called only from artifacts/api-server/scripts/market-refresh.mjs,
 * behind the staging guard. No route reaches this module.
 *
 * Spend control, in order:
 *   1. An explicit pin list (at most 50) and source list. There is no "all".
 *   2. Cache: a (pin, source) with a stored listing seen within the source's
 *      TTL (sold 7 days, active 2 days by default) is not searched again.
 *      Soldgraph charges for its own cached results, so this is the saving.
 *   3. Dedupe: the same search key is run once per run, even across pins.
 *   4. The worst-case credit cost and the month's remaining budget are
 *      worked out before any call. A dry run stops there.
 *   5. --apply needs --confirm-credits equal to that worst case, refuses when
 *      it exceeds the remaining budget, and never spends more than it in the
 *      run. The Soldgraph client still reserves every credit atomically
 *      against the monthly cap (provider_budgets / reserve_provider_credit).
 *
 * Storage: accepted matches and near-miss rejections (variant, year or
 * edition mismatch, for SG-10) are upserted into market_listings on
 * (source_id, external_id, pin_id), with last_seen_at = now and expires_at
 * capped by the source's retention_days (the 049 trigger caps it again). A
 * listing accepted for two pins is kept against the better match only. No
 * images, seller details, listed prices or medians are stored.
 */
import fs from "node:fs";
import type { SoldgraphClient } from "../../soldgraph/client";
import { BudgetExceededError } from "../../soldgraph/errors";
import type { AdapterSearchResult, MarketplaceAdapter } from "../adapter";
import { matchListing, type RejectionReason } from "../matching";
import { planPinSearches } from "../queries";
import { collectPinEvidence, type CollectedListing, type RevalueResult } from "../valuation-v2-service";
import {
  PLANNING_CLIENT,
  REFRESH_SOURCE_IDS,
  buildRefreshAdapters,
  firstQuery,
  refreshSource,
  rowContext,
} from "./sources";
import type {
  BudgetStatus,
  ListingKey,
  MarketListingRow,
  PinRef,
  RefreshStore,
  SourceRow,
  StoredAcceptedListing,
} from "./types";

export const MAX_PINS = 50;
export const DEFAULT_SOLD_TTL_DAYS = 7;
export const DEFAULT_ACTIVE_TTL_DAYS = 2;
export const DEFAULT_QUERIES_PER_SOURCE = 1;
export const MAX_QUERIES_PER_SOURCE = 3;
const DAY_MS = 86_400_000;
const PINHUNT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const UPSERT_CHUNK = 200;

/**
 * Rejections kept as near-misses for catalogue research (SG-10): the listing
 * is the same kind of pin but a different variant, year or edition.
 */
export const NEAR_MISS_REASONS: ReadonlySet<RejectionReason> = new Set<RejectionReason>([
  "variant_not_in_record",
  "variant_missing",
  "edition_size_conflict",
  "edition_kind_conflict",
  "year_conflict",
]);

// ─── Options ─────────────────────────────────────────────────────────────────

export class RefreshUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefreshUsageError";
  }
}

export interface RefreshOptions {
  command: "refresh";
  pinhuntIds: string[];
  sources: string[];
  queriesPerSource: number;
  soldTtlDays: number;
  activeTtlDays: number;
  apply: boolean;
  confirmCredits: number | null;
}

export interface ProbeOptions {
  command: "probe";
  pinhuntId: string;
  source: string;
  /** Search text to use instead of the pin's own query (for checking a shorter search). */
  query?: string;
  apply: boolean;
  confirmCredits: number | null;
}

export interface PurgeOptions {
  command: "purge";
  source: string | null;
  apply: boolean;
}

export type CliOptions = RefreshOptions | ProbeOptions | PurgeOptions;

/** One PinHunt ID per line; blank lines and # comments ignored. */
export function parseIdsText(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.replace(/#.*/, "").trim()).filter(Boolean);
}

function intFlag(flag: string, raw: string, min: number, max: number): number {
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(n) || n < min || n > max) {
    throw new RefreshUsageError(`${flag} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

function checkIds(ids: string[]): string[] {
  const unique = [...new Set(ids)];
  const bad = unique.filter(id => !PINHUNT_ID_RE.test(id));
  if (bad.length) throw new RefreshUsageError(`Not a PinHunt ID: ${bad.slice(0, 3).join(", ")}`);
  if (unique.length === 0) throw new RefreshUsageError("Give the pins with --pinhunt-ids or --ids-file.");
  if (unique.length > MAX_PINS) {
    throw new RefreshUsageError(`${unique.length} pins given; the most per run is ${MAX_PINS}.`);
  }
  return unique;
}

function checkSource(id: string): string {
  if (!REFRESH_SOURCE_IDS.includes(id)) {
    throw new RefreshUsageError(`Unknown source "${id}". Use: ${REFRESH_SOURCE_IDS.join(", ")}.`);
  }
  return id;
}

/**
 * Parse the market-refresh.mjs arguments. Throws RefreshUsageError, before
 * anything connects, for anything unclear.
 */
export function parseCliArgs(argv: string[], readFile: (p: string) => string = p => fs.readFileSync(p, "utf8")): CliOptions {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith("--") ? args.shift()! : "refresh";
  if (!["refresh", "probe", "purge"].includes(command)) {
    throw new RefreshUsageError(`Unknown command "${command}". Use refresh (the default), probe or purge.`);
  }
  const flags = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!flag.startsWith("--")) throw new RefreshUsageError(`Unexpected argument "${flag}".`);
    if (flag === "--all") {
      throw new RefreshUsageError("There is no --all: give an explicit list of at most 50 pins.");
    }
    if (flags.has(flag)) throw new RefreshUsageError(`${flag} given twice.`);
    if (flag === "--apply") {
      flags.set(flag, true);
      continue;
    }
    const v = args[++i];
    if (v === undefined || v.startsWith("--")) throw new RefreshUsageError(`${flag} needs a value.`);
    flags.set(flag, v);
  }
  const take = (name: string): string | undefined => {
    const v = flags.get(name);
    flags.delete(name);
    return typeof v === "string" ? v : undefined;
  };
  const apply = flags.delete("--apply");
  const confirmRaw = take("--confirm-credits");
  const confirmCredits = confirmRaw === undefined ? null : intFlag("--confirm-credits", confirmRaw, 0, 10_000);

  let out: CliOptions;
  if (command === "refresh") {
    const ids: string[] = [];
    const list = take("--pinhunt-ids");
    if (list) ids.push(...list.split(",").map(s => s.trim()).filter(Boolean));
    const file = take("--ids-file");
    if (file) ids.push(...parseIdsText(readFile(file)));
    const sources = (take("--sources") ?? "").split(",").map(s => s.trim()).filter(Boolean);
    if (sources.length === 0) throw new RefreshUsageError(`Give --sources (any of: ${REFRESH_SOURCE_IDS.join(", ")}).`);
    const q = take("--queries-per-source");
    const sold = take("--sold-ttl-days");
    const active = take("--active-ttl-days");
    out = {
      command: "refresh",
      pinhuntIds: checkIds(ids),
      sources: [...new Set(sources.map(checkSource))],
      queriesPerSource: q === undefined ? DEFAULT_QUERIES_PER_SOURCE : intFlag("--queries-per-source", q, 1, MAX_QUERIES_PER_SOURCE),
      soldTtlDays: sold === undefined ? DEFAULT_SOLD_TTL_DAYS : intFlag("--sold-ttl-days", sold, 1, 90),
      activeTtlDays: active === undefined ? DEFAULT_ACTIVE_TTL_DAYS : intFlag("--active-ttl-days", active, 1, 90),
      apply,
      confirmCredits,
    };
  } else if (command === "probe") {
    const id = take("--pinhunt-id");
    const source = take("--source");
    if (!id) throw new RefreshUsageError("probe needs --pinhunt-id (one pin).");
    if (!source) throw new RefreshUsageError("probe needs --source (one source).");
    const query = take("--query")?.trim();
    if (query !== undefined && (query.length < 3 || query.length > 120)) {
      throw new RefreshUsageError("--query must be 3 to 120 characters.");
    }
    out = {
      command: "probe",
      pinhuntId: checkIds([id])[0],
      source: checkSource(source),
      ...(query ? { query } : {}),
      apply,
      confirmCredits,
    };
  } else {
    const source = take("--source");
    if (confirmCredits !== null) throw new RefreshUsageError("purge makes no provider calls; drop --confirm-credits.");
    out = { command: "purge", source: source === undefined ? null : checkSource(source), apply };
  }
  if (flags.size) throw new RefreshUsageError(`Unknown flag for ${command}: ${[...flags.keys()].join(", ")}.`);
  if (!apply && confirmCredits !== null) {
    throw new RefreshUsageError("--confirm-credits only goes with --apply.");
  }
  return out;
}

// ─── Helpers (exported for tests) ────────────────────────────────────────────

export function ttlDays(source: Pick<SourceRow, "evidenceType">, opts: Pick<RefreshOptions, "soldTtlDays" | "activeTtlDays">): number {
  return source.evidenceType === "sold" ? opts.soldTtlDays : opts.activeTtlDays;
}

/** True when a row seen at `lastSeenIso` is still inside the TTL. */
export function isFresh(lastSeenIso: string | undefined, ttl: number, now: number): boolean {
  if (!lastSeenIso) return false;
  const at = Date.parse(lastSeenIso);
  return Number.isFinite(at) && at <= now && now - at < ttl * DAY_MS;
}

export function isNearMiss(c: CollectedListing): boolean {
  return !c.match.accepted && c.match.rejectionReason !== undefined && NEAR_MISS_REASONS.has(c.match.rejectionReason);
}

const cap = (s: string | undefined, n: number) => (s === undefined ? undefined : s.slice(0, n));

/** The small title-derived `parsed` object 049 allows (no listing detail). */
export function parsedAttributes(c: CollectedListing): Record<string, unknown> {
  const p = c.match.parsed;
  const out: Record<string, unknown> = {};
  if (p.year !== undefined) out.year = p.year;
  if (p.editionSize !== undefined) out.edition_size = p.editionSize;
  if (p.variantTerms.length) out.variant_terms = p.variantTerms.slice(0, 12);
  if (p.seriesGuess) out.series_guess = cap(p.seriesGuess, 100);
  if (p.charactersGuess.length) out.characters_guess = p.charactersGuess.slice(0, 10).map(s => s.slice(0, 60));
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function toListingRow(c: CollectedListing, pinUuid: string, retentionDays: number, now: number): MarketListingRow {
  const l = c.listing;
  const at = new Date(now).toISOString();
  return {
    source_id: l.sourceId,
    external_id: l.externalId,
    pin_id: pinUuid,
    title: l.title.slice(0, 500),
    price: l.price === null ? null : round2(l.price),
    shipping: l.shipping === null ? null : round2(l.shipping),
    currency: l.currency,
    sold_date: l.priceKind === "active" ? null : l.soldDate,
    price_kind: l.priceKind,
    best_offer_accepted: l.priceKind === "active" ? null : l.bestOfferAccepted,
    listing_url: l.url && l.url.startsWith("https://") && l.url.length <= 2000 ? l.url : null,
    match_score: Math.max(-9999, Math.min(9999, round2(c.match.score))),
    accepted: c.match.accepted,
    rejection_reason: c.match.accepted ? null : (c.match.rejectionReason ?? null),
    parsed: parsedAttributes(c),
    last_seen_at: at,
    expires_at: new Date(now + retentionDays * DAY_MS).toISOString(),
  };
}

const pairKey = (sourceId: string, externalId: string) => `${sourceId}|${externalId}`;
const listingKey = (k: ListingKey) => `${k.pinUuid}|${k.sourceId}|${k.externalId}`;

export interface RunAccepted extends ListingKey {
  score: number;
}

export interface DedupeDecision {
  /** Run rows (by listingKey) that lose to a better match on another pin: not stored. */
  dropRun: Set<string>;
  /** Stored accepted rows on other pins that lose to this run: deleted. */
  deleteStored: ListingKey[];
}

/**
 * "The same listing matched to two pins is kept against the best match only."
 * Candidates are this run's accepted rows plus accepted rows already stored
 * for the same (source, item). A stored row for the same pin is replaced by
 * the run's row, so it is not a competitor. Highest score wins; on a tie the
 * row already stored wins (no churn), then the earlier pin in the run.
 */
export function resolveCrossPinDuplicates(run: RunAccepted[], stored: StoredAcceptedListing[]): DedupeDecision {
  const runKeys = new Set(run.map(listingKey));
  type Cand = ListingKey & { score: number; stored: boolean; order: number };
  const groups = new Map<string, Cand[]>();
  const add = (c: Cand) => {
    const k = pairKey(c.sourceId, c.externalId);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  };
  run.forEach((r, i) => add({ ...r, stored: false, order: i }));
  for (const s of stored) {
    if (runKeys.has(listingKey(s))) continue;
    add({ pinUuid: s.pinUuid, sourceId: s.sourceId, externalId: s.externalId, score: s.matchScore ?? -Infinity, stored: true, order: -1 });
  }
  const dropRun = new Set<string>();
  const deleteStored: ListingKey[] = [];
  for (const cands of groups.values()) {
    if (cands.length < 2) continue;
    const best = [...cands].sort(
      (a, b) => b.score - a.score || Number(b.stored) - Number(a.stored) || a.order - b.order,
    )[0];
    for (const c of cands) {
      if (c === best) continue;
      if (c.stored) deleteStored.push({ pinUuid: c.pinUuid, sourceId: c.sourceId, externalId: c.externalId });
      else dropRun.add(listingKey(c));
    }
  }
  return { dropRun, deleteStored };
}

// ─── Planning ────────────────────────────────────────────────────────────────

export interface PinPlan {
  pinhuntId: string;
  uuid: string;
  /** Sources skipped because a stored listing is still inside the TTL. */
  cachedSources: string[];
  /** Searches planned for this pin (before cross-pin dedupe). */
  searches: Array<{ sourceId: string; key: string }>;
}

export interface RefreshPlan {
  pins: PinPlan[];
  missingPins: string[];
  /** Requested sources with no market_sources row. */
  missingSources: string[];
  /** Requested sources whose market_sources row is not enabled. */
  disabledSources: string[];
  /** Unique paid searches across the run (cross-pin dedupe applied). */
  uniqueSearches: number;
  /** Planned searches that reuse another pin's identical search. */
  sharedSearches: number;
  /** Worst-case credits: every unique planned search costs its full price. */
  worstCaseCredits: number;
  /** Per-pin credit limit passed to the planner. */
  perPinCreditLimit: number;
  budget: BudgetStatus;
  /** Credits left this month under a hard stop; null when the cap is soft. */
  remainingCredits: number | null;
  overBudget: boolean;
}

export interface RefreshDeps {
  store: RefreshStore;
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /** Builds the real client; only called for --apply. */
  createClient?: () => SoldgraphClient;
}

function monthOfMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

interface Prepared {
  plan: RefreshPlan;
  pins: PinRef[];
  sourceRows: Map<string, SourceRow>;
  runnable: string[];
}

async function prepare(opts: RefreshOptions, deps: RefreshDeps, now: number): Promise<Prepared> {
  const rows = await deps.store.loadSources();
  const sourceRows = new Map(rows.map(r => [r.id, r]));
  const missingSources = opts.sources.filter(id => !sourceRows.has(id));
  const disabledSources = opts.sources.filter(id => sourceRows.get(id)?.enabled === false);
  const runnable = opts.sources.filter(id => sourceRows.has(id));

  const loaded = await deps.store.loadPins(opts.pinhuntIds);
  const byId = new Map(loaded.map(p => [p.pinhuntId, p]));
  const pins = opts.pinhuntIds.map(id => byId.get(id)).filter((p): p is PinRef => p !== undefined);
  const missingPins = opts.pinhuntIds.filter(id => !byId.has(id));

  const lastSeen = await deps.store.lastSeen(pins.map(p => p.uuid), runnable, now);
  const adapters = buildRefreshAdapters(PLANNING_CLIENT, runnable, opts.queriesPerSource);
  const perPinCreditLimit = adapters.reduce((n, a) => n + a.creditsPerSearch * opts.queriesPerSource, 0);

  const pinPlans: PinPlan[] = [];
  const costByKey = new Map<string, number>();
  let planned = 0;
  for (const p of pins) {
    const cachedSources = runnable.filter(id =>
      isFresh(lastSeen.get(`${p.uuid}|${id}`), ttlDays(sourceRows.get(id)!, opts), now));
    const live = adapters.filter(a => !cachedSources.includes(a.sourceId));
    const pinPlan = planPinSearches(p.pin, live, { creditLimit: perPinCreditLimit });
    for (const s of pinPlan.searches) {
      planned += 1;
      if (!costByKey.has(s.key)) costByKey.set(s.key, s.adapter.creditsPerSearch);
    }
    pinPlans.push({
      pinhuntId: p.pinhuntId,
      uuid: p.uuid,
      cachedSources,
      searches: pinPlan.searches.map(s => ({ sourceId: s.adapter.sourceId, key: s.key })),
    });
  }
  const worstCaseCredits = [...costByKey.values()].reduce((a, b) => a + b, 0);
  const budget = await deps.store.budget(monthOfMs(now));
  const remainingCredits = budget.hardStop ? Math.max(0, budget.limitCredits - budget.usedCredits) : null;
  return {
    plan: {
      pins: pinPlans,
      missingPins,
      missingSources,
      disabledSources,
      uniqueSearches: costByKey.size,
      sharedSearches: planned - costByKey.size,
      worstCaseCredits,
      perPinCreditLimit,
      budget,
      remainingCredits,
      overBudget: remainingCredits !== null && worstCaseCredits > remainingCredits,
    },
    pins,
    sourceRows,
    runnable,
  };
}

/** Reasons --apply must not run, in the order they are reported. */
export function applyBlockers(
  plan: Pick<RefreshPlan, "missingSources" | "disabledSources" | "worstCaseCredits" | "overBudget" | "remainingCredits">,
  opts: { confirmCredits: number | null },
  env: NodeJS.ProcessEnv,
): string[] {
  const out: string[] = [];
  if (plan.missingSources.length) out.push(`no market_sources row for: ${plan.missingSources.join(", ")}`);
  if (plan.disabledSources.length) out.push(`market_sources not enabled for: ${plan.disabledSources.join(", ")}`);
  if (plan.worstCaseCredits > 0) {
    if (env.SOLDGRAPH_ENABLED !== "true") out.push("SOLDGRAPH_ENABLED is not \"true\" for this command");
    if (!env.SOLDGRAPH_API_KEY) out.push("SOLDGRAPH_API_KEY is not set");
  }
  if (plan.overBudget) {
    out.push(`worst case ${plan.worstCaseCredits} credit(s) is more than the ${plan.remainingCredits} left this month`);
  }
  if (opts.confirmCredits === null) {
    out.push(`--confirm-credits ${plan.worstCaseCredits} is required with --apply`);
  } else if (opts.confirmCredits !== plan.worstCaseCredits) {
    out.push(`--confirm-credits must equal the worst case shown (${plan.worstCaseCredits}), not ${opts.confirmCredits}`);
  }
  return out;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

export interface PinSummary {
  pinhuntId: string;
  cachedSources: string[];
  searchesRun: number;
  searchesFailed: number;
  sharedSearches: number;
  /** Listings the searches returned, before matching. */
  found: number;
  accepted: number;
  nearMisses: number;
  /** Why unmatched listings were turned down (counts only). */
  rejectedReasons: Record<string, number>;
  droppedAsDuplicate: number;
  stoppedBy?: "budget" | "disabled" | "unavailable";
  valuation?: RevalueResult | { status: "error" };
}

export interface RefreshResult {
  plan: RefreshPlan;
  applied: boolean;
  blockers: string[];
  pins: PinSummary[];
  /** Paid searches this run actually sent (cache and dedupe excluded). */
  creditsSpent: number;
  listingsWritten: number;
  storedRowsReplaced: number;
  /** Pins outside the list revalued because a duplicate row moved away from them. */
  otherPinsRevalued: number;
  stoppedBy?: "budget" | "disabled" | "unavailable";
  budgetAfter?: BudgetStatus;
}

/**
 * Wrap adapters so identical searches (same key) run once per run, and the
 * run never sends more than `maxCredits` worth of paid searches.
 */
export function withRunCache(
  adapters: MarketplaceAdapter[],
  maxCredits: number,
  month: string,
): { adapters: MarketplaceAdapter[]; spent: () => number; shared: () => number } {
  const cache = new Map<string, Promise<AdapterSearchResult>>();
  let spent = 0;
  let shared = 0;
  const wrapped = adapters.map((a): MarketplaceAdapter => ({
    ...a,
    buildQueries: a.buildQueries,
    searchKey: a.searchKey,
    search(query, opts) {
      const key = a.searchKey(query);
      const hit = cache.get(key);
      if (hit) {
        shared += 1;
        return hit;
      }
      if (spent + a.creditsPerSearch > maxCredits) {
        return Promise.reject(new BudgetExceededError(month, spent, maxCredits));
      }
      spent += a.creditsPerSearch;
      const p = a.search(query, opts);
      cache.set(key, p);
      // A failed search is not reused: failed Soldgraph jobs are free, and a
      // later pin may retry it within the same cap.
      p.catch(() => cache.delete(key));
      return p;
    },
  }));
  return { adapters: wrapped, spent: () => spent, shared: () => shared };
}

export async function runRefresh(opts: RefreshOptions, deps: RefreshDeps): Promise<RefreshResult> {
  const clock = deps.now ?? Date.now;
  const now = clock();
  const { plan, pins, sourceRows, runnable } = await prepare(opts, deps, now);
  const base: RefreshResult = {
    plan,
    applied: false,
    blockers: [],
    pins: [],
    creditsSpent: 0,
    listingsWritten: 0,
    storedRowsReplaced: 0,
    otherPinsRevalued: 0,
  };
  if (!opts.apply) return base;
  const blockers = applyBlockers(plan, opts, deps.env);
  if (blockers.length) return { ...base, blockers };

  const month = monthOfMs(now);
  let client: SoldgraphClient = PLANNING_CLIENT;
  if (plan.worstCaseCredits > 0) {
    if (!deps.createClient) throw new Error("no Soldgraph client factory");
    client = deps.createClient();
  }
  const adapters = buildRefreshAdapters(client, runnable, opts.queriesPerSource, clock);
  const run = withRunCache(adapters, plan.worstCaseCredits, month);

  const summaries: PinSummary[] = [];
  const collected: Array<{ ref: PinRef; items: CollectedListing[] }> = [];
  let stoppedBy: RefreshResult["stoppedBy"];
  for (const ref of pins) {
    const pinPlan = plan.pins.find(p => p.uuid === ref.uuid)!;
    const live = run.adapters.filter(a => !pinPlan.cachedSources.includes(a.sourceId));
    const sharedBefore = run.shared();
    const res = await collectPinEvidence(ref.pin, live, { creditLimit: plan.perPinCreditLimit, pinId: ref.uuid }, clock);
    const items = [...res.accepted, ...res.rejected.filter(isNearMiss)];
    collected.push({ ref, items });
    summaries.push({
      pinhuntId: ref.pinhuntId,
      cachedSources: pinPlan.cachedSources,
      searchesRun: res.searchesRun - (run.shared() - sharedBefore),
      searchesFailed: res.searchesFailed,
      sharedSearches: run.shared() - sharedBefore,
      found: res.listingsFound,
      accepted: res.accepted.length,
      nearMisses: items.length - res.accepted.length,
      rejectedReasons: res.rejectedReasons,
      droppedAsDuplicate: 0,
      ...(res.stoppedBy ? { stoppedBy: res.stoppedBy } : {}),
    });
    if (res.stoppedBy) {
      stoppedBy = res.stoppedBy;
      break;
    }
  }

  // Cross-pin dedupe of accepted rows, against this run and what is stored.
  const runAccepted: RunAccepted[] = collected.flatMap(({ ref, items }) =>
    items.filter(c => c.match.accepted).map(c => ({
      pinUuid: ref.uuid, sourceId: c.listing.sourceId, externalId: c.listing.externalId, score: c.match.score,
    })));
  const pairs = [...new Map(runAccepted.map(r => [pairKey(r.sourceId, r.externalId), { sourceId: r.sourceId, externalId: r.externalId }])).values()];
  const stored = pairs.length ? await deps.store.acceptedFor(pairs) : [];
  const decision = resolveCrossPinDuplicates(runAccepted, stored);

  const rows: MarketListingRow[] = [];
  collected.forEach(({ ref, items }, i) => {
    for (const c of items) {
      const k = listingKey({ pinUuid: ref.uuid, sourceId: c.listing.sourceId, externalId: c.listing.externalId });
      if (c.match.accepted && decision.dropRun.has(k)) {
        summaries[i].droppedAsDuplicate += 1;
        summaries[i].accepted -= 1;
        continue;
      }
      const src = sourceRows.get(c.listing.sourceId);
      if (!src) continue;
      rows.push(toListingRow(c, ref.uuid, src.retentionDays, now));
    }
  });
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await deps.store.upsertListings(rows.slice(i, i + UPSERT_CHUNK));
  }
  // Delete worse duplicates only after the new rows are stored, so a failed
  // upsert never loses a listing; never delete a row this run just wrote.
  const written = new Set(rows.map(r => listingKey({ pinUuid: r.pin_id, sourceId: r.source_id, externalId: r.external_id })));
  const toDelete = decision.deleteStored.filter(k => !written.has(listingKey(k)));
  if (toDelete.length) await deps.store.deleteListings(toDelete);

  // Revalue from stored evidence (no provider calls). Pins not reached after
  // a stop are left as they are.
  for (let i = 0; i < collected.length; i++) {
    try {
      summaries[i].valuation = await deps.store.revalue(collected[i].ref.uuid, now);
    } catch {
      summaries[i].valuation = { status: "error" };
    }
  }
  const inRun = new Set(collected.map(c => c.ref.uuid));
  const others = [...new Set(toDelete.map(d => d.pinUuid))].filter(u => !inRun.has(u));
  for (const uuid of others) {
    try {
      await deps.store.revalue(uuid, now);
    } catch {
      // Reported through the count only; that pin keeps its previous valuation.
    }
  }

  let budgetAfter: BudgetStatus | undefined;
  try {
    budgetAfter = await deps.store.budget(month);
  } catch {
    budgetAfter = undefined;
  }
  return {
    ...base,
    applied: true,
    pins: summaries,
    creditsSpent: run.spent(),
    listingsWritten: rows.length,
    storedRowsReplaced: toDelete.length,
    otherPinsRevalued: others.length,
    ...(stoppedBy ? { stoppedBy } : {}),
    ...(budgetAfter ? { budgetAfter } : {}),
  };
}

// ─── Single probe ────────────────────────────────────────────────────────────

const FIELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_FIELDS = 80;

export interface FieldShape {
  name: string;
  /** JS types seen for this field across rows, sorted. */
  types: string[];
  /** Rows that had the field. */
  present: number;
  /** For object fields: nested key names (one level), names only. */
  nested?: string[];
}

export interface FieldReport {
  rows: number;
  fields: FieldShape[];
  /** Keys not shaped like identifiers (could be data, so never printed). */
  hiddenKeys: number;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Field names and types of raw provider rows. Never returns a value: only
 * identifier-shaped key names, their JS types and how many rows had them.
 */
export function describeFields(rows: unknown[]): FieldReport {
  const fields = new Map<string, { types: Set<string>; present: number; nested: Set<string> }>();
  let hiddenKeys = 0;
  let count = 0;
  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    count += 1;
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (!FIELD_NAME_RE.test(k)) {
        hiddenKeys += 1;
        continue;
      }
      let f = fields.get(k);
      if (!f) {
        if (fields.size >= MAX_FIELDS) {
          hiddenKeys += 1;
          continue;
        }
        f = { types: new Set(), present: 0, nested: new Set() };
        fields.set(k, f);
      }
      f.present += 1;
      f.types.add(typeOf(v));
      const inner = Array.isArray(v) ? v.find(x => typeof x === "object" && x !== null && !Array.isArray(x)) : v;
      if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
        for (const nk of Object.keys(inner)) {
          if (FIELD_NAME_RE.test(nk) && f.nested.size < 40) f.nested.add(nk);
          else hiddenKeys += 1;
        }
      }
    }
  }
  return {
    rows: count,
    hiddenKeys,
    fields: [...fields.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, f]) => ({
        name,
        types: [...f.types].sort(),
        present: f.present,
        ...(f.nested.size ? { nested: [...f.nested].sort() } : {}),
      })),
  };
}

export interface ProbeResult {
  applied: boolean;
  blockers: string[];
  pinFound: boolean;
  sourceId: string;
  route: string;
  country: string;
  /** Whether a query could be built (the query text itself is the pin's own catalogue title). */
  query: string | null;
  budget: BudgetStatus;
  remainingCredits: number | null;
  report?: FieldReport;
  pages?: number;
  truncated?: boolean;
  /** Adapter mapping of the rows: mapped count and drop reasons (counts only). */
  mapped?: number;
  /** Mapped rows with a usable price, and with a sold date (counts only). */
  withPrice?: number;
  withSoldDate?: number;
  dropped?: Record<string, number>;
  /** matchListing v2 on mapped rows: accepted count and rejection reasons (counts only). */
  matchAccepted?: number;
  matchRejected?: Record<string, number>;
  /** Key names (never values) of Soldgraph's response and its `result`. */
  responseKeys?: { body: string[]; result: string[] };
  error?: string;
}

export async function runProbe(opts: ProbeOptions, deps: RefreshDeps): Promise<ProbeResult> {
  const clock = deps.now ?? Date.now;
  const now = clock();
  const spec = refreshSource(opts.source)!;
  const budget = await deps.store.budget(monthOfMs(now));
  const remainingCredits = budget.hardStop ? Math.max(0, budget.limitCredits - budget.usedCredits) : null;
  const sources = await deps.store.loadSources();
  const row = sources.find(s => s.id === opts.source);
  const [ref] = await deps.store.loadPins([opts.pinhuntId]);
  const adapter = buildRefreshAdapters(PLANNING_CLIENT, [opts.source], 1)[0];
  const query = opts.query ?? (ref ? firstQuery(adapter, ref.pin) : null);
  const result: ProbeResult = {
    applied: false,
    blockers: [],
    pinFound: Boolean(ref),
    sourceId: spec.id,
    route: spec.route,
    country: spec.country,
    query,
    budget,
    remainingCredits,
  };
  if (!opts.apply) return result;

  const blockers: string[] = [];
  if (!ref) blockers.push(`pin ${opts.pinhuntId} not found`);
  if (ref && !query) blockers.push("no search query could be built for this pin");
  if (!row) blockers.push(`no market_sources row for ${opts.source}`);
  else if (!row.enabled) blockers.push(`market_sources not enabled for ${opts.source}`);
  if (deps.env.SOLDGRAPH_ENABLED !== "true") blockers.push("SOLDGRAPH_ENABLED is not \"true\" for this command");
  if (!deps.env.SOLDGRAPH_API_KEY) blockers.push("SOLDGRAPH_API_KEY is not set");
  if (remainingCredits !== null && remainingCredits < 1) blockers.push("no credits left this month");
  if (opts.confirmCredits !== 1) blockers.push("--confirm-credits 1 is required with --apply");
  if (blockers.length) return { ...result, blockers };
  if (!deps.createClient) throw new Error("no Soldgraph client factory");

  try {
    const res = await deps.createClient().search<unknown>(
      spec.route,
      { q: query!, country: spec.country },
      { pinId: ref!.uuid, maxPages: 1 },
    );
    const ctx = rowContext(spec, now);
    const dropped: Record<string, number> = {};
    const matchRejected: Record<string, number> = {};
    let mapped = 0;
    let withPrice = 0;
    let withSoldDate = 0;
    let matchAccepted = 0;
    for (const raw of res.rows) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        dropped.invalid_row = (dropped.invalid_row ?? 0) + 1;
        continue;
      }
      const out = spec.mapRow(raw as Record<string, unknown>, ctx);
      if (typeof out === "string") {
        dropped[out] = (dropped[out] ?? 0) + 1;
        continue;
      }
      mapped += 1;
      if (out.price !== null) withPrice += 1;
      if (out.soldDate) withSoldDate += 1;
      const m = matchListing(ref!.pin, out.title, { mode: "v2", lang: ctx.lang });
      if (m.accepted) matchAccepted += 1;
      else {
        const r = m.rejectionReason ?? "unknown";
        matchRejected[r] = (matchRejected[r] ?? 0) + 1;
      }
    }
    return {
      ...result,
      applied: true,
      report: describeFields(res.rows),
      pages: res.pages,
      truncated: res.truncated,
      mapped,
      withPrice,
      withSoldDate,
      dropped,
      matchAccepted,
      matchRejected,
      ...(res.responseKeys ? { responseKeys: res.responseKeys } : {}),
    };
  } catch (err) {
    // Typed client errors are generic and safe to show (no key, body or URL).
    return { ...result, applied: true, error: err instanceof Error ? err.message : "probe failed" };
  }
}

// ─── Purge ───────────────────────────────────────────────────────────────────

export interface PurgeResult {
  applied: boolean;
  expired: Array<{ sourceId: string; count: number }>;
  deleted?: number;
}

export async function runPurge(opts: PurgeOptions, deps: RefreshDeps): Promise<PurgeResult> {
  const now = (deps.now ?? Date.now)();
  const expired = await deps.store.countExpired(opts.source, now);
  if (!opts.apply) return { applied: false, expired };
  const deleted = await deps.store.purgeExpired(opts.source);
  return { applied: true, expired, deleted };
}

// ─── Usage report (market-usage.mjs) ─────────────────────────────────────────

export interface UsageMonth {
  month: string;
  credits: number;
  requests: number;
  byRoute: Array<{ route: string; credits: number; requests: number; failed: number }>;
  limitCredits: number;
  hardStop: boolean;
  budgetOrigin: "row" | "default";
  remainingCredits: number | null;
  /** credits × --usd-per-credit, when given. */
  estimatedUsd?: number;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export async function runUsageReport(
  opts: { months: number; usdPerCredit: number | null },
  deps: RefreshDeps,
): Promise<UsageMonth[]> {
  const now = (deps.now ?? Date.now)();
  const current = monthOfMs(now);
  const from = addMonths(current, -(opts.months - 1));
  const [rows, budgets, currentBudget] = await Promise.all([
    deps.store.usageRows(from),
    deps.store.budgets(from),
    deps.store.budget(current),
  ]);
  const months: UsageMonth[] = [];
  for (let i = opts.months - 1; i >= 0; i--) {
    const month = addMonths(current, -i);
    const inMonth = rows.filter(r => r.month === month);
    const routes = new Map<string, { credits: number; requests: number; failed: number }>();
    for (const r of inMonth) {
      const e = routes.get(r.route) ?? { credits: 0, requests: 0, failed: 0 };
      e.credits += r.credits;
      e.requests += 1;
      if (r.status !== "complete" && r.status !== "reserved") e.failed += 1;
      routes.set(r.route, e);
    }
    const credits = inMonth.reduce((n, r) => n + r.credits, 0);
    const row = budgets.find(b => b.month === month);
    const limit = month === current ? currentBudget.limitCredits : (row?.limitCredits ?? currentBudget.limitCredits);
    const hardStop = month === current ? currentBudget.hardStop : (row?.hardStop ?? true);
    months.push({
      month,
      credits,
      requests: inMonth.length,
      byRoute: [...routes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([route, e]) => ({ route, ...e })),
      limitCredits: limit,
      hardStop,
      budgetOrigin: month === current ? currentBudget.origin : (row ? "row" : "default"),
      remainingCredits: hardStop ? Math.max(0, limit - credits) : null,
      ...(opts.usdPerCredit !== null ? { estimatedUsd: Math.round(credits * opts.usdPerCredit * 100) / 100 } : {}),
    });
  }
  return months;
}
