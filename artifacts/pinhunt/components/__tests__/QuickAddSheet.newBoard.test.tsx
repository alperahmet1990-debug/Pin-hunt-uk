import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { CollectionStatus } from '@/types/pin';
import type { Board } from '@/types/board';
import { QuickAddSheet } from '../QuickAddSheet';

// Stateful stand-ins for CollectionContext and BoardsContext. addPinToBoard
// keeps the real guard: boards only hold pins that are Owned or For Trade.
type Store = { collection: ReturnType<typeof useFakeStores>['collection']; boards: ReturnType<typeof useFakeStores>['boards'] };
const mockStoreContext = createContext<Store | null>(null);
const mockUseStore = () => useContext(mockStoreContext)!;

jest.mock('@/context/CollectionContext', () => ({ useCollection: () => mockUseStore().collection }));
jest.mock('@/context/BoardsContext', () => ({ useBoards: () => mockUseStore().boards }));
jest.mock('react-native-keyboard-controller', () => {
  const { View } = require('react-native');
  return { KeyboardStickyView: View };
});
jest.mock('../KeyboardAwareScrollViewCompat', () => {
  const { ScrollView } = require('react-native');
  return { KeyboardAwareScrollViewCompat: ScrollView };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const PIN = { id: 'p1', title: 'Test Pin', collection: 'Test Set' } as never;

let latest: { statuses: Record<string, CollectionStatus>; boards: Board[] };

function useFakeStores(initial: CollectionStatus) {
  const [statuses, setStatuses] = useState<Record<string, CollectionStatus>>({ p1: initial });
  const [boards, setBoards] = useState<Board[]>([]);
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  latest = { statuses, boards };

  const setStatus = useCallback((pinId: string, status: CollectionStatus) => {
    setStatuses(prev => ({ ...prev, [pinId]: status }));
  }, []);
  const getEntry = (pinId: string) =>
    statuses[pinId] && statuses[pinId] !== 'none'
      ? { pinId, status: statuses[pinId], quantity: 1, notes: '', dateAdded: '' }
      : undefined;
  const createBoard = (name: string): Board => {
    const board: Board = { id: `b-${name}`, name, pinIds: [], createdAt: '', isCustom: true };
    boardsRef.current = [...boardsRef.current, board];
    setBoards(boardsRef.current);
    return board;
  };
  const addPinToBoard = useCallback((boardId: string, pinId: string) => {
    if (statuses[pinId] !== 'owned' && statuses[pinId] !== 'for_trade') return;
    setBoards(prev => prev.map(b => (b.id === boardId && !b.pinIds.includes(pinId) ? { ...b, pinIds: [...b.pinIds, pinId] } : b)));
  }, [statuses]);

  return {
    collection: { getEntry, setStatus, adjustQuantity: jest.fn() },
    boards: {
      customBoards: boards,
      createBoard,
      addPinToBoard,
      removePinFromBoard: jest.fn(),
      getBoardPins: () => [],
    },
  };
}

function Harness({ initial }: { initial: CollectionStatus }) {
  const store = useFakeStores(initial);
  return (
    <mockStoreContext.Provider value={store as Store}>
      <QuickAddSheet pin={PIN} onClose={() => {}} />
    </mockStoreContext.Provider>
  );
}

async function createBoardFromSheet(initial: CollectionStatus) {
  await render(<Harness initial={initial} />);
  await act(async () => { fireEvent.press(screen.getByText('New Board')); });
  await act(async () => { fireEvent.changeText(screen.getByPlaceholderText('Board name…'), 'Paris'); });
  await act(async () => { fireEvent.press(screen.getByText('Create')); });
}

describe('QuickAddSheet: New Board adds the pin', () => {
  it.each(['none', 'wanted'] as const)(
    'from %s: marks the pin Owned and adds it to the new board',
    async initial => {
      await createBoardFromSheet(initial);
      expect(latest.statuses.p1).toBe('owned');
      expect(latest.boards).toHaveLength(1);
      expect(latest.boards[0].pinIds).toEqual(['p1']);
      expect(screen.getByLabelText('Paris').props.accessibilityState).toMatchObject({ selected: true });
    },
  );

  it.each(['owned', 'for_trade'] as const)(
    'from %s: adds the pin and keeps its status',
    async initial => {
      await createBoardFromSheet(initial);
      expect(latest.statuses.p1).toBe(initial);
      expect(latest.boards[0].pinIds).toEqual(['p1']);
      expect(screen.getByLabelText('Paris').props.accessibilityState).toMatchObject({ selected: true });
    },
  );
});
