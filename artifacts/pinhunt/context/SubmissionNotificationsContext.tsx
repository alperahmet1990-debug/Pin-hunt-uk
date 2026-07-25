/**
 * SubmissionNotificationsContext
 *
 * Tracks which of the current user's pin submissions have status changes
 * (approved / rejected / needs_changes) that the user hasn't seen yet.
 *
 * Persistence: AsyncStorage key `pinhunt_sub_seen_<userId>` stores a JSON
 * object mapping submissionId → last-seen status.  A submission is "unseen"
 * when its current status is a notifiable one AND differs from the stored
 * last-seen status (or has never been stored before).
 *
 * Consumers:
 *   • Tab layout  — reads `unseenCount` to show a badge dot on the Profile tab.
 *   • My Submissions screen — reads `unseenIds` to highlight cards, calls
 *     `markAllSeen()` when the screen mounts.
 *   • Profile screen — reads `unseenCount` to badge the row.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createSupabaseUserRepository } from '@workspace/pin-repository';
import type { PinSubmission, PinSubmissionStatus } from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// Statuses that trigger a notification
const NOTIFIABLE: PinSubmissionStatus[] = ['approved', 'rejected', 'needs_changes'];

type SeenMap = Record<string, PinSubmissionStatus>;

interface SubmissionNotificationsContextValue {
  /** Number of submissions with an unseen status change. */
  unseenCount: number;
  /** Set of submission IDs with unseen status changes. */
  unseenIds: Set<string>;
  /** Call when the user opens the My Submissions screen. */
  markAllSeen: () => Promise<void>;
}

const SubmissionNotificationsContext =
  createContext<SubmissionNotificationsContextValue>({
    unseenCount: 0,
    unseenIds: new Set(),
    markAllSeen: async () => {},
  });

export function useSubmissionNotifications() {
  return useContext(SubmissionNotificationsContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SubmissionNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [unseenIds, setUnseenIds] = useState<Set<string>>(new Set());
  const submissionsRef = useRef<PinSubmission[]>([]);

  const storageKey = userId ? `pinhunt_sub_seen_${userId}` : null;

  // ── Compute unseen from latest submissions ──────────────────────────────────
  const computeUnseen = useCallback(
    async (submissions: PinSubmission[]): Promise<Set<string>> => {
      if (!storageKey) return new Set();

      let seen: SeenMap = {};
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) seen = JSON.parse(raw) as SeenMap;
      } catch {
        // Ignore parse errors; treat as empty
      }

      const unseen = new Set<string>();
      for (const sub of submissions) {
        if (!NOTIFIABLE.includes(sub.status)) continue;
        // Unseen when the stored status doesn't match the current one
        if (seen[sub.id] !== sub.status) {
          unseen.add(sub.id);
        }
      }
      return unseen;
    },
    [storageKey],
  );

  // ── Fetch + refresh ─────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const repo = createSupabaseUserRepository(supabase as any);
      const submissions = await repo.getMyPinSubmissions(userId);
      submissionsRef.current = submissions;
      const unseen = await computeUnseen(submissions);
      setUnseenIds(unseen);
    } catch {
      // Silently ignore — this is non-critical
    }
  }, [userId, computeUnseen]);

  // ── markAllSeen ─────────────────────────────────────────────────────────────
  const markAllSeen = useCallback(async () => {
    if (!storageKey) return;
    // Build map of current statuses for all notifiable submissions
    const seen: SeenMap = {};
    for (const sub of submissionsRef.current) {
      if (NOTIFIABLE.includes(sub.status)) {
        seen[sub.id] = sub.status;
      }
    }
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(seen));
    } catch {
      // Best-effort
    }
    setUnseenIds(new Set());
  }, [storageKey]);

  // ── Fetch on mount + auth change ────────────────────────────────────────────
  useEffect(() => {
    if (userId) {
      refresh();
    } else {
      setUnseenIds(new Set());
      submissionsRef.current = [];
    }
  }, [userId, refresh]);

  // ── Realtime: react to status changes on the user's submissions ────────────
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`pin_submissions_user_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pin_submissions',
          filter: `submitted_by=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as { id?: string; status?: PinSubmissionStatus };
          if (!row?.id || !row?.status) return;

          const existing = submissionsRef.current.find(s => s.id === row.id);
          if (existing) {
            // Patch the cached submission's status and recompute unseen
            // without a full refetch.
            submissionsRef.current = submissionsRef.current.map(s =>
              s.id === row.id ? { ...s, status: row.status as PinSubmissionStatus } : s,
            );
            const unseen = await computeUnseen(submissionsRef.current);
            setUnseenIds(unseen);
          } else {
            // Unknown submission (e.g. created on another device) — fall back
            // to a full refresh.
            refresh();
          }
        },
      )
      .subscribe(status => {
        // On (re)connect, run one catch-up fetch so status changes that
        // happened while the channel was down are picked up.
        if (status === 'SUBSCRIBED') { refresh(); }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, computeUnseen, refresh]);

  // ── Re-fetch when app returns to foreground ─────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <SubmissionNotificationsContext.Provider
      value={{
        unseenCount: unseenIds.size,
        unseenIds,
        markAllSeen,
      }}
    >
      {children}
    </SubmissionNotificationsContext.Provider>
  );
}
