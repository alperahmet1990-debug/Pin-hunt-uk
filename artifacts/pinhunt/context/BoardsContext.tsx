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
  getBoardById: (boardId: string) => Board | undefined;
  getBoardPins: (board: Board) => CataloguePin[];
}

const BoardsContext = createContext<BoardsContextValue | null>(null);

const STORAGE_KEY = '@pinhunt_boards_v1';

function makeId() {
  return 'board_' + Date.now().toString() + Math.random().toString(36).slice(2, 7);
}

export function BoardsProvider({ children }: { children: React.ReactNode }) {
  const { collection } = useCollection();
  const { pins } = usePinCatalogue();
  const [customBoards, setCustomBoards] = useState<Board[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(data => {
      if (data) setCustomBoards(JSON.parse(data));
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((boards: Board[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  }, []);

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
    setCustomBoards(prev => {
      const next = prev.map(b =>
        b.id === boardId && !b.pinIds.includes(pinId)
          ? { ...b, pinIds: [...b.pinIds, pinId] }
          : b,
      );
      persist(next);
      return next;
    });
  }, [persist]);

  const removePinFromBoard = useCallback((boardId: string, pinId: string) => {
    setCustomBoards(prev => {
      const next = prev.map(b =>
        b.id === boardId
          ? { ...b, pinIds: b.pinIds.filter(id => id !== pinId) }
          : b,
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
      // Custom: pins in pinIds order
      return board.pinIds
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
