/**
 * Entry point for scripts/marketplace-leads.mjs (SG-10, #415). The script
 * parses arguments first, passes the staging guard, builds the Supabase
 * client and then calls `executeLeadsCli`.
 *
 * By default it only READS stored market_listings near misses and the
 * catalogue, and makes no provider call. With --out it writes a
 * pinhunt-research-run/v1 file on the maintainer's machine (outside the
 * repository) for Admin → Research Review → "Load research run".
 *
 * Terminal output is counts only: never listing titles, links, seller data
 * or keys.
 */
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateResearchRun } from "../../../lib/research-run";
import type { SoldgraphClient, SoldgraphLogger } from "../../soldgraph/client";
import { createSoldgraphClientFromEnv } from "../../soldgraph/factory";
import { REFRESH_SOURCE_IDS } from "../refresh/sources";
import { SupabaseRefreshStore } from "../refresh/store";
import type { RefreshStore } from "../refresh/types";
import { formatBudget } from "../refresh/cli";
import {
  DEFAULT_MIN_LISTINGS,
  DEFAULT_MIN_MARKETPLACES,
  DEFAULT_WINDOW_DAYS,
  MIN_CLUSTER_SIZE,
  buildLeads,
  type LeadListing,
  type LeadsStats,
} from "./leads";
import { DEFAULT_PROBE_SETS, MAX_PROBE_SETS, runSetProbe, setsWithGaps, type SetProbeResult } from "./probe";
import { SupabaseLeadsStore, type LeadsStore } from "./store";

export class LeadsUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadsUsageError";
  }
}

export interface LeadsCliOptions {
  /** Where to write the research-run file; null = report only. */
  out: string | null;
  windowDays: number;
  minListings: number;
  minMarketplaces: number;
  /** Only stored listings from these sources; null = all. */
  sources: string[] | null;
  gitCommit: string | null;
  probeSets: boolean;
  maxProbeSets: number;
  probeSources: string[];
  apply: boolean;
  confirmCredits: number | null;
}

const SOURCE_ID_RE = /^[a-z0-9_]+:[a-z0-9_]+$/;
const DAY_MS = 86_400_000;

