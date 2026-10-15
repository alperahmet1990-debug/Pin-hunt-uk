import React from 'react';
import { render, screen } from '@testing-library/react-native';
import FindTradesScreen from '../app/find-trades';

// UX-045: Find Trades loads with shelf-shaped placeholders, not a spinner.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('@/hooks/useFindTrades', () => ({
  useFindTrades: () => ({
    isoOpportunities: [],
    reciprocalTraderIds: new Set<string>(),
    potentialTrades: [],
    setOpportunities: [],
    discoveryItems: [],
    loading: true,
    error: null,
    refresh: () => {},
  }),
}));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));

it('shows placeholder shelves while trades load, and no empty state', async () => {
  await render(<FindTradesScreen />);
  expect(screen.getByRole('progressbar', { name: 'Finding trades' })).toBeTruthy();
  expect(screen.queryByText('Nothing to trade for yet')).toBeNull();
});
