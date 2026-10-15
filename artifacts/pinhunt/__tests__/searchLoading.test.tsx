import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import SearchScreen from '../app/search';

// UX-045: a search in flight shows result-shaped rows, not a spinner.
let resolveSearch: (page: unknown) => void = () => {};
let mockSearchFails = false;
const mockRepository = {
  searchPinsPage: jest.fn(() => (mockSearchFails
    ? Promise.reject(Object.assign(new Error('relation "pins" does not exist'), { status: 500 }))
    : new Promise(resolve => { resolveSearch = resolve; }))),
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

it('a failed search explains and retries instead of saying "No pins found" (UX-046)', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockRepository.searchPinsPage.mockClear();
  mockSearchFails = true;
  await render(<SearchScreen />);
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(screen.getByRole('alert', { name: "Something went wrong on our side. It's not you. Please try again in a moment." })).toBeTruthy();
  expect(screen.queryByText('No pins found')).toBeNull();
  expect(screen.queryByText(/does not exist/)).toBeNull();

  mockSearchFails = false;
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await act(async () => { jest.advanceTimersByTime(300); });
  await act(async () => {
    resolveSearch({ pins: [{ id: 'p1', title: 'Stitch Surfing', brand: 'Disney', collection: 'Lilo', characters: ['Stitch'] }], total: 1 });
  });
  expect(screen.getByText('Stitch Surfing')).toBeTruthy();
  // Two searches for the query (failed, then retried); the popular-pins page
  // is a separate empty-query call (#25).
  const queryCalls = (mockRepository.searchPinsPage.mock.calls as unknown as [string][]).filter(([q]) => q !== '');
  expect(queryCalls).toHaveLength(2);
});
