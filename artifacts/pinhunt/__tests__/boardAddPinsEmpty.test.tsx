import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BoardDetailScreen from '../app/board/[id]';

const mockPush = jest.fn();
const mockPin = { id: 'p1', title: 'Mickey', collection: 'Park Icons', characters: [], releaseYear: 2022 };
const mockBoard = { id: 'b1', name: 'New board', pinIds: [] as string[], createdAt: '', isCustom: true };
let mockCollection: Record<string, unknown> = {};

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
    getBoardPins: () => [],
    addPinToBoard: jest.fn(),
    removePinFromBoard: jest.fn(),
    removePinsFromBoard: jest.fn(),
    addPinsToBoard: jest.fn(),
    customBoards: [],
    deleteBoard: jest.fn(),
    setBoardThumbnail: jest.fn(),
    renameBoard: jest.fn(),
  }),
}));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, getEntry: () => undefined, setStatuses: jest.fn(), restoreEntries: jest.fn() }),
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn(), hide: jest.fn() }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: [mockPin] }) }));

const openAddPins = async () => {
  await render(<BoardDetailScreen />);
  await fireEvent.press((await screen.findAllByText('Add Pins'))[0]);
};

describe('Add Pins on a board when there is nothing to add (#391)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('points a collector with no pins to the catalogue', async () => {
    mockCollection = {};
    await openAddPins();
    expect(screen.queryByText(/already on this board/)).toBeNull();
    await fireEvent.press(await screen.findByText('Browse Catalogue'));
    expect(mockPush).toHaveBeenCalledWith('/browse-catalogue');
  });

  it('does not count ISO pins as pins they own', async () => {
    mockCollection = { p1: { pinId: 'p1', status: 'wanted', quantity: 1 } };
    await openAddPins();
    expect(await screen.findByText("You don't have any pins yet")).toBeTruthy();
  });

  it('offers owned pins as before', async () => {
    mockCollection = { p1: { pinId: 'p1', status: 'owned', quantity: 1 } };
    await openAddPins();
    expect(screen.queryByText("You don't have any pins yet")).toBeNull();
  });
});
