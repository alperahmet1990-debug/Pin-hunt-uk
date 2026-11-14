/**
 * On-demand sold-price requests ("Get a price"): switches and limits.
 * Server-side env only. Everything is off until the maintainer turns it on;
 * see scripts/PRICE-REQUEST.md and docs/market-data/RIGHTS.md §3.
 *
 *   MARKET_PRICE_REQUEST_ENABLED         "true" to allow requests. Off = 404.
 *                                        Also needs MARKET_VALUATION_V2_ENABLED,
 *                                        SOLDGRAPH_ENABLED and SOLDGRAPH_API_KEY.
 *   MARKET_PRICE_REQUEST_USER_DAILY      requests per collector per rolling 24h (default 5)
 *   MARKET_PRICE_REQUEST_GLOBAL_DAILY    requests from all collectors per rolling 24h (default 50)
 *   MARKET_PRICE_REQUEST_CACHE_DAYS      a finished request (priced or no sales)
 *                                        answers repeat requests for this long (default 30)
 *   MARKET_PRICE_REQUEST_BUDGET_RESERVE  credits of the month's Soldgraph budget that
 *                                        requests leave untouched, e.g. for the
 *                                        maintainer's pilot (default 0). Best effort:
 *                                        it is checked before the claim, outside the
 *                                        lock, so parallel requests for different pins
 *                                        can dip into it by a few credits. The monthly
 *                                        hard stop itself is enforced atomically.
 *
 * Which markets are searched follows MARKET_VALUATION_PUBLISHED_MARKETS: only
 * UK and US have an eBay sold source here, and a market that isn't published
 * is never paid for, because nobody could see the result.
 */
import type { MarketCode } from "@workspace/pin-repository";
import { publishedMarkets } from "../publication";

export const PRICE_REQUEST_FLAG_ENV = "MARKET_PRICE_REQUEST_ENABLED";

/** eBay sold source per market. FR is deliberately absent (#411). */
export const PRICE_REQUEST_SOURCES: Readonly<Partial<Record<MarketCode, string>>> = {
  UK: "soldgraph:ebay_gb_sold",
  US: "soldgraph:ebay_us_sold",
};

/** One search per source: never more than this many credits per request. */
export const MAX_CREDITS_PER_REQUEST = 2;

/** A pending request older than this is treated as abandoned (server restart). */
export const PENDING_TIMEOUT_MINUTES = 10;

export interface PriceRequestLimits {
  userDaily: number;
  globalDaily: number;
  cacheDays: number;
  budgetReserve: number;
}

const DEFAULTS: PriceRequestLimits = { userDaily: 5, globalDaily: 50, cacheDays: 30, budgetReserve: 0 };

function wholeNumber(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
}

export function priceRequestLimits(env: NodeJS.ProcessEnv = process.env): PriceRequestLimits {
  return {
    userDaily: wholeNumber(env.MARKET_PRICE_REQUEST_USER_DAILY, DEFAULTS.userDaily, 1000),
    globalDaily: wholeNumber(env.MARKET_PRICE_REQUEST_GLOBAL_DAILY, DEFAULTS.globalDaily, 100_000),
    cacheDays: wholeNumber(env.MARKET_PRICE_REQUEST_CACHE_DAYS, DEFAULTS.cacheDays, 365),
    budgetReserve: wholeNumber(env.MARKET_PRICE_REQUEST_BUDGET_RESERVE, DEFAULTS.budgetReserve, 1_000_000),
  };
}

export function priceRequestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[PRICE_REQUEST_FLAG_ENV] === "true";
}

/** Sources a request searches now: published markets that have an eBay sold source, UK first. */
export function requestSources(env: NodeJS.ProcessEnv = process.env): string[] {
  return publishedMarkets(env)
    .map(m => PRICE_REQUEST_SOURCES[m])
    .filter((s): s is string => typeof s === "string");
}

/** The markets those sources price. */
export function requestMarkets(env: NodeJS.ProcessEnv = process.env): MarketCode[] {
  return publishedMarkets(env).filter(m => PRICE_REQUEST_SOURCES[m] !== undefined);
}
