import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FindTradesScreen from '../app/find-trades';

// UX-046 (#156): Find Trades shows the shared error state with Retry.
const mockRefresh = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }), Stack: { Screen: () => null } }));
jest.mock('@/hooks/useFindTrades', () => ({
  useFindTrades: () => ({
    isoOpportunities: [], reciprocalTraderIds: new Set<string>(), potentialTrades: [], setOpportunities: [], discoveryItems: [],
    loading: false,
    error: { kind: 'timeout', title: 'That took too long', message: "PinHunt didn't hear back in time. Please try again." },
    refresh: mockRefresh,
  }),
}));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));

it('shows the plain error and retries', async () => {
  await render(<FindTradesScreen />);
  expect(screen.getByRole('alert', { name: "That took too long. PinHunt didn't hear back in time. Please try again." })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(mockRefresh).toHaveBeenCalled();
});
