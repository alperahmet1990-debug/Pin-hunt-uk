/**
 * Listing matching — decides whether a marketplace listing title is the
 * same pin as a catalogue record, and how strongly.
 *
 * Two versions live here:
 *
 * - **v1** (`scoreListing`, `buildSearchQueries`): the original eBay Browse
 *   matcher, moved unchanged from valuation.ts. valuation.ts still uses it,
 *   and `matching.v1-regression.test.ts` pins its results.
 * - **v2** (`matchListing(pin, title, { mode: "v2" })`): adds release year,
 *   LE/LR/OE edition conflicts, variant terms, character and series
 *   evidence, French titles, and bundle / complete-set rules. Every
 *   rejection carries a stable machine-readable `rejectionReason`, and
 *   every result carries the parsed listing attributes. v2 is opt-in:
 *   `matchListing` defaults to v1.
 *
 * `normaliseTitle` and `parseAttributes` are exported for reuse by
 * catalogue research (SG-10). They are pure and need no catalogue record.
 */
import type { CataloguePin } from "@workspace/pin-repository";
import type { EbayListing } from "../ebay";
import { pinCharacterList, primaryCharacter } from "../catalogue-validation";

// ═══════════════════════════════════════════════════════════════════════════
// v1 — moved verbatim from valuation.ts. Do not change behaviour.
// ═══════════════════════════════════════════════════════════════════════════

