import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CollectionScreen from '../app/(tabs)/collection';

// #65: the ISO tab explains what ISO means, and the next step.
const mockPush = jest.fn();
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
  useLocalSearchParams: () => ({ tab: 'iso' }),
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn(), hide: jest.fn() }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    collection: mockCollection,
    getEntry: (id: string) => mockCollection[id],
    setStatuses: jest.fn(),
    restoreEntries: jest.fn(),
  }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), getBoardPins: () => [], addPinsToBoard: jest.fn(), removePinsFromBoard: jest.fn() }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: null, ensurePins: mockEnsure, ensureCollections: mockEnsure }),
}));

function seed(statuses: string[]) {
  mockPins = statuses.map((_, i) => ({ id: `p${i}`, title: `Pin ${i}`, collection: 'Set', characters: [] }));
  mockCollection = Object.fromEntries(mockPins.map((p, i) => [p.id, { pinId: p.id, status: statuses[i], quantity: 1, dateAdded: '2026-01-01' }]));
}

beforeEach(() => { jest.clearAllMocks(); });

describe("What's ISO? (#65)", () => {
  it('explains ISO and For Trade from the ISO tab, then offers Find Trades', async () => {
    seed(['wanted', 'owned']);
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: "What's ISO?" }));
    expect(await screen.findByLabelText('ISO means In Search Of: the pins you’re looking for.')).toBeTruthy();
    expect(screen.getByLabelText('For Trade is the other side: pins you own and would swap.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'See who has them' }));
    expect(mockPush).toHaveBeenCalledWith('/find-trades');
  });

  it('with nothing on the ISO yet, points to finding a pin', async () => {
    seed(['owned']);
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: "What's ISO?" }));
    // The empty ISO tab offers the same action; the sheet's button is the last one.
    await screen.findByLabelText(/In Search Of/);
    const buttons = screen.getAllByRole('button', { name: 'Find a pin to add' });
    await fireEvent.press(buttons[buttons.length - 1]);
    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('Got it closes the explainer', async () => {
    seed(['wanted']);
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: "What's ISO?" }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByLabelText(/In Search Of/)).toBeNull());
    expect(mockPush).not.toHaveBeenCalled();
  });
});
