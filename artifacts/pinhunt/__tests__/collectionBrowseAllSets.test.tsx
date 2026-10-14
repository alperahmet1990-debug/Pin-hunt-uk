import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CollectionScreen from '../app/(tabs)/collection';

const mockPush = jest.fn();
let mockTab: string | undefined;
let mockCollection: Record<string, { pinId: string; status: string; quantity: number }> = {};
const mockCatalogue = [
  { id: 'p1', title: 'Mickey Classic', collection: 'Classics 2024', characters: [] },
  { id: 'p2', title: 'Minnie Bow', collection: 'Classics 2024', characters: [] },
  { id: 'p3', title: 'Dumbo', collection: 'Park Icons', characters: [] },
];
const mockEnsure = () => Promise.resolve();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => (mockTab ? { tab: mockTab } : {}),
  Stack: { Screen: () => null },
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock('@/hooks/useMarketValue', () => ({ useLatestMarketValue: () => null, formatLatestValue: () => '' }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection, getEntry: (id: string) => mockCollection[id] }) }));
// The photo-gaps card (UX-056) is for contributors only; off here.
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), getBoardPins: () => [] }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({
    pins: mockCatalogue,
    repository: null,
    ensurePins: mockEnsure,
    ensureCollections: mockEnsure,
  }),
}));

describe('Collection → Sets: Browse all sets (UX-025)', () => {
  beforeEach(() => { mockPush.mockClear(); mockTab = undefined; });

  it('ends the Sets list with a row that opens Browse Catalogue', async () => {
    // Collection opens on All (B-P1-03); these are about the Sets tab.
    mockTab = 'sets';
    mockCollection = { p1: { pinId: 'p1', status: 'owned', quantity: 1 } };
    await render(<CollectionScreen />);
    expect(screen.getByText('Classics 2024')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Browse all sets\./ }));
    expect(mockPush).toHaveBeenCalledWith('/browse-catalogue');
  });

  it('offers Add pins you own in the empty state when no set is started (UX-055)', async () => {
    // Collection opens on All (B-P1-03); these are about the Sets tab.
    mockTab = 'sets';
    mockCollection = {};
    await render(<CollectionScreen />);
    expect(screen.getByText('No sets started')).toBeTruthy();
    // Only the empty-state button, not the end-of-list row as well.
    expect(screen.queryByRole('button', { name: /^Browse all sets\./ })).toBeNull();
    await fireEvent.press(screen.getByText('Add pins you own'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/browse-catalogue', params: { mode: 'add' } });
  });

  it('does not show the row on other tabs', async () => {
    mockTab = 'traders';
    mockCollection = { p1: { pinId: 'p1', status: 'for_trade', quantity: 1 } };
    await render(<CollectionScreen />);
    expect(screen.queryByText('Browse all sets')).toBeNull();
  });
});
