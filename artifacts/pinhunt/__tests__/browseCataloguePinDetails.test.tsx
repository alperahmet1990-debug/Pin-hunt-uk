import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BrowseCatalogueScreen from '../app/browse-catalogue';

// #377: on Add from catalogue, tapping a pin's picture selects it and tapping
// its name opens the pin.
const mockPush = jest.fn();
const mockRows = [
  { id: 'p1', title: 'Mickey Classic', setName: 'Classics 2024' },
  { id: 'p2', title: 'Minnie Bow', setName: 'Classics 2024' },
];
const mockIndex = { rows: mockRows, loading: false, error: null, refresh: () => Promise.resolve() };
let mockCollection: Record<string, { status: string }> = {};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({ mode: 'add' }),
  Stack: { Screen: () => null },
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn(), hide: jest.fn() }) }));
jest.mock('@/hooks/useCatalogueBrowseIndex', () => ({ useCatalogueBrowseIndex: () => mockIndex }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, setStatuses: jest.fn() }),
}));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: false, loading: false }) }));
jest.mock('@/hooks/useCatalogueCoverage', () => ({ useCatalogueCoverage: () => ({ rows: [] }) }));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), addPinsToBoard: jest.fn() }),
}));

const tile = (name: RegExp) => screen.getByRole('checkbox', { name });

describe('Add from catalogue: opening a pin (#377)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection = {};
  });

  it('tapping the name opens the pin without selecting it', async () => {
    await render(<BrowseCatalogueScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'View details for Mickey Classic' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'p1' } });
    expect(tile(/^Mickey Classic/).props.accessibilityState).toMatchObject({ checked: false });
  }, 20_000);

  it('tapping the picture selects, and opens nothing', async () => {
    await render(<BrowseCatalogueScreen />);
    await fireEvent.press(tile(/^Minnie Bow/));
    expect(tile(/^Minnie Bow/).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a pin you already own can still be opened from its name', async () => {
    mockCollection = { p1: { status: 'owned' } };
    await render(<BrowseCatalogueScreen />);
    expect(tile(/^Mickey Classic/).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole('button', { name: 'View details for Mickey Classic' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'p1' } });
  });

  it('screen readers get a View details action on the tile', async () => {
    await render(<BrowseCatalogueScreen />);
    const t = tile(/^Minnie Bow/);
    expect(t.props.accessibilityActions).toContainEqual({ name: 'viewDetails', label: 'View details' });
    await fireEvent(t, 'accessibilityAction', { nativeEvent: { actionName: 'viewDetails' } });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'p2' } });
  });

  it('press and hold still opens the pin', async () => {
    await render(<BrowseCatalogueScreen />);
    await fireEvent(tile(/^Minnie Bow/), 'longPress');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'p2' } });
  });
});

describe('Add from catalogue: hint (#377)', () => {
  it('tells people a name opens the pin', async () => {
    await render(<BrowseCatalogueScreen />);
    expect(screen.getByText(/Tap a name to see the pin\./)).toBeTruthy();
  });
});
