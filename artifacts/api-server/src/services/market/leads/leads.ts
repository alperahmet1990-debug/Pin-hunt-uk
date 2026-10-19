/**
 * Marketplace leads for catalogue research (SG-10, #415). Pure functions:
 * no database, no network.
 *
 * Input: market listings the valuation refresh already stored (SG-06) as
 * near misses (same kind of pin, but a different variant, year or edition
 * size), plus, only when the maintainer runs the optional set probe, the
 * listings that probe returned in memory.
 *
 * Output: a standard `pinhunt-research-run/v1` payload (validated by
 * validateResearchRun) that the maintainer loads through the existing
 * Admin → Research Review → "Load research run". It never writes pins or
 * pin_sets, and it never creates a new review path:
 *
 *   - every candidate is at most Low confidence, so it can never be approved
 *     as it stands (checkDecision needs High or Medium);
 *   - every evidence row is lead-only (`unclassified`, `search_snippet`,
 *     no source URL), so it can never count as verification;
 *   - discrepancy checks carry duplicate_pinhunt_id, so they show as a
 *     conflict against the existing pin and can never be imported (045's
 *     candidate_import_creates_new_pin and the import judge both refuse).
 *
 * What leaves this module is title-derived only: short consensus title
 * words, well-known character names, a series guess, edition size, edition
 * type, year and variant word. No listing titles, seller names, descriptions,
 * images or listing links.
 */
import { createHash } from "node:crypto";
import type { CataloguePin, PinSetSummary } from "@workspace/pin-repository";
import { RESEARCH_RUN_FORMAT, type Confidence } from "../../../lib/research-run";
import { storedSourceClass } from "../../../lib/source-registry";
import { matchListing, normaliseTitle, parseAttributes, type ParsedAttributes, type RejectionReason } from "../matching";
import { NEAR_MISS_REASONS } from "../refresh/refresh";

export const LEADS_ENGINE_VERSION = "marketplace-leads/1";

export const DEFAULT_WINDOW_DAYS = 180;
export const DEFAULT_MIN_LISTINGS = 3;
export const DEFAULT_MIN_MARKETPLACES = 2;
/** A lead is never a single listing, whatever the options say. */
export const MIN_CLUSTER_SIZE = 2;
/** Lead scores at or above this map to Low; below it, Unverified. Never higher. */
export const LOW_CONFIDENCE_SCORE = 60;

const DAY_MS = 86_400_000;
const MAX_TITLE_WORDS = 12;
const MAX_TITLE_WORDS_CHARS = 120;
const MAX_NOTE = 240;
const MAX_PUBLISHER = 200;
const MAX_CANDIDATES = 2000;
const CATALOGUE_CHECKS_PER_LISTING = 40;
const MISSING_PIN_SIMILARITY = 0.5;

/** One market_sources row, as the leads need it. */
export interface LeadSource {
  id: string;
  /** market_sources.marketplace, e.g. "ebay". */
  marketplace: string;
  /** "UK" | "US" | "FR". */
  market: string;
}

/**
 * A listing the leads may use. Stored rows come from market_listings; probe
 * rows exist only in memory and have no pin.
 */
export interface LeadListing {
  sourceId: string;
  externalId: string;
  /** market_listings.pin_id (the pin that was searched); null for probe rows. */
  pinUuid: string | null;
  /** Read in memory to re-parse; never copied to the output. */
  title: string;
  price: number | null;
  currency: string;
  soldDate: string | null;
  lastSeenAt: string;
  rejectionReason: string | null;
  matchScore: number | null;
  /** Set probe only: the set searched for. */
  setHint?: string;
}

/** A live catalogue pin; `pin.id` is the pinhunt_id. */
export interface CatalogueEntry {
  pinhuntId: string;
  pin: CataloguePin;
}

export interface LeadOptions {
  windowDays: number;
  minListings: number;
  minMarketplaces: number;
}

export interface LeadsInput {
  listings: LeadListing[];
  sources: LeadSource[];
  /** Live (non-archived) catalogue: the "is it already catalogued" check. */
  catalogue: CatalogueEntry[];
  /** The pins listings were stored against, by pins.id (UUID). */
  anchors: Map<string, CatalogueEntry>;
  sets: PinSetSummary[];
  options: LeadOptions;
  now: number;
  gitCommit: string;
}

