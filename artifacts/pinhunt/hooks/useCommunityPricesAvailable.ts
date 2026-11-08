/**
 * Whether community prices work here (#511): a price source exists and
 * migration 065 is applied. Checked once per session. Used to show settings
 * that would otherwise lead nowhere.
 */
import { useEffect, useState } from 'react';
import { getCommunityPriceService } from '@/lib/communityPriceService';

let known: boolean | null = null;

/** For tests. */
export function resetCommunityPricesAvailableForTests() {
  known = null;
}

export function useCommunityPricesAvailable(): boolean {
  const [available, setAvailable] = useState(known === true);
  useEffect(() => {
    if (known !== null) { setAvailable(known); return; }
    const service = getCommunityPriceService();
    if (!service) { known = false; setAvailable(false); return; }
    let cancelled = false;
    service.getMyCommunityPriceSetting()
      .then(() => { known = true; if (!cancelled) setAvailable(true); })
      .catch(() => { known = false; if (!cancelled) setAvailable(false); });
    return () => { cancelled = true; };
  }, []);
  return available;
}
