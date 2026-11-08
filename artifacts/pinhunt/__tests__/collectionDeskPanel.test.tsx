import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CollectionDeskPanel } from '../components/CollectionDeskPanel';

const mockSetStatuses = jest.fn();
const mockRestore = jest.fn();
const mockAddToBoard = jest.fn();
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
    customBoards: [{ id: 'b1', name: 'Brush of Magic wall', pinIds: ['x', 'y'] }],
    addPinsToBoard: mockAddToBoard,
    removePinsFromBoard: jest.fn(),
  }),
}));

const props = {
  onStartSelecting: jest.fn(),
  onDone: jest.fn(),
  onOpenBoard: jest.fn(),
  onOpenStatus: jest.fn(),
  counts: { owned: 214, forTrade: 38, iso: 12 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCollection = {
    a: { pinId: 'a', status: 'owned', quantity: 1 },
    b: { pinId: 'b', status: 'owned', quantity: 1 },
    c: { pinId: 'c', status: 'wanted', quantity: 1 },
  };
});

describe('CollectionDeskPanel (iPad: Collecting at home)', () => {
  it('when not selecting, offers to select and opens lists and boards', async () => {
    await render(<CollectionDeskPanel {...props} selecting={false} ids={[]} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    expect(props.onStartSelecting).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'For Trade, 38 pins' }));
    expect(props.onOpenStatus).toHaveBeenCalledWith('for_trade');
    await fireEvent.press(screen.getByRole('button', { name: 'Brush of Magic wall, 2 pins' }));
    expect(props.onOpenBoard).toHaveBeenCalledWith('b1');
    expect(mockSetStatuses).not.toHaveBeenCalled();
  }, 20_000);

  it('moves every selected pin to For Trade in one go, with Undo', async () => {
    await render(<CollectionDeskPanel {...props} selecting ids={['a', 'b']} />);
    expect(screen.getByRole('header', { name: '2 pins selected' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'For Trade, move 2 pins' }));
    expect(mockSetStatuses).toHaveBeenCalledTimes(1);
    expect(mockSetStatuses).toHaveBeenCalledWith(['a', 'b'], 'for_trade');
    expect(props.onDone).toHaveBeenCalled();
    mockToast.mock.calls[0][0].action.onPress();
    expect(mockRestore).toHaveBeenCalled();
  }, 20_000);

  it('keeps ISO separate: asks before moving owned pins there', async () => {
    await render(<CollectionDeskPanel {...props} selecting ids={['a']} />);
    await fireEvent.press(screen.getByRole('button', { name: 'ISO, move 1 pin' }));
    expect(mockSetStatuses).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Move 1 pin to your ISO?' })).toBeTruthy();
  }, 20_000);

  it('adds the selection to a board, leaving ISO pins out', async () => {
    await render(<CollectionDeskPanel {...props} selecting ids={['a', 'c']} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Brush of Magic wall, add 1 pin' }));
    expect(mockAddToBoard).toHaveBeenCalledWith('b1', ['a', 'c']);
    expect(mockToast.mock.calls[0][0].message).toBe('Added 1 pin to Brush of Magic wall · 1 ISO skipped');
  }, 20_000);

  it('does nothing until a pin is selected', async () => {
    await render(<CollectionDeskPanel {...props} selecting ids={[]} />);
    expect(screen.getByText('Tap pins in the grid to select them.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'For Trade, 38 pins' }));
    expect(mockSetStatuses).not.toHaveBeenCalled();
  }, 20_000);
});
