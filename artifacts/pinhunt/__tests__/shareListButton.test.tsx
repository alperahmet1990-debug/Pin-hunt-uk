import React from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CollectionScreen from '../app/(tabs)/collection';

// #146: Share on the ISO and For Trade tabs.
const mockPush = jest.fn();
let mockTab = 'traders';
let mockProfile: { username: string; profileVisibility: 'public' | 'private' } | null = null;
const mockPins = [
  { id: 'p1', title: 'Castle Fireworks', collection: 'Park Icons', characters: [] },
  { id: 'p2', title: 'Dumbo Blue Sky', collection: 'Park Icons', characters: [] },
  { id: 'p3', title: 'Stitch Valentine', collection: 'Hearts', characters: [] },
];
const mockCollection: Record<string, { pinId: string; status: string; quantity: number; dateAdded: string }> = {
  p1: { pinId: 'p1', status: 'for_trade', quantity: 1, dateAdded: '2026-01-01' },
  p2: { pinId: 'p2', status: 'for_trade', quantity: 1, dateAdded: '2026-01-02' },
  p3: { pinId: 'p3', status: 'wanted', quantity: 1, dateAdded: '2026-01-03' },
};
const mockEnsure = () => Promise.resolve();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ tab: mockTab }),
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn(), hide: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: mockProfile }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, getEntry: (id: string) => mockCollection[id], setStatuses: jest.fn(), restoreEntries: jest.fn() }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), getBoardPins: () => [], addPinsToBoard: jest.fn(), removePinsFromBoard: jest.fn() }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: null, ensurePins: mockEnsure, ensureCollections: mockEnsure }),
}));

let share: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = { username: 'pinfan', profileVisibility: 'public' };
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
});

describe('Share my lists (#146)', () => {
  it('shares the For Trade list as text with the username, and nothing else', async () => {
    mockTab = 'traders';
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Share your For Trade list' }));
    expect(share).toHaveBeenCalledWith({
      message: 'My For Trade pins on PinHunt (2):\n• Castle Fireworks\n• Dumbo Blue Sky\n\nFind me on PinHunt: @pinfan',
      title: 'My For Trade pins',
    });
  });

  it('shares the ISO list from the ISO tab, without For Trade pins', async () => {
    mockTab = 'iso';
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Share your ISO list' }));
    const { message } = share.mock.calls[0][0];
    expect(message).toContain('My ISO on PinHunt (1):\n• Stitch Valentine');
    expect(message).not.toContain('Castle Fireworks');
  });

  it('a private profile explains how to share instead of sharing', async () => {
    mockTab = 'iso';
    mockProfile = { username: 'pinfan', profileVisibility: 'private' };
    await render(<CollectionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Share your ISO list' }));
    expect(share).not.toHaveBeenCalled();
    expect(await screen.findByText('Your profile is private')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Profile' }));
    expect(mockPush).toHaveBeenCalledWith('/edit-profile');
  });
});
