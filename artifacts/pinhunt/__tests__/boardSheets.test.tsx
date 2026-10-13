import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BoardDetailScreen from '../app/board/[id]';

const mockBack = jest.fn();
const mockRename = jest.fn();
const mockDelete = jest.fn();
const mockRemovePin = jest.fn();
const mockBoard = { id: 'b1', name: 'Favourites', pinIds: ['p1'], createdAt: '', isCustom: true };
const mockPins = [{ id: 'p1', title: 'Mickey', collection: 'Park Icons', characters: [] }];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('@/hooks/useMarketValue', () => ({ useLatestMarketValue: () => null, formatLatestValue: () => '' }));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({
    getBoardById: () => mockBoard,
    getBoardPins: () => mockPins,
    addPinToBoard: jest.fn(),
    removePinFromBoard: mockRemovePin,
    deleteBoard: mockDelete,
    setBoardThumbnail: jest.fn(),
    renameBoard: mockRename,
  }),
}));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {}, getEntry: () => undefined }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: mockPins }) }));

beforeEach(() => jest.clearAllMocks());

describe('Board detail: options, rename and delete (UX-041)', () => {
  it('renames through the options sheet and the rename sheet', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Board options'));
    expect(screen.getByRole('header', { name: 'Board options' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Rename Board/ }));
    expect(screen.getByRole('header', { name: 'Rename board' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Board name'), 'Trade bait');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(mockRename).toHaveBeenCalledWith('b1', 'Trade bait');
  }, 20_000);

  it('Delete asks first in an in-app dialog; Cancel deletes nothing', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Board options'));
    await fireEvent.press(screen.getByRole('button', { name: /Delete Board/ }));
    expect(screen.getByRole('header', { name: 'Delete Board?' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('confirming Delete deletes the board and goes back', async () => {
    await render(<BoardDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Board options'));
    await fireEvent.press(screen.getByRole('button', { name: /Delete Board/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(mockDelete).toHaveBeenCalledWith('b1');
    expect(mockBack).toHaveBeenCalled();
  });
});
