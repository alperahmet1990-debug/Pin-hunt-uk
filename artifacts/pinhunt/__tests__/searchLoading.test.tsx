import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import SearchScreen from '../app/search';

// UX-045: a search in flight shows result-shaped rows, not a spinner.
let resolveSearch: (page: unknown) => void = () => {};
const mockRepository = {
  searchPinsPage: () => new Promise(resolve => { resolveSearch = resolve; }),
};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ q: 'stitch' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: [], repository: mockRepository }),
}));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ getEntry: () => undefined }) }));
jest.mock('@/components/QuickAddSheet', () => ({ QuickAddSheet: () => null }));
jest.mock('@/components/PinActionsSheet', () => ({
  usePinActions: () => ({ open: jest.fn(), a11y: () => ({}), sheet: null }),
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('shows placeholder result rows while searching, then the results', async () => {
  await render(<SearchScreen />);
  expect(screen.getByRole('progressbar', { name: 'Searching pins' })).toBeTruthy();
  expect(screen.queryByText('No pins found')).toBeNull();

  await act(async () => { jest.advanceTimersByTime(300); });
  await act(async () => {
    resolveSearch({ pins: [{ id: 'p1', title: 'Stitch Surfing', brand: 'Disney', collection: 'Lilo', characters: ['Stitch'] }], total: 1 });
  });
  expect(screen.queryByRole('progressbar', { name: 'Searching pins' })).toBeNull();
  expect(screen.getByText('Stitch Surfing')).toBeTruthy();
});
