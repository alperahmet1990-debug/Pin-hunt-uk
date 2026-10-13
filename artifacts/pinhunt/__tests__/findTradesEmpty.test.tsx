import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FindTradesScreen from '../app/find-trades';
import { findTradesEmptyState } from '../utils/findTradesEmpty';

const mockPush = jest.fn();
let mockCollection: Record<string, { status: string }> = {};
const mockNoResults = {
  isoOpportunities: [],
  reciprocalTraderIds: new Set<string>(),
  potentialTrades: [],
  setOpportunities: [],
  discoveryItems: [],
  loading: false,
  error: null,
  refresh: () => {},
};

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@/hooks/useFindTrades', () => ({ useFindTrades: () => mockNoResults }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection }) }));

describe('findTradesEmptyState', () => {
  it('asks for ISO pins only when there are none', () => {
    expect(findTradesEmptyState(0)).toMatchObject({ title: 'Nothing to trade for yet', primary: { action: 'addToIso' } });
    expect(findTradesEmptyState(0).secondary).toBeUndefined();
  });

  it('names the ISO count once there are some, and points at For Trade posts', () => {
    expect(findTradesEmptyState(1).body).toContain('No one has your ISO pin for trade yet');
    const two = findTradesEmptyState(2);
    expect(two.title).toBe('No matches yet');
    expect(two.body).toContain('No one has your 2 ISO pins for trade yet');
    expect(two.body).not.toMatch(/Add pins to your ISO/);
    expect(two.primary).toEqual({ label: 'See For Trade posts', action: 'forTradePosts' });
    expect(two.secondary).toEqual({ label: 'Add more to your ISO', action: 'addToIso' });
  });
});

describe('Find Trades with no results', () => {
  beforeEach(() => mockPush.mockClear());

  it('with nothing on the ISO, offers Add to your ISO (opens Search)', async () => {
    mockCollection = { a: { status: 'owned' } };
    await render(<FindTradesScreen />);
    expect(screen.getByText('Nothing to trade for yet')).toBeTruthy();
    expect(screen.queryByText('See For Trade posts')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Add to your ISO' }));
    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('with ISO pins, says no one has them yet and opens Community on For Trade', async () => {
    mockCollection = { a: { status: 'wanted' }, b: { status: 'wanted' }, c: { status: 'for_trade' } };
    await render(<FindTradesScreen />);
    expect(screen.getByText('No matches yet')).toBeTruthy();
    expect(screen.getByText(/No one has your 2 ISO pins for trade yet/)).toBeTruthy();
    expect(screen.queryByText('Nothing to trade for yet')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'See For Trade posts' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/community', params: { filter: 'for_trade' } });

    await fireEvent.press(screen.getByRole('button', { name: 'Add more to your ISO' }));
    expect(mockPush).toHaveBeenLastCalledWith('/search');
  });
});
