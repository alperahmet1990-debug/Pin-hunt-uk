import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SetDetailScreen from '../app/set/[collection]';

const mockPush = jest.fn();
const mockSetStatuses = jest.fn();
const mockToast = jest.fn();
let mockCollection: Record<string, { pinId: string; status: string; quantity: number }> = {};
const mockPins = [
  { id: 'p1', title: 'Mickey', collection: 'Park Icons', characters: [] },
  { id: 'p2', title: 'Dumbo', collection: 'Park Icons', characters: [] },
  { id: 'p3', title: 'Castle', collection: 'Park Icons', characters: [] },
  { id: 'p4', title: 'Stitch', collection: 'Park Icons', characters: [] },
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
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: null, userId: null }) }));
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

beforeEach(() => {
  jest.clearAllMocks();
  // p1 owned; p2 on the ISO; p3, p4 not collected.
  mockCollection = {
    p1: { pinId: 'p1', status: 'owned', quantity: 1 },
    p2: { pinId: 'p2', status: 'wanted', quantity: 1 },
  };
});

describe('Set detail: select mode (UX-022)', () => {
  // First test in the file: its first render compiles the whole screen tree,
  // which on a cold Jest cache can pass the 5 s default, so it gets longer.
  it('selects all missing and marks them Owned in one batch, with Undo back to exactly what they were', async () => {
    await render(<SetDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    expect(screen.getByText('Tap the pins you have')).toBeTruthy();
    // Owned pins aren't selectable; missing pins become checkboxes.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);

    await fireEvent.press(screen.getByRole('button', { name: 'Select all missing' }));
    expect(screen.getByText('3 selected')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Mark 3 as Owned' }));

    expect(mockSetStatuses).toHaveBeenCalledWith(['p2', 'p3', 'p4'], 'owned');
    const toast = mockToast.mock.calls[0][0];
    expect(toast.message).toBe('Added 3 · Set 4/4');
    toast.action.onPress();
    expect(mockSetStatuses).toHaveBeenCalledWith(['p3', 'p4'], 'none');
    expect(mockSetStatuses).toHaveBeenCalledWith(['p2'], 'wanted');
    // Back to normal mode.
    expect(screen.queryByRole('checkbox')).toBeNull();
  }, 20_000);

  it('ticks individual pins and adds only the ones not already on the ISO', async () => {
    await render(<SetDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Dumbo/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Castle/ }));
    expect(screen.getByRole('checkbox', { name: /^Castle/ }).props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Add to ISO' }));
    expect(mockSetStatuses).toHaveBeenCalledWith(['p3'], 'wanted');
    expect(mockToast.mock.calls[0][0].message).toBe('Added 1 pin to your ISO');
  });

  it('in select mode tapping a pin selects it instead of opening it; Cancel leaves without changes', async () => {
    await render(<SetDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Stitch/ }));
    expect(mockPush).not.toHaveBeenCalled();
    // The missing-pins footer is replaced while selecting.
    expect(screen.queryByRole('button', { name: /Find the/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel selecting' }));
    expect(mockSetStatuses).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Find the 3 missing/ })).toBeTruthy();
  });

  it('Mark as Owned is disabled until something is selected', async () => {
    await render(<SetDetailScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select pins' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as Owned' }));
    expect(mockSetStatuses).not.toHaveBeenCalled();
  });

  it('has no Select button once the set is complete', async () => {
    mockCollection = Object.fromEntries(mockPins.map(p => [p.id, { pinId: p.id, status: 'owned', quantity: 1 }]));
    await render(<SetDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Select pins' })).toBeNull();
  });
});
