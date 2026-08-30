import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CollectionEntry, CollectionMap } from '@/types/collection';
import type { CollectionStatus } from '@/types/pin';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  CollectionPushQueue,
  normalizeCollectionQuantities,
  reconcileCollectionEntry,
  type CollectionPushChange,
} from '@/context/collection-push-queue';

interface CollectionContextValue {
  collection: CollectionMap;
  setStatus: (pinId: string, status: CollectionStatus) => void;
  adjustQuantity: (pinId: string, delta: number) => void;
  setNotes: (pinId: string, notes: string) => void;
  getEntry: (pinId: string) => CollectionEntry | undefined;
  counts: { owned: number; wanted: number; forTrade: number };
  recentlyViewed: string[];
  markViewed: (pinId: string) => void;
  estimatedValue: number;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

const STORAGE_KEY = '@pinhunt_collection_v1';
const VIEWED_KEY = '@pinhunt_viewed_v1';
// Which signed-in account the locally stored collection belongs to. Used to
// clear local data when a different account signs in on the same device.
const OWNER_KEY = '@pinhunt_collection_owner_v1';
// Status changes that failed to reach the server (offline / transient error),
// keyed by pinId. Flushed after the next successful pull or status change.
const PENDING_KEY = '@pinhunt_collection_pending_v1';

type PendingPush = CollectionPushChange & { status: CollectionStatus };
type PendingPushes = Record<string, PendingPush>;
type PendingEnvelope = { ownerId: string; pushes: PendingPushes };

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [collection, setCollection] = useState<CollectionMap>({});
  const latestCollectionRef = useRef<CollectionMap>({});
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collectionOwnerId, setCollectionOwnerId] = useState<string | null>(null);
  const { ensurePins } = usePinCatalogue();
  const { user } = useAuth();

  // The catalogue context caches only a slice of the catalogue; pins in the
  // user's collection may fall outside it. Pull any missing ones in so the
  // Collection tab, boards, and home screen can always render them.
  useEffect(() => {
    if (!loaded) return;
    const ids = Object.keys(collection);
    if (ids.length > 0) void ensurePins(ids);
  }, [loaded, collection, ensurePins]);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(VIEWED_KEY),
      AsyncStorage.getItem(OWNER_KEY),
    ]).then(([colData, viewData, ownerId]) => {
      if (colData) {
        const saved = normalizeCollectionQuantities(
          JSON.parse(colData) as Record<string, CollectionEntry>,
        ) as CollectionMap;
        latestCollectionRef.current = saved;
        setCollection(saved);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      }
      if (viewData) setRecentlyViewed(JSON.parse(viewData));
      setCollectionOwnerId(ownerId);
      setLoaded(true);
    });
  }, []);

  const userId = user?.id;
  const pendingOwnerRef = useRef<string | null>(null);

  // ── Push helpers ────────────────────────────────────────────────────────────
  // Failed pushes are queued (per pin, last-write-wins) and retried after the
  // next successful pull or the next status change while signed in.
  const pushQueueRef = useRef<CollectionPushQueue | null>(null);
  if (!pushQueueRef.current) {
    pushQueueRef.current = new CollectionPushQueue({
      send: (pinId, change) =>
        supabase.rpc('set_user_pin_status', {
          p_pinhunt_id: pinId,
          p_status: change.status,
          p_quantity: change.quantity,
        }),
      onPendingChange: pending => {
        const ownerId = pendingOwnerRef.current;
        if (!ownerId) {
          AsyncStorage.removeItem(PENDING_KEY);
          return;
        }
        const envelope: PendingEnvelope = {
          ownerId,
          pushes: pending as PendingPushes,
        };
        AsyncStorage.setItem(PENDING_KEY, JSON.stringify(envelope));
      },
      onError: message => {
        console.warn('[collection] sync push failed:', message);
      },
    });
  }
  const pushQueue = pushQueueRef.current;

  const pushEntry = useCallback((pinId: string, change: PendingPush) => {
    if (!userId || pendingOwnerRef.current !== userId) return;
    pushQueue.enqueue(pinId, change);
  }, [pushQueue, userId]);

  const flushPending = useCallback(() => {
    pushQueue.flush();
  }, [pushQueue]);

  // ── Pull & reconcile ────────────────────────────────────────────────────────
  // Pull the signed-in user's collection from Supabase. For a returning user
  // on this device the server is authoritative (removals made elsewhere are
  // applied here, except entries with pending unpushed changes). On first
  // sign-in on this device, local guest entries are kept and pushed up. If a
  // *different* account was previously synced here, local data is cleared
  // first so collections never bleed between accounts.
  const pulledForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded || !isSupabaseConfigured) return;

    if (!user) {
      // Signed out: if the local collection belonged to a synced account,
      // clear it so the next user (or guest) doesn't inherit it.
      pulledForUserRef.current = null;
      pendingOwnerRef.current = null;
      pushQueue.clear();
      AsyncStorage.getItem(OWNER_KEY).then(owner => {
        if (!owner) return;
        latestCollectionRef.current = {};
        setCollection({});
        setCollectionOwnerId(null);
        AsyncStorage.multiRemove([STORAGE_KEY, OWNER_KEY, PENDING_KEY]);
      });
      return;
    }

    if (pulledForUserRef.current === user.id) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async (triesLeft: number) => {
      const [owner, rawPending] = await Promise.all([
        AsyncStorage.getItem(OWNER_KEY),
        AsyncStorage.getItem(PENDING_KEY),
      ]);
      if (cancelled) return;
      const returningUser = owner === user.id;
      pendingOwnerRef.current = user.id;
      pushQueue.clear();
      if (returningUser && rawPending) {
        try {
          const parsed = JSON.parse(rawPending) as unknown;
          const rawPushes =
            typeof parsed === 'object' &&
            parsed !== null &&
            'ownerId' in parsed &&
            'pushes' in parsed
              ? (parsed as PendingEnvelope).ownerId === user.id
                ? (parsed as PendingEnvelope).pushes
                : {}
              : (parsed as Record<string, PendingPush | CollectionStatus>);
          const normalised = Object.fromEntries(
            Object.entries(rawPushes).map(([pinId, value]) => [
              pinId,
              typeof value === 'string'
                ? { status: value, quantity: 1 }
                : value,
            ]),
          ) as PendingPushes;
          pushQueue.hydrate(normalised);
        } catch {
          pushQueue.clear();
        }
      }
      if (owner && owner !== user.id) {
        // A different account's data is on this device — clear it.
        pushQueue.clear();
        latestCollectionRef.current = {};
        setCollection({});
        await AsyncStorage.multiRemove([STORAGE_KEY, PENDING_KEY]);
      }

      const { data, error } = await supabase
        .from('user_pins')
        .select('status, quantity, notes, created_at, pins(pinhunt_id)')
        .eq('user_id', user.id);
      if (cancelled) return;
      if (error || !data) {
        console.warn('[collection] sync pull failed:', error?.message ?? 'no data');
        if (triesLeft > 0) retryTimer = setTimeout(() => attempt(triesLeft - 1), 5000);
        return;
      }

      pulledForUserRef.current = user.id;
      AsyncStorage.setItem(OWNER_KEY, user.id);
      setCollectionOwnerId(user.id);
      setCollection(prev => {
        const next: CollectionMap = {};
        const serverIds = new Set<string>();
        for (const row of data as any[]) {
          const pinId = row.pins?.pinhunt_id;
          const status = row.status as string;
          // Only accept statuses the app understands; skip anything else
          // (e.g. legacy values like 'traded' that may linger in old rows).
          if (!pinId || !['owned', 'wanted', 'for_trade'].includes(status)) continue;
          serverIds.add(pinId);
          const serverEntry: CollectionEntry = {
            pinId,
            status: status as CollectionStatus,
            quantity: Math.max(1, Number(row.quantity) || 1),
            notes: row.notes ?? prev[pinId]?.notes ?? '',
            dateAdded: prev[pinId]?.dateAdded ?? row.created_at ?? new Date().toISOString(),
          };
          next[pinId] = reconcileCollectionEntry(
            serverEntry,
            prev[pinId],
            pushQueue.has(pinId),
          );
        }
        // Keep local entries not on the server when: first sync for this
        // account here (adopt guest data — push it up), or the entry has a
        // pending unpushed change.
        for (const entry of Object.values(prev)) {
          if (serverIds.has(entry.pinId)) continue;
          if (!returningUser || pushQueue.has(entry.pinId)) {
            next[entry.pinId] = entry;
            if (!returningUser) {
              pushQueue.stage(entry.pinId, {
                status: entry.status,
                quantity: entry.quantity ?? 1,
              });
            }
          }
        }
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        latestCollectionRef.current = next;
        return next;
      });
      flushPending();
    };

    void attempt(3);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [loaded, user?.id, flushPending, pushQueue]);

  const setStatus = useCallback((pinId: string, status: CollectionStatus) => {
    const existing = collection[pinId];
    const quantity = status === 'wanted' || status === 'none'
      ? 1
      : existing?.quantity ?? 1;
    if (userId && isSupabaseConfigured) {
      if (pendingOwnerRef.current !== userId) {
        pendingOwnerRef.current = userId;
        pushQueue.clear();
      }
      pushEntry(pinId, { status, quantity });
      // Piggyback: retry anything that failed earlier.
      pushQueue.flush();
    }
    setCollection(prev => {
      const existing = prev[pinId];
      let next: CollectionMap;
      if (status === 'none') {
        next = { ...prev };
        delete next[pinId];
      } else {
        next = {
          ...prev,
          [pinId]: {
            pinId,
            status: status as CollectionStatus,
            quantity,
            notes: existing?.notes ?? '',
            dateAdded: existing?.dateAdded ?? new Date().toISOString(),
          },
        };
      }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      latestCollectionRef.current = next;
      return next;
    });
  }, [collection, userId, pushEntry, pushQueue]);

  const adjustQuantity = useCallback((pinId: string, delta: number) => {
    const existing = latestCollectionRef.current[pinId];
    if (!existing || (existing.status !== 'owned' && existing.status !== 'for_trade')) return;
    const quantity = Math.max(1, (existing.quantity ?? 1) + Math.trunc(delta));
    if (quantity === existing.quantity) return;
    const next = {
      ...latestCollectionRef.current,
      [pinId]: { ...existing, quantity },
    };
    latestCollectionRef.current = next;
    setCollection(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const change = { status: existing.status, quantity };
    if (userId && isSupabaseConfigured) pushEntry(pinId, change);
  }, [userId, pushEntry]);

  const setNotes = useCallback((pinId: string, notes: string) => {
    setCollection(prev => {
      const entry = prev[pinId];
      if (!entry) return prev;
      const next = { ...prev, [pinId]: { ...entry, notes } };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      latestCollectionRef.current = next;
      return next;
    });
  }, []);

  const visibleCollection =
    collectionOwnerId && collectionOwnerId !== userId ? {} : collection;

  const getEntry = useCallback(
    (pinId: string) => visibleCollection[pinId],
    [visibleCollection],
  );

  const markViewed = useCallback((pinId: string) => {
    setRecentlyViewed(prev => {
      const next = [pinId, ...prev.filter(id => id !== pinId)].slice(0, 12);
      AsyncStorage.setItem(VIEWED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const entries = Object.values(visibleCollection);
  const counts = {
    owned: entries.filter(e => e.status === 'owned').length,
    wanted: entries.filter(e => e.status === 'wanted').length,
    forTrade: entries.filter(e => e.status === 'for_trade').length,
  };

  // Estimated value is computed by the calling screen from PINS + collection
  const estimatedValue = 0; // placeholder; real computation done in Collection screen

  if (!loaded) return null;

  return (
    <CollectionContext.Provider
      value={{
        collection: visibleCollection,
        setStatus,
        adjustQuantity,
        setNotes,
        getEntry,
        counts,
        recentlyViewed,
        markViewed,
        estimatedValue,
      }}
    >
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollection() {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error('useCollection must be inside CollectionProvider');
  return ctx;
}
