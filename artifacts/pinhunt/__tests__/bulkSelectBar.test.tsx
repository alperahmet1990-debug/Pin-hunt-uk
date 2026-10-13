import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BulkSelectBar, bulkStatusMessage } from '../components/BulkSelectBar';

const mockSetStatuses = jest.fn();
const mockRestore = jest.fn();
const mockAddToBoard = jest.fn();
const mockRemoveFromBoard = jest.fn();
const mockToast = jest.fn();
let mockCollection: Record<string, { pinId: string; status: string; quantity: number }> = {};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    getEntry: (id: string) => mockCollection[id],
    setStatuses: mockSetStatuses,
    restoreEntries: mockRestore,
  }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({
    customBoards: [{ id: 'b1', name: 'Favourites', pinIds: [] }],
    addPinsToBoard: mockAddToBoard,
    removePinsFromBoard: mockRemoveFromBoard,
  }),
}));

const onDone = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  mockCollection = {
    a: { pinId: 'a', status: 'owned', quantity: 3 },
    b: { pinId: 'b', status: 'for_trade', quantity: 1 },
    c: { pinId: 'c', status: 'wanted', quantity: 1 },
  };
});

describe('BulkSelectBar (UX-017)', () => {
  it('marks every selected pin For Trade in one setStatuses call, with Undo restoring each entry', async () => {
    await render(<BulkSelectBar ids={['a', 'c']} onDone={onDone} />);
    await fireEvent.press(screen.getByRole('button', { name: 'For Trade, 2 pins' }));
    expect(mockSetStatuses).toHaveBeenCalledTimes(1);
    expect(mockSetStatuses).toHaveBeenCalledWith(['a', 'c'], 'for_trade');
    expect(onDone).toHaveBeenCalled();
    const toast = mockToast.mock.calls[0][0];
    expect(toast.message).toBe('Marked 2 pins as For Trade');
    toast.action.onPress();
    expect(mockRestore).toHaveBeenCalledWith([['a', mockCollection.a], ['c', mockCollection.c]]);
  }, 20_000);

  it('asks before moving owned pins to the ISO, and ISO stays separate from For Trade', async () => {
    await render(<BulkSelectBar ids={['a', 'b']} onDone={onDone} />);
    await fireEvent.press(screen.getByRole('button', { name: 'ISO, 2 pins' }));
    expect(mockSetStatuses).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Move 2 pins to your ISO?' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Move to ISO' }));
    expect(mockSetStatuses).toHaveBeenCalledWith(['a', 'b'], 'wanted');
  });

  it('Remove asks first and can be undone', async () => {
    await render(<BulkSelectBar ids={['a', 'b', 'c']} onDone={onDone} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove, 3 pins' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(mockSetStatuses).toHaveBeenCalledWith(['a', 'b', 'c'], 'none');
    expect(mockToast.mock.calls[0][0].message).toBe('Removed 3 pins');
  });

  it('adds owned pins to a board and says how many ISO pins were left out', async () => {
    await render(<BulkSelectBar ids={['a', 'c']} onDone={onDone} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Board, 2 pins' }));
    await fireEvent.press(screen.getByRole('button', { name: /Favourites/ }));
    expect(mockAddToBoard).toHaveBeenCalledWith('b1', ['a', 'c']);
    expect(mockToast.mock.calls[0][0].message).toBe('Added 1 pin to Favourites · 1 ISO skipped');
  });

  it('on a board, Remove takes pins off that board only, with Undo', async () => {
    await render(<BulkSelectBar ids={['a', 'b']} boardId="b1" onDone={onDone} />);
    expect(screen.queryByRole('button', { name: /^Board/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from board, 2 pins' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(mockRemoveFromBoard).toHaveBeenCalledWith('b1', ['a', 'b']);
    expect(mockSetStatuses).not.toHaveBeenCalled();
    mockToast.mock.calls[0][0].action.onPress();
    expect(mockAddToBoard).toHaveBeenCalledWith('b1', ['a', 'b']);
  });

  it('is disabled with nothing selected', async () => {
    await render(<BulkSelectBar ids={[]} onDone={onDone} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Owned, 0 pins' }));
    expect(mockSetStatuses).not.toHaveBeenCalled();
  });

  it('words toasts with the glossary', () => {
    expect(bulkStatusMessage('owned', 1)).toBe('Marked 1 pin as Owned');
    expect(bulkStatusMessage('wanted', 5)).toBe('Moved 5 pins to your ISO');
  });
});
