/**
 * useTradesWaiting: how many of the signed-in collector's trades wait on
 * them (answer a proposal, post their pins, confirm receipt). Migration 071.
 *
 * Refreshes whenever the screen comes into focus, like the unread badges.
 * Before 071 is applied the call fails and the count stays 0, so nothing
 * shows.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCommunity } from '@/hooks/useCommunity';

export function useTradesWaiting(): { count: number; refresh: () => Promise<void> } {
  const { repo, userId } = useCommunity();
  const [count, setCount] = useState(0);
  const userRef = useRef(userId);
  userRef.current = userId;

  const refresh = useCallback(async () => {
    if (!repo || !userId || typeof repo.getTradesWaitingCount !== 'function') return;
    const asked = userId;
    try {
      const n = await repo.getTradesWaitingCount();
      if (userRef.current === asked) setCount(n);
    } catch {
      // Non-fatal: keep the last count; the next focus retries.
    }
  }, [repo, userId]);

  // A different (or no) collector: start from zero.
  useEffect(() => { setCount(0); }, [userId]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return { count, refresh };
}

/** "1 trade needs you" / "3 trades need you". */
export function tradesWaitingLine(count: number): string {
  return count === 1 ? '1 trade needs you' : `${count} trades need you`;
}
