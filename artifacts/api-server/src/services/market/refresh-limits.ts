/**
 * Controls for the collector-facing "refresh live eBay prices" route
 * (POST /api/pins/:pinId/market-value/refresh). See docs/market-data/RIGHTS.md §3.
 *
 * Env is read on each call so the values can be changed without code changes
 * and are easy to set in tests. The per-user cap is in memory and per server
 * process, like the price-request limiter it reuses.
 */
import { createRateLimiter, type RateLimiter } from "./price-request/rate-limit";

const DAY_MS = 24 * 60 * 60 * 1000;

export function refreshEnabled(): boolean {
  return ["1", "true"].includes((process.env.MARKET_VALUE_REFRESH_ENABLED ?? "").trim().toLowerCase());
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function refreshFreshHours(): number {
  return positiveNumber(process.env.MARKET_VALUE_REFRESH_FRESH_HOURS, 24);
}

export function refreshUserDailyCap(): number {
  return Math.floor(positiveNumber(process.env.MARKET_VALUE_REFRESH_USER_DAILY, 20));
}

/** True when a stored estimate calculated at `calculatedAt` is still fresh. */
export function isFresh(calculatedAt: string | undefined, now: number = Date.now()): boolean {
  if (!calculatedAt) return false;
  const at = Date.parse(calculatedAt);
  return Number.isFinite(at) && now - at < refreshFreshHours() * 3_600_000;
}

let limiter: { cap: number; instance: RateLimiter } | null = null;

/** Count one eBay call for this user; false when they are over today's cap. */
export function takeUserRefresh(userId: string): boolean {
  const cap = refreshUserDailyCap();
  if (!limiter || limiter.cap !== cap) limiter = { cap, instance: createRateLimiter(cap, DAY_MS) };
  return limiter.instance.take(userId);
}

/** Test helper. */
export function resetRefreshLimits(): void {
  limiter = null;
}
