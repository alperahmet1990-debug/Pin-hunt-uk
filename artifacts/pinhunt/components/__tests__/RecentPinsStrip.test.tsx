import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RecentPinsStrip, recentEntries } from '../RecentPinsStrip';

// #59: Home shows the collector's newest pins, led by Find Trades.
const mockPush = jest.fn();
const mockEnsure = jest.fn(() => Promise.resolve());
const mockPins = [
  { id: 'p1', title: 'Castle Fireworks', collection: 'Park Icons' },
  { id: 'p2', title: 'Dumbo Blue Sky', collection: 'Park Icons' },
  { id: 'p3', title: 'Stitch Valentine', collection: 'Hearts' },
];
const mockCollection = {
  p1: { pinId: 'p1', status: 'owned', quantity: 1, dateAdded: '2026-10-01T10:00:00Z' },
  p2: { pinId: 'p2', status: 'wanted', quantity: 1, dateAdded: '2026-10-03T10:00:00Z' },
  p3: { pinId: 'p3', status: 'for_trade', quantity: 1, dateAdded: '2026-10-02T10:00:00Z' },
  p9: { pinId: 'p9', status: 'owned', quantity: 1, dateAdded: '2026-09-01T10:00:00Z' },
};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: mockPins, ensurePins: mockEnsure }) }));

beforeEach(() => jest.clearAllMocks());

describe('RecentPinsStrip (#59)', () => {
  it('orders pins newest first across Owned, For Trade and ISO', () => {
    expect(recentEntries(mockCollection as never).map(e => e.pinId)).toEqual(['p2', 'p3', 'p1', 'p9']);
    expect(recentEntries(mockCollection as never, 2)).toHaveLength(2);
  });

  it('renders the newest pins from the collection, led by Find Trades', async () => {
    await render(<RecentPinsStrip />);
    const labels = screen.getAllByRole('button').map(b => b.props.accessibilityLabel);
    expect(labels).toEqual([
      'Find Trades: see who has your ISO pins and who wants yours',
      'Dumbo Blue Sky, ISO',
      'Stitch Valentine, For Trade',
      'Castle Fireworks, Owned',
    ]);
    // A pin outside the cached catalogue is fetched, not shown blank.
    expect(mockEnsure).toHaveBeenCalledWith(['p9']);
  });

  it('opens Find Trades and Pin detail', async () => {
    await render(<RecentPinsStrip />);
    await fireEvent.press(screen.getByRole('button', { name: /^Find Trades/ }));
    expect(mockPush).toHaveBeenCalledWith('/find-trades');
    await fireEvent.press(screen.getByRole('button', { name: 'Dumbo Blue Sky, ISO' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'p2' } });
  });
});
