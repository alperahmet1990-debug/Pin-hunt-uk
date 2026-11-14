/**
 * Per-user request rate limit for the price-request routes, in memory and
 * per server process. It protects the database from one account hammering
 * the routes (every POST plans a refresh before the daily caps apply). It is
 * not the spend control: that is the daily caps and the monthly hard stop.
 */
export interface RateLimiter {
  /** True when this key may make another request now (and counts it). */
  take(key: string): boolean;
}

const MAX_KEYS = 10_000;

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    take(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter(at => at > t - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.delete(key); // re-insert so the oldest keys are first in the map
      hits.set(key, recent);
      if (hits.size > MAX_KEYS) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return true;
    },
  };
}