export type LeadKind = "variant" | "base_pin" | "edition_size" | "edition_type" | "release_year" | "missing_pin";
export type IgnoredReason = "outside_window" | "duplicate_listing" | "not_a_pin" | "bundle" | "set_listing" | "no_anchor";

export interface LeadsStats {
  listingsRead: number;
  ignored: Record<IgnoredReason, number>;
  alreadyCatalogued: number;
  clusters: number;
  belowThreshold: { clusters: number; listings: number };
  leads: Record<LeadKind, number>;
  setCandidates: number;
  evidenceRows: number;
}

export interface LeadsResult {
  /** null when there is no lead (an empty run would not validate). */
  run: ResearchRunPayload | null;
  stats: LeadsStats;
}

export interface EvidenceOut {
  field: string;
  value: unknown;
  source_url: null;
  publisher: string;
  source_class: "unclassified";
  method: "search_snippet";
  note: string;
  claim_ref: string;
}

export interface CandidateOut {
  research_key: string;
  entity_type: "pin" | "set";
  set_research_key: string | null;
  proposed: Record<string, unknown>;
  record_confidence: Extract<Confidence, "Low" | "Unverified">;
  engine_verified: false;
  review_reasons: string[];
  warnings: string[];
  duplicate_status: string;
  duplicate_pinhunt_id: string | null;
  evidence: EvidenceOut[];
}

export interface ResearchRunPayload {
  format: typeof RESEARCH_RUN_FORMAT;
  engine_version: typeof LEADS_ENGINE_VERSION;
  git_commit: string;
  generated: string;
  note: string;
  parameters: Record<string, number>;
  candidates: CandidateOut[];
}

// ─── Text helpers ────────────────────────────────────────────────────────────

/** Words that say nothing about which pin a listing is (EN and FR). */
const STOP = new Set([
  "disney", "disneyland", "pin", "pins", "badge", "badges", "broche", "the", "and", "for", "with", "from",
  "new", "rare", "htf", "official", "authentic", "genuine", "original", "nwt", "bnwt", "bnib", "mint", "card",
  "backing", "free", "postage", "shipping", "fast", "uk", "usa", "limited", "edition", "release", "series",
  "collection", "trading", "trade", "park", "parks", "resort", "sold", "out", "vintage", "brand",
  "des", "les", "pour", "avec", "sur", "neuf", "tres", "une", "dans", "serie", "edition", "limitee",
]);

