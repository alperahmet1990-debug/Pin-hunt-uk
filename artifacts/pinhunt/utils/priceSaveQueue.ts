/**
 * Saves for "Price my trade pins" (CV-05, #516): one write at a time per pin
 * and currency, always ending on the latest value typed, so fast edits and
 * slow responses can't leave an older price saved
 * (.agents/memory/collection-mutation-ordering.md). Different pins save in
 * parallel.
 */
import type { PriceCurrency } from '@workspace/pin-repository';

/** amount null = remove the price. */
export type PriceWrite = (pinId: string, currency: PriceCurrency, amount: number | null) => Promise<void>;

interface Slot {
  wanted: number | null;
  running: Promise<void> | null;
  waiters: { resolve: () => void; reject: (e: unknown) => void }[];
}

export function createPriceSaveQueue(write: PriceWrite) {
  const slots = new Map<string, Slot>();

  const run = async (key: string, pinId: string, currency: PriceCurrency) => {
    const slot = slots.get(key)!;
    let lastError: unknown = null;
    let saved: number | null | undefined;
    // Keep going until what's saved matches the latest value asked for.
    while (saved === undefined || saved !== slot.wanted) {
      const target = slot.wanted;
      try {
        await write(pinId, currency, target);
        saved = target;
        lastError = null;
      } catch (e) {
        lastError = e;
        if (slot.wanted === target) break;
      }
    }
    const waiters = slot.waiters.splice(0);
    slot.running = null;
    for (const w of waiters) (lastError ? w.reject(lastError) : w.resolve());
  };

  /** Ask for this price to be saved; resolves once the latest value for this pin is saved. */
  function save(pinId: string, currency: PriceCurrency, amount: number | null): Promise<void> {
    const key = `${pinId}|${currency}`;
    let slot = slots.get(key);
    if (!slot) { slot = { wanted: amount, running: null, waiters: [] }; slots.set(key, slot); }
    slot.wanted = amount;
    const done = new Promise<void>((resolve, reject) => slot!.waiters.push({ resolve, reject }));
    if (!slot.running) slot.running = run(key, pinId, currency);
    return done;
  }

  return { save };
}
