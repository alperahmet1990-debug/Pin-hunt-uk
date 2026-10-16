import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { SetCompleteWatcher } from '../SetCompleteWatcher';

const mockPush = jest.fn();
const mockListeners = new Set<(ids: string[]) => void>();
const mockOnPinsAdded = (l: (ids: string[]) => void) => { mockListeners.add(l); return () => { mockListeners.delete(l); }; };
let mockCollection: Record<string, { status: string }> = {};
const mockPins = [
  { id: 'a1', title: 'Mickey', collection: 'Park Icons' },
  { id: 'a2', title: 'Castle', collection: 'Park Icons' },
];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(() => Promise.resolve()), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    collection: mockCollection,
    onPinsAdded: mockOnPinsAdded,
  }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, ensureCollections: () => Promise.resolve() }),
}));

async function addPins(ids: string[], status = 'owned') {
  for (const id of ids) mockCollection = { ...mockCollection, [id]: { status } };
  await act(async () => { mockListeners.forEach(l => l(ids)); });
}

beforeEach(async () => {
  jest.clearAllMocks();
  // RNTL unmounts the previous test's screen late; start with no listeners.
  mockListeners.clear();
  mockCollection = {};
  await AsyncStorage.clear();
});

describe('Set-completion moment (UX-023, #136)', () => {
  // Runs first: a test that opens and leaves the sheet delays RNTL's next mount.
  it('with Reduce Motion, shows the same content without the animation', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const spring = jest.spyOn(Animated, 'spring');
    const view = await render(<SetCompleteWatcher />);
    await act(async () => {});
    await addPins(['a1', 'a2'], 'for_trade');
    view.rerender(<SetCompleteWatcher />);
    expect(await screen.findByText('Set complete: 2/2')).toBeTruthy();
    expect(spring).not.toHaveBeenCalled();
  });

  it('celebrates the moment the last pin of a set is added, then View set opens it', async () => {
    const view = await render(<SetCompleteWatcher />);
    await addPins(['a1']);
    view.rerender(<SetCompleteWatcher />);
    expect(screen.queryByTestId('set-complete-sheet')).toBeNull();
    await addPins(['a2']);
    view.rerender(<SetCompleteWatcher />);
    expect(await screen.findByText('Set complete: 2/2')).toBeTruthy();
    expect(screen.getByText('Park Icons')).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'View set' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/set/[collection]', params: { collection: 'Park Icons' } });
  });

  it('only once per set per account, even after a restart', async () => {
    await AsyncStorage.setItem('@pinhunt_sets_celebrated_v1:u1', JSON.stringify(['Park Icons']));
    const view = await render(<SetCompleteWatcher />);
    await addPins(['a1', 'a2']);
    view.rerender(<SetCompleteWatcher />);
    expect(screen.queryByTestId('set-complete-sheet')).toBeNull();
  });

});
