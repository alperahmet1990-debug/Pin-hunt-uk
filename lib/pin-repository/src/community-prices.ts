/**
 * Collector prices and community prices (CV-02, #513; migration 065, #512).
 *
 * A collector sets their own price for a pin they have in their collection or
 * For Trade. The community price is the median of those prices, per pin and
 * currency, worked out on the server. Clients only ever see their own prices
 * and the totals: never another collector's price with a name, and never a
 * user id.
 *
 * Every call goes through a migration 065 function; the tables have no client
 * access. Until 065 is applied, the functions don't exist and calls throw a
 * PinRepositoryError with code NOT_FOUND (see isCommunityPricesUnavailable),
 * so screens can hide the feature instead of failing.
 */
import { PinRepositoryError } from './repository';

/** Pounds and dollars are kept apart and never converted (#511, decision 5). */
export type PriceCurrency = 'GBP' | 'USD';
export const PRICE_CURRENCIES: readonly PriceCurrency[] = ['GBP', 'USD'];

/** 'early' below the server's threshold (3 collectors), 'confident' at or above it. */
export type CommunityPriceStep = 'early' | 'confident';

export interface CommunityPrice {
  /** pins.pinhunt_id: the app's pin id. */
  pinId: string;
  currency: PriceCurrency;
  collectorCount: number;
  median: number;
  low: number;
  high: number;
  /** The individual amounts, lowest first, only when 1–2 collectors priced it. */
  entries?: number[];
  step: CommunityPriceStep;
}

export interface MyPinPrice {
  pinId: string;
  currency: PriceCurrency;
  amount: number;
  updatedAt: string;
}

/** The slice of a Supabase client this module uses (structural, any supabase-js version). */
export interface CommunityPricesClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** Largest batch the server accepts per call (migration 065). */
export const COMMUNITY_PRICE_BATCH = 1000;

const UNAVAILABLE = 'Community prices are not available yet.';

/** True when the error means migration 065 isn't applied (or reachable) yet. */
export function isCommunityPricesUnavailable(err: unknown): boolean {
  return err instanceof PinRepositoryError && err.code === 'NOT_FOUND' && err.message === UNAVAILABLE;
}

function toError(error: unknown, fallback: string): PinRepositoryError {
  const e = (error ?? {}) as { code?: string; message?: string };
  const message = String(e.message ?? '');
  // PostgREST: function not in the schema cache (migration not applied yet).
  if (e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(message)) {
    return new PinRepositoryError('NOT_FOUND', UNAVAILABLE, error);
  }
  if (/pin not in your collection/i.test(message)) {
    return new PinRepositoryError('INVALID_INPUT', 'You can only price pins in your collection or For Trade.', error);
  }
  if (/unknown pin/i.test(message)) {
    return new PinRepositoryError('NOT_FOUND', 'That pin isn’t in the catalogue.', error);
  }
  if (/invalid (amount|currency)/i.test(message)) {
    return new PinRepositoryError('INVALID_INPUT', 'Enter a price above 0.', error);
  }
  return new PinRepositoryError('UPSTREAM_ERROR', fallback, error);
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isCurrency(value: unknown): value is PriceCurrency {
  return value === 'GBP' || value === 'USD';
}

/** Validates a price before it is sent: above 0, at most 100,000, two decimals. */
export function normalisePriceAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    throw new PinRepositoryError('INVALID_INPUT', 'Enter a price above 0.');
  }
  return Math.round(amount * 100) / 100;
}

export function mapCommunityPriceRow(row: Record<string, unknown>, currency: PriceCurrency): CommunityPrice | null {
  const pinId = typeof row.pinhunt_id === 'string' ? row.pinhunt_id : null;
  const collectorCount = toNumber(row.collector_count);
  if (!pinId || collectorCount < 1) return null;
  const entries = Array.isArray(row.entries) ? row.entries.map(toNumber) : undefined;
  return {
    pinId,
    currency,
    collectorCount,
    median: toNumber(row.median),
    low: toNumber(row.low),
    high: toNumber(row.high),
    ...(entries && entries.length > 0 && collectorCount <= 2 ? { entries } : {}),
    step: row.step === 'confident' ? 'confident' : 'early',
  };
}

export function mapMyPinPriceRow(row: Record<string, unknown>): MyPinPrice | null {
  if (typeof row.pinhunt_id !== 'string' || !isCurrency(row.currency)) return null;
  return {
    pinId: row.pinhunt_id,
    currency: row.currency,
    amount: toNumber(row.amount),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function setMyPinPrice(
  client: CommunityPricesClient, pinId: string, currency: PriceCurrency, amount: number,
): Promise<void> {
  const value = normalisePriceAmount(amount);
  const { error } = await client.rpc('set_my_pin_price', { p_pinhunt_id: pinId, p_currency: currency, p_amount: value });
  if (error) throw toError(error, 'Could not save your price.');
}

export async function clearMyPinPrice(client: CommunityPricesClient, pinId: string, currency: PriceCurrency): Promise<void> {
  const { error } = await client.rpc('clear_my_pin_price', { p_pinhunt_id: pinId, p_currency: currency });
  if (error) throw toError(error, 'Could not remove your price.');
}

/** The signed-in collector's own prices for these pins, in every currency. */
export async function getMyPinPrices(client: CommunityPricesClient, pinIds: string[]): Promise<MyPinPrice[]> {
  const ids = [...new Set(pinIds)];
  const out: MyPinPrice[] = [];
  for (const batch of chunks(ids, COMMUNITY_PRICE_BATCH)) {
    const { data, error } = await client.rpc('get_my_pin_prices', { p_pinhunt_ids: batch });
    if (error) throw toError(error, 'Could not load your prices.');
    for (const row of (Array.isArray(data) ? data : []) as Record<string, unknown>[]) {
      const mapped = mapMyPinPriceRow(row);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}

/** Community prices for these pins in one currency. Pins nobody has priced are absent. */
export async function getCommunityPrices(
  client: CommunityPricesClient, pinIds: string[], currency: PriceCurrency,
): Promise<CommunityPrice[]> {
  const ids = [...new Set(pinIds)];
  const out: CommunityPrice[] = [];
  for (const batch of chunks(ids, COMMUNITY_PRICE_BATCH)) {
    const { data, error } = await client.rpc('get_community_prices', { p_pinhunt_ids: batch, p_currency: currency });
    if (error) throw toError(error, 'Could not load community prices.');
    for (const row of (Array.isArray(data) ? data : []) as Record<string, unknown>[]) {
      const mapped = mapCommunityPriceRow(row, currency);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}

/** One pin's community price, or null when nobody has priced it in this currency. */
export async function getCommunityPrice(
  client: CommunityPricesClient, pinId: string, currency: PriceCurrency,
): Promise<CommunityPrice | null> {
  const [price] = await getCommunityPrices(client, [pinId], currency);
  return price ?? null;
}

/** "Include my prices in community prices": on unless the collector turned it off. */
export async function getMyCommunityPriceSetting(client: CommunityPricesClient): Promise<boolean> {
  const { data, error } = await client.rpc('get_my_community_price_setting');
  if (error) throw toError(error, 'Could not load your price setting.');
  return data !== false;
}

export async function setMyCommunityPriceSetting(client: CommunityPricesClient, include: boolean): Promise<void> {
  const { error } = await client.rpc('set_my_community_price_setting', { p_include: include });
  if (error) throw toError(error, 'Could not save your price setting.');
}
