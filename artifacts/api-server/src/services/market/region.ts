/**
 * Region provenance for eBay sold evidence (SG-13, #450).
 *
 * Soldgraph's `country` picks the eBay *website* (ebay.co.uk, ebay.fr,
 * ebay.com), not the seller's country. Results can include international
 * sellers, and prices are shown in the website's currency. Soldgraph's
 * `item_location` parameter takes `domestic` (sellers in the website's
 * country only) or `worldwide`; leaving it out uses the website's default.
 * There is no field for the original price or currency, and no structured
 * seller or item country: only the free-text `location_text`.
 *
 * So a sold row is regional evidence only when it was fetched with
 * `item_location=domestic` (see valuation-v2.ts, `regionExclusions`).
 * `parseItemCountry` derives a country, and only a country, from the
 * location text as a cross-check. The text itself, any town and any seller
 * detail are never kept.
 */
import type { MarketCode } from "@workspace/pin-repository";

/** Soldgraph `item_location` values. */
export const ITEM_LOCATIONS = ["domestic", "worldwide"] as const;
export type ItemLocation = (typeof ITEM_LOCATIONS)[number];

export function isItemLocation(v: unknown): v is ItemLocation {
  return typeof v === "string" && (ITEM_LOCATIONS as readonly string[]).includes(v);
}

/** Default `item_location` for eBay sold searches. */
export const DEFAULT_EBAY_SOLD_ITEM_LOCATION: ItemLocation = "domestic";

/** ISO 3166-1 alpha-2 country of each market's eBay website. */
export const MARKET_COUNTRY: Record<MarketCode, string> = { UK: "GB", FR: "FR", US: "US" };

/**
 * Sources whose rows must carry region provenance to count as regional
 * evidence: the Soldgraph eBay sold searches. Rows from any other source are
 * not region-checked.
 */
export const REGION_CHECKED_SOURCE_IDS: ReadonlySet<string> = new Set([
  "soldgraph:ebay_gb_sold",
  "soldgraph:ebay_fr_sold",
  "soldgraph:ebay_us_sold",
]);

/**
 * Country names (English and French, as eBay UK, FR and US show them) and the
 * few unambiguous codes accepted on their own. Lower case, accents removed.
 * Deliberately short: anything not listed gives null.
 */
const COUNTRY_NAMES: Record<string, string> = {
  "united kingdom": "GB",
  "great britain": "GB",
  "england": "GB",
  "scotland": "GB",
  "wales": "GB",
  "northern ireland": "GB",
  "royaume-uni": "GB",
  "royaume uni": "GB",
  "grande-bretagne": "GB",
  "angleterre": "GB",
  "france": "FR",
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "etats-unis": "US",
  "etats unis": "US",
  "germany": "DE",
  "allemagne": "DE",
  "deutschland": "DE",
  "italy": "IT",
  "italie": "IT",
  "spain": "ES",
  "espagne": "ES",
  "belgium": "BE",
  "belgique": "BE",
  "netherlands": "NL",
  "pays-bas": "NL",
  "ireland": "IE",
  "irlande": "IE",
  "canada": "CA",
  "australia": "AU",
  "australie": "AU",
  "japan": "JP",
  "japon": "JP",
  "china": "CN",
  "chine": "CN",
  "hong kong": "HK",
};

/** Codes accepted only when they are the whole text (never after a comma: "Lafayette, CA" is not Canada). */
const WHOLE_TEXT_CODES: Record<string, string> = {
  uk: "GB",
  gb: "GB",
  fr: "FR",
  us: "US",
  usa: "US",
};

const PREFIX_RE = /^(?:located in|item location|location|ships from|from|de|depuis|situe(?:e)? (?:en|au|aux|a))\s*:?\s+/;

function canonical(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ISO-2 country of an eBay location text such as "London, United Kingdom",
 * "Paris, France", "from United States" or "US". Only the last
 * comma-separated part is read, and only a listed country name (or a bare
 * code making up the whole text) is accepted. Null when unsure. Returns the
 * country only: never the town or anything else from the text.
 */
export function parseItemCountry(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return null;
  const whole = canonical(raw).replace(PREFIX_RE, "");
  if (!whole) return null;
  const parts = whole.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1].replace(PREFIX_RE, "");
  if (parts.length === 1 && WHOLE_TEXT_CODES[last]) return WHOLE_TEXT_CODES[last];
  return COUNTRY_NAMES[last] ?? null;
}
