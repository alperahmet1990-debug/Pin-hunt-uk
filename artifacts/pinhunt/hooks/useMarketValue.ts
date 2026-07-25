/**
 * useLatestMarketValue(pinId) — latest saved eBay value for a pin, batched.
 *
 * Cards register their pin id; requests are coalesced (150 ms window, up to
 * 100 ids per call) into GET /api/pins/market-values. Results are cached
 * in-memory for the session, so scrolling lists don't re-fetch.
 * Read-only: never triggers an eBay search.
 */
import { useEffect, useState } from 'react';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:8080/api';

export interface LatestValue {
  marketplace: 'EBAY_GB' | 'EBAY_US';
  currency: string;
  mid: number;
  calculatedAt: string;
  stale: boolean;
}

// null = fetched, no value saved for this pin.
const cache = new Map<string, LatestValue | null>();
const pending = new Set<string>();
const subscribers = new Map<string, Set<(v: LatestValue | null) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function notify(id: string) {
  const value = cache.get(id) ?? null;
  for (const cb of subscribers.get(id) ?? []) cb(value);
}

async function flush() {
  flushTimer = null;
  const batch = [...pending].slice(0, 100);
  batch.forEach(id => pending.delete(id));
  if (batch.length === 0) return;
  if (pending.size > 0) scheduleFlush();

  try {
    const resp = await fetch(`${API_BASE}/pins/market-values?ids=${encodeURIComponent(batch.join(','))}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as { values: Record<string, LatestValue> };
    for (const id of batch) {
      cache.set(id, data.values[id] ?? null);
      notify(id);
    }
  } catch {
    // Leave uncached so a later mount can retry; cards just keep the fallback.
    for (const id of batch) notify(id);
  }
}

function scheduleFlush() {
  if (!flushTimer) flushTimer = setTimeout(flush, 150);
}

/** Latest saved eBay value for a pin, or null/undefined while unknown. */
export function useLatestMarketValue(pinId: string | undefined): LatestValue | null {
  const [value, setValue] = useState<LatestValue | null>(
    pinId ? cache.get(pinId) ?? null : null,
  );

  useEffect(() => {
    if (!pinId) return;
    if (cache.has(pinId)) {
      setValue(cache.get(pinId) ?? null);
      return;
    }
    let subs = subscribers.get(pinId);
    if (!subs) { subs = new Set(); subscribers.set(pinId, subs); }
    subs.add(setValue);
    pending.add(pinId);
    scheduleFlush();
    return () => {
      subs!.delete(setValue);
      if (subs!.size === 0) subscribers.delete(pinId);
    };
  }, [pinId]);

  return value;
}

/** Format a latest value for compact card display, e.g. "£36" or "$33". */
export function formatLatestValue(v: LatestValue): string {
  const symbol = v.currency === 'GBP' ? '£' : v.currency === 'USD' ? '$' : `${v.currency} `;
  return `${symbol}${Math.round(v.mid)}`;
}
