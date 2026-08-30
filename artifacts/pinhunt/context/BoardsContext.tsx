import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useAuth } from '@/context/AuthContext';
import type { Board } from '@/types/board';
import type { CataloguePin } from '@workspace/pin-repository';

interface BoardsContextValue {
  customBoards: Board[];
  suggestedBoards: Board[];
  allBoards: Board[];
  createBoard: (name: string) => Board;
  deleteBoard: (boardId: string) => void;
  addPinToBoard: (boardId: string, pinId: string) => void;
  removePinFromBoard: (boardId: string, pinId: string) => void;
  setBoardThumbnail: (boardId: string, pinId: string | undefined) => void;
  getBoardById: (boardId: string) => Board | undefined;
  getBoardPins: (board: Board) => CataloguePin[];
}

const BoardsContext = createContext<BoardsContextValue | null>(null);

const LEGACY_STORAGE_KEY = '@pinhunt_boards_v1';
const STORAGE_KEY_PREFIX = '@pinhunt_boards_v2';

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
  const [loaded, setLoaded] = useState(false);
  const storageKey = `${STORAGE_KEY_PREFIX}:${user?.id ?? 'guest'}`;

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
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

        if (!cancelled) setCustomBoards(data ? JSON.parse(data) : []);
      } catch {
        // A corrupt local cache must not prevent boards from opening.
        if (!cancelled) setCustomBoards([]);
      }
      if (!cancelled) setLoaded(true);
    };

    void loadBoards();
    return () => { cancelled = true; };
  }, [storageKey, user?.id]);

  const persist = useCallback((boards: Board[]) => {
    AsyncStorage.setItem(storageKey, JSON.stringify(boards));
  }, [storageKey]);

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
    setCustomBoards(prev => {
      const next = [...prev, board];
      persist(next);
      return next;
    });
    return board;
  }, [persist]);

  const deleteBoard = useCallback((boardId: string) => {
    setCustomBoards(prev => {
      const next = prev.filter(b => b.id !== boardId);
      persist(next);
      return next;
    });
  }, [persist]);

  const addPinToBoard = useCallback((boardId: string, pinId: string) => {
    // A board organises pins the collector has. Keeping only pin IDs in a
    // board (rather than creating another user_pin) preserves ownership while
    // allowing the same owned pin to appear on several boards.
    const entry = collection[pinId];
    if (!entry || (entry.status !== 'owned' && entry.status !== 'for_trade')) return;
    setCustomBoards(prev => {
      const next = prev.map(b =>
        b.id === boardId && !b.pinIds.includes(pinId)
          ? { ...b, pinIds: [...b.pinIds, pinId] }
          : b,
      );
      persist(next);
      return next;
    });
  }, [collection, persist]);

  const removePinFromBoard = useCallback((boardId: string, pinId: string) => {
    setCustomBoards(prev => {
      const next = prev.map(b =>
        b.id === boardId
          ? {
              ...b,
              pinIds: b.pinIds.filter(id => id !== pinId),
              // A removed pin can't stay the cover.
              thumbnailPinId: b.thumbnailPinId === pinId ? undefined : b.thumbnailPinId,
            }
          : b,
      );
      persist(next);
      return next;
    });
  }, [persist]);

  const setBoardThumbnail = useCallback((boardId: string, pinId: string | undefined) => {
    setCustomBoards(prev => {
      const next = prev.map(b =>
        b.id === boardId ? { ...b, thumbnailPinId: pinId } : b,
      );
      persist(next);
      return next;
    });
  }, [persist]);

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
        removePinFromBoard,
        setBoardThumbnail,
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
