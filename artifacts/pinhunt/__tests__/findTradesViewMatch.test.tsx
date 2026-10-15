import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import FindTradesScreen from '../app/find-trades';

// B-P2-08 (#63): the Potential Trades "View match" button is at least 44 pt tall.
const mockResults = {
  isoOpportunities: [],
  reciprocalTraderIds: new Set<string>(),
  potentialTrades: [{
    traderId: 'u2',
    profile: { id: 'u2', username: 'pinpal', displayName: 'Pin Pal' },
    theyHaveCount: 1,
    iHaveCount: 1,
    samplePins: [{ title: 'Mickey' }, { title: 'Dumbo' }],
  }],
  setOpportunities: [],
  discoveryItems: [],
  loading: false,
  error: null,
  refresh: () => {},
};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));
jest.mock('@/hooks/useFindTrades', () => ({ useFindTrades: () => mockResults }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));

it('"View match" is at least 44 pt tall', async () => {
  await render(<FindTradesScreen />);
  // The pill is the label's nearest ancestor with a minHeight.
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText('View match');
  let minHeight: number | undefined;
  while (node && minHeight === undefined) {
    minHeight = StyleSheet.flatten(node.props.style)?.minHeight as number | undefined;
    node = node.parent;
  }
  expect(minHeight).toBeGreaterThanOrEqual(44);
});
