import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PhotographYourPinsScreen from '../app/contribute/photos';
import { PhotoGapsCard } from '../components/PhotoGapsCard';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { pins?: string } = {};
let mockEnabled = true;
const row = (pinhuntId: string, imageSource: string | null, myStatus?: string) =>
  ({ pinhuntId, title: `Pin ${pinhuntId}`, setName: 'Park Icons', imageSource, pendingCount: 0, myStatus });
let mockRows = [row('p1', null), row('p2', null, 'pending'), row('p3', 'community'), row('p4', null)];
const mockCollection = {
  p1: { pinId: 'p1', status: 'owned' }, p2: { pinId: 'p2', status: 'owned' },
  p3: { pinId: 'p3', status: 'owned' }, p4: { pinId: 'p4', status: 'for_trade' },
};

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: mockEnabled, loading: false }) }));
jest.mock('@/hooks/useCatalogueCoverage', () => ({
  useCatalogueCoverage: (enabled: boolean) => ({ rows: enabled ? mockRows : [], loading: false, error: null, refresh: jest.fn() }),
}));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = {};
  mockEnabled = true;
  mockRows = [row('p1', null), row('p2', null, 'pending'), row('p3', 'community'), row('p4', null)];
  await AsyncStorage.removeItem('@pinhunt_photo_gaps_snooze_v1:u1');
});

describe('Photograph your pins (UX-056)', () => {
  // First test in the file: its first render compiles the whole screen tree.
  // On a cold Jest cache with every worker busy that alone can pass the 5 s
  // default (seen in CI-like cold runs), so it gets a longer limit.
  it('lists owned pins with no photo, still-to-do first, and opens the existing contribute flow', async () => {
    await render(<PhotographYourPinsScreen />);
    expect(screen.getByText(/2 of your pins don.t have a catalogue photo yet/)).toBeTruthy();
    expect(screen.getByText('1 sent · 2 to go')).toBeTruthy();
    expect(screen.queryByText('Pin p3')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo of Pin p1' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/contribute-image/[pinId]', params: { pinId: 'p1', from: 'catalogue' } });
    expect(screen.getByRole('button', { name: 'Pin p2, photo sent for review' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Later' }));
    expect(mockBack).toHaveBeenCalled();
  }, 20_000);

  it('after Done in add mode, shows only the pins just added', async () => {
    mockParams = { pins: 'p4' };
    await render(<PhotographYourPinsScreen />);
    expect(screen.getByText(/1 of your pins doesn.t have a catalogue photo yet/)).toBeTruthy();
    expect(screen.getByText('Pin p4')).toBeTruthy();
    expect(screen.queryByText('Pin p1')).toBeNull();
  });

  it('says thanks with a Done button once everything is sent', async () => {
    mockRows = [row('p1', null, 'pending')];
    await render(<PhotographYourPinsScreen />);
    expect(screen.getByText('Thanks! 1 photo sent for review.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('is closed to people without photo contributions', async () => {
    mockEnabled = false;
    await render(<PhotographYourPinsScreen />);
    expect(screen.getByText(/aren't open to your account yet/)).toBeTruthy();
    expect(screen.queryByText('Pin p1')).toBeNull();
  });
});

describe('PhotoGapsCard (UX-056)', () => {
  it('shows the count and opens the list', async () => {
    await render(<PhotoGapsCard />);
    await waitFor(() => expect(screen.getByText('Pins that need a photo (2)')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: /Pins that need a photo, 2/ }));
    expect(mockPush).toHaveBeenCalledWith('/contribute/photos');
  });

  it('Not now hides it and remembers for a week', async () => {
    await render(<PhotoGapsCard />);
    await waitFor(() => expect(screen.getByText('Pins that need a photo (2)')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(/need a photo/)).toBeNull();
    await waitFor(async () => expect(await AsyncStorage.getItem('@pinhunt_photo_gaps_snooze_v1:u1')).toBeTruthy());
  });

  it('stays hidden while snoozed', async () => {
    await AsyncStorage.setItem('@pinhunt_photo_gaps_snooze_v1:u1', String(Date.now()));
    await render(<PhotoGapsCard />);
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(screen.queryByText(/need a photo/)).toBeNull();
  });

  it('never shows without photo contributions', async () => {
    mockEnabled = false;
    await render(<PhotoGapsCard />);
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(screen.queryByText(/need a photo/)).toBeNull();
  });
});
