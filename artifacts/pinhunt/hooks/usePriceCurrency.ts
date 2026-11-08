/**
 * UK (£) or US ($) for prices on this device (#511). One shared value, so the
 * value card and "Your price" stay in step. A fuller UK/US experience is
 * separate work; until then this is a per-device choice, £ by default.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PriceCurrency } from '@workspace/pin-repository';

export const PRICE_CURRENCY_KEY = '@pinhunt_price_currency_v1';

let current: PriceCurrency = 'GBP';
let loaded = false;
const listeners = new Set<(c: PriceCurrency) => void>();

function publish(c: PriceCurrency) {
  current = c;
  listeners.forEach(l => l(c));
}

export function setPriceCurrency(c: PriceCurrency) {
  publish(c);
  AsyncStorage.setItem(PRICE_CURRENCY_KEY, c).catch(() => {});
}

/** For tests: forget the in-memory choice. */
export function resetPriceCurrencyForTests() {
  current = 'GBP';
  loaded = false;
}

export function usePriceCurrency(): [PriceCurrency, (c: PriceCurrency) => void] {
  const [value, setValue] = useState<PriceCurrency>(current);
  useEffect(() => {
    listeners.add(setValue);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(PRICE_CURRENCY_KEY)
        .then(v => { if (v === 'GBP' || v === 'USD') publish(v); })
        .catch(() => {});
    } else {
      setValue(current);
    }
    return () => { listeners.delete(setValue); };
  }, []);
  return [value, setPriceCurrency];
}