function int(flag: string, v: string | undefined, min: number, max: number): number {
  const n = Number(v);
  if (v === undefined || !Number.isInteger(n) || n < min || n > max) {
    throw new LeadsUsageError(`${flag} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

function list(flag: string, v: string | undefined, allowed?: readonly string[]): string[] {
  const items = [...new Set(String(v ?? "").split(",").map(s => s.trim()).filter(Boolean))];
  if (items.length === 0) throw new LeadsUsageError(`${flag} needs a comma-separated list.`);
  for (const id of items) {
    if (!SOURCE_ID_RE.test(id) || (allowed && !allowed.includes(id))) throw new LeadsUsageError(`${flag}: unknown source ${id}.`);
  }
  return items;
}

export function parseLeadsArgs(argv: string[]): LeadsCliOptions {
  const o: LeadsCliOptions = {
    out: null,
    windowDays: DEFAULT_WINDOW_DAYS,
    minListings: DEFAULT_MIN_LISTINGS,
    minMarketplaces: DEFAULT_MIN_MARKETPLACES,
    sources: null,
    gitCommit: null,
    probeSets: false,
    maxProbeSets: DEFAULT_PROBE_SETS,
    probeSources: [],
    apply: false,
    confirmCredits: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--probe-sets") { o.probeSets = true; continue; }
    if (flag === "--apply") { o.apply = true; continue; }
    const v = argv[++i];
    switch (flag) {
      case "--out":
        if (!v || !v.endsWith(".json")) throw new LeadsUsageError("--out needs a file name ending in .json.");
        o.out = v;
        break;
      case "--window-days": o.windowDays = int(flag, v, 1, 365); break;
      case "--min-listings": o.minListings = int(flag, v, MIN_CLUSTER_SIZE, 50); break;
      case "--min-marketplaces": o.minMarketplaces = int(flag, v, 2, 10); break;
      case "--sources": o.sources = list(flag, v); break;
      case "--git-commit":
        if (!v || !/^[0-9a-f]{7,40}$/.test(v)) throw new LeadsUsageError("--git-commit must be a 7–40 character hex commit id.");
        o.gitCommit = v;
        break;
      case "--max-probe-sets": o.maxProbeSets = int(flag, v, 1, MAX_PROBE_SETS); break;
      case "--probe-sources": o.probeSources = list(flag, v, REFRESH_SOURCE_IDS); break;
      case "--confirm-credits": o.confirmCredits = int(flag, v, 0, 1000); break;
      default:
        throw new LeadsUsageError(`Unknown flag ${flag}.`);
    }
  }
  if (o.apply && !o.probeSets) {
    throw new LeadsUsageError("--apply is only for --probe-sets. The leads report itself never writes to the database.");
  }
  if (o.probeSets && o.probeSources.length === 0) {
    throw new LeadsUsageError("--probe-sets needs --probe-sources (for example soldgraph:ebay_gb_sold).");
  }
  if ((o.maxProbeSets !== DEFAULT_PROBE_SETS || o.probeSources.length || o.confirmCredits !== null) && !o.probeSets) {
    throw new LeadsUsageError("--max-probe-sets, --probe-sources and --confirm-credits need --probe-sets.");
  }
  if (o.probeSets && o.apply && !o.out) {
    throw new LeadsUsageError("--probe-sets --apply needs --out: probe results are not stored, so write the leads in the same run.");
  }
  return o;
}

/** The client logs nothing to the terminal: its fields can include request ids. */
const quietLogger: SoldgraphLogger = { info() {}, warn() {}, error() {} };

export interface LeadsCliDeps {
  db?: SupabaseClient;
  /** Override db; for tests. */
  leadsStore?: LeadsStore;
  refreshStore?: Pick<RefreshStore, "loadSources" | "budget">;
  env: NodeJS.ProcessEnv;
  print: (line: string) => void;
  now?: () => number;
  /** Builds the Soldgraph client; only called for --probe-sets --apply. */
  createClient?: () => SoldgraphClient;
  /** Writes the run file. */
  writeFile: (file: string, text: string) => void;
  fileExists: (file: string) => boolean;
  /** Files inside this directory are refused, so a leads file is never committed. */
  repoRoot?: string;
}

export function formatStats(s: LeadsStats): string[] {
  const ig = s.ignored;
  return [
    `Listings read: ${s.listingsRead}`,
    `  ignored: ${ig.outside_window} outside the window, ${ig.duplicate_listing} duplicate, ${ig.not_a_pin} not a pin, ` +
      `${ig.bundle} bundle or lot, ${ig.set_listing} set or multi-pin, ${ig.no_anchor} pin no longer found`,
    `  already in the catalogue: ${s.alreadyCatalogued}`,
    `Clusters: ${s.clusters} (${s.belowThreshold.clusters} below the lead threshold, ${s.belowThreshold.listings} listing(s))`,
    `Leads: ${s.leads.missing_pin} possible missing pin(s), ${s.leads.variant} possible variant(s), ${s.leads.base_pin} possible base pin(s), ` +
      `${s.leads.edition_size} edition size check(s), ${s.leads.edition_type} edition type check(s), ${s.leads.release_year} release year check(s), ` +
      `${s.setCandidates} possible set(s)`,
    `Evidence rows: ${s.evidenceRows} (all lead-only: unclassified, search_snippet, no source link)`,
  ];
}

export function formatProbe(r: SetProbeResult): string[] {
  const p = r.plan;
  const out = [r.applied ? "Set probe: APPLY" : "Set probe: dry run (no provider calls)", formatBudget(p.budget)];
  if (p.missingSources.length) out.push(`  No market_sources row: ${p.missingSources.join(", ")}`);
  if (p.disabledSources.length) out.push(`  Not enabled in market_sources: ${p.disabledSources.join(", ")}`);
  if (p.sets.length === 0) out.push("  No catalogue set has fewer pins than expected.");
  for (const s of p.sets) out.push(`  ${s.setName}: ${s.known} of ${s.expected} known, ${s.searches.length} search(es)`);
  out.push(`Worst case: ${p.worstCaseCredits} credit(s) for ${p.uniqueSearches} search(es).`);
  if (p.overBudget) out.push(`OVER BUDGET: only ${p.remainingCredits} credit(s) left this month.`);
  if (r.blockers.length) {
    out.push("Not applied:");
    for (const b of r.blockers) out.push(`  - ${b}`);
  }
  if (!r.applied && !r.blockers.length) out.push(`To run it: add --apply --confirm-credits ${p.worstCaseCredits} (see MARKETPLACE-LEADS.md).`);
  if (r.applied) {
    out.push(`Probe: ${r.searchesRun} search(es) run, ${r.searchesFailed} failed, ${r.creditsSpent} credit(s) reserved, ${r.listings.length} listing(s) held in memory (not stored).`);
    if (r.stoppedBy) out.push(`Stopped early (${r.stoppedBy}).`);
    if (r.budgetAfter) out.push(`After: ${formatBudget(r.budgetAfter)}`);
  }
  return out;
}

/** Runs the leads report. Returns the process exit code. */
export async function executeLeadsCli(opts: LeadsCliOptions, d: LeadsCliDeps): Promise<number> {
  const now = (d.now ?? Date.now)();
  const store = d.leadsStore ?? (d.db ? new SupabaseLeadsStore(d.db) : null);
  if (!store) throw new Error("no database");
  if (!opts.gitCommit) throw new LeadsUsageError("No git commit: run from the repository, or pass --git-commit.");

  let outFile: string | null = null;
  if (opts.out) {
    outFile = path.resolve(opts.out);
    if (d.repoRoot) {
      const rel = path.relative(path.resolve(d.repoRoot), outFile);
      if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
        throw new LeadsUsageError("--out must be outside the repository, so a leads file is never committed.");
      }
    }
    if (d.fileExists(outFile)) throw new LeadsUsageError("--out file already exists; choose a new name.");
  }

  const nowIso = new Date(now).toISOString();
  const sinceIso = new Date(now - opts.windowDays * DAY_MS).toISOString();
  const [sources, stored, catalogue, sets] = await Promise.all([
    store.loadSources(),
    store.loadNearMisses(sinceIso, nowIso, opts.sources),
    store.loadCatalogue(),
    store.loadSets(),
  ]);
  d.print(`Marketplace leads (read-only): window ${opts.windowDays} days, lead = ${opts.minListings}+ listings or ${opts.minMarketplaces}+ sites.`);
  d.print(`Catalogue: ${catalogue.length} pin(s), ${sets.length} set record(s). Stored near misses: ${stored.length}.`);

  let listings: LeadListing[] = stored;
  if (opts.probeSets) {
    const refreshStore = d.refreshStore ?? (d.db ? new SupabaseRefreshStore(d.db, d.env) : null);
    if (!refreshStore) throw new Error("no database");
    const probe = await runSetProbe(setsWithGaps(sets, catalogue), {
      sources: opts.probeSources, maxSets: opts.maxProbeSets, apply: opts.apply, confirmCredits: opts.confirmCredits,
    }, {
      refreshStore,
      env: d.env,
      now,
      createClient: d.createClient ?? (() => createSoldgraphClientFromEnv(d.env, { logger: quietLogger })),
    });
    formatProbe(probe).forEach(l => d.print(l));
    if (opts.apply && !probe.applied) return 1;
    listings = [...stored, ...probe.listings];
  } else {
    d.print("No provider calls: stored listings only.");
  }

  const anchors = await store.loadAnchors([...new Set(listings.map(l => l.pinUuid).filter((x): x is string => !!x))]);
  const result = buildLeads({
    listings,
    sources,
    catalogue,
    anchors,
    sets,
    options: { windowDays: opts.windowDays, minListings: opts.minListings, minMarketplaces: opts.minMarketplaces },
    now,
    gitCommit: opts.gitCommit,
  });
  formatStats(result.stats).forEach(l => d.print(l));

  if (!result.run) {
    d.print("No leads: nothing to write.");
    return 0;
  }
  const check = validateResearchRun(result.run);
  if (!check.ok) {
    d.print("The leads file did not pass validateResearchRun; nothing written:");
    check.errors.slice(0, 20).forEach(e => d.print(`  - ${e}`));
    return 1;
  }
  d.print(`Validated: ${check.run.counts.pins} pin lead(s), ${check.run.counts.sets} set lead(s), ${check.run.counts.evidence} evidence row(s).`);
  if (!outFile) {
    d.print("Report only. Add --out <file outside the repo>.json to write the research-run file.");
    return 0;
  }
  d.writeFile(outFile, `${JSON.stringify(result.run, null, 2)}\n`);
  d.print(`Wrote ${outFile}. Load it with Admin → Research Review → Load research run.`);
  return 0;
}
