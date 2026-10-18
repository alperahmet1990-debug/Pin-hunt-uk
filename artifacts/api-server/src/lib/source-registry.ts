/**
 * Source registry for catalogue research review.
 *
 * Classifies a source URL into official / news / fan / lead_only / excluded and
 * returns its registrable domain (so `static.wdwnt.com` and `www.wdwnt.com` are
 * one source for independence checks).
 *
 * MAINTAINER REVIEW REQUIRED: changing any list in this file changes what
 * counts as evidence on the catalogue write path. Do not edit without the
 * maintainer's review (see the research access policy).
 *
 * Pure functions, no I/O, no imports.
 */

export type SourceClass = "official" | "news" | "fan" | "lead_only" | "excluded";

const OFFICIAL = [
  "disneystore.com", "disneystore.co.uk", "disneystore.eu", "disneystore.fr", "disneystore.de", "disneystore.asia",
  "disneystore.com.au", "shopdisney.com", "shopdisney.co.uk", "disney.go.com", "disneylandparis.com",
  "disneyparksblog.com", "disney.co.uk",
];
const NEWS = ["wdwnt.com", "laughingplace.com", "disneyfoodblog.com", "mickeyblog.com", "wdwinfo.com", "dismerchandise.com"];
const FAN = [
  "disneypinsblog.com", "mousesteps.com", "pixiedustdlp.com", "mypincentral.com", "disneymouseketeer.com",
  "chipandco.com", "disneybymark.com", "extramagicminutes.com",
];
const LEAD_ONLY = [
  "disneypinventory.com", "disneypinforum.com", "reddit.com", "facebook.com", "instagram.com", "threads.com",
  "x.com", "twitter.com", "fandom.com", "medium.com",
  // Marketplaces: seller-written listing text is never evidence on its own.
  "ebay.co.uk", "ebay.com", "ebay.fr", "ebay.de", "ebay.it", "ebay.es", "ebay.com.au", "ebay.ca",
  "vinted.co.uk", "vinted.fr", "vinted.com", "vinted.de", "whatnot.com", "mercari.com", "depop.com",
  "etsy.com", "poshmark.com",
];
const EXCLUDED = ["pinandpop.com", "pinpics.com", "pintradingdb.com", "stewpins.com"];

const BY_DOMAIN = new Map<string, SourceClass>([
  ...OFFICIAL.map(d => [d, "official"] as const),
  ...NEWS.map(d => [d, "news"] as const),
  ...FAN.map(d => [d, "fan"] as const),
  ...LEAD_ONLY.map(d => [d, "lead_only"] as const),
  ...EXCLUDED.map(d => [d, "excluded"] as const),
]);

// Second-level public suffixes we may meet; enough for this registry without a PSL dependency.
const TWO_LEVEL_SUFFIX = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "com.br"]);

/** Registrable domain of a hostname: `static.wdwnt.com` → `wdwnt.com`, `www.x.co.uk` → `x.co.uk`. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  return TWO_LEVEL_SUFFIX.has(last2) ? parts.slice(-3).join(".") : last2;
}

/** True when `host` is `d` or a subdomain of it, for any official domain `d` (which may itself be two-level). */
export const isOfficialHost = (host: string) => {
  const h = host.toLowerCase();
  return OFFICIAL.some(d => h === d || h.endsWith(`.${d}`));
};

/**
 * Class and registrable domain for a URL. Unknown hosts are `fan`.
 * Returns null when the URL cannot be parsed.
 */
export function classifySource(url: string): { class: SourceClass; domain: string } | null {
  let host: string;
  try { host = new URL(url).hostname; } catch { return null; }
  if (!host) return null;
  const domain = registrableDomain(host);
  if (isOfficialHost(host)) return { class: "official", domain };
  return { class: BY_DOMAIN.get(domain) ?? "fan", domain };
}

/**
 * Value stored in `catalogue_evidence.source_class` (migration 045 enum has no
 * `lead_only`): lead-only sources are stored as `unclassified`.
 */
export function storedSourceClass(cls: SourceClass): "official" | "news" | "fan" | "unclassified" {
  if (cls === "lead_only" || cls === "excluded") return "unclassified";
  return cls;
}

/** Whether a direct check against this class counts towards approval. */
export const countsAsEvidence = (cls: SourceClass) => cls !== "lead_only" && cls !== "excluded";
