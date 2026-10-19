/**
 * BlockedUsersContext (B-P0-05b, #17): who the signed-in collector has
 * blocked, and the block / unblock / report actions.
 *
 * Screens read `blockedIds` and hide those collectors' posts, comments,
 * conversations and trade matches (utils/blockedUsers). The database stops
 * new contact in both directions (migration 050); this only hides what the
 * viewer can already see. Only the viewer's own blocks are readable (RLS), so
 * someone who blocked the viewer is not hidden here.
 *
 * Without Supabase (demo mode for screenshots) blocks live in memory only.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportUserInput, UserBlock } from '@workspace/pin-repository';
import { useCommunity } from '@/hooks/useCommunity';
import { isDemoMode } from '@/lib/demoMode';

export interface BlockTarget {
  id: string;
  username?: string;
  avatarUrl?: string;
}

export interface BlockedUsersValue {
  /** Most recent first. */
  blockedUsers: UserBlock[];
  blockedIds: ReadonlySet<string>;
  loading: boolean;
  /** False when signed out: hide Block and Report. */
  canModerate: boolean;
  isBlocked(userId: string | null | undefined): boolean;
  block(target: BlockTarget): Promise<void>;
  unblock(userId: string): Promise<void>;
  report(input: ReportUserInput): Promise<void>;
  refresh(): Promise<void>;
}

const EMPTY: ReadonlySet<string> = new Set();

const BlockedUsersContext = createContext<BlockedUsersValue>({
  blockedUsers: [],
  blockedIds: EMPTY,
  loading: false,
  canModerate: false,
  isBlocked: () => false,
  block: async () => { throw new Error('Not signed in'); },
  unblock: async () => { throw new Error('Not signed in'); },
  report: async () => { throw new Error('Not signed in'); },
  refresh: async () => {},
});

export function BlockedUsersProvider({ children }: { children: React.ReactNode }) {
  const { repo, userId } = useCommunity();
  const [blockedUsers, setBlockedUsers] = useState<UserBlock[]>([]);
  const [loading, setLoading] = useState(false);
  // Invalidates in-flight loads after sign-out or an account switch.
  const requestRef = useRef(0);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const blockedRef = useRef(blockedUsers);
  blockedRef.current = blockedUsers;

  const refresh = useCallback(async () => {
    if (!repo || !userId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const rows = await repo.getBlockedUsers(userId);
      if (requestRef.current === requestId) setBlockedUsers(rows);
    } catch (err) {
      // Non-fatal: keep the last known list; the next refresh retries.
      if (__DEV__) console.warn('[BlockedUsers] load failed', err);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [repo, userId]);

  useEffect(() => {
    requestRef.current += 1;
    setBlockedUsers([]);
    setLoading(false);
    if (userId) void refresh();
  }, [userId, refresh]);

  const block = useCallback(async (target: BlockTarget) => {
    if (!userId) throw new Error('Not signed in');
    if (target.id === userId) throw new Error("You can't block yourself");
    const row: UserBlock = {
      blockedUserId: target.id,
      username: target.username,
      avatarUrl: target.avatarUrl,
      createdAt: new Date().toISOString(),
    };
    // Optimistic: their content disappears at once; rolled back on failure.
    setBlockedUsers(prev => (prev.some(b => b.blockedUserId === target.id) ? prev : [row, ...prev]));
    if (!repo) {
      if (isDemoMode) return;
      throw new Error('Not available offline');
    }
    try {
      await repo.blockUser(userId, target.id);
    } catch (err) {
      if (userIdRef.current === userId) {
        setBlockedUsers(prev => prev.filter(b => b.blockedUserId !== target.id));
      }
      throw err;
    }
  }, [repo, userId]);

  const unblock = useCallback(async (blockedUserId: string) => {
    if (!userId) throw new Error('Not signed in');
    // Read before the update: setState updaters stay pure.
    const removed = blockedRef.current.find(b => b.blockedUserId === blockedUserId);
    setBlockedUsers(prev => prev.filter(b => b.blockedUserId !== blockedUserId));
    if (!repo) {
      if (isDemoMode) return;
      throw new Error('Not available offline');
    }
    try {
      await repo.unblockUser(userId, blockedUserId);
    } catch (err) {
      if (removed && userIdRef.current === userId) {
        setBlockedUsers(prev => (prev.some(b => b.blockedUserId === blockedUserId) ? prev : [removed, ...prev]));
      }
      throw err;
    }
  }, [repo, userId]);

  const report = useCallback(async (input: ReportUserInput) => {
    if (!userId) throw new Error('Not signed in');
    if (!repo) {
      if (isDemoMode) return;
      throw new Error('Not available offline');
    }
    await repo.reportUser(userId, input);
  }, [repo, userId]);

  const blockedIds = useMemo<ReadonlySet<string>>(
    () => (blockedUsers.length ? new Set(blockedUsers.map(b => b.blockedUserId)) : EMPTY),
    [blockedUsers],
  );
  const isBlocked = useCallback((id: string | null | undefined) => !!id && blockedIds.has(id), [blockedIds]);
  const canModerate = !!userId && (!!repo || isDemoMode);

  const value = useMemo<BlockedUsersValue>(() => ({
    blockedUsers, blockedIds, loading, canModerate, isBlocked, block, unblock, report, refresh,
  }), [blockedUsers, blockedIds, loading, canModerate, isBlocked, block, unblock, report, refresh]);

  return <BlockedUsersContext.Provider value={value}>{children}</BlockedUsersContext.Provider>;
}

export function useBlockedUsers(): BlockedUsersValue {
  return useContext(BlockedUsersContext);
}
