import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BoardDetailScreen from '../app/board/[id]';
import { boardStats, sortBoardPins } from '../utils/boardSort';

const mockPush = jest.fn();
const mockSetThumb = jest.fn();
const mockRemoveMany = jest.fn();
const mockPins = [
  { id: 'p1', title: 'Mickey', collection: 'Park Icons', characters: [], releaseYear: 2022 },
  { id: 'p2', title: 'Dumbo', collection: 'Flying Friends', characters: [], releaseYear: 2024 },
  { id: 'p3', title: 'Castle', collection: 'Park Icons', characters: [], releaseYear: 2023 },
];
const mockBoard = { id: 'b1', name: 'Favourites', pinIds: ['p1', 'p2', 'p3'], createdAt: '', isCustom: true, thumbnailPinId: undefined as string | undefined };

const mockCollection = {
  p1: { pinId: 'p1', status: 'owned', quantity: 2 },
  p2: { pinId: 'p2', status: 'for_trade', quantity: 1 },
  p3: { pinId: 'p3', status: 'owned', quantity: 1 },
};

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('@/hooks/useMarketValue', () => ({ useLatestMarketValue: () => null, formatLatestValue: () => '' }));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({
    getBoardById: () => mockBoard,
    getBoardPins: () => mockPins,
    addPinToBoard: jest.fn(),
    removePinFromBoard: jest.fn(),
    removePinsFromBoard: mockRemoveMany,
    addPinsToBoard: jest.fn(),
    customBoards: [],
    deleteBoard: jest.fn(),
    setBoardThumbnail: mockSetThumb,
    renameBoard: jest.fn(),
  }),
}));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, getEntry: () => undefined, setStatuses: jest.fn(), restoreEntries: jest.fn() }),
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn(), hide: jest.fn() }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: mockPins }) }));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

const tileOrder = () => screen.getAllByRole('button', { name: /^(Mickey|Dumbo|Castle)/ }).map(el => el.props.accessibilityLabel);

describe('sortBoardPins', () => {
  it('orders by date added (newest first), pin name, set, or for trade first', () => {
    const ids = ['p1', 'p2', 'p3'];
    const sorted = (order: string[], sort: Parameters<typeof sortBoardPins>[2]) =>
      sortBoardPins(mockPins as never, order, sort, mockCollection).map(p => p.id);
    expect(sorted(ids, 'recent')).toEqual(['p3', 'p2', 'p1']);
    expect(sorted(['p3', 'p1', 'p2'], 'recent')).toEqual(['p2', 'p1', 'p3']);
    expect(sorted(ids, 'name')).toEqual(['p3', 'p2', 'p1']);
    // Set A–Z, then name within a set.
    expect(sorted(ids, 'set')).toEqual(['p2', 'p3', 'p1']);
    // For trade first, then newest first.
    expect(sorted(['p2', 'p1', 'p3'], 'trade')).toEqual(['p2', 'p3', 'p1']);
  });
});

describe('boardStats', () => {
  it('counts pins, pins for trade, and duplicates (quantity above 1)', () => {
    expect(boardStats(mockPins as never, mockCollection)).toEqual({ pins: 3, forTrade: 1, duplicates: 1 });
    expect(boardStats([], mockCollection)).toEqual({ pins: 0, forTrade: 0, duplicates: 0 });
  });
});

describe('Board detail grid (UX-019)', () => {
  it('shows image-first tiles; a tap opens the pin', async () => {
    await render(<BoardDetailScreen />);
    expect(tileOrder()).toEqual(['Castle', 'Dumbo, For Trade', 'Mickey, 2 copies']);
    expect(screen.getByLabelText('3 Pins, 1 For Trade, 1 Duplicates')).toBeTruthy();
    expect(screen.getByText('BOARD')).toBeTruthy();
    expect(screen.queryByText(/£|\$|value/i)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Dumbo, For Trade' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'p2' } });
  }, 20_000);

  it('sorts by date added, pin name, set or for trade first', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Date added' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Set' }));
    expect(tileOrder()).toEqual(['Dumbo, For Trade', 'Castle', 'Mickey, 2 copies']);
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Set' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Pin name' }));
    expect(tileOrder()).toEqual(['Castle', 'Dumbo, For Trade', 'Mickey, 2 copies']);
  });

  it('switches to list view and remembers it for My Collection too', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'List view' }));
    expect(screen.getAllByText('Park Icons').length).toBe(2);
    expect(screen.getByText('Flying Friends')).toBeTruthy();
    expect(await AsyncStorage.getItem('@pinhunt_collection_view_v1')).toBe('list');
  });

  it('opens in the view chosen on My Collection', async () => {
    await AsyncStorage.setItem('@pinhunt_collection_view_v1', 'list');
    await render(<BoardDetailScreen />);
    expect(await screen.findByText('Flying Friends')).toBeTruthy();
  });

  it('search narrows the board to matching pins', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Search this board' }));
    await fireEvent.changeText(screen.getByLabelText('Search this board'), 'dum');
    expect(tileOrder()).toEqual(['Dumbo, For Trade']);
  });

  it('in edit mode, cover and remove are separate: setting a cover never removes the pin', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.press(screen.getByRole('button', { name: 'Set Dumbo as board cover' }));
    expect(mockSetThumb).toHaveBeenCalledWith('b1', 'p2');
    expect(screen.queryByRole('header', { name: 'Remove Pin?' })).toBeNull();
    // Tapping the tile itself does nothing in edit mode.
    await fireEvent.press(screen.getByRole('button', { name: 'Dumbo, For Trade' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole('header', { name: 'Remove Pin?' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Dumbo from this board' }));
    expect(screen.getByRole('header', { name: 'Remove Pin?' })).toBeTruthy();
  });

  it('list view keeps edit mode: cover and remove per row', async () => {
    await AsyncStorage.setItem('@pinhunt_collection_view_v1', 'list');
    await render(<BoardDetailScreen />);
    await screen.findByText('Flying Friends');
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.press(screen.getByRole('button', { name: 'Set Castle as board cover' }));
    expect(mockSetThumb).toHaveBeenCalledWith('b1', 'p3');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Castle from this board' }));
    expect(screen.getByRole('header', { name: 'Remove Pin?' })).toBeTruthy();
  });

  it('select mode takes several pins off the board at once', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Dumbo, For Trade' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Castle' }));
    expect(screen.getByText('2 selected')).toBeTruthy();
    // Tapping a tile selects instead of opening it.
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from board, 2 pins' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(mockRemoveMany).toHaveBeenCalledWith('b1', ['p2', 'p3']);
  });
});
