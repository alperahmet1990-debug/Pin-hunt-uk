/**
 * UnreadMessagesContext — tracks unread DM counts so the app can show
 * badges on the Community tab and the Messages icon.
 *
 * Polls the conversations list every 30 s while signed in; screens can
 * call refresh() after reading/sending messages to update immediately.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useCommunity } from '@/hooks/useCommunity';

interface UnreadMessagesValue {
  /** Total unread messages across all conversations. */
  totalUnread: number;
  /** Per-conversation unread counts (conversationId → count). */
  unreadByConversation: Record<string, number>;
  /** Re-fetch counts now (e.g. after opening a chat). */
  refresh(): Promise<void>;
  /** Mark a conversation read on the server and clear its local count. */
  markRead(conversationId: string): Promise<void>;
}

const UnreadMessagesContext = createContext<UnreadMessagesValue>({
  totalUnread: 0,
  unreadByConversation: {},
  refresh: async () => {},
  markRead: async () => {},
});

const POLL_MS = 30_000;

export function UnreadMessagesProvider({ children }: { children: React.ReactNode }) {
  const { repo, userId } = useCommunity();
  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const inFlight = useRef(false);
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;

  const refresh = useCallback(async () => {
    if (!repo || !userId || inFlight.current) return;
    const requestedUserId = userId;
    inFlight.current = true;
    try {
      // Lightweight RPC — returns only per-conversation counts, so polling
      // stays cheap no matter how many messages exist.
      const map = await repo.getConversationUnreadCounts();
      if (currentUserIdRef.current === requestedUserId) {
        setUnreadByConversation(map);
      }
    } catch {
      // Non-fatal — keep the previous counts; next poll retries.
    } finally {
      inFlight.current = false;
    }
  }, [repo, userId]);

  const markRead = useCallback(async (conversationId: string) => {
    // Clear locally first so badges react instantly.
    setUnreadByConversation(prev => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    if (!repo) return;
    try {
      await repo.markConversationRead(conversationId);
    } catch {
      // Non-fatal — the next refresh will re-surface the count if it failed.
    }
  }, [repo]);

  useEffect(() => {
    setUnreadByConversation({});
    inFlight.current = false;
    if (!userId) {
      return;
    }
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [userId, refresh]);

  const totalUnread = Object.values(unreadByConversation).reduce((a, b) => a + b, 0);

  return (
    <UnreadMessagesContext.Provider value={{ totalUnread, unreadByConversation, refresh, markRead }}>
      {children}
    </UnreadMessagesContext.Provider>
  );
}

export function useUnreadMessages() {
  return useContext(UnreadMessagesContext);
}
