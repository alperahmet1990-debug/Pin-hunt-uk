import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BrowseCatalogueScreen from '../app/browse-catalogue';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
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
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: mockReplace }),
  useLocalSearchParams: () => (mockMode ? { mode: mockMode } : {}),
  Stack: { Screen: ({ options }: { options: { title: string } }) => { mockTitle = options.title; return null; } },
}));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));
jest.mock('@/hooks/useCatalogueBrowseIndex', () => ({ useCatalogueBrowseIndex: () => mockIndex }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: {}, setStatuses: mockSetStatuses }),
}));
let mockCanContribute = false;
let mockCoverage: Array<{ pinhuntId: string; imageSource: string | null }> = [];
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: mockCanContribute, loading: false }) }));
jest.mock('@/hooks/useCatalogueCoverage', () => ({ useCatalogueCoverage: () => ({ rows: mockCoverage }) }));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), addPinsToBoard: jest.fn() }),
}));

/** True when the element sits inside the shared Sheet's keyboard handling (#47). */
function insideKeyboardAvoidingView(el: { parent: unknown }): boolean {
  for (let n = el.parent as { props?: { testID?: string }; parent: unknown } | null; n; n = n.parent as typeof n) {
    if (n.props?.testID === 'keyboard-avoiding-view') return true;
  }
  return false;
}

describe('Browse catalogue: add mode and For Trade (UX-055)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMode = undefined;
    mockTitle = undefined;
    mockCanContribute = false;
    mockCoverage = [];
  });

  // First test in the file: its first render compiles the whole screen tree.
  // On a cold Jest cache with every worker busy that alone can pass the 5 s
  // default (seen in CI-like cold runs), so it gets a longer limit.
  it('without mode=add it is the Entire Catalogue, with no Done bar', async () => {
    await render(<BrowseCatalogueScreen />);
    expect(mockTitle).toBe('Entire Catalogue');
    expect(screen.queryByText(/Pick a set and tap Select all/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Done/ })).toBeNull();
  }, 20_000);

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

  it('keeps the new-board name field above the keyboard (B-P1-21)', async () => {
    await render(<BrowseCatalogueScreen />);
    await fireEvent.press(screen.getByLabelText('Dumbo'));
    await fireEvent.press(screen.getByRole('button', { name: /Board/ }));
    expect(insideKeyboardAvoidingView(screen.getByPlaceholderText('New board name'))).toBe(true);
  });

  describe('photo gaps for contributors (UX-056)', () => {
    beforeEach(() => {
      mockCoverage = [
        { pinhuntId: 'p1', imageSource: null },
        { pinhuntId: 'p2', imageSource: 'community' },
        { pinhuntId: 'p3', imageSource: null },
      ];
    });

    it('does not tag tiles for people who cannot contribute photos', async () => {
      await render(<BrowseCatalogueScreen />);
      expect(screen.queryAllByLabelText(/, photo needed$/)).toHaveLength(0);
      expect(screen.queryByText(/No catalogue photo yet/)).toBeNull();
    });

    it('tags tiles with no catalogue photo for contributors', async () => {
      mockCanContribute = true;
      await render(<BrowseCatalogueScreen />);
      expect(screen.getAllByLabelText(/, photo needed$/)).toHaveLength(2);
      expect(screen.getByText(/No catalogue photo yet/)).toBeTruthy();
      expect(screen.getByLabelText('Mickey Classic, photo needed')).toBeTruthy();
    });

    it('on Done, asks a contributor to photograph the owned pins they just added', async () => {
      mockCanContribute = true;
      mockMode = 'add';
      await render(<BrowseCatalogueScreen />);
      await fireEvent.press(screen.getAllByText('Select all')[0]);
      await fireEvent.press(screen.getByRole('button', { name: /Add to Collection/ }));
      await fireEvent.press(screen.getByRole('button', { name: 'Done · 2 added' }));

      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByText(/One of the pins you just added doesn.t have a photo yet/)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Photograph it' }));
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/contribute/photos', params: { pins: 'p1' } });
    });

    it('Later just leaves; ISO adds never trigger the prompt', async () => {
      mockCanContribute = true;
      mockMode = 'add';
      await render(<BrowseCatalogueScreen />);
      await fireEvent.press(screen.getByLabelText('Dumbo, photo needed'));
      await fireEvent.press(screen.getByRole('button', { name: /ISO$/ }));
      await fireEvent.press(screen.getByRole('button', { name: 'Done · 1 added' }));
      expect(screen.queryByText(/Help with photos/)).toBeNull();
      expect(mockBack).toHaveBeenCalled();
    });

    it('without the feature, Done leaves straight away', async () => {
      mockMode = 'add';
      await render(<BrowseCatalogueScreen />);
      await fireEvent.press(screen.getAllByText('Select all')[0]);
      await fireEvent.press(screen.getByRole('button', { name: /Add to Collection/ }));
      await fireEvent.press(screen.getByRole('button', { name: 'Done · 2 added' }));
      expect(mockBack).toHaveBeenCalled();
      expect(screen.queryByText(/Help with photos/)).toBeNull();
    });
  });
});
