/**
 * Optional set probe for marketplace leads (SG-10, #415). Off unless the
 * maintainer passes --probe-sets, and a dry run unless they also pass
 * --apply with --confirm-credits.
 *
 * It searches for a few catalogue sets that have fewer pins than expected,
 * one search per set per source, through the SAME controls as the market
 * refresh (SG-06):
 *   - the same Soldgraph client (createSoldgraphClientFromEnv): the
 *     SOLDGRAPH_ENABLED kill switch and the atomic monthly credit
 *     reservation (provider_budgets / reserve_provider_credit);
 *   - the same adapters and query builder (buildRefreshAdapters);
 *   - the same run cache (withRunCache): an identical search runs once, and
 *     the run never spends more than the confirmed worst case;
 *   - the same --apply blockers (applyBlockers): sources switched on, key
 *     set, worst case within the month's remaining budget, and
 *     --confirm-credits equal to the worst case.
 *
 * Results stay in memory for this run only: they are never stored, printed
 * or written anywhere except as title-derived leads.
 */
import type { CataloguePin, PinSetSummary } from "@workspace/pin-repository";
import type { SoldgraphClient } from "../../soldgraph/client";
import { BudgetExceededError, ProviderDisabledError, ProviderUnavailableError } from "../../soldgraph/errors";
import { normaliseTitle } from "../matching";
import { applyBlockers, withRunCache } from "../refresh/refresh";
import { PLANNING_CLIENT, buildRefreshAdapters } from "../refresh/sources";
import type { BudgetStatus, RefreshStore } from "../refresh/types";
import type { CatalogueEntry, LeadListing } from "./leads";
import { MAX_TITLE_LENGTH } from "./store";

export const DEFAULT_PROBE_SETS = 3;
export const MAX_PROBE_SETS = 10;

export interface SetGap {
  setName: string;
  expected: number;
  known: number;
}

/** pin_sets rows with an expected count above the catalogue pins found for them; biggest gap first. */
export function setsWithGaps(sets: PinSetSummary[], catalogue: CatalogueEntry[]): SetGap[] {
  const out: SetGap[] = [];
  for (const s of sets) {
    if (!s.expectedPinCount || s.expectedPinCount < 1) continue;
    const names = new Set([s.setName, s.collectionName].filter((x): x is string => !!x).map(normaliseTitle));
    const known = catalogue.filter(e =>
      names.has(normaliseTitle(e.pin.collection ?? "")) ||
      (!!s.normalisedSeries && e.pin.normalisedSeries === s.normalisedSeries)).length;
    if (known < s.expectedPinCount) out.push({ setName: s.setName, expected: s.expectedPinCount, known });
  }
  return out.sort((a, b) => (b.expected - b.known) - (a.expected - a.known) || a.setName.localeCompare(b.setName));
}

/** A stand-in record so the adapters' own query builder can phrase a set search. */
export function setProbePin(setName: string): CataloguePin {
  return {
    id: "SET-PROBE",
    title: setName,
    brand: "Disney",
    collection: setName,
    characters: [],
    categories: [],
    externalIdentifiers: {},
    status: "active",
    isUserSubmitted: false,
  };
}

export interface SetProbeOptions {
  sources: string[];
  maxSets: number;
  apply: boolean;
  confirmCredits: number | null;
}

export interface SetProbePlan {
  sets: Array<SetGap & { searches: Array<{ sourceId: string; key: string; query: string }> }>;
  missingSources: string[];
  disabledSources: string[];
  uniqueSearches: number;
  worstCaseCredits: number;
  budget: BudgetStatus;
  remainingCredits: number | null;
  overBudget: boolean;
}

export interface SetProbeResult {
  plan: SetProbePlan;
  applied: boolean;
  blockers: string[];
  /** In memory only; never stored. */
  listings: LeadListing[];
  searchesRun: number;
  searchesFailed: number;
  creditsSpent: number;
  stoppedBy?: "budget" | "disabled" | "unavailable";
  budgetAfter?: BudgetStatus;
}

export interface SetProbeDeps {
  /** Budget and source switches: the refresh's own store. */
  refreshStore: Pick<RefreshStore, "loadSources" | "budget">;
  env: NodeJS.ProcessEnv;
  now: number;
  /** Builds the real client; only called for --apply with a paid search planned. */
  createClient?: () => SoldgraphClient;
}

const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);

