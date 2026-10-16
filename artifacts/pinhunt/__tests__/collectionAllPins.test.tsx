import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CollectionScreen from '../app/(tabs)/collection';

const mockPush = jest.fn();
const mockCreateBoard = jest.fn(() => ({ id: 'b-new' }));
let mockParams: { tab?: string } = {};
let mockCollection: Record<string, { pinId: string; status: string; quantity: number; dateAdded: string }> = {};
let mockBoards: { id: string; name: string; pinIds: string[] }[] = [];
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
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: null }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, getEntry: (id: string) => mockCollection[id] }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({
    customBoards: mockBoards,
    createBoard: mockCreateBoard,
    getBoardPins: (b: { pinIds: string[] }) => mockPins.filter(p => b.pinIds.includes(p.id)),
  }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: null, ensurePins: mockEnsure, ensureCollections: mockEnsure }),
}));

/** True when the element sits inside the shared Sheet's keyboard handling (#47). */
function insideKeyboardAvoidingView(el: { parent: unknown }): boolean {
  for (let n = el.parent as { props?: { testID?: string }; parent: unknown } | null; n; n = n.parent as typeof n) {
    if (n.props?.testID === 'keyboard-avoiding-view') return true;
  }
  return false;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await require('@react-native-async-storage/async-storage').clear();
  mockParams = {};
  mockBoards = [{ id: 'b1', name: 'Favourites', pinIds: ['p1', 'p2'] }];
  // p1 owned ×3, p2 for trade, p3 on the ISO, p4 not collected.
  mockCollection = {
    p1: { pinId: 'p1', status: 'owned', quantity: 3, dateAdded: '2026-10-01' },
    p2: { pinId: 'p2', status: 'for_trade', quantity: 1, dateAdded: '2026-10-02' },
    p3: { pinId: 'p3', status: 'wanted', quantity: 1, dateAdded: '2026-10-03' },
  };
});

const openAllPins = async () => {
  await fireEvent.press(screen.getByRole('button', { name: /^All pins, / }));
};

describe('My Collection: Boards first, All pins one tap away (UX-067, B-P1-04)', () => {
  it('opens on Boards with the summary, "All pins" first and each board as a card', async () => {
    await render(<CollectionScreen />);
    expect(screen.getByLabelText('2 Total pins, 1 Boards, 1 For Trade')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All pins, 2 pins, 1 for trade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Favourites, 2 pins, 1 for trade' })).toBeTruthy();
    // No values on My Collection (maintainer, 16 Oct).
    expect(screen.queryByText(/£|\$/)).toBeNull();
  }, 20_000);

  it('All pins shows owned pins as image-first tiles, ×N for duplicates and For Trade marked', async () => {
    await render(<CollectionScreen />);
    await openAllPins();
    // Owned and For Trade pins, not ISO or uncollected ones.
    expect(screen.getByRole('button', { name: 'Mickey, 3 copies' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dumbo, For Trade' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Castle/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Stitch/ })).toBeNull();
    expect(screen.getByText('×3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to boards' }));
    expect(screen.getByRole('button', { name: /^All pins, / })).toBeTruthy();
  });

  it('a board opens in one tap and New board is one tap', async () => {
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Favourites, 2 pins, 1 for trade' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/board/[id]', params: { id: 'b1' } });
    await fireEvent.press(screen.getByRole('button', { name: 'New board' }));
    expect(screen.getByRole('header', { name: 'New board' })).toBeTruthy();
  });

  it('sorts boards and switches to a remembered list view', async () => {
    mockBoards = [
      { id: 'b1', name: 'Zoo', pinIds: ['p1'] },
      { id: 'b2', name: 'Apples', pinIds: ['p1', 'p2'] },
    ];
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sort boards: Recent' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Name' }));
    const names = screen.getAllByRole('button', { name: /pins?(, \d+ for trade)?$/ }).map(b => b.props.accessibilityLabel);
    expect(names.indexOf('Apples, 2 pins, 1 for trade')).toBeLessThan(names.indexOf('Zoo, 1 pin'));
    await fireEvent.press(screen.getByRole('radio', { name: 'List view' }));
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@pinhunt_collection_view_v1', 'list');
    expect(screen.getByRole('radio', { name: 'List view' }).props.accessibilityState.selected).toBe(true);
  });

  it('keeps the Create Board name field above the keyboard (B-P1-21)', async () => {
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'New board' }));
    expect(insideKeyboardAvoidingView(screen.getByLabelText('Board name'))).toBe(true);
  });

  it('ISO shows wanted pins without a status marker, and For Trade stays separate', async () => {
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByText('ISO'));
    expect(screen.getByRole('button', { name: 'Castle' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Mickey/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Favourites/ })).toBeNull();
  });

  it('For Trade shows only for_trade pins, without the redundant marker', async () => {
    await render(<CollectionScreen />);
    // The tab, not the summary's "For Trade" label.
    await fireEvent.press(screen.getAllByText('For Trade')[0]);
    expect(screen.getByRole('button', { name: 'Dumbo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Mickey/ })).toBeNull();
  });

  it('links to ?tab=boards land on Boards', async () => {
    mockParams = { tab: 'boards' };
    await render(<CollectionScreen />);
    expect(screen.getByRole('button', { name: /^All pins, / })).toBeTruthy();
  });

  it('links to ?tab=all open All pins', async () => {
    mockParams = { tab: 'all' };
    await render(<CollectionScreen />);
    expect(screen.getByRole('button', { name: 'Mickey, 3 copies' })).toBeTruthy();
  });

  it('with no pins and no boards, offers Scan and Add from catalogue only (#353)', async () => {
    mockCollection = {};
    mockBoards = [];
    await render(<CollectionScreen />);
    expect(screen.getByText('No pins yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Scan a pin' }));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/scan');
    await fireEvent.press(screen.getByRole('button', { name: 'Add from catalogue' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/browse-catalogue', params: { mode: 'add' } });
    expect(screen.queryByText(/Search for a pin/)).toBeNull();
  });

  it('the + menu has one door to the catalogue: Scan, Add from catalogue, New board (#353)', async () => {
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add pins' }));
    for (const label of ['Scan a pin', 'Add from catalogue', 'New board']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.queryByText('Search for a pin')).toBeNull();
    await fireEvent.press(screen.getByText('Add from catalogue'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/browse-catalogue', params: { mode: 'add' } });
  });
});