/** Generate up to 3 distinct search queries from pin metadata. */
export function buildSearchQueries(pin: CataloguePin): string[] {
  const character = primaryCharacter(pin);
  const productCode =
    pin.externalIdentifiers?.sku ??
    pin.externalIdentifiers?.disneySku ??
    pin.externalIdentifiers?.fac;

  const candidates: string[] = [];

  // Most specific: brand + title + LE size
  const q1 = [
    "Disney",
    pin.brand !== "Disney" ? pin.brand : undefined,
    pin.title,
    "pin",
    pin.limitedEditionSize ? `LE ${pin.limitedEditionSize}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  candidates.push(q1);

  // Product code search when available — very high precision
  if (productCode) {
    candidates.push(`Disney pin ${productCode}`);
  }

  // Broader: character/collection oriented
  const q3 = [
    character,
    pin.collection && pin.collection !== pin.title ? pin.collection : undefined,
    "Disney pin",
    pin.releaseYear ? String(pin.releaseYear) : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  if (q3.trim().length > "Disney pin".length) candidates.push(q3);

  // Fallback broad title search
  candidates.push(`${pin.title} Disney pin`);

  // Dedupe (case/whitespace-insensitive), cap at 3
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const q of candidates) {
    const norm = q.toLowerCase().replace(/\s+/g, " ").trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    queries.push(q.replace(/\s+/g, " ").trim());
    if (queries.length === 3) break;
  }
  return queries;
}

export const BASE_EXCLUDE_TERMS = [
  "job lot",
  "bundle",
  "pin backs",
  "backing card only",
  "box only",
  "custom",
  "fantasy",
  "inspired",
  "scrapper",
  "fake",
  "replica",
  // Non-pin merchandise that often surfaces in keyword searches
  "lanyard",
  "keychain",
  "keyring",
  "plush",
  "t-shirt",
  "tshirt",
  "sweatshirt",
  "hoodie",
  "mug",
  "tumbler",
  "funko",
  "ears headband",
  "loungefly bag",
  "backpack",
  "wallet",
  "phone case",
  "sticker",
  "poster",
];

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9£$ ]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/** v1 rejection reasons (a subset of the v2 set, same meanings). */
type V1Outcome = { score: number | null; reason?: RejectionReason; detail?: string };

/** v1 scoring with the reason for each rejection. Same results as scoreListing. */
function scoreListingV1(pin: CataloguePin, listing: Pick<EbayListing, "title">): V1Outcome {
  const title = listing.title.toLowerCase();

  // Exclusions. "lot" is only excluded as a standalone word (avoid "Camelot").
  const isSetRecord = /\bset\b/i.test(pin.title) || /\bset\b/i.test(pin.collection ?? "");
  const isMysteryRecord = /mystery/i.test(pin.title) || /mystery/i.test(pin.collection ?? "");
  for (const term of BASE_EXCLUDE_TERMS) {
    if (title.includes(term)) return { score: null, reason: "excluded_term", detail: term };
  }
  if (/\blot\b/.test(title)) return { score: null, reason: "bundle", detail: "lot" };
  if (!isSetRecord && /\bset\b/.test(title) && !/\bset of 1\b/.test(title)) {
    // Listings selling whole sets aren't comparable to a single-pin record.
    return { score: null, reason: "complete_set", detail: "set" };
  }
  if (!isMysteryRecord && /\bmystery\b/.test(title)) {
    return { score: null, reason: "variant_not_in_record", detail: "mystery" };
  }

  // Must actually be a pin/badge listing.
  if (!/\bpins?\b|\bbadge\b/.test(title)) return { score: null, reason: "not_a_pin" };

  let score = 0;
  const titleTokens = new Set(tokenise(listing.title));

  // Pin name overlap (strongest signal)
  const nameTokens = tokenise(pin.title);
  const nameHits = nameTokens.filter(t => titleTokens.has(t)).length;
  const nameRatio = nameTokens.length > 0 ? nameHits / nameTokens.length : 0;
  if (nameTokens.length > 0) score += nameRatio * 50;

  // Conflicting edition size is disqualifying — different pin.
  const leInTitle = title.match(/\ble\s*(\d{2,6})\b/);
  if (pin.limitedEditionSize && leInTitle && Number(leInTitle[1]) !== pin.limitedEditionSize) {
    return { score: null, reason: "edition_size_conflict", detail: leInTitle[1] };
  }

  // Character conflict: if the record has characters and the listing names a
  // different well-known character but none of the record's, don't force it.
  const recordCharacters = pinCharacterList(pin);
  const hasRecordCharacter = recordCharacters.some(c => c && title.includes(c.toLowerCase()));

  // Series/edition discriminators — crucial for pins with generic names
  // (e.g. "Hatbox Ghost" exists across many series; only the collection and
  // edition words distinguish the right one).
  const GENERIC_TOKENS = new Set([
    "disney", "pin", "pins", "the", "and", "wave", "series", "edition",
    "open", "limited", "collection", "wdw", "dlr", "parks",
  ]);
  const discTokens = [
    ...tokenise(pin.collection ?? ""),
    ...tokenise(pin.edition ?? ""),
  ].filter(t => !GENERIC_TOKENS.has(t));
  const discHits = discTokens.filter(t => titleTokens.has(t)).length;
  score += Math.min(discHits, 3) * 8;

  // Generic-name guard: a short pin name that matches everything is not
  // enough on its own — require at least one series/edition word too.
  if (nameTokens.length <= 3 && discTokens.length >= 2 && discHits === 0) {
    return { score: null, reason: "generic_name_no_series" };
  }

  // Character match — merged junction + enriched character list
  for (const c of pinCharacterList(pin)) {
    if (c && title.includes(c.toLowerCase())) { score += 15; break; }
  }
  // Collection match
  if (pin.collection && title.includes(pin.collection.toLowerCase())) score += 10;
  // Manufacturer/brand match
  const maker = pin.manufacturer ?? pin.brand;
  if (maker && title.includes(maker.toLowerCase())) score += 10;
  // Edition size match
  if (pin.limitedEditionSize && new RegExp(`\\ble\\s*${pin.limitedEditionSize}\\b`).test(title)) {
    score += 15;
  }
  // Product code match
  const codes = Object.values(pin.externalIdentifiers ?? {}).filter(Boolean) as string[];
  if (codes.some(code => code.length >= 4 && title.includes(code.toLowerCase()))) score += 20;

  // Stricter acceptance: require genuine name overlap so keyword-adjacent
  // listings don't pollute the comparable pool. If the record has character
  // metadata, the listing must also mention one of them or match most of the
  // pin name — otherwise it's likely a different pin.
  if (nameRatio < 0.4) return { score: null, reason: "low_name_overlap" };
  if (recordCharacters.length > 0 && !hasRecordCharacter && nameRatio < 0.7) {
    return { score: null, reason: "character_missing" };
  }
  return score >= 40 ? { score } : { score: null, reason: "low_score", detail: String(score) };
}

/** v1: score a listing's relevance to the pin. Returns null when excluded. */
export function scoreListing(pin: CataloguePin, listing: EbayListing): number | null {
  return scoreListingV1(pin, listing).score;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared types
// ═══════════════════════════════════════════════════════════════════════════

export type MatchLang = "en" | "fr";
export type EditionKind = "LE" | "LR" | "OE";

/** Variant words that make a listing a different product from the base pin. */
export type VariantTerm =
  | "jumbo"
  | "mini"
  | "pin_on_pin"
  | "limited_release"
  | "chaser"
  | "mystery"
  | "artist_proof"
  | "pin_traders_delight"
  | "prototype"
  | "completer"
  | "framed"
  | "hidden_mickey";

/**
 * Stable, machine-readable rejection reasons. Values are stored with
 * market evidence (SG-01) and used by the pilot report, so never rename one;
 * add new values instead.
 */
export const REJECTION_REASONS = [
  "excluded_term",          // non-pin merchandise, fakes, customs, backs only
  "not_a_pin",              // no pin/badge word in the title
  "job_lot",                // mixed job lot / wholesale
  "bundle",                 // lot / bundle / ensemble for a single-pin record
  "complete_set",           // set / box / multi-pin listing for a single-pin record
  "set_not_complete",       // set record, listing doesn't say it's complete
  "set_count_mismatch",     // set record, listing pin count differs
  "set_name_mismatch",      // set record, listing doesn't name the set
  "variant_not_in_record",  // jumbo / mini / chaser / AP / PTD … not in the record
  "variant_missing",        // the record is a variant (e.g. jumbo), the listing isn't
  "edition_size_conflict",  // LE size differs
  "edition_kind_conflict",  // LE vs LR vs OE
  "year_conflict",          // a different release year in the title
  "character_conflict",     // names another character, none of the record's
  "generic_name_no_series", // short generic name with no series/edition word
  "low_name_overlap",       // too few pin-name words
  "character_missing",      // record characters absent and name match weak
  "low_score",              // below the acceptance threshold
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** Attributes parsed from a listing title alone (no catalogue record). */
export interface ParsedAttributes {
  /** normaliseTitle(title). */
  normalised: string;
  lang: MatchLang;
  /** First plausible release year in the title. */
  year?: number;
  /** Every 4-digit year in the title (edition sizes excluded). */
  years: number[];
  editionSize?: number;
  editionKind?: EditionKind;
  variantTerms: VariantTerm[];
  /** Matched lot / bundle words ("lot", "bundle", "ensemble", "job lot"…). */
  bundleTerms: string[];
  /** Matched set / box words ("set", "boxed set", "coffret"…). */
  setTerms: string[];
  /** Matched completeness words ("complete", "full set", "complet"…). */
  completenessTerms: string[];
  /** Number of pins the listing says it contains, when stated. */
  itemCount?: number;
  /** Non-pin merchandise or fake/custom words found. */
  excludedTerms: string[];
  /** The title names a pin or badge ("pin's" counts). */
  isPin: boolean;
  seriesGuess?: string;
  /** Canonical (English) names of well-known characters found. */
  charactersGuess: string[];
}

export interface MatchOptions {
  /** "v1" (default) keeps the original eBay Browse behaviour. */
  mode?: "v1" | "v2";
  /** Title language; "auto" (default) detects French from the wording. */
  lang?: MatchLang | "auto";
}

export interface MatchResult {
  mode: "v1" | "v2";
  accepted: boolean;
  /** Relevance score; for rejections, the score reached before rejecting. */
  score: number;
  rejectionReason?: RejectionReason;
  /** Human-readable detail for the rejection (the term, year or size seen). */
  rejectionDetail?: string;
  parsed: ParsedAttributes;
}

// ═══════════════════════════════════════════════════════════════════════════
// Normaliser and attribute parser (exported for SG-10)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lower-case, strip accents, fold "pin's" to "pin", turn "4/4" into
 * "4 of 4", and reduce everything else to single-spaced [a-z0-9] words.
 */
export function normaliseTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[’‘`´]/g, "'")
    // "pin's" is French for "pin"; English "pins" stays plural.
    .replace(/\bpin's\b/g, "pin")
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$1 of $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const FR_HINTS =
  /pin['’]s|[éèêàçùôî]|\b(?:lot de|ensemble|neuf|avec|serie|série|edition limit|édition|fee|fée|porte[- ]cl|peluche|coffret|complet|complète|broche|ans)\b/i;

function detectLang(title: string): MatchLang {
  return FR_HINTS.test(title) ? "fr" : "en";
}

const EDITION_SIZE_PATTERNS: RegExp[] = [
  /\ble ?(\d{2,5})\b/,
  /\blimited edition (?:of |size )?(\d{2,5})\b/,
  /\bedition limitee (?:a |de )?(\d{2,5})\b/,
  /\bserie limitee (?:a |de )?(\d{2,5})\b/,
  /\bltd (?:ed |edition )?(?:of )?(\d{2,5})\b/,
  /\b(\d{2,5}) (?:exemplaires|ex)\b/,
];

const VARIANT_PATTERNS: Array<[VariantTerm, RegExp]> = [
  ["jumbo", /\bjumbo\b/],
  ["mini", /\bminis?\b(?! mouse)|\bminiature\b/],
  ["pin_on_pin", /\bpin on pin\b|\bpin sur pin\b/],
  ["limited_release", /\blimited release\b|\blr\b/],
  ["chaser", /\bchasers?\b/],
  ["mystery", /\bmystery\b|\bmysteres?\b|\bsurprise\b|\bblind (?:box|bag)\b/],
  ["artist_proof", /\bartist proofs?\b|\bap\b|\bepreuve d artiste\b/],
  ["pin_traders_delight", /\bptd\b|\bpin traders? s? ?delight\b/],
  ["prototype", /\bprototypes?\b|\bproto\b/],
  ["completer", /\bcompleters?\b/],
  ["framed", /\bframed\b|\bencadres?\b/],
  // Not "HM": collectors use it for Haunted Mansion.
  ["hidden_mickey", /\bhidden mickeys?\b/],
];

/** Non-pin merchandise, fakes and parts. Matched as whole words. */
const V2_EXCLUDE_PATTERNS: Array<[string, RegExp]> = [
  ...[
    "pin backs", "backing card only", "card only", "box only", "custom", "fantasy pin",
    "inspired", "scrapper", "scrappers", "fake", "replica", "lanyard", "keychain",
    "key chain", "keyring", "key ring", "plush", "t shirt", "tshirt", "sweatshirt", "hoodie",
    "mug", "mugs", "tumbler", "funko", "ears headband", "loungefly bag", "backpack",
    "wallet", "phone case", "sticker", "stickers", "poster", "magnet", "magnets",
    // French
    "porte cles", "porte cle", "porte clef", "porte clefs", "peluche", "aimant",
    "contrefacon",
  ].map(term => [term, new RegExp(`\\b${term}\\b`)] as [string, RegExp]),
];

const JOB_LOT = /\bjob lot\b|\bwholesale\b|\bmixed lot\b|\bvrac\b|\bbulk\b/;
const BUNDLE_PATTERNS: Array<[string, RegExp]> = [
  ["lot de", /\blot de\b/],
  ["lot", /\blot\b/],
  ["bundle", /\bbundle\b/],
  ["ensemble", /\bensemble\b/],
  ["collection complete", /\bcollection complete\b/],
];
const SET_PATTERNS: Array<[string, RegExp]> = [
  ["boxed set", /\bbox(?:ed)? set\b/],
  ["coffret", /\bcoffrets?\b/],
  ["booster", /\bbooster\b/],
  ["starter set", /\bstarter (?:set|kit)\b/],
  ["set", /\bset\b(?! of 1\b)/],
];
const COMPLETENESS_PATTERNS: Array<[string, RegExp]> = [
  ["complete", /\bcomplete\b/],
  ["complet", /\bcomplet(?:e|es)?\b/],
  ["full set", /\bfull (?:set|series|collection)\b/],
  ["all n", /\ball (?:\d{1,2}|the) (?:pins|pin|badges)\b|\ball \d{1,2}\b/],
  ["integrale", /\bintegrale?\b/],
  ["n of n", /\b(\d{1,2}) (?:of|sur) \1\b/],
  ["sealed", /\bsealed\b|\bscelle\b/],
];
const COUNT_PATTERNS: RegExp[] = [
  /\b(?:set|lot|pack|box) (?:of|de) (\d{1,2})\b/,
  /\b(\d{1,2}) ?(?:x )?(?:pins|pin|badges|pieces|piece|pcs)\b/,
  /\bx ?(\d{1,2}) (?:pins|pin)\b/,
  /\ball (\d{1,2})\b/,
  /\b(\d{1,2}) of \1\b/,
];

/** Well-known characters, canonical English name → aliases (normalised, EN + FR). */
const CHARACTER_LEXICON: Array<[string, string[]]> = [
  ["Mickey Mouse", ["mickey mouse", "mickey"]],
  ["Minnie Mouse", ["minnie mouse", "minnie"]],
  ["Donald Duck", ["donald duck", "donald"]],
  ["Daisy Duck", ["daisy duck", "daisy"]],
  ["Goofy", ["goofy", "dingo"]],
  ["Pluto", ["pluto"]],
  ["Stitch", ["stitch"]],
  ["Lilo", ["lilo"]],
  ["Tinker Bell", ["tinker bell", "tinkerbell", "fee clochette"]],
  ["Peter Pan", ["peter pan"]],
  ["Captain Hook", ["captain hook", "capitaine crochet"]],
  ["Simba", ["simba"]],
  ["Nala", ["nala"]],
  ["Winnie the Pooh", ["winnie the pooh", "winnie l ourson", "winnie", "pooh"]],
  ["Eeyore", ["eeyore", "bourriquet"]],
  ["Tigger", ["tigger", "tigrou"]],
  ["Piglet", ["piglet", "porcinet"]],
  ["Ariel", ["ariel"]],
  ["Belle", ["belle"]],
  ["Cinderella", ["cinderella", "cendrillon"]],
  ["Aurora", ["aurora", "aurore"]],
  ["Snow White", ["snow white", "blanche neige"]],
  ["Jasmine", ["jasmine"]],
  ["Rapunzel", ["rapunzel", "raiponce"]],
  ["Moana", ["moana", "vaiana"]],
  ["Mulan", ["mulan"]],
  ["Elsa", ["elsa"]],
  ["Anna", ["anna"]],
  ["Olaf", ["olaf"]],
  ["Dumbo", ["dumbo"]],
  ["Bambi", ["bambi"]],
  ["Figment", ["figment"]],
  ["Orange Bird", ["orange bird"]],
  ["Hatbox Ghost", ["hatbox ghost"]],
  ["Maleficent", ["maleficent", "malefique"]],
  ["Ursula", ["ursula"]],
  ["Jack Skellington", ["jack skellington"]],
  ["Buzz Lightyear", ["buzz lightyear", "buzz l eclair", "buzz"]],
  ["Woody", ["woody"]],
  ["Alice", ["alice"]],
  ["Cheshire Cat", ["cheshire cat", "chat du cheshire"]],
  ["Pinocchio", ["pinocchio"]],
  ["Baymax", ["baymax"]],
  ["Oswald", ["oswald"]],
  ["Chip and Dale", ["chip and dale", "chip n dale", "tic et tac"]],
];

function lexiconAliases(canonicalOrName: string): string[] {
  const n = normaliseTitle(canonicalOrName);
  for (const [canonical, aliases] of CHARACTER_LEXICON) {
    if (normaliseTitle(canonical) === n || aliases.includes(n)) return aliases;
  }
  return [n];
}

function hasPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

const SERIES_STOP = new Set(["disney", "pin", "pins", "the", "a", "de", "la", "le", "les", "du", "des"]);

function guessSeries(normalised: string, lang: MatchLang): string | undefined {
  const fr = lang === "fr" ? normalised.match(/\b(?:serie|collection) ((?:[a-z0-9]+ ?){1,4})/) : null;
  const en = normalised.match(/\b((?:[a-z0-9]+ ){1,4})(?:series|collection|serie|wave)\b/);
  const raw = (fr?.[1] ?? en?.[1] ?? "").trim();
  const words = raw.split(" ").filter(w => w && !SERIES_STOP.has(w));
  return words.length > 0 ? words.join(" ") : undefined;
}

function firstNumber(text: string, patterns: RegExp[]): { value: number; match: string } | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return { value: Number(m[1]), match: m[0] };
  }
  return undefined;
}

