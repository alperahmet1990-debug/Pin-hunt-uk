import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import CollectionScreen from '../app/(tabs)/collection';

// UX-045: while the pins behind your collection are loading, the grid shows
// placeholders, not "No pins yet".
let mockPins: Array<{ id: string; title: string; collection: string; characters: string[] }> = [];
let mockCatalogueLoading = false;
let resolveEnsure: () => void = () => {};
const mockEnsurePins = () => new Promise<void>(resolve => { resolveEnsure = resolve; });
const mockEnsureCollections = () => Promise.resolve();
let mockCollection: Record<string, { pinId: string; status: string; quantity: number; dateAdded: string }> = {};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, getEntry: (id: string) => mockCollection[id] }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), getBoardPins: () => [] }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({
    pins: mockPins,
    loading: mockCatalogueLoading,
    repository: null,
    ensurePins: mockEnsurePins,
    ensureCollections: mockEnsureCollections,
  }),
}));

beforeEach(() => {
  mockPins = [];
  mockCatalogueLoading = false;
  mockCollection = { p1: { pinId: 'p1', status: 'owned', quantity: 1, dateAdded: '2026-10-01' } };
});

describe('My Collection while loading (UX-045)', () => {
  it('shows placeholder tiles, not the empty state, while your pins are fetched', async () => {
    await render(<CollectionScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading your pins' })).toBeTruthy();
    expect(screen.queryByText('No pins yet')).toBeNull();
  });

  it('swaps placeholders for the pins once they arrive', async () => {
    const view = await render(<CollectionScreen />);
    mockPins = [{ id: 'p1', title: 'Mickey', collection: 'Park Icons', characters: [] }];
    await act(async () => { resolveEnsure(); });
    await view.rerender(<CollectionScreen />);
    expect(screen.queryByRole('progressbar', { name: 'Loading your pins' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mickey' })).toBeTruthy();
  });

  it('keeps placeholders while the catalogue itself is still loading', async () => {
    mockCatalogueLoading = true;
    await render(<CollectionScreen />);
    await act(async () => { resolveEnsure(); });
    expect(screen.getByRole('progressbar', { name: 'Loading your pins' })).toBeTruthy();
  });

  it('shows the empty state, not placeholders, for an empty collection', async () => {
    mockCollection = {};
    await render(<CollectionScreen />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('No pins yet')).toBeTruthy();
  });

  it('falls back to the empty state once loading ends without the pins', async () => {
    await render(<CollectionScreen />);
    await act(async () => { resolveEnsure(); });
    expect(screen.queryByRole('progressbar', { name: 'Loading your pins' })).toBeNull();
    expect(screen.getByText('No pins yet')).toBeTruthy();
  });
});
