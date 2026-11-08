/**
 * useCommunityPrice(pinId, currency): the community price for one pin (#511).
 *
 * status:
 *   'off'      no price source (unit tests, unconfigured build), or migration
 *              065 isn't applied yet. Screens keep their old layout.
 *   'loading'  first load.
 *   'ready'    price is the CommunityPrice, or null when nobody has priced it.
 *   'error'    the call failed for another reason; screens show no community tile.
 *
 * Cached per pin and currency for the session. Call refreshCommunityPrice()
 * after saving a price so every mounted card updates.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  isCommunityPricesUnavailable,
  type CommunityPrice,
  type PriceCurrency,
} from '@workspace/pin-repository';
import { getCommunityPriceService } from '@/lib/communityPriceService';

export type CommunityPriceStatus = 'off' | 'loading' | 'ready' | 'error';

interface Entry { status: CommunityPriceStatus; price: CommunityPrice | null }

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<(e: Entry) => void>>();
const keyOf = (pinId: string, currency: PriceCurrency) => `${pinId}|${currency}`;
/** Set once a call shows migration 065 isn't there, so later calls don't retry. */
let unavailable = false;

function publish(key: string, entry: Entry) {
  cache.set(key, entry);
  listeners.get(key)?.forEach(l => l(entry));
}

async function load(pinId: string, currency: PriceCurrency) {
  const key = keyOf(pinId, currency);
  const service = getCommunityPriceService();
  if (!service || unavailable) { publish(key, { status: 'off', price: null }); return; }
  try {
    const price = await service.getCommunityPrice(pinId, currency);
    publish(key, { status: 'ready', price });
  } catch (err) {
    if (isCommunityPricesUnavailable(err)) {
      unavailable = true;
      publish(key, { status: 'off', price: null });
    } else {
      publish(key, { status: 'error', price: null });
    }
  }
}

/** Reload one pin's community price (after the collector saves or clears theirs). */
export function refreshCommunityPrice(pinId: string, currency: PriceCurrency): Promise<void> {
  return load(pinId, currency);
}

/** For tests: forget cached prices and the "not available" flag. */
export function resetCommunityPriceCacheForTests() {
  cache.clear();
  unavailable = false;
}

export function useCommunityPrice(pinId: string | undefined, currency: PriceCurrency) {
  const key = pinId ? keyOf(pinId, currency) : '';
  const initial = (key && cache.get(key)) || { status: (getCommunityPriceService() ? 'loading' : 'off') as CommunityPriceStatus, price: null };
  const [entry, setEntry] = useState<Entry>(initial);

  useEffect(() => {
    if (!pinId) return;
    let set = listeners.get(key);
    if (!set) { set = new Set(); listeners.set(key, set); }
    set.add(setEntry);
    const cached = cache.get(key);
    if (cached) setEntry(cached);
    else {
      setEntry({ status: getCommunityPriceService() && !unavailable ? 'loading' : 'off', price: null });
      void load(pinId, currency);
    }
    return () => {
      set!.delete(setEntry);
      if (set!.size === 0) listeners.delete(key);
    };
  }, [pinId, currency, key]);

  const refresh = useCallback(() => (pinId ? load(pinId, currency) : Promise.resolve()), [pinId, currency]);
  return { ...entry, refresh };
}
