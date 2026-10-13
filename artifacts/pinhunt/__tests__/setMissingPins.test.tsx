import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SetDetailScreen from '../app/set/[collection]';
import SetTradersScreen from '../app/set-traders/[collection]';

const mockPush = jest.fn();
const mockSetStatuses = jest.fn();
const mockToast = jest.fn();
const mockInventory = jest.fn();
let mockCollection: Record<string, { pinId: string; status: string; quantity: number }> = {};
let mockRepo: { getForTradeInventory: jest.Mock } | null = null;
const mockPins = [
  { id: 'p1', title: 'Mickey', collection: 'Park Icons', characters: [] },
  { id: 'p2', title: 'Dumbo', collection: 'Park Icons', characters: [] },
  { id: 'p3', title: 'Castle', collection: 'Park Icons', characters: [] },
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
  useLocalSearchParams: () => ({ collection: 'Park Icons' }),
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  Stack: { Screen: () => null },
}));
jest.mock('@/components/QuickAddSheet', () => ({ QuickAddSheet: () => null }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: mockRepo ? 'me' : null }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    collection: mockCollection,
    getEntry: (id: string) => mockCollection[id],
    setStatuses: mockSetStatuses,
  }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, loading: false, repository: null, ensureCollections: mockEnsure }),
}));

const inv = (pinId: string, traderId: string) => ({ pinId, title: pinId, traderId, traderUsername: traderId });

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo = { getForTradeInventory: mockInventory };
  mockInventory.mockResolvedValue([inv('p2', 'bea'), inv('p3', 'bea'), inv('p2', 'amy')]);
  mockCollection = { p1: { pinId: 'p1', status: 'owned', quantity: 1 } };
});

describe('Set detail: missing-pins footer (UX-021)', () => {
  it('asks once for every missing pin and shows how many are available', async () => {
    await render(<SetDetailScreen />);
    await waitFor(() => expect(screen.getByText('2 available from collectors')).toBeTruthy());
    expect(mockInventory).toHaveBeenCalledTimes(1);
    expect(mockInventory).toHaveBeenCalledWith({ viewerId: 'me', pinIds: ['p2', 'p3'] });
    await fireEvent.press(screen.getByRole('button', { name: /Find the 2 missing/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/set-traders/[collection]', params: { collection: 'Park Icons' } });
  });

  it('adds only missing pins not already on the ISO, with Undo', async () => {
    mockCollection = { ...mockCollection, p3: { pinId: 'p3', status: 'wanted', quantity: 1 } };
    await render(<SetDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add missing to ISO' }));
    expect(mockSetStatuses).toHaveBeenCalledWith(['p2'], 'wanted');
    const toast = mockToast.mock.calls[0][0];
    expect(toast.message).toBe('Added 1 pin to your ISO');
    toast.action.onPress();
    expect(mockSetStatuses).toHaveBeenLastCalledWith(['p2'], 'none');
  });

  it('hides Add missing to ISO when every missing pin is already on the ISO', async () => {
    mockCollection = { ...mockCollection, p2: { pinId: 'p2', status: 'wanted', quantity: 1 }, p3: { pinId: 'p3', status: 'wanted', quantity: 1 } };
    await render(<SetDetailScreen />);
    expect(screen.getByRole('button', { name: /Find the 2 missing/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add missing to ISO' })).toBeNull();
  });

  it('has no footer when the set is complete', async () => {
    mockCollection = Object.fromEntries(mockPins.map(p => [p.id, { pinId: p.id, status: 'owned', quantity: 1 }]));
    await render(<SetDetailScreen />);
    expect(screen.queryByText(/missing$/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Find the/ })).toBeNull();
  });

  it('without Supabase (demo) it still offers the actions but no availability count', async () => {
    mockRepo = null;
    await render(<SetDetailScreen />);
    expect(screen.getByRole('button', { name: /Find the 2 missing/ })).toBeTruthy();
    expect(screen.queryByText(/available from collectors|None for trade yet/)).toBeNull();
  });
});

describe('Find the missing screen (UX-021)', () => {
  it('lists collectors with the most of your missing pins first', async () => {
    await render(<SetTradersScreen />);
    await waitFor(() => expect(screen.getByText(/2 missing · 2 available from 2 collectors/)).toBeTruthy());
    const titles = screen.getAllByText(/^@/).map(t => t.props.children.slice(0, 2).join(''));
    expect(titles).toEqual(['@bea', '@amy']);
    expect(screen.getByText('has all 2')).toBeTruthy();
    expect(screen.getByText('has 1 of them')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Message @bea' }));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/community/start-conversation',
      params: expect.objectContaining({ recipientId: 'bea', recipientName: 'bea' }),
    }));
  });

  it('when nobody has them, offers Add missing to ISO', async () => {
    mockInventory.mockResolvedValue([]);
    await render(<SetTradersScreen />);
    await waitFor(() => expect(screen.getByText('No one has these for trade yet')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Add missing to ISO' }));
    expect(mockSetStatuses).toHaveBeenCalledWith(['p2', 'p3'], 'wanted');
  });
});
