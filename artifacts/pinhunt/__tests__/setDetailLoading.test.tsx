import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import SetDetailScreen from '../app/set/[collection]';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockCanContribute = false;
let resolveLoad: () => void = () => {};
let mockPins: Array<{ id: string; title: string; collection: string; imageUrl?: string }> = [];
let mockCatalogueLoading = false;
// Stable across renders, like the real context's callback.
const mockEnsureCollections = () => new Promise<void>(resolve => { resolveLoad = resolve; });

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ collection: 'Classics 2024' }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
  Stack: { Screen: () => null },
}));
jest.mock('@/components/QuickAddSheet', () => ({ QuickAddSheet: () => null }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: mockCanContribute, loading: false }) }));
// The missing-pins footer (UX-021) reads these; no Supabase, no toasts here.
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: null, userId: null }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn(), hide: jest.fn() }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: {}, getEntry: () => undefined }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({
    pins: mockPins,
    loading: mockCatalogueLoading,
    repository: null,
    ensureCollections: mockEnsureCollections,
  }),
}));

describe('Set detail while loading', () => {
  beforeEach(() => {
    mockPins = [];
    mockCatalogueLoading = false;
    mockCanContribute = false;
    mockPush.mockClear();
  });

  it('shows the back button, set name and placeholder tiles instead of a blank screen', async () => {
    await render(<SetDetailScreen />);
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByText('Classics 2024')).toBeTruthy();
    expect(screen.getByText('Loading set…')).toBeTruthy();
    expect(screen.getByLabelText('Loading pins in this set')).toBeTruthy();
    // Progress waits for the full set: no counts and no "not found" yet.
    expect(screen.queryByText(/collected/)).toBeNull();
    expect(screen.queryByText('Set not found')).toBeNull();
  });

  it('swaps the placeholders for the real grid once the set has loaded', async () => {
    await render(<SetDetailScreen />);
    mockPins = [{ id: 'p1', title: 'Mickey Classic', collection: 'Classics 2024' }];
    await act(async () => { resolveLoad(); });
    expect(screen.queryByLabelText('Loading pins in this set')).toBeNull();
    expect(screen.getByText('0 of 1 collected')).toBeTruthy();
    expect(screen.getByText('Mickey Classic')).toBeTruthy();
  });

  it('only says "Set not found" after loading finishes with no pins', async () => {
    await render(<SetDetailScreen />);
    expect(screen.queryByText('Set not found')).toBeNull();
    await act(async () => { resolveLoad(); });
    expect(screen.getByText('Set not found')).toBeTruthy();
  });

  it('keeps the placeholders (not "Set not found") while the catalogue itself is still loading', async () => {
    mockCatalogueLoading = true;
    const view = await render(<SetDetailScreen />);
    await act(async () => { resolveLoad(); });
    expect(screen.queryByText('Set not found')).toBeNull();
    expect(screen.getByLabelText('Loading pins in this set')).toBeTruthy();

    mockCatalogueLoading = false;
    mockPins = [{ id: 'p1', title: 'Mickey Classic', collection: 'Classics 2024' }];
    await act(async () => { view.rerender(<SetDetailScreen />); });
    expect(screen.getByText('Mickey Classic')).toBeTruthy();
  });

  it('links photo contributors to Contribute pictures for this set\'s pins with no photo', async () => {
    mockCanContribute = true;
    await render(<SetDetailScreen />);
    mockPins = [
      { id: 'p1', title: 'Mickey Classic', collection: 'Classics 2024' },
      { id: 'p2', title: 'Minnie Classic', collection: 'Classics 2024', imageUrl: 'https://example.com/minnie.png' },
    ];
    await act(async () => { resolveLoad(); });
    expect(screen.getByText('1 pin needs a photo · Contribute')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('set-contribute-photos')); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/contribute', params: { set: 'Classics 2024', filter: 'needs' } });
  });

  it('shows no contribute link to people who cannot contribute', async () => {
    await render(<SetDetailScreen />);
    mockPins = [{ id: 'p1', title: 'Mickey Classic', collection: 'Classics 2024' }];
    await act(async () => { resolveLoad(); });
    expect(screen.queryByTestId('set-contribute-photos')).toBeNull();
  });
});