/** Distinctive normalised words of a title, in title order. */
export function titleTokens(normalised: string): string[] {
  const out: string[] = [];
  for (const t of normalised.split(" ")) {
    if (t.length < 3 || t.length > 20 || /^\d+$/.test(t) || STOP.has(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Lower-case a-z0-9 words joined by "-", for research keys. */
export function slug(s: string, max = 40): string {
  const out = normaliseTitle(s).replace(/ /g, "-").slice(0, max).replace(/-+$/g, "");
  return out || "lead";
}

const hashOf = (parts: string[]) => createHash("sha256").update(parts.join("\n")).digest("hex");

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const MARKETPLACE_NAMES: Record<string, string> = { ebay: "eBay", vinted: "Vinted", whatnot: "Whatnot", mercari: "Mercari" };

/** "eBay UK" for display; never a URL. */
export function sourceLabel(src: LeadSource | undefined, sourceId: string): string {
  if (!src) return sourceId.replace(/[^a-z0-9_:]/gi, "").slice(0, 60);
  const name = MARKETPLACE_NAMES[src.marketplace] ?? src.marketplace;
  return `${name} ${src.market}`;
}

// ─── Observations ────────────────────────────────────────────────────────────

interface Observation {
  key: string;
  sourceId: string;
  at: number;
  price: number | null;
  currency: string;
  parsed: ParsedAttributes;
  tokens: Set<string>;
  tokenList: string[];
  kind: LeadKind;
  anchor?: CatalogueEntry;
  /** The variant word, year, size or edition type that differs from the anchor. */
  attr?: string;
  setHint?: string;
}

function listingTime(l: LeadListing): number {
  const t = Date.parse(l.soldDate ?? l.lastSeenAt);
  return Number.isFinite(t) ? t : NaN;
}

const KIND_BY_REASON: Partial<Record<RejectionReason, LeadKind>> = {
  variant_not_in_record: "variant",
  variant_missing: "base_pin",
  edition_size_conflict: "edition_size",
  edition_kind_conflict: "edition_type",
  year_conflict: "release_year",
};

/** Catalogue pins sharing words with a listing, most shared first. */
class CatalogueIndex {
  private readonly byToken = new Map<string, number[]>();

  constructor(private readonly entries: CatalogueEntry[]) {
    entries.forEach((e, i) => {
      const p = e.pin;
      const text = normaliseTitle([p.title, p.collection, p.searchAliases, p.mainCharacter, ...(p.characters ?? [])].filter(Boolean).join(" "));
      for (const t of titleTokens(text)) {
        const list = this.byToken.get(t);
        if (list) list.push(i);
        else this.byToken.set(t, [i]);
      }
    });
  }

  /** True when some live catalogue pin accepts this title (v2 rules). */
  accepts(title: string, tokens: string[]): boolean {
    const shared = new Map<number, number>();
    for (const t of tokens) for (const i of this.byToken.get(t) ?? []) shared.set(i, (shared.get(i) ?? 0) + 1);
    const ranked = [...shared.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, CATALOGUE_CHECKS_PER_LISTING);
    return ranked.some(([i]) => matchListing(this.entries[i].pin, title, { mode: "v2" }).accepted);
  }
}

// ─── Anchor check ────────────────────────────────────────────────────────────

const VARIANT_WORDS: Record<string, string> = {
  pin_on_pin: "pin on pin", limited_release: "limited release", artist_proof: "artist proof",
  pin_traders_delight: "pin traders delight", hidden_mickey: "hidden mickey",
};
const variantText = (v: string) => VARIANT_WORDS[v] ?? v;

/**
 * Is this listing about the anchor pin, differing in exactly one attribute?
 * The record is given the listing's value for the attribute v2 rejected on
 * (edition size, edition type, year or variant word) and matched again: the
 * listing is about that pin only if it is then accepted. Anything else (two
 * differences, or a name that never matched) is a possibly different pin.
 */
export function anchorDifference(
  pin: CataloguePin,
  title: string,
  parsed: ParsedAttributes,
): "accepted" | { kind: LeadKind; attr: string } | null {
  const m = matchListing(pin, title, { mode: "v2" });
  if (m.accepted) return "accepted";
  const reason = m.rejectionReason;
  if (!reason || !NEAR_MISS_REASONS.has(reason)) return null;
  const kind = KIND_BY_REASON[reason];
  if (!kind) return null;
  let neutral: CataloguePin;
  let attr: string;
  switch (reason) {
    case "edition_size_conflict":
      if (parsed.editionSize === undefined) return null;
      neutral = { ...pin, limitedEditionSize: parsed.editionSize };
      attr = String(parsed.editionSize);
      break;
    case "edition_kind_conflict":
      if (!parsed.editionKind) return null;
      neutral = { ...pin, edition: undefined, limitedEditionSize: undefined };
      attr = parsed.editionKind;
      break;
    case "year_conflict": {
      const year = Number(m.rejectionDetail);
      if (!Number.isInteger(year)) return null;
      neutral = { ...pin, releaseYear: year };
      attr = String(year);
      break;
    }
    case "variant_not_in_record":
      neutral = { ...pin, description: [pin.description, ...parsed.variantTerms.map(variantText)].filter(Boolean).join(" ") };
      attr = String(m.rejectionDetail ?? "");
      break;
    default: {
      // variant_missing: the record is a variant (e.g. jumbo); the listing is not.
      const word = variantText(String(m.rejectionDetail ?? ""));
      const stripped = pin.title.replace(new RegExp(`\\b${word.replace(/ /g, "\\s+")}\\b`, "i"), " ").replace(/\s+/g, " ").trim();
      if (!word || stripped === pin.title) return null;
      neutral = { ...pin, title: stripped };
      attr = String(m.rejectionDetail ?? "");
    }
  }
  return matchListing(neutral, title, { mode: "v2" }).accepted ? { kind, attr } : null;
}

// ─── Clusters ────────────────────────────────────────────────────────────────

interface Cluster {
  kind: LeadKind;
  anchor?: CatalogueEntry;
  attr?: string;
  members: Observation[];
  seed: Observation;
}

/** Year, edition size, named characters and variant words must not contradict each other. */
function compatible(a: ParsedAttributes, b: ParsedAttributes): boolean {
  if (a.year !== undefined && b.year !== undefined && a.year !== b.year) return false;
  if (a.editionSize !== undefined && b.editionSize !== undefined && a.editionSize !== b.editionSize) return false;
  if (a.charactersGuess.length && b.charactersGuess.length && !a.charactersGuess.some(c => b.charactersGuess.includes(c))) return false;
  return [...a.variantTerms].sort().join(",") === [...b.variantTerms].sort().join(",");
}

function cluster(observations: Observation[]): Cluster[] {
  const anchored = new Map<string, Cluster>();
  const missing: Cluster[] = [];
  for (const o of observations) {
    if (o.kind !== "missing_pin" && o.anchor) {
      const k = `${o.anchor.pinhuntId}|${o.kind}|${o.attr ?? ""}`;
      const c = anchored.get(k);
      if (c) c.members.push(o);
      else anchored.set(k, { kind: o.kind, anchor: o.anchor, attr: o.attr, members: [o], seed: o });
      continue;
    }
    // Possibly a different pin: group by title words, never across a
    // contradicting year, edition size, variant word or probed set.
    const home = missing.find(c =>
      (c.seed.setHint ?? "") === (o.setHint ?? "") &&
      c.members.every(m => compatible(m.parsed, o.parsed)) &&
      jaccard(c.seed.tokens, o.tokens) >= MISSING_PIN_SIMILARITY);
    if (home) home.members.push(o);
    else missing.push({ kind: "missing_pin", members: [o], seed: o });
  }
  return [...anchored.values(), ...missing];
}

interface Consensus<T> {
  value?: T;
  /** Members stated more than one value for this field. */
  varies: boolean;
}

/** The value most members state, when it is a strict majority of those stating one. */
function consensus<T>(values: Array<T | undefined>, key: (v: T) => string = v => String(v)): Consensus<T> {
  const counts = new Map<string, { v: T; n: number }>();
  let stated = 0;
  for (const v of values) {
    if (v === undefined) continue;
    stated += 1;
    const k = key(v);
    const c = counts.get(k);
    if (c) c.n += 1;
    else counts.set(k, { v, n: 1 });
  }
  if (stated === 0) return { varies: false };
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
  const varies = ranked.length > 1;
  return ranked[0].n * 2 > stated ? { value: ranked[0].v, varies } : { varies };
}

/** Words in at least half the titles, in the seed title's order, capped. */
function consensusWords(c: Cluster): string {
  const need = Math.ceil(c.members.length / 2);
  const words = c.seed.tokenList.filter(t => c.members.filter(m => m.tokens.has(t)).length >= need).slice(0, MAX_TITLE_WORDS);
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > MAX_TITLE_WORDS_CHARS) break;
    out = next;
  }
  return out;
}

/** 0–100 from cluster size, number of sites, recency and title agreement. */
export function leadScore(c: { members: Array<{ sourceId: string; at: number; tokens: Set<string> }>; seedTokens: Set<string> }, now: number): number {
  const n = c.members.length;
  const sites = new Set(c.members.map(m => m.sourceId)).size;
  const newest = Math.max(...c.members.map(m => m.at));
  const ageDays = (now - newest) / DAY_MS;
  const agreement = c.members.reduce((s, m) => s + jaccard(m.tokens, c.seedTokens), 0) / n;
  const size = (Math.min(n, 10) / 10) * 35;
  const spread = sites >= 3 ? 20 : sites === 2 ? 15 : 0;
  const recency = ageDays <= 30 ? 20 : ageDays <= 90 ? 12 : 5;
  return Math.max(0, Math.min(100, Math.round(size + spread + recency + agreement * 25)));
}

export const confidenceFor = (score: number): "Low" | "Unverified" => (score >= LOW_CONFIDENCE_SCORE ? "Low" : "Unverified");

// ─── Known sets ──────────────────────────────────────────────────────────────

interface KnownSet {
  name: string;
  words: string[];
  expected?: number;
  known: number;
}

function knownSets(sets: PinSetSummary[], catalogue: CatalogueEntry[]): KnownSet[] {
  const countBy = new Map<string, number>();
  for (const e of catalogue) {
    const k = normaliseTitle(e.pin.collection ?? "");
    if (k) countBy.set(k, (countBy.get(k) ?? 0) + 1);
  }
  const out = new Map<string, KnownSet>();
  for (const s of sets) {
    const norm = normaliseTitle(s.setName);
    const words = titleTokens(norm);
    if (words.length === 0) continue;
    out.set(norm, { name: s.setName, words, expected: s.expectedPinCount, known: countBy.get(norm) ?? 0 });
  }
  for (const e of catalogue) {
    const name = e.pin.collection;
    const norm = normaliseTitle(name ?? "");
    if (!name || out.has(norm)) continue;
    const words = titleTokens(norm);
    if (words.length >= 2) out.set(norm, { name, words, known: countBy.get(norm) ?? 0 });
  }
  return [...out.values()];
}

/** A known set whose distinctive words all appear in the lead's words or series guess. */
function matchKnownSet(words: Set<string>, series: string | undefined, setHint: string | undefined, sets: KnownSet[]): KnownSet | undefined {
  if (setHint) {
    const n = normaliseTitle(setHint);
    const hit = sets.find(s => normaliseTitle(s.name) === n);
    if (hit) return hit;
  }
  const pool = new Set([...words, ...titleTokens(normaliseTitle(series ?? ""))]);
  return sets
    .filter(s => s.words.length >= 1 && s.words.every(w => pool.has(w)))
    .sort((a, b) => b.words.length - a.words.length)[0];
}

// ─── Build ───────────────────────────────────────────────────────────────────

const LEAD_TYPE: Record<LeadKind, string> = {
  variant: "Possible variant of a catalogue pin",
  base_pin: "Possible base pin of a catalogue variant",
  edition_size: "Edition size check",
  edition_type: "Edition type check",
  release_year: "Release year check",
  missing_pin: "Possible missing pin",
};

const KIND_SLUG: Record<LeadKind, string> = {
  variant: "variant",
  base_pin: "base-pin",
  edition_size: "discrepancy-edition-size",
  edition_type: "discrepancy-edition-type",
  release_year: "discrepancy-release-year",
  missing_pin: "missing-pin",
};

const DISCREPANCY: Partial<Record<LeadKind, { reason: string; label: string; current: (p: CataloguePin) => unknown }>> = {
  edition_size: { reason: "discrepancy:edition_size", label: "Catalogue edition size", current: p => p.limitedEditionSize ?? null },
  edition_type: { reason: "discrepancy:edition_type", label: "Catalogue edition type", current: p => p.edition ?? null },
  release_year: { reason: "discrepancy:release_year", label: "Catalogue release year", current: p => p.releaseYear ?? null },
};

const emptyStats = (): LeadsStats => ({
  listingsRead: 0,
  ignored: { outside_window: 0, duplicate_listing: 0, not_a_pin: 0, bundle: 0, set_listing: 0, no_anchor: 0 },
  alreadyCatalogued: 0,
  clusters: 0,
  belowThreshold: { clusters: 0, listings: 0 },
  leads: { variant: 0, base_pin: 0, edition_size: 0, edition_type: 0, release_year: 0, missing_pin: 0 },
  setCandidates: 0,
  evidenceRows: 0,
});

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Turns stored near misses (and probe rows) into a research-run payload. */
export function buildLeads(input: LeadsInput): LeadsResult {
  const { options, now } = input;
  const stats = emptyStats();
  stats.listingsRead = input.listings.length;
  const sources = new Map(input.sources.map(s => [s.id, s]));
  const since = now - options.windowDays * DAY_MS;

  // 1. Inside the window, one row per marketplace item (the closest match wins).
  const byItem = new Map<string, LeadListing>();
  for (const l of input.listings) {
    const at = listingTime(l);
    if (!Number.isFinite(at) || at < since || at > now + DAY_MS) { stats.ignored.outside_window += 1; continue; }
    const key = `${l.sourceId}|${l.externalId}`;
    const prev = byItem.get(key);
    if (prev) {
      stats.ignored.duplicate_listing += 1;
      if ((l.matchScore ?? -Infinity) <= (prev.matchScore ?? -Infinity)) continue;
    }
    byItem.set(key, l);
  }

  // 2. Parse, drop bundles and sets, drop what the catalogue already has, classify.
  const index = new CatalogueIndex(input.catalogue);
  const observations: Observation[] = [];
  for (const [key, l] of byItem) {
    const parsed = parseAttributes(l.title);
    if (parsed.excludedTerms.length > 0 || !parsed.isPin) { stats.ignored.not_a_pin += 1; continue; }
    if (parsed.bundleTerms.length > 0) { stats.ignored.bundle += 1; continue; }
    const completeSet = parsed.completenessTerms.some(t => t !== "sealed");
    if (parsed.setTerms.length > 0 || (parsed.itemCount !== undefined && parsed.itemCount > 1) || completeSet) {
      stats.ignored.set_listing += 1;
      continue;
    }
    const tokenList = titleTokens(parsed.normalised);
    if (index.accepts(l.title, tokenList)) { stats.alreadyCatalogued += 1; continue; }

    const base = {
      key, sourceId: l.sourceId, at: listingTime(l), price: l.price, currency: l.currency,
      parsed, tokens: new Set(tokenList), tokenList, setHint: l.setHint,
    };
    const anchor = l.pinUuid ? input.anchors.get(l.pinUuid) : undefined;
    if (l.pinUuid && !anchor) { stats.ignored.no_anchor += 1; continue; }
    if (!anchor) { observations.push({ ...base, kind: "missing_pin" }); continue; }
    const diff = anchorDifference(anchor.pin, l.title, parsed);
    if (diff === "accepted") { stats.alreadyCatalogued += 1; continue; }
    if (!diff) { observations.push({ ...base, kind: "missing_pin" }); continue; }
    observations.push({ ...base, kind: diff.kind, anchor, attr: diff.attr });
  }

  // 3. Cluster and apply the lead threshold.
  const clusters = cluster(observations);
  stats.clusters = clusters.length;
  const kept = clusters.filter(c => {
    const sites = new Set(c.members.map(m => m.sourceId)).size;
    const ok = c.members.length >= MIN_CLUSTER_SIZE &&
      (c.members.length >= options.minListings || sites >= options.minMarketplaces);
    if (!ok) { stats.belowThreshold.clusters += 1; stats.belowThreshold.listings += c.members.length; }
    return ok;
  });

  // 4. Candidates.
  const sets = knownSets(input.sets, input.catalogue);
  const pins: CandidateOut[] = [];
  const newSets = new Map<string, { series: string; keys: string[]; score: number; members: Observation[] }>();
  for (const c of kept) {
    const built = buildPinCandidate(c, sources, sets, now);
    pins.push(built.candidate);
    stats.leads[c.kind] += 1;
    if (built.newSeries) {
      const k = normaliseTitle(built.newSeries);
      const entry = newSets.get(k) ?? { series: built.newSeries, keys: [], score: 0, members: [] };
      entry.keys.push(built.candidate.research_key);
      entry.score = Math.max(entry.score, built.score);
      entry.members.push(...c.members);
      newSets.set(k, entry);
    }
  }

  // A series no known set has, named by two or more missing-pin leads, becomes a set lead.
  const setCands: CandidateOut[] = [];
  for (const s of newSets.values()) {
    if (s.keys.length < 2) continue;
    const key = `marketplace-leads/set/${slug(s.series)}-${hashOf(s.keys).slice(0, 6)}`;
    for (const p of pins) if (s.keys.includes(p.research_key)) p.set_research_key = key;
    const prov = provenance(s.members, sources, s.score, hashOf(s.keys));
    setCands.push({
      research_key: key,
      entity_type: "set",
      set_research_key: null,
      proposed: { "Lead type": "Possible set", "Series (from listing titles)": s.series, "Pin leads": s.keys.length, "Lead score": s.score },
      record_confidence: "Unverified",
      engine_verified: false,
      review_reasons: ["marketplace_lead", "possible_set", `lead_score:${s.score}`],
      warnings: ["lead_only: marketplace listing titles; confirm with an official or news source"],
      duplicate_status: "NEW (marketplace lead)",
      duplicate_pinhunt_id: null,
      evidence: [evidence("series", s.series, prov)],
    });
  }
  stats.setCandidates = setCands.length;

  const candidates = [...setCands, ...pins.sort((a, b) => leadScoreOf(b) - leadScoreOf(a))].slice(0, MAX_CANDIDATES);
  stats.evidenceRows = candidates.reduce((n, c) => n + c.evidence.length, 0);
  if (candidates.length === 0) return { run: null, stats };
  return {
    run: {
      format: RESEARCH_RUN_FORMAT,
      engine_version: LEADS_ENGINE_VERSION,
      git_commit: input.gitCommit,
      generated: isoDay(now),
      note: "Marketplace leads: title-derived, lead-only evidence (never verification). Every candidate needs official or news research before any catalogue change.",
      parameters: {
        window_days: options.windowDays,
        min_listings: options.minListings,
        min_marketplaces: options.minMarketplaces,
      },
      candidates,
    },
    stats,
  };
}

const leadScoreOf = (c: CandidateOut) => Number(c.proposed["Lead score"] ?? 0);

interface Provenance {
  publisher: string;
  note: string;
  claimRef: string;
}

function provenance(members: Observation[], sources: Map<string, LeadSource>, score: number, hash: string): Provenance {
  const labels = [...new Set(members.map(m => sourceLabel(sources.get(m.sourceId), m.sourceId)))].sort();
  const times = members.map(m => m.at);
  const byCurrency = new Map<string, number[]>();
  for (const m of members) {
    if (m.price === null || !Number.isFinite(m.price) || !/^[A-Z]{3}$/.test(m.currency)) continue;
    byCurrency.set(m.currency, [...(byCurrency.get(m.currency) ?? []), m.price]);
  }
  const medians = [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([cur, xs]) => `${cur} ${median(xs).toFixed(2)}`).join(", ");
  const note = [
    `Lead only, not verification. ${members.length} listing(s) on ${labels.length} site(s)`,
    `${isoDay(Math.min(...times))} to ${isoDay(Math.max(...times))}`,
    medians ? `median ${medians}` : "",
    `lead score ${score}/100`,
  ].filter(Boolean).join("; ");
  return {
    publisher: `Soldgraph: ${labels.join(", ")}`.slice(0, MAX_PUBLISHER),
    note: `${note}.`.slice(0, MAX_NOTE),
    claimRef: `mkt-${hash.slice(0, 12)}`,
  };
}

function evidence(field: string, value: unknown, prov: Provenance): EvidenceOut {
  return {
    field,
    value,
    source_url: null,
    publisher: prov.publisher,
    // Marketplaces are lead_only in the source registry; stored as unclassified.
    source_class: storedSourceClass("lead_only") as "unclassified",
    method: "search_snippet",
    note: prov.note,
    claim_ref: prov.claimRef,
  };
}

const VARIANT_LABEL = (v: string) => v.replace(/_/g, " ");

function buildPinCandidate(
  c: Cluster,
  sources: Map<string, LeadSource>,
  sets: KnownSet[],
  now: number,
): { candidate: CandidateOut; score: number; newSeries?: string } {
  const hash = hashOf(c.members.map(m => m.key).sort());
  const score = leadScore({ members: c.members, seedTokens: c.seed.tokens }, now);
  const prov = provenance(c.members, sources, score, hash);

  const words = consensusWords(c);
  const chars = consensus(c.members.map(m => (m.parsed.charactersGuess.length ? [...m.parsed.charactersGuess].sort() : undefined)), v => v.join("|"));
  const series = consensus(c.members.map(m => m.parsed.seriesGuess));
  const size = consensus(c.members.map(m => m.parsed.editionSize));
  const kindE = consensus(c.members.map(m => m.parsed.editionKind));
  const year = consensus(c.members.map(m => m.parsed.year));
  const variant = consensus(c.members.map(m => (m.parsed.variantTerms.length ? [...m.parsed.variantTerms].sort() : undefined)), v => v.join("|"));

  const warnings = ["lead_only: marketplace listing titles; confirm with an official or news source"];
  const varies: Array<[string, Consensus<unknown>]> = [
    ["characters", chars], ["series", series], ["edition_size", size], ["edition_type", kindE], ["release_year", year], ["variant", variant],
  ];
  for (const [f, v] of varies) if (v.varies) warnings.push(`variants: ${f}`);

  const proposed: Record<string, unknown> = { "Lead type": LEAD_TYPE[c.kind] };
  const ev: EvidenceOut[] = [];
  const add = (label: string, field: string, value: unknown) => {
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return;
    proposed[label] = Array.isArray(value) ? value.join("; ") : value;
    ev.push(evidence(field, value, prov));
  };
  add("Title words", "title_words", words);
  add("Characters", "characters", chars.value);
  add("Series", "series", series.value);
  add("Edition size", "edition_size", size.value);
  add("Edition type", "edition_type", kindE.value);
  add("Release year", "release_year", year.value);
  add("Variant", "variant", variant.value?.map(VARIANT_LABEL));

  const reasons = ["marketplace_lead", `lead_score:${score}`];
  let duplicateStatus = "NEW (marketplace lead)";
  let duplicateId: string | null = null;
  let newSeries: string | undefined;
  let base: string;

  if (c.anchor) {
    const id = c.anchor.pinhuntId;
    proposed["Catalogue pin"] = id;
    base = `${id}-${c.attr ?? ""}`;
    const d = DISCREPANCY[c.kind];
    if (d) {
      reasons.push(d.reason);
      proposed[d.label] = d.current(c.anchor.pin);
      duplicateStatus = "DUPLICATE (marketplace discrepancy check)";
      duplicateId = id;
    } else if (c.kind === "variant") {
      reasons.push(`possible_variant_of:${id}`);
      if (c.attr) reasons.push(`variant:${c.attr}`);
      duplicateStatus = `NEW (possible variant of ${id})`;
    } else {
      reasons.push(`possible_base_of:${id}`);
      duplicateStatus = `NEW (possible base pin of ${id})`;
    }
  } else {
    reasons.push("possible_missing_pin");
    base = words || "lead";
    const hints = new Set(c.members.map(m => m.setHint).filter((h): h is string => !!h));
    const hint = hints.size === 1 ? [...hints][0] : undefined;
    const set = matchKnownSet(c.seed.tokens, series.value, hint, sets);
    if (set) {
      proposed["Possible set"] = set.name;
      reasons.push(`possible_set_member:${set.name.slice(0, 200)}`);
      if (set.expected !== undefined && set.known < set.expected) reasons.push(`set_gap:${set.known}/${set.expected}`);
    } else if (series.value) {
      newSeries = series.value;
    }
  }
  proposed["Lead score"] = score;
  proposed["Listings"] = c.members.length;
  proposed["Marketplaces"] = prov.publisher.replace(/^Soldgraph: /, "");

  return {
    score,
    newSeries,
    candidate: {
      research_key: `marketplace-leads/${KIND_SLUG[c.kind]}/${slug(base)}-${hash.slice(0, 6)}`,
      entity_type: "pin",
      set_research_key: null,
      proposed,
      record_confidence: confidenceFor(score),
      engine_verified: false,
      review_reasons: reasons,
      warnings,
      duplicate_status: duplicateStatus,
      duplicate_pinhunt_id: duplicateId,
      evidence: ev,
    },
  };
}
