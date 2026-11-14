/**
 * useSoldPrices(pinId) — eBay sold-price values for a pin, plus "Get a price".
 *
 * Reads GET /api/pins/:id/market-valuations (valuation v2; only published
 * markets come back) and GET /api/pins/:id/price-request (has anyone asked,
 * is it running). requestPrice() POSTs a request; while it runs the hook
 * polls the request state and re-reads the values when it finishes.
 *
 * "off" means the server has sold prices switched off (404) or couldn't be
 * reached: the tile then renders nothing and the pin page is as before.
 * Never shows listings or links: those wait on the eBay terms review.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';

export type SoldMarket = 'UK' | 'US';

export interface SoldValuation {
  market: SoldMarket;
  currency: string;
  low: number | null;
  fair: number;
  high: number | null;
  soldCount: number;
  calculatedAt: string;
}

export type RequestState = 'none' | 'pending' | 'priced' | 'no_sales';

export interface RequestStatus {
  state: RequestState;
  checkedAt: string | null;
  nextRequestAt: string | null;
  requestsOpen: boolean;
}

export type RequestError = 'daily_limit' | 'busy' | 'unavailable';

export type SoldPrices =
  | { status: 'loading' }
  | { status: 'off' }
  | {
      status: 'ready';
      valuations: SoldValuation[];
      request: RequestStatus;
      error: RequestError | null;
      requestPrice: () => void;
    };

export const POLL_MS = 4000;
/** Stop polling after this long; the tile then offers the button again if nothing came back. */
export const POLL_LIMIT_MS = 3 * 60_000;

const CLOSED: RequestStatus = { state: 'none', checkedAt: null, nextRequestAt: null, requestsOpen: false };

function toValuations(body: unknown): SoldValuation[] {
  const list = (body as { valuations?: unknown[] } | null)?.valuations;
  if (!Array.isArray(list)) return [];
  const out: SoldValuation[] = [];
  for (const raw of list) {
    const v = raw as Record<string, unknown>;
    if ((v.market !== 'UK' && v.market !== 'US') || typeof v.fair !== 'number') continue;
    const soldCount = typeof v.soldCount === 'number' ? v.soldCount : 0;
    if (soldCount <= 0) continue; // asking-price-only values are not sold prices
    out.push({
      market: v.market,
      currency: typeof v.currency === 'string' ? v.currency : v.market === 'US' ? 'USD' : 'GBP',
      low: typeof v.low === 'number' ? v.low : null,
      fair: v.fair,
      high: typeof v.high === 'number' ? v.high : null,
      soldCount,
      calculatedAt: typeof v.calculatedAt === 'string' ? v.calculatedAt : '',
    });
  }
  return out;
}

function toStatus(body: unknown): RequestStatus {
  const b = (body ?? {}) as Record<string, unknown>;
  const state = ['none', 'pending', 'priced', 'no_sales'].includes(String(b.state)) ? (b.state as RequestState) : 'none';
  return {
    state,
    checkedAt: typeof b.checkedAt === 'string' ? b.checkedAt : null,
    nextRequestAt: typeof b.nextRequestAt === 'string' ? b.nextRequestAt : null,
    requestsOpen: b.requestsOpen === true,
  };
}

export function useSoldPrices(pinId: string | null): SoldPrices {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [valuations, setValuations] = useState<SoldValuation[] | null | 'off'>(null);
  const [request, setRequest] = useState<RequestStatus>(CLOSED);
  const [error, setError] = useState<RequestError | null>(null);
  const pollStarted = useRef<number | null>(null);
  const alive = useRef(true);

  const headers = useCallback((): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const base = pinId ? `${API_BASE}/pins/${encodeURIComponent(pinId)}` : null;

  const loadValuations = useCallback(async () => {
    if (!base) return;
    try {
      const r = await fetch(`${base}/market-valuations`, { headers: headers() });
      if (!alive.current) return;
      if (!r.ok) { setValuations('off'); return; }
      setValuations(toValuations(await r.json()));
    } catch {
      if (alive.current) setValuations('off');
    }
  }, [base, headers]);

  const loadStatus = useCallback(async (): Promise<RequestStatus> => {
    if (!base) return CLOSED;
    try {
      const r = await fetch(`${base}/price-request`, { headers: headers() });
      const s = r.ok ? toStatus(await r.json()) : CLOSED;
      if (alive.current) setRequest(s);
      return s;
    } catch {
      if (alive.current) setRequest(CLOSED);
      return CLOSED;
    }
  }, [base, headers]);

  useEffect(() => {
    alive.current = true;
    setValuations(null);
    setRequest(CLOSED);
    setError(null);
    if (!base || !token) {
      setValuations('off');
      return () => { alive.current = false; };
    }
    void loadValuations();
    void loadStatus().then(s => { if (s.state === 'pending') pollStarted.current = Date.now(); });
    return () => { alive.current = false; };
  }, [base, token, loadValuations, loadStatus]);

  // Poll while a request runs; re-read the values when it finishes.
  const pending = request.state === 'pending';
  useEffect(() => {
    if (!pending) return;
    if (pollStarted.current === null) pollStarted.current = Date.now();
    const t = setInterval(async () => {
      if (pollStarted.current !== null && Date.now() - pollStarted.current > POLL_LIMIT_MS) {
        clearInterval(t);
        pollStarted.current = null;
        if (alive.current) setRequest(r => ({ ...r, state: 'none' }));
        return;
      }
      const s = await loadStatus();
      if (s.state !== 'pending') {
        clearInterval(t);
        pollStarted.current = null;
        await loadValuations();
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [pending, loadStatus, loadValuations]);

  const requestPrice = useCallback(async () => {
    if (!base) return;
    setError(null);
    setRequest(r => ({ ...r, state: 'pending' }));
    pollStarted.current = Date.now();
    try {
      const r = await fetch(`${base}/price-request`, { method: 'POST', headers: headers() });
      const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!alive.current) return;
      if (r.status === 202 || r.status === 409) return; // running; the poll takes over
      if (r.ok) {
        setRequest(prev => ({ ...prev, ...toStatus(body), requestsOpen: prev.requestsOpen }));
        await loadValuations();
        return;
      }
      pollStarted.current = null;
      setRequest(prev => ({ ...prev, state: 'none' }));
      setError(r.status === 429 ? (body.error === 'daily_limit' ? 'daily_limit' : 'busy') : 'unavailable');
    } catch {
      if (!alive.current) return;
      pollStarted.current = null;
      setRequest(prev => ({ ...prev, state: 'none' }));
      setError('unavailable');
    }
  }, [base, headers, loadValuations]);

  if (valuations === null) return { status: 'loading' };
  if (valuations === 'off') return { status: 'off' };
  return { status: 'ready', valuations, request, error, requestPrice: () => { void requestPrice(); } };
}
