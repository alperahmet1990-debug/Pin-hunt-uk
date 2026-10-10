/**
 * BoardsContext — custom (collector-made) and suggested Boards.
 *
 * Custom boards are cached per account in AsyncStorage and, when signed in,
 * synced to Supabase `user_boards` (migration 043):
 *  - every change applies locally first, then is queued per board
 *    (PushQueue — coalesced, retried, persisted across restarts);
 *  - on sign-in the server's boards are pulled and reconciled
 *    (boards-sync.ts): the first sync of an account on a device uploads the
 *    boards already on it; after that the server wins except for boards
 *    with local changes still pending.
 * Guests (no account) keep boards on the device only, as before.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { PushQueue } from '@/context/collection-push-queue';
import {
  boardChangesMatch,
  boardToRow,
  reconcileBoards,
  rowToBoard,
  type BoardChange,
  type BoardRow,
} from '@/context/boards-sync';
import type { Board } from '@/types/board';
import type { CataloguePin } from '@workspace/pin-repository';

interface BoardsContextValue {
  customBoards: Board[];
  suggestedBoards: Board[];
  allBoards: Board[];
  createBoard: (name: string) => Board;
  deleteBoard: (boardId: string) => void;
  addPinToBoard: (boardId: string, pinId: string) => void;
  /** Bulk addPinToBoard — same owned/for-trade rule, one persist. */
  addPinsToBoard: (boardId: string, pinIds: string[]) => void;
  removePinFromBoard: (boardId: string, pinId: string) => void;
  setBoardThumbnail: (boardId: string, pinId: string | undefined) => void;
  renameBoard: (boardId: string, newName: string) => void;
  getBoardById: (boardId: string) => Board | undefined;
  getBoardPins: (board: Board) => CataloguePin[];
}

const BoardsContext = createContext<BoardsContextValue | null>(null);

const LEGACY_STORAGE_KEY = '@pinhunt_boards_v1';
const STORAGE_KEY_PREFIX = '@pinhunt_boards_v2';
// Board writes that haven't reached the server yet, keyed by board id.
const PENDING_KEY_PREFIX = '@pinhunt_boards_pending_v1';
// Set once this account's boards have been pulled on this device; until
// then local boards are adopted (uploaded) rather than treated as deleted.
const SYNCED_KEY_PREFIX = '@pinhunt_boards_synced_v1';

// user_boards isn't in the generated Database types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const boardsTable = () => (supabase as any).from('user_boards');

interface LegacyBoardClaim {
  version: 2;
  claimedBy: string;
  boards: Board[];
}

function isLegacyBoardClaim(value: unknown): value is LegacyBoardClaim {
  if (!value || typeof value !== 'object') return false;
  const claim = value as Partial<LegacyBoardClaim>;
  return claim.version === 2 && typeof claim.claimedBy === 'string' && Array.isArray(claim.boards);
}

function makeId() {
  return 'board_' + Date.now().toString() + Math.random().toString(36).slice(2, 7);
}

