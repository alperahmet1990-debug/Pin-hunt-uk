import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CollectionScreen from '../app/(tabs)/collection';

const mockSetStatuses = jest.fn();
const mockToast = jest.fn();
let mockPins: { id: string; title: string; collection: string; characters: string[] }[] = [];
let mockCollection: Record<string, { pinId: string; status: string; quantity: number; dateAdded: string }> = {};
const mockEnsure = () => Promise.resolve();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  // These cover the All pins view (UX-067 opens on Boards; All is one tap from it).
  useLocalSearchParams: () => ({ tab: 'all' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    collection: mockCollection,
    getEntry: (id: string) => mockCollection[id],
    setStatuses: mockSetStatuses,
    restoreEntries: jest.fn(),
  }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), getBoardPins: () => [], addPinsToBoard: jest.fn(), removePinsFromBoard: jest.fn() }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: null, ensurePins: mockEnsure, ensureCollections: mockEnsure }),
}));

function seed(count: number) {
  mockPins = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, title: `Pin ${i}`, collection: 'Set', characters: [] }));
  mockCollection = Object.fromEntries(mockPins.map((p, i) => [p.id, { pinId: p.id, status: i % 10 === 0 ? 'wanted' : 'owned', quantity: 1, dateAdded: `2026-01-${String(1 + (i % 28)).padStart(2, '0')}` }]));
}

beforeEach(() => { jest.clearAllMocks(); seed(6); });

describe('My Collection: select mode (UX-017)', () => {
  it('selects tiles instead of opening them and marks them For Trade in one batch', async () => {
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Pin 1/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Pin 2/ }));
    expect(screen.getByText('2 selected')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'For Trade, 2 pins' }));
    expect(mockSetStatuses).toHaveBeenCalledWith(['p1', 'p2'], 'for_trade');
    // Back out of select mode afterwards.
    expect(screen.queryByRole('checkbox')).toBeNull();
  }, 20_000);

  it('Select all only takes what the current tab shows', async () => {
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    // All shows owned pins only: p0 is on the ISO.
    await fireEvent.press(screen.getByRole('button', { name: 'Select all 5' }));
    expect(screen.getByText('5 selected')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Owned, 5 pins' }));
    expect(mockSetStatuses.mock.calls[0][0]).not.toContain('p0');
  });

  it('switching tabs leaves select mode', async () => {
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    // The segment comes before the bulk bar's ISO action in the tree.
    await fireEvent.press(screen.getAllByText('ISO')[0]);
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it('handles 500 selected pins with one status write', async () => {
    seed(560);
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    const started = Date.now();
    await fireEvent.press(screen.getByRole('button', { name: 'Select all 504' }));
    expect(screen.getByText('504 selected')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'For Trade, 504 pins' }));
    expect(Date.now() - started).toBeLessThan(3000);
    expect(mockSetStatuses).toHaveBeenCalledTimes(1);
    expect(mockSetStatuses.mock.calls[0][0]).toHaveLength(504);
  }, 30_000);
});
