import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BoardDetailScreen from '../app/board/[id]';
import { sortBoardPins } from '../utils/boardSort';

const mockPush = jest.fn();
const mockSetThumb = jest.fn();
const mockPins = [
  { id: 'p1', title: 'Mickey', collection: 'Park Icons', characters: [], releaseYear: 2022 },
  { id: 'p2', title: 'Dumbo', collection: 'Park Icons', characters: [], releaseYear: 2024 },
  { id: 'p3', title: 'Castle', collection: 'Park Icons', characters: [], releaseYear: 2023 },
];
const mockBoard = { id: 'b1', name: 'Favourites', pinIds: ['p1', 'p2', 'p3'], createdAt: '', isCustom: true, thumbnailPinId: undefined as string | undefined };

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
    deleteBoard: jest.fn(),
    setBoardThumbnail: mockSetThumb,
    renameBoard: jest.fn(),
  }),
}));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: { p1: { pinId: 'p1', status: 'owned', quantity: 2 } }, getEntry: () => undefined }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: mockPins }) }));

beforeEach(() => jest.clearAllMocks());

const tileOrder = () => screen.getAllByRole('button', { name: /^(Mickey|Dumbo|Castle)/ }).map(el => el.props.accessibilityLabel);

describe('sortBoardPins', () => {
  it('orders by recently added (newest first), name, or release date', () => {
    const ids = ['p1', 'p2', 'p3'];
    expect(sortBoardPins(mockPins as never, ids, 'recent').map(p => p.id)).toEqual(['p3', 'p2', 'p1']);
    expect(sortBoardPins(mockPins as never, ids, 'name').map(p => p.id)).toEqual(['p3', 'p2', 'p1']);
    expect(sortBoardPins(mockPins as never, ['p3', 'p1', 'p2'], 'recent').map(p => p.id)).toEqual(['p2', 'p1', 'p3']);
    expect(sortBoardPins(mockPins as never, ids, 'year').map(p => p.id)).toEqual(['p2', 'p3', 'p1']);
  });
});

describe('Board detail grid (UX-019)', () => {
  it('shows image-first tiles; a tap opens the pin', async () => {
    await render(<BoardDetailScreen />);
    expect(tileOrder()).toEqual(['Castle', 'Dumbo', 'Mickey, 2 copies']);
    await fireEvent.press(screen.getByRole('button', { name: 'Dumbo' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'p2' } });
  }, 20_000);

  it('sorts with the same options as My Collection', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sort: Recently added' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Release date' }));
    expect(tileOrder()).toEqual(['Dumbo', 'Castle', 'Mickey, 2 copies']);
  });

  it('in edit mode, cover and remove are separate: setting a cover never removes the pin', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.press(screen.getByRole('button', { name: 'Set Dumbo as board cover' }));
    expect(mockSetThumb).toHaveBeenCalledWith('b1', 'p2');
    expect(screen.queryByRole('header', { name: 'Remove Pin?' })).toBeNull();
    // Tapping the tile itself does nothing in edit mode.
    await fireEvent.press(screen.getByRole('button', { name: 'Dumbo' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole('header', { name: 'Remove Pin?' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Dumbo from this board' }));
    expect(screen.getByRole('header', { name: 'Remove Pin?' })).toBeTruthy();
  });
});