export async function planSetProbe(gaps: SetGap[], opts: SetProbeOptions, deps: SetProbeDeps): Promise<SetProbePlan> {
  const rows = await deps.refreshStore.loadSources();
  const byId = new Map(rows.map(r => [r.id, r]));
  const missingSources = opts.sources.filter(id => !byId.has(id));
  const disabledSources = opts.sources.filter(id => byId.get(id)?.enabled === false);
  const runnable = opts.sources.filter(id => byId.has(id));
  const adapters = buildRefreshAdapters(PLANNING_CLIENT, runnable, 1);

  const costByKey = new Map<string, number>();
  const sets = gaps.slice(0, opts.maxSets).map(g => {
    const pin = setProbePin(g.setName);
    const searches: Array<{ sourceId: string; key: string; query: string }> = [];
    for (const a of adapters) {
      const query = a.buildQueries(pin)[0];
      if (!query) continue;
      const key = a.searchKey(query);
      if (!costByKey.has(key)) costByKey.set(key, a.creditsPerSearch);
      searches.push({ sourceId: a.sourceId, key, query });
    }
    return { ...g, searches };
  });
  const worstCaseCredits = [...costByKey.values()].reduce((a, b) => a + b, 0);
  const budget = await deps.refreshStore.budget(monthOf(deps.now));
  const remainingCredits = budget.hardStop ? Math.max(0, budget.limitCredits - budget.usedCredits) : null;
  return {
    sets,
    missingSources,
    disabledSources,
    uniqueSearches: costByKey.size,
    worstCaseCredits,
    budget,
    remainingCredits,
    overBudget: remainingCredits !== null && worstCaseCredits > remainingCredits,
  };
}

export async function runSetProbe(gaps: SetGap[], opts: SetProbeOptions, deps: SetProbeDeps): Promise<SetProbeResult> {
  const plan = await planSetProbe(gaps, opts, deps);
  const base: SetProbeResult = { plan, applied: false, blockers: [], listings: [], searchesRun: 0, searchesFailed: 0, creditsSpent: 0 };
  if (!opts.apply) return base;
  const blockers = applyBlockers(plan, opts, deps.env);
  if (plan.sets.every(s => s.searches.length === 0)) blockers.push("no set to probe");
  if (blockers.length) return { ...base, blockers };

  if (!deps.createClient) throw new Error("no Soldgraph client factory");
  const client = deps.createClient();
  const runnable = opts.sources.filter(id => !plan.missingSources.includes(id));
  const adapters = buildRefreshAdapters(client, runnable, 1);
  const run = withRunCache(adapters, plan.worstCaseCredits, monthOf(deps.now));
  const bySource = new Map(run.adapters.map(a => [a.sourceId, a]));
  const seenAt = new Date(deps.now).toISOString();

  const listings: LeadListing[] = [];
  let searchesRun = 0;
  let searchesFailed = 0;
  let stoppedBy: SetProbeResult["stoppedBy"];
  outer: for (const set of plan.sets) {
    for (const s of set.searches) {
      const adapter = bySource.get(s.sourceId);
      if (!adapter) continue;
      try {
        const res = await adapter.search(s.query);
        searchesRun += 1;
        for (const l of res.listings) {
          listings.push({
            sourceId: l.sourceId,
            externalId: l.externalId,
            pinUuid: null,
            title: l.title.slice(0, MAX_TITLE_LENGTH),
            price: l.price,
            currency: l.currency,
            soldDate: l.soldDate,
            lastSeenAt: seenAt,
            rejectionReason: null,
            matchScore: null,
            setHint: set.setName,
          });
        }
      } catch (err) {
        searchesFailed += 1;
        if (err instanceof BudgetExceededError) stoppedBy = "budget";
        else if (err instanceof ProviderDisabledError) stoppedBy = "disabled";
        else if (err instanceof ProviderUnavailableError) stoppedBy = "unavailable";
        if (stoppedBy) break outer;
      }
    }
  }

  let budgetAfter: BudgetStatus | undefined;
  try {
    budgetAfter = await deps.refreshStore.budget(monthOf(deps.now));
  } catch {
    budgetAfter = undefined;
  }
  return {
    ...base,
    applied: true,
    listings,
    searchesRun,
    searchesFailed,
    creditsSpent: run.spent(),
    ...(stoppedBy ? { stoppedBy } : {}),
    ...(budgetAfter ? { budgetAfter } : {}),
  };
}
