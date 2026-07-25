/**
 * useCommunity — thin hook that surfaces the shared user repository and
 * the current userId, scoped to community operations.
 *
 * Uses the same underlying SupabaseUserPinRepository as useMarketplace so
 * no extra initialisation is needed.
 */
import { useMarketplace } from './useMarketplace';

export function useCommunity() {
  return useMarketplace();
}
