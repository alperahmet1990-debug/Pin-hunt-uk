/**
 * What the valuation API may publish (SG-12, #446). Server-side switches,
 * all off by default. See docs/market-data/RIGHTS.md §3.
 *
 * - MARKET_VALUATION_PUBLISHED_MARKETS: comma list of markets (UK, FR, US)
 *   whose valuations the read returns. Empty (the default) = none. A market
 *   is listed only once its evidence is verified region-true (#411, #450).
 *   Valuations are still computed and stored for every market.
 * - MARKET_COMPS_PUBLIC_ENABLED: the comparable-sales endpoint. Off = 404
 *   for everyone. Separate from the valuation flags: turning valuations on
 *   never turns this on. It stays off until marketplace terms are resolved
 *   for the source shown (RIGHTS.md §2).
 *
 * Values are published only when built by a method version that uses
 * region-verified evidence only (REGION_VERIFIED_METHOD_VERSIONS).
 */
import type { MarketCode } from "@workspace/pin-repository";
import { MARKET_PRIORITY, REGION_VERIFIED_METHOD_VERSIONS } from "./valuation-v2";

export const PUBLISHED_MARKETS_ENV = "MARKET_VALUATION_PUBLISHED_MARKETS";
export const COMPS_PUBLIC_FLAG_ENV = "MARKET_COMPS_PUBLIC_ENABLED";

/** Markets in the publication allow-list, in UK > FR > US order. Unknown entries are ignored. */
export function publishedMarkets(env: NodeJS.ProcessEnv = process.env): MarketCode[] {
  const listed = new Set(
    String(env[PUBLISHED_MARKETS_ENV] ?? "")
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean),
  );
  return MARKET_PRIORITY.filter(m => listed.has(m));
}

export function isMarketPublished(market: string, env: NodeJS.ProcessEnv = process.env): market is MarketCode {
  return (publishedMarkets(env) as string[]).includes(market);
}

export function compsPublicEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[COMPS_PUBLIC_FLAG_ENV] === "true";
}

/** True when a stored value was built from region-verified evidence only (054, #450). */
export function isRegionVerifiedMethod(methodVersion: string): boolean {
  return REGION_VERIFIED_METHOD_VERSIONS.has(methodVersion);
}

/** Each marketplace's own website per market. Only these hosts (or www.) are linked. */
export const MARKETPLACE_SITES: Readonly<Record<string, Partial<Record<MarketCode, string>>>> = {
  ebay: { UK: "ebay.co.uk", FR: "ebay.fr", US: "ebay.com" },
};

const SAFE_PATH_RE = /^\/[A-Za-z0-9\-._~/%]{0,300}$/;

/**
 * A listing link reduced to https on the marketplace's own website for that
 * market, path only: no query string, fragment, credentials or port. Null
 * when the link is missing or anything about it is unexpected.
 */
export function sanitiseListingLink(raw: unknown, marketplace: string, market: MarketCode): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return null;
  const site = MARKETPLACE_SITES[marketplace]?.[market];
  if (!site) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host !== site && host !== `www.${site}`) return null;
  if (!SAFE_PATH_RE.test(url.pathname) || url.pathname === "/") return null;
  return `https://${host}${url.pathname}`;
}