export function BoardsProvider({ children }: { children: React.ReactNode }) {
  const { collection } = useCollection();
  const { pins } = usePinCatalogue();
  const { user } = useAuth();
  const [customBoards, setCustomBoards] = useState<Board[]>([]);
  const userId = user?.id;
  const storageKey = `${STORAGE_KEY_PREFIX}:${userId ?? 'guest'}`;
  // Which account's boards are loaded. Derived (not a plain boolean) so that
  // on an account switch `loaded` is false in the very same render — the
  // pull effect must never reconcile one account's boards into another's.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loaded = loadedKey === storageKey;
  
  // Latest boards, updated synchronously so back-to-back calls in one
  // handler (e.g. createBoard then addPinsToBoard) see each other.
  const boardsRef = useRef<Board[]>([]);
  // Monotonic change counter; starts at Date.now() so it never collides
  // with revs in a pending queue persisted by an earlier app session.
  const revRef = useRef(Date.now());
  // Last rev that touched each board — lets a pull ignore boards changed
  // after it started.
  const touchedRevRef = useRef<Record<string, number>>({});

  // One queue per signed-in account. A previous account's queue is simply
  // abandoned: its callbacks only ever write that account's pending key.
  const queue = useMemo(() => {
    if (!userId || !isSupabaseConfigured) return null;
    const pendingKey = `${PENDING_KEY_PREFIX}:${userId}`;
    return new PushQueue<BoardChange>({
      send: (boardId, change) =>
        change.op === 'upsert'
          ? boardsTable().upsert(boardToRow(change.board, userId), { onConflict: 'user_id,id' })
          : boardsTable().delete().eq('user_id', userId).eq('id', boardId),
      onPendingChange: pending => {
        AsyncStorage.setItem(pendingKey, JSON.stringify(pending)).catch(() => {});
      },
      onError: message => console.warn('[boards] sync push failed:', message),
      isSame: boardChangesMatch,
    });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoadedKey(null);
    boardsRef.current = [];
    setCustomBoards([]);

    const loadBoards = async () => {
      try {
        let data = await AsyncStorage.getItem(storageKey);

        // The old cache was not account-scoped. The first authenticated user
        // on this installation claims it once. The claim envelope retains the
        // data and owner if the app closes mid-migration, so only that same
        // account can resume without exposing or losing existing Boards.
        if (!data && user?.id) {
          const legacyData = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacyData) {
            const parsedLegacy: unknown = JSON.parse(legacyData);
            let boardsToMigrate: Board[] | null = null;

            if (Array.isArray(parsedLegacy)) {
              boardsToMigrate = parsedLegacy;
              const claim: LegacyBoardClaim = {
                version: 2,
                claimedBy: user.id,
                boards: boardsToMigrate,
              };
              await AsyncStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(claim));
            } else if (isLegacyBoardClaim(parsedLegacy) && parsedLegacy.claimedBy === user.id) {
              boardsToMigrate = parsedLegacy.boards;
            }

            if (boardsToMigrate) {
              data = JSON.stringify(boardsToMigrate);
              await AsyncStorage.setItem(storageKey, data);
              await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
            }
          }
        }

        const boards: Board[] = data ? JSON.parse(data) : [];
        if (!cancelled) {
          boardsRef.current = boards;
          setCustomBoards(boards);
        }
      } catch {
        // A corrupt local cache must not prevent boards from opening.
        if (!cancelled) {
          boardsRef.current = [];
          setCustomBoards([]);
        }
      }
      if (queue && userId) {
        try {
          const saved = await AsyncStorage.getItem(`${PENDING_KEY_PREFIX}:${userId}`);
          // Not flushed yet — the pull below flushes once it has reconciled.
          if (saved && !cancelled) queue.hydrate(JSON.parse(saved));
        } catch { /* a corrupt queue just means nothing to retry */ }
      }
      if (!cancelled) setLoadedKey(storageKey);
    };

    void loadBoards();
    return () => { cancelled = true; };
  }, [storageKey, userId, queue]);

  const persist = useCallback((boards: Board[]) => {
    AsyncStorage.setItem(storageKey, JSON.stringify(boards));
  }, [storageKey]);

  /**
   * The single write path for custom boards: apply locally, cache, and
   * queue a sync for each board that changed (deleted ⇒ delete).
   */
  const apply = useCallback((mutate: (prev: Board[]) => Board[], touched: string[]) => {
    const prev = boardsRef.current;
    const next = mutate(prev);
    if (next === prev) return;
    boardsRef.current = next;
    setCustomBoards(next);
    persist(next);
    for (const id of touched) {
      const rev = ++revRef.current;
      touchedRevRef.current[id] = rev;
      if (!queue) continue;
      const board = next.find(b => b.id === id);
      queue.enqueue(id, board ? { op: 'upsert', rev, board } : { op: 'delete', rev });
    }
  }, [persist, queue]);

  // ── Pull & reconcile on sign-in ───────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !queue || !userId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const syncedKey = `${SYNCED_KEY_PREFIX}:${userId}`;

    const attempt = async (triesLeft: number) => {
      const startRev = revRef.current;
      const { data, error } = await boardsTable()
        .select('id, name, pin_ids, thumbnail_pin_id, created_at')
        .eq('user_id', userId)
        .order('created_at');
      if (cancelled) return;
      if (error || !data) {
        console.warn('[boards] sync pull failed:', error?.message ?? 'no data');
        if (triesLeft > 0) retryTimer = setTimeout(() => attempt(triesLeft - 1), 5000);
        return;
      }
      const adoptLocal = !(await AsyncStorage.getItem(syncedKey));
      if (cancelled) return;

      const keepLocal = new Set<string>(queue.entries().map(([id]) => id));
      for (const [id, rev] of Object.entries(touchedRevRef.current)) {
        if (rev > startRev) keepLocal.add(id);
      }
      const { boards, toPush } = reconcileBoards(
        (data as Omit<BoardRow, 'user_id'>[]).map(rowToBoard),
        boardsRef.current,
        keepLocal,
        adoptLocal,
      );
      boardsRef.current = boards;
      setCustomBoards(boards);
      persist(boards);
      for (const board of toPush) {
        queue.stage(board.id, { op: 'upsert', rev: ++revRef.current, board });
      }
      AsyncStorage.setItem(syncedKey, '1').catch(() => {});
      queue.flush();
    };

    void attempt(3);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [loaded, queue, userId, persist]);

  // Auto-suggested boards: one per unique collection among owned pins
  const suggestedBoards = useMemo<Board[]>(() => {
    const ownedEntries = Object.values(collection).filter(e => e.status === 'owned');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const byCollection = new Map<string, string[]>();
    for (const entry of ownedEntries) {
      const pin = pins.find(p => p.id === entry.pinId);
      if (!pin) continue;
      const existing = byCollection.get(pin.collection) ?? [];
      byCollection.set(pin.collection, [...existing, pin.id]);
    }
    return Array.from(byCollection.entries()).map(([col, pinIds]) => ({
      id: `sug::${col}`,
      name: col,
      pinIds,
      createdAt: '',
      isCustom: false,
      suggestedCollection: col,
    }));
  }, [collection, pins]);

  const allBoards = useMemo(
    () => [...suggestedBoards, ...customBoards],
    [suggestedBoards, customBoards],
  );

  const createBoard = useCallback((name: string): Board => {
    const board: Board = {
      id: makeId(),
      name: name.trim(),
      pinIds: [],
      createdAt: new Date().toISOString(),
      isCustom: true,
    };
    apply(prev => [...prev, board], [board.id]);
    return board;
  }, [apply]);

  const deleteBoard = useCallback((boardId: string) => {
    apply(prev => prev.filter(b => b.id !== boardId), [boardId]);
  }, [apply]);

  const addPinToBoard = useCallback((boardId: string, pinId: string) => {
    // A board organises pins the collector has. Keeping only pin IDs in a
    // board (rather than creating another user_pin) preserves ownership while
    // allowing the same owned pin to appear on several boards.
    const entry = collection[pinId];
    if (!entry || (entry.status !== 'owned' && entry.status !== 'for_trade')) return;
    const board = boardsRef.current.find(b => b.id === boardId);
    if (!board || board.pinIds.includes(pinId)) return;
    apply(prev => prev.map(b =>
      b.id === boardId ? { ...b, pinIds: [...b.pinIds, pinId] } : b,
    ), [boardId]);
  }, [collection, apply]);

  const addPinsToBoard = useCallback((boardId: string, pinIds: string[]) => {
    const kept = pinIds.filter(id => {
      const entry = collection[id];
      return entry && (entry.status === 'owned' || entry.status === 'for_trade');
    });
    const board = boardsRef.current.find(b => b.id === boardId);
    const added = board ? kept.filter(id => !board.pinIds.includes(id)) : [];
    if (added.length === 0) return;
    apply(prev => prev.map(b =>
      b.id === boardId ? { ...b, pinIds: [...b.pinIds, ...added] } : b,
    ), [boardId]);
  }, [collection, apply]);

  const removePinFromBoard = useCallback((boardId: string, pinId: string) => {
    apply(prev => prev.map(b =>
      b.id === boardId
        ? {
            ...b,
            pinIds: b.pinIds.filter(id => id !== pinId),
            // A removed pin can't stay the cover.
            thumbnailPinId: b.thumbnailPinId === pinId ? undefined : b.thumbnailPinId,
          }
        : b,
    ), [boardId]);
  }, [apply]);

  const setBoardThumbnail = useCallback((boardId: string, pinId: string | undefined) => {
    apply(prev => prev.map(b =>
      b.id === boardId ? { ...b, thumbnailPinId: pinId } : b,
    ), [boardId]);
  }, [apply]);

  const renameBoard = useCallback((boardId: string, newName: string) => {
    apply(prev => prev.map(b =>
      b.id === boardId ? { ...b, name: newName.trim() } : b,
    ), [boardId]);
  }, [apply]);

  const getBoardById = useCallback(
    (boardId: string) => allBoards.find(b => b.id === boardId),
    [allBoards],
  );

  const getBoardPins = useCallback(
    (board: Board): CataloguePin[] => {
      if (!board.isCustom && board.suggestedCollection) {
        // Suggested: all owned pins from that collection
        const ownedIds = new Set(
          Object.values(collection)
            .filter(e => e.status === 'owned')
            .map(e => e.pinId),
        );
        return pins.filter(
          p => p.collection === board.suggestedCollection && ownedIds.has(p.id),
        );
      }
      // Custom boards contain only pins the collector still owns. Old local
      // references are retained so a temporarily removed pin can be restored,
      // but never appear as ownership on a board.
      const ownedIds = new Set(
        Object.values(collection)
          .filter(e => e.status === 'owned' || e.status === 'for_trade')
          .map(e => e.pinId),
      );
      return board.pinIds
        .filter(id => ownedIds.has(id))
        .map(id => pins.find(p => p.id === id))
        .filter((p): p is CataloguePin => p !== undefined);
    },
    [collection, pins],
  );

  if (!loaded) return null;

  return (
    <BoardsContext.Provider
      value={{
        customBoards,
        suggestedBoards,
        allBoards,
        createBoard,
        deleteBoard,
        addPinToBoard,
        addPinsToBoard,
        removePinFromBoard,
        setBoardThumbnail,
        renameBoard,
        getBoardById,
        getBoardPins,
      }}
    >
      {children}
    </BoardsContext.Provider>
  );
}

export function useBoards() {
  const ctx = useContext(BoardsContext);
  if (!ctx) throw new Error('useBoards must be inside BoardsProvider');
  return ctx;
}
