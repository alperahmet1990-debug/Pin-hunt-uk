/**
 * useMyPinPrice(pinId): the signed-in collector's own prices for a pin (#511),
 * plus save and clear. status 'off' when there's no price source or migration
 * 065 isn't applied: screens hide "Your price" then.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  isCommunityPricesUnavailable,
  type MyPinPrice,
  type PriceCurrency,
} from '@workspace/pin-repository';
import { getCommunityPriceService } from '@/lib/communityPriceService';
import { refreshCommunityPrice } from '@/hooks/useCommunityPrice';

export type MyPinPriceStatus = 'off' | 'loading' | 'ready' | 'error';
interface Entry { status: MyPinPriceStatus; prices: MyPinPrice[] }

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<(e: Entry) => void>>();

function publish(pinId: string, entry: Entry) {
  cache.set(pinId, entry);
  listeners.get(pinId)?.forEach(l => l(entry));
}

async function load(pinId: string) {
  const service = getCommunityPriceService();
  if (!service) { publish(pinId, { status: 'off', prices: [] }); return; }
  try {
    publish(pinId, { status: 'ready', prices: await service.getMyPinPrices([pinId]) });
  } catch (err) {
    publish(pinId, { status: isCommunityPricesUnavailable(err) ? 'off' : 'error', prices: [] });
  }
}

/** For tests. */
export function resetMyPinPriceCacheForTests() {
  cache.clear();
}

/** Save the collector's price, then refresh their prices and the community price. */
export async function saveMyPinPrice(pinId: string, currency: PriceCurrency, amount: number): Promise<void> {
  const service = getCommunityPriceService();
  if (!service) throw new Error('Prices are not available.');
  await service.setMyPinPrice(pinId, currency, amount);
  await Promise.all([load(pinId), refreshCommunityPrice(pinId, currency)]);
}

export async function clearMyPinPrice(pinId: string, currency: PriceCurrency): Promise<void> {
  const service = getCommunityPriceService();
  if (!service) throw new Error('Prices are not available.');
  await service.clearMyPinPrice(pinId, currency);
  await Promise.all([load(pinId), refreshCommunityPrice(pinId, currency)]);
}

export function useMyPinPrice(pinId: string | undefined) {
  const [entry, setEntry] = useState<Entry>(
    (pinId && cache.get(pinId)) || { status: getCommunityPriceService() ? 'loading' : 'off', prices: [] },
  );

  useEffect(() => {
    if (!pinId) return;
    let set = listeners.get(pinId);
    if (!set) { set = new Set(); listeners.set(pinId, set); }
    set.add(setEntry);
    const cached = cache.get(pinId);
    if (cached) setEntry(cached);
    else void load(pinId);
    return () => {
      set!.delete(setEntry);
      if (set!.size === 0) listeners.delete(pinId);
    };
  }, [pinId]);

  const priceIn = useCallback(
    (currency: PriceCurrency) => entry.prices.find(p => p.currency === currency) ?? null,
    [entry.prices],
  );
  return { ...entry, priceIn };
}
