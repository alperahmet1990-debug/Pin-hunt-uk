/**
 * Which currency prices show in (#511, HM-04 #564).
 *
 * It starts on the collector's home market (UK -> £, US -> $; set from the
 * profile through utils/format.ts). Switching to the other currency on the
 * value card, "Your price" or "Price my trade pins" is a peek for this
 * session: it isn't saved, and it resets when the home market changes.
 * Pounds and dollars are never converted.
 */
import { useEffect, useState } from 'react';
import type { PriceCurrency } from '@workspace/pin-repository';
import { formatMarket, setFormatMarket, subscribeFormatMarket, type HomeMarket } from '@/utils/format';

export const currencyForMarket = (market: HomeMarket): PriceCurrency => (market === 'US' ? 'USD' : 'GBP');

let peek: PriceCurrency | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

subscribeFormatMarket(() => {
  peek = null;
  notify();
});

/** Show prices in this currency for now (a peek; the home market is unchanged). */
export function setPriceCurrency(c: PriceCurrency) {
  peek = c === currencyForMarket(formatMarket()) ? null : c;
  notify();
}

/** For tests: back to the UK home market with no peek. */
export function resetPriceCurrencyForTests() {
  peek = null;
  setFormatMarket('UK');
  notify();
}

/** [currency shown, change it (peek), the home market's currency] */
export function usePriceCurrency(): [PriceCurrency, (c: PriceCurrency) => void, PriceCurrency] {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender(n => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const home = currencyForMarket(formatMarket());
  return [peek ?? home, setPriceCurrency, home];
}
