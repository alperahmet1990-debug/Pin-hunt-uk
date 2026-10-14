import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { CollectionStatus } from '@/types/pin';
import type { Board } from '@/types/board';
import { ToastHost, ToastProvider } from '@/components/ui/Toast';
import { QuickAddSheet } from '../QuickAddSheet';

// Stateful stand-ins for the collection and boards contexts, with the real
// rules that matter here: ISO/removal reset copies to 1, boards keep their
// pin references, and restoreEntry writes the snapshot back.
type Entry = { pinId: string; status: CollectionStatus; quantity: number; notes: string; dateAdded: string };
const mockStoreContext = createContext<ReturnType<typeof useFakeStores> | null>(null);
const mockUseStore = () => useContext(mockStoreContext)!;
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => mockUseStore().collection }));
jest.mock('@/context/BoardsContext', () => ({ useBoards: () => mockUseStore().boards }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardStickyView: require('react-native').View }));
jest.mock('../KeyboardAwareScrollViewCompat', () => ({ KeyboardAwareScrollViewCompat: require('react-native').ScrollView }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const PIN = { id: 'p1', title: 'Test Pin', collection: 'Test Set' } as never;
let latest: { entries: Record<string, Entry>; boards: Board[]; writes: number };

function useFakeStores(initial: Entry | null, boards: Board[]) {
  const [entries, setEntries] = useState<Record<string, Entry>>(initial ? { p1: initial } : {});
  const [boardList] = useState(boards);
  const writes = useRef(0);
  latest = { entries, boards: boardList, writes: writes.current };
  const setStatus = useCallback((pinId: string, status: CollectionStatus) => {
    writes.current += 1;
    setEntries(prev => {
      const next = { ...prev };
      if (status === 'none') delete next[pinId];
      else next[pinId] = {
        pinId, status, notes: prev[pinId]?.notes ?? '', dateAdded: prev[pinId]?.dateAdded ?? 'd',
        quantity: status === 'wanted' ? 1 : prev[pinId]?.quantity ?? 1,
      };
      return next;
    });
  }, []);
  const restoreEntry = useCallback((pinId: string, snapshot: Entry | undefined) => {
    writes.current += 1;
    setEntries(prev => {
      const next = { ...prev };
      if (!snapshot) delete next[pinId]; else next[pinId] = { ...snapshot };
      return next;
    });
  }, []);
  return {
    collection: { getEntry: (id: string) => entries[id], setStatus, restoreEntry, adjustQuantity: jest.fn() },
    boards: {
      customBoards: boardList, createBoard: jest.fn(), addPinToBoard: jest.fn(), removePinFromBoard: jest.fn(),
      getBoardPins: () => [],
    },
  };
}

function Harness({ initial, boards = [], onAdded }: { initial: Entry | null; boards?: Board[]; onAdded?: (pinId: string, status: CollectionStatus) => void }) {
  const store = useFakeStores(initial, boards);
  return (
    <mockStoreContext.Provider value={store}>
      <ToastProvider>
        <QuickAddSheet pin={PIN} onClose={() => {}} onAdded={onAdded} />
        <ToastHost />
      </ToastProvider>
    </mockStoreContext.Provider>
  );
}

const owned3: Entry = { pinId: 'p1', status: 'owned', quantity: 3, notes: 'shelf', dateAdded: '2026-01-01' };
const boardsWithPin: Board[] = [
  { id: 'b1', name: 'Paris', pinIds: ['p1'], createdAt: '', isCustom: true },
  { id: 'b2', name: 'Faves', pinIds: ['p1'], createdAt: '', isCustom: true },
];
const press = async (name: string) => { await act(async () => { fireEvent.press(screen.getByRole('button', { name })); }); };

describe('QuickAddSheet status changes', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('tapping the selected status does nothing', async () => {
    await render(<Harness initial={owned3} />);
    await press('Mark as Owned');
    expect(latest.entries.p1).toEqual(owned3);
    expect(latest.writes).toBe(0);
  });

  it('remove needs confirmation, and Undo restores status, copies and notes', async () => {
    await render(<Harness initial={owned3} boards={boardsWithPin} />);
    await press('Remove from my collection');
    expect(latest.entries.p1).toEqual(owned3); // nothing yet
    expect(screen.getByText("You'll no longer own ×3 copies and it leaves 2 boards. You can undo this.")).toBeTruthy();
    await press('Remove');
    expect(latest.entries.p1).toBeUndefined();
    expect(screen.getByText('Removed from your collection')).toBeTruthy();
    await press('Undo');
    expect(latest.entries.p1).toEqual(owned3);
    // Boards keep their references, so membership is back once the pin is owned again.
    expect(latest.boards.every(b => b.pinIds.includes('p1'))).toBe(true);
  });

  it('cancel leaves everything as it was', async () => {
    await render(<Harness initial={owned3} />);
    await press('Remove from my collection');
    await press('Cancel');
    expect(latest.entries.p1).toEqual(owned3);
    expect(latest.writes).toBe(0);
  });

  it('Owned ×3 → ISO asks first, then Undo brings the 3 copies back', async () => {
    await render(<Harness initial={owned3} />);
    await press('Mark as ISO');
    expect(latest.entries.p1.status).toBe('owned');
    expect(screen.getByText("You'll no longer own ×3 copies. You can undo this.")).toBeTruthy();
    await press('Move to ISO');
    expect(latest.entries.p1).toMatchObject({ status: 'wanted', quantity: 1 });
    await press('Undo');
    expect(latest.entries.p1).toEqual(owned3);
  });

  it('a single copy moves to ISO straight away, with Undo', async () => {
    await render(<Harness initial={{ ...owned3, quantity: 1 }} />);
    await press('Mark as ISO');
    expect(latest.entries.p1.status).toBe('wanted');
    expect(screen.getByText('Moved to your ISO')).toBeTruthy();
  });

  it('rapid taps compare against the latest choice, not the last render', async () => {
    await render(<Harness initial={null} />);
    // All three taps land before React re-renders the sheet (one synchronous act).
    const owned = screen.getByRole('button', { name: 'Mark as Owned' });
    const forTrade = screen.getByRole('button', { name: 'Mark as For Trade' });
    await act(async () => {
      fireEvent.press(owned);
      fireEvent.press(owned); // same status again: no-op
      fireEvent.press(forTrade);
    });
    expect(latest.entries.p1.status).toBe('for_trade');
    expect(latest.writes).toBe(2);
  });

  it('onAdded reports saves to a list, never a removal (UX-061)', async () => {
    const onAdded = jest.fn();
    await render(<Harness initial={null} onAdded={onAdded} />);
    await press('Mark as For Trade');
    expect(onAdded).toHaveBeenLastCalledWith('p1', 'for_trade');
    // The add's toast still offers Undo.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    await press('Remove from my collection');
    await press('Remove');
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('close control is a labelled 44 pt target, and the footer button reads "Close" (UX-013a)', async () => {
    const { StyleSheet } = require('react-native');
    await render(<Harness initial={owned3} />);
    const close = screen.getByRole('button', { name: 'Close' });
    const size = StyleSheet.flatten(close.props.style);
    const slop = close.props.hitSlop ?? 0;
    expect(size.width + 2 * slop).toBeGreaterThanOrEqual(44);
    expect(size.height + 2 * slop).toBeGreaterThanOrEqual(44);
    expect(screen.getByText('Close')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
  });
});
