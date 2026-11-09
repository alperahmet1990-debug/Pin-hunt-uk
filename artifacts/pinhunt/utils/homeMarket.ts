/**
 * Home market helpers (#560).
 */
import type { HomeMarket } from '@/utils/format';

/** The phone's region, as a starting choice: US for a US region, otherwise UK. */
export function marketFromDeviceRegion(locale: string | undefined = deviceLocale()): HomeMarket {
  const region = (locale ?? '').split(/[-_]/)[1]?.toUpperCase();
  return region === 'US' ? 'US' : 'UK';
}

function deviceLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

/** What each choice changes today; extend as events (HM-05) and links (HM-06) follow the market. */
export const MARKET_LABEL: Record<HomeMarket, { name: string; flag: string; detail: string }> = {
  UK: { name: 'United Kingdom', flag: '🇬🇧', detail: 'Prices in £ · dates like 8 Nov 2026' },
  US: { name: 'United States', flag: '🇺🇸', detail: 'Prices in $ · dates like Nov 8, 2026' },
};

/** True when saving failed only because migration 068 isn't applied yet. */
export function isHomeMarketUnavailable(err: unknown): boolean {
  return err instanceof Error && /home market isn\u2019t available yet|home market isn't available yet/i.test(err.message);
}
