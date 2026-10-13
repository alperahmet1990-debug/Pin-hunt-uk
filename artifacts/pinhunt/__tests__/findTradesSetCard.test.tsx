import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import FindTradesScreen from '../app/find-trades';

const mockPush = jest.fn();
const mockResults = {
  isoOpportunities: [],
  reciprocalTraderIds: new Set<string>(),
  potentialTrades: [],
  setOpportunities: [{
    setName: 'Park Icons',
    ownedCount: 1,
    totalCount: 3,
    available: [{ pinId: 'p2', title: 'Dumbo', collectors: [{ id: 'bea', username: 'bea' }] }],
  }],
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), Stack: { Screen: () => null } }));
jest.mock('@/hooks/useFindTrades', () => ({ useFindTrades: () => mockResults }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));

it('Complete your sets opens every collector with the missing pins, not just the first pin (UX-021)', async () => {
  await render(<FindTradesScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Who has the missing Park Icons pins' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/set-traders/[collection]', params: { collection: 'Park Icons' } });
});
