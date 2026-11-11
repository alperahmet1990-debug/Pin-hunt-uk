import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CollectionScreen from '../app/(tabs)/collection';

// Empty For Trade and ISO tabs send collectors somewhere useful (#463).
const mockPush = jest.fn();
let mockTab = 'traders';
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
  useLocalSearchParams: () => ({ tab: mockTab }),
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn(), hide: jest.fn() }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: null }) }));
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

function seedOwned(count: number) {
  mockPins = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, title: `Pin ${i}`, collection: 'Set', characters: [] }));
  mockCollection = Object.fromEntries(mockPins.map(p => [p.id, { pinId: p.id, status: 'owned', quantity: 1, dateAdded: '2026-01-01' }]));
}

beforeEach(() => { jest.clearAllMocks(); seedOwned(3); });

describe('Collection empty-state actions (#463)', () => {
  it('For Trade: "Choose pins to trade" opens your own pins with Select on', async () => {
    mockTab = 'traders';
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose pins to trade' }));
    expect(mockPush).not.toHaveBeenCalled();
    // All pins, already selecting, with the bulk For Trade action to hand.
    expect(screen.getByRole('button', { name: 'Back to boards' })).toBeTruthy();
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('For Trade with nothing owned lands on the empty All pins view', async () => {
    mockTab = 'traders';
    mockPins = [];
    mockCollection = {};
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose pins to trade' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Start your collection')).toBeTruthy();
  });

  it('ISO: the empty action browses the catalogue', async () => {
    mockTab = 'iso';
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Browse the catalogue' }));
    expect(mockPush).toHaveBeenCalledWith('/browse-catalogue');
  });
});
