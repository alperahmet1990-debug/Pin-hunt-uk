import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BrowseCatalogueScreen from '../app/browse-catalogue';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetStatuses = jest.fn();
const mockToast = jest.fn();
let mockMode: string | undefined;
let mockTitle: string | undefined;
const mockRows = [
  { id: 'p1', title: 'Mickey Classic', setName: 'Classics 2024' },
  { id: 'p2', title: 'Minnie Bow', setName: 'Classics 2024' },
  { id: 'p3', title: 'Dumbo', setName: 'Park Icons' },
];
const mockIndex = { rows: mockRows, loading: false, error: null, refresh: () => Promise.resolve() };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => (mockMode ? { mode: mockMode } : {}),
  Stack: { Screen: ({ options }: { options: { title: string } }) => { mockTitle = options.title; return null; } },
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));
jest.mock('@/hooks/useCatalogueBrowseIndex', () => ({ useCatalogueBrowseIndex: () => mockIndex }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: {}, setStatuses: mockSetStatuses }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), addPinsToBoard: jest.fn() }),
}));

describe('Browse catalogue: add mode and For Trade (UX-055)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMode = undefined;
    mockTitle = undefined;
  });

  it('without mode=add it is the Entire Catalogue, with no Done bar', async () => {
    await render(<BrowseCatalogueScreen />);
    expect(mockTitle).toBe('Entire Catalogue');
    expect(screen.queryByText(/Pick a set and tap Select all/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Done/ })).toBeNull();
  });

  it('mode=add reframes the screen and counts what was added', async () => {
    mockMode = 'add';
    await render(<BrowseCatalogueScreen />);
    expect(mockTitle).toBe('Add pins you own');
    expect(screen.getByText(/Pick a set and tap Select all/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();

    await fireEvent.press(screen.getAllByText('Select all')[0]);
    await fireEvent.press(screen.getByRole('button', { name: /Add to Collection/ }));
    expect(mockSetStatuses).toHaveBeenCalledWith(['p1', 'p2'], 'owned');

    const done = screen.getByRole('button', { name: 'Done · 2 added' });
    await fireEvent.press(done);
    expect(mockBack).toHaveBeenCalled();
  });

  it('For Trade marks the selection for_trade in one go, with Undo', async () => {
    await render(<BrowseCatalogueScreen />);
    await fireEvent.press(screen.getByLabelText('Dumbo'));
    await fireEvent.press(screen.getByRole('button', { name: /For Trade/ }));
    expect(mockSetStatuses).toHaveBeenCalledWith(['p3'], 'for_trade');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Added 1 pin for trade' }));

    mockToast.mock.calls[0][0].action.onPress();
    expect(mockSetStatuses).toHaveBeenLastCalledWith(['p3'], 'none');
  });
});