/**
 * Parse a listing title (EN or FR) into matching attributes. Pure; needs no
 * catalogue record, so catalogue research can run it on any title.
 */
export function parseAttributes(title: string, opts: { lang?: MatchLang | "auto" } = {}): ParsedAttributes {
  const lang: MatchLang = !opts.lang || opts.lang === "auto" ? detectLang(title) : opts.lang;
  const normalised = normaliseTitle(title);

  const size = firstNumber(normalised, EDITION_SIZE_PATTERNS);
  const editionSize = size && size.value >= 10 ? size.value : undefined;

  // Years: remove the edition-size phrase first so "LE 2000" isn't a year.
  const yearText = (size ? normalised.replace(size.match, " ") : normalised)
    .replace(/\b\d{1,5} of \d{2,5}\b/g, " ");
  const years = [...new Set([...yearText.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)].map(m => Number(m[1])))];

  // Edition kind. "LE" as a bare word must be upper case in the original
  // title (French "le" is an article); French titles need a size or phrase.
  let editionKind: EditionKind | undefined;
  const bareLE = lang === "en" && /\bLE\b/.test(title);
  if (editionSize || /\blimited edition\b|\bedition limitee\b|\bserie limitee\b|\bltd ed\b/.test(normalised) || bareLE) {
    editionKind = "LE";
  } else if (/\blimited release\b/.test(normalised) || /\bLR\b/i.test(title)) {
    editionKind = "LR";
  } else if (/\bopen edition\b/.test(normalised) || /\bOE\b/.test(title)) {
    editionKind = "OE";
  }

  const variantTerms = VARIANT_PATTERNS.filter(([, re]) => re.test(normalised)).map(([v]) => v);
  const excludedTerms = V2_EXCLUDE_PATTERNS.filter(([, re]) => re.test(normalised)).map(([t]) => t);
  const bundleTerms = [
    ...(JOB_LOT.test(normalised) ? ["job lot"] : []),
    ...BUNDLE_PATTERNS.filter(([, re]) => re.test(normalised)).map(([t]) => t),
  ];
  const setTerms = SET_PATTERNS.filter(([, re]) => re.test(normalised)).map(([t]) => t);
  const completenessTerms = COMPLETENESS_PATTERNS.filter(([, re]) => re.test(normalised)).map(([t]) => t);
  const count = firstNumber(normalised, COUNT_PATTERNS);
  const itemCount = count && count.value >= 1 && count.value <= 60 ? count.value : undefined;

  const charactersGuess = CHARACTER_LEXICON
    .filter(([, aliases]) => aliases.some(a => hasPhrase(normalised, a)))
    .map(([canonical]) => canonical);

  return {
    normalised,
    lang,
    year: years[0],
    years,
    editionSize,
    editionKind,
    variantTerms,
    bundleTerms,
    setTerms,
    completenessTerms,
    itemCount,
    excludedTerms,
    isPin: /\bpins?\b|\bbadges?\b|\bbroches?\b/.test(normalised),
    seriesGuess: guessSeries(normalised, lang),
    charactersGuess,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// v2 matcher
// ═══════════════════════════════════════════════════════════════════════════

const V2_GENERIC_TOKENS = new Set([
  "disney", "pin", "pins", "the", "and", "wave", "series", "edition", "open", "limited",
  "collection", "wdw", "dlr", "parks", "release", "serie", "badge", "des", "les", "pour",
  "avec", "set", "boxed", "box", "booster",
]);

/** Variants that make the record itself a different product from the base pin. */
const STRONG_VARIANTS = new Set<VariantTerm>([
  "jumbo", "mini", "pin_on_pin", "chaser", "artist_proof", "pin_traders_delight",
  "prototype", "completer", "framed",
]);

function v2Tokens(normalised: string): string[] {
  return normalised.split(" ").filter(t => t.length > 2);
}

function overlap(recordText: string, titleTokens: Set<string>, drop: Set<string> = new Set()): number {
  const tokens = v2Tokens(normaliseTitle(recordText)).filter(t => !drop.has(t));
  if (tokens.length === 0) return 0;
  return tokens.filter(t => titleTokens.has(t)).length / tokens.length;
}

/** The record's own edition kind, from its edition text or LE size. */
export function recordEditionKind(pin: CataloguePin): EditionKind | undefined {
  const e = normaliseTitle(pin.edition ?? "");
  if (/\blimited release\b|\blr\b/.test(e)) return "LR";
  if (/\bopen edition\b|\boe\b/.test(e)) return "OE";
  if (/\blimited edition\b|\ble\b/.test(e) || pin.limitedEditionSize) return "LE";
  return undefined;
}

function recordText(pin: CataloguePin): string {
  return normaliseTitle(
    [pin.title, pin.collection, pin.edition, pin.normalisedSeries, pin.searchAliases, pin.description]
      .filter(Boolean)
      .join(" | "),
  );
}

/** A record that is itself a set or box (sold as one item). */
export function isSetRecord(pin: CataloguePin): boolean {
  const t = normaliseTitle(pin.title);
  return /\bset\b|\bboxed\b|\bbox set\b|\bcoffret\b|\bbooster\b/.test(t)
    || /\b([2-9]|[1-5]\d) ?pin\b/.test(t);
}

function recordSetCount(pin: CataloguePin): number | undefined {
  const t = normaliseTitle(`${pin.title} ${pin.description ?? ""}`);
  return firstNumber(t, [/\b(\d{1,2}) ?(?:pin|pins|piece|pieces)\b/, /\bset of (\d{1,2})\b/])?.value;
}

function matchV2(pin: CataloguePin, title: string, lang: MatchLang | "auto"): MatchResult {
  const parsed = parseAttributes(title, { lang });
  const text = parsed.normalised;
  const recText = recordText(pin);
  const setRecord = isSetRecord(pin);
  const reject = (reason: RejectionReason, score: number, detail?: string): MatchResult => ({
    mode: "v2", accepted: false, score, rejectionReason: reason, rejectionDetail: detail, parsed,
  });

  // For a single-pin record, a listing may quote the record's own collection
  // name ("from the Hitchhiking Ghosts Boxed Set"). Strip it before looking
  // for set/bundle words so the quote isn't mistaken for a set listing.
  let setScanText = text;
  if (!setRecord) {
    for (const phrase of [pin.collection, pin.normalisedSeries]) {
      const p = normaliseTitle(phrase ?? "");
      if (p) setScanText = ` ${setScanText} `.split(` ${p} `).join(" ").trim();
    }
  }
  const scan = setScanText === text ? parsed : parseAttributes(setScanText, { lang: parsed.lang });

  // ── Score (computed first so rejections keep a near-miss score) ──────────
  const titleTokens = new Set(v2Tokens(text));
  const aliases = (pin.searchAliases ?? "").split(/[;|]/).map(a => a.trim()).filter(Boolean);
  const setNameDrop = new Set([...V2_GENERIC_TOKENS, ...Array.from({ length: 60 }, (_, i) => String(i + 1))]);
  const nameTokens = v2Tokens(normaliseTitle(pin.title));
  const nameRatio = setRecord
    ? Math.max(overlap(pin.title, titleTokens, setNameDrop), overlap(pin.collection ?? "", titleTokens, setNameDrop))
    : Math.max(overlap(pin.title, titleTokens), ...aliases.map(a => overlap(a, titleTokens)));

  let score = nameRatio * 50;

  const discTokens = [
    ...new Set([
      ...v2Tokens(normaliseTitle(pin.collection ?? "")),
      ...v2Tokens(normaliseTitle(pin.edition ?? "")),
      ...v2Tokens(normaliseTitle((pin.normalisedSeries ?? "").replace(/\|/g, " "))),
    ]),
  ].filter(t => !V2_GENERIC_TOKENS.has(t) && !nameTokens.includes(t) && !/^\d{4}$/.test(t));
  const discHits = discTokens.filter(t => titleTokens.has(t)).length;
  score += Math.min(discHits, 3) * 8;

  const recordChars = pinCharacterList(pin);
  const recordCharAliases = recordChars.map(c => lexiconAliases(c));
  const charHit = recordCharAliases.some(as => as.some(a => hasPhrase(text, a)));
  if (charHit) score += 15;

  const collectionNorm = normaliseTitle(pin.collection ?? "");
  if (collectionNorm && hasPhrase(text, collectionNorm)) score += 10;
  const maker = normaliseTitle(pin.manufacturer ?? pin.brand ?? "");
  if (maker && hasPhrase(text, maker)) score += 10;
  if (pin.limitedEditionSize && parsed.editionSize === pin.limitedEditionSize) score += 15;
  const codes = Object.values(pin.externalIdentifiers ?? {}).filter(Boolean) as string[];
  const codeHit = codes.some(code => code.length >= 4 && hasPhrase(text, normaliseTitle(code)));
  if (codeHit) score += 20;

  // Year: ignore pre-1998 years (films, park openings) and years the record
  // itself names (e.g. "1969–2019" in an anniversary collection).
  const listingYears = parsed.years.filter(y => y >= 1998 && !hasPhrase(recText, String(y)));
  let yearDetail: string | undefined;
  let yearConflict = false;
  if (pin.releaseYear && listingYears.length > 0) {
    if (listingYears.includes(pin.releaseYear)) {
      score += 10;
    } else {
      const diff = Math.min(...listingYears.map(y => Math.abs(y - pin.releaseYear!)));
      yearDetail = String(listingYears[0]);
      // One year out is often a catalogue release-date boundary: penalise.
      if (diff === 1) score -= 15;
      else yearConflict = true;
    }
  }

  // ── Rules, in a fixed order ───────────────────────────────────────────────
  if (parsed.excludedTerms.length > 0) return reject("excluded_term", score, parsed.excludedTerms[0]);
  if (!parsed.isPin) return reject("not_a_pin", score);
  if (parsed.bundleTerms.includes("job lot")) return reject("job_lot", score, "job lot");

  const recCount = setRecord ? recordSetCount(pin) : undefined;
  if (setRecord) {
    const complete = parsed.completenessTerms.length > 0
      || (recCount !== undefined && parsed.itemCount === recCount);
    if (recCount !== undefined && parsed.itemCount !== undefined && parsed.itemCount > 1 && parsed.itemCount !== recCount) {
      return reject("set_count_mismatch", score, String(parsed.itemCount));
    }
    if (!complete) return reject("set_not_complete", score);
    if (nameRatio < 0.6) return reject("set_name_mismatch", score);
  } else {
    if (scan.bundleTerms.length > 0) return reject("bundle", score, scan.bundleTerms[0]);
    const multi = scan.itemCount !== undefined && scan.itemCount > 1;
    const completeSet = scan.completenessTerms.some(t => t !== "sealed") && /\bset\b|\bseries\b|\bserie\b|\bcollection\b/.test(setScanText);
    if (scan.setTerms.length > 0 || multi || completeSet) {
      return reject("complete_set", score, scan.setTerms[0] ?? (multi ? `${scan.itemCount} pins` : "complete"));
    }
  }

  const recordKind = recordEditionKind(pin);
  const allowedVariants = new Set(parseAttributes(recText, { lang: "en" }).variantTerms);
  for (const v of parsed.variantTerms) {
    // LR against a record with a known edition is an edition question.
    if (v === "limited_release" && recordKind) continue;
    if (!allowedVariants.has(v)) return reject("variant_not_in_record", score, v);
  }

  // A variant record (e.g. "Simba Jumbo Pin") must not match the base pin.
  for (const v of parseAttributes(pin.title, { lang: "en" }).variantTerms) {
    if (STRONG_VARIANTS.has(v) && !parsed.variantTerms.includes(v)) {
      return reject("variant_missing", score, v);
    }
  }

  if (pin.limitedEditionSize && parsed.editionSize && parsed.editionSize !== pin.limitedEditionSize) {
    return reject("edition_size_conflict", score, String(parsed.editionSize));
  }
  if (recordKind && parsed.editionKind && parsed.editionKind !== recordKind) {
    return reject("edition_kind_conflict", score, `${parsed.editionKind}≠${recordKind}`);
  }
  if (yearConflict) return reject("year_conflict", score, yearDetail);

  if (!setRecord && recordChars.length > 0 && !charHit) {
    const others = parsed.charactersGuess.filter(c =>
      !lexiconAliases(c).some(a => hasPhrase(recText, a)));
    if (others.length > 0) return reject("character_conflict", score, others[0]);
  }

  if (!setRecord && !codeHit && nameTokens.length <= 3 && discTokens.length >= 2 && discHits === 0) {
    return reject("generic_name_no_series", score);
  }
  if (nameRatio < 0.4 && !codeHit) return reject("low_name_overlap", score);
  // Matching only the character's name is not enough when the pin name has
  // other distinctive words ("Stitch Surfing" vs "Stitch Hula").
  if (!setRecord && !codeHit) {
    const charWords = new Set(recordCharAliases.flat().flatMap(a => a.split(" ")));
    const distinctive = (s: string) =>
      v2Tokens(normaliseTitle(s)).filter(t => !V2_GENERIC_TOKENS.has(t) && !charWords.has(t));
    const sources = [pin.title, ...aliases].map(distinctive).filter(d => d.length > 0);
    if (sources.length > 0 && !sources.some(d => d.some(t => titleTokens.has(t)))) {
      return reject("low_name_overlap", score, "distinctive");
    }
  }
  if (!setRecord && !codeHit && recordChars.length > 0 && !charHit && nameRatio < 0.7) {
    return reject("character_missing", score);
  }
  // An exact product code (SKU, FAC…) identifies the pin on its own.
  if (score < 40 && !codeHit) return reject("low_score", score);
  return { mode: "v2", accepted: true, score, parsed };
}

/**
 * Match a listing title against a catalogue record.
 *
 * Defaults to v1 so existing callers are unaffected; pass `{ mode: "v2" }`
 * for the v2 rules. Both modes return parsed attributes, and every
 * rejection has a `rejectionReason`.
 */
export function matchListing(pin: CataloguePin, title: string, opts: MatchOptions = {}): MatchResult {
  const mode = opts.mode ?? "v1";
  const lang = opts.lang ?? "auto";
  if (mode === "v2") return matchV2(pin, title, lang);
  const v1 = scoreListingV1(pin, { title });
  return {
    mode: "v1",
    accepted: v1.score !== null,
    score: v1.score ?? 0,
    rejectionReason: v1.reason,
    rejectionDetail: v1.detail,
    parsed: parseAttributes(title, { lang }),
  };
}
