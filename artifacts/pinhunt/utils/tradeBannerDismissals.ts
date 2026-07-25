/**
 * Housekeeping for trade "potential match" banner dismissal keys.
 *
 * Each dismissal writes `trade_banner_dismissed_<tradeId>` to AsyncStorage.
 * Historically the value was '1' (no timestamp), so keys accumulated forever.
 * New writes store the dismissal time as epoch millis. On app start we prune
 * any key whose timestamp is older than the threshold; legacy '1' values are
 * upgraded to a current timestamp so they start aging instead of being
 * re-shown to the user.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRADE_BANNER_DISMISSED_PREFIX = 'trade_banner_dismissed_';

/** Keys older than this are removed (90 days). */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Storage key for a given trade's banner dismissal. */
export function tradeBannerDismissalKey(tradeId: string): string {
  return `${TRADE_BANNER_DISMISSED_PREFIX}${tradeId}`;
}

/** True if the stored value marks the banner as dismissed (legacy or timestamped). */
export function isDismissedValue(value: string | null): boolean {
  return value !== null;
}

/** Persist a dismissal with the current timestamp. */
export async function persistBannerDismissal(tradeId: string): Promise<void> {
  await AsyncStorage.setItem(tradeBannerDismissalKey(tradeId), String(Date.now()));
}

/**
 * Remove dismissal keys older than the max age. Legacy '1' values (written
 * before timestamps existed) are rewritten with the current time so they age
 * out naturally on a later run. Errors are swallowed — pruning is best-effort.
 */
export async function pruneOldBannerDismissals(now: number = Date.now()): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const dismissalKeys = allKeys.filter(k => k.startsWith(TRADE_BANNER_DISMISSED_PREFIX));
    if (dismissalKeys.length === 0) return;

    const entries = await AsyncStorage.multiGet(dismissalKeys);
    const toRemove: string[] = [];
    const toUpgrade: [string, string][] = [];

    for (const [key, value] of entries) {
      const ts = value === null ? NaN : Number(value);
      if (!Number.isFinite(ts)) {
        // Corrupt/empty value — safe to drop.
        toRemove.push(key);
      } else if (ts === 1) {
        // Legacy '1' marker: no age info. Stamp it now so it ages out later.
        toUpgrade.push([key, String(now)]);
      } else if (now - ts > MAX_AGE_MS) {
        toRemove.push(key);
      }
    }

    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
    if (toUpgrade.length > 0) await AsyncStorage.multiSet(toUpgrade);
  } catch {
    // Best-effort cleanup — never surface errors to the user.
  }
}
