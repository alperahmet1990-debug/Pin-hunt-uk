import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ScanScreen from '../app/(tabs)/scan';

// UX-005 (#112): from photo to "That's it" without leaving the scan screen.
const mockPush = jest.fn();
let mockQuickAddPin: { id: string } | null = null;
const mockPins = [
  { id: 'p1', title: 'Castle Fireworks', collection: 'Park Icons', imageUrl: 'https://example.test/p1.jpg' },
  { id: 'p2', title: 'Dumbo Blue Sky', collection: 'Park Icons' },
];
const mockIdentify = jest.fn();

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: false, assets: [{ uri: 'file:///photo.jpg', base64: 'abc', mimeType: 'image/jpeg' }] })),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
}));
jest.mock('@/utils/identifyPin', () => ({ identifyPin: (...args: unknown[]) => mockIdentify(...args) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/hooks/useMyAccess', () => ({ useMyAccess: () => ({ isAdmin: false, isAppCreator: false, isContributor: false, loading: false }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ markViewed: jest.fn() }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: mockPins, repository: null }) }));
jest.mock('@/components/QuickAddSheet', () => ({
  QuickAddSheet: ({ pin }: { pin: { id: string } | null }) => { mockQuickAddPin = pin; return null; },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuickAddPin = null;
  mockIdentify.mockResolvedValue({
    matches: [
      { pinId: 'p2', confidence: 81, reasoning: 'Blue sky and ears' },
      { pinId: 'p1', confidence: 55, reasoning: 'Castle' },
    ],
    imageInsights: null,
  });
});

async function scanToResult() {
  await render(<ScanScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose Photo' }));
  const identify = await screen.findByRole('button', { name: 'Identify Pin' }, { timeout: 3000 });
  await fireEvent.press(identify);
  await screen.findByRole('header', { name: 'Best match' });
}

describe('Scan result (UX-005)', () => {
  it("\"That's it\" opens the add sheet in place for the best match", async () => {
    await scanToResult();
    expect(screen.getByText('Dumbo Blue Sky')).toBeTruthy();
    expect(screen.queryByText(/81%/)).toBeNull();
    // The comparison shows the photo, so the big viewfinder steps aside…
    expect(screen.queryByText('Analysing with AI…')).toBeNull();
    expect(screen.getAllByLabelText('Your photo')).toHaveLength(1);
    // …and a new scan is one tap away.
    expect(screen.getByRole('button', { name: 'Scan another pin' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: "That's it" }));
    await waitFor(() => expect(mockQuickAddPin?.id).toBe('p2'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opening a pin without a catalogue photo goes to Pin detail, never photo contribution', async () => {
    await scanToResult();
    await fireEvent.press(screen.getByRole('button', { name: 'Dumbo Blue Sky. Open pin details' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'p2' } });
    expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/contribute-image/[pinId]' }));
  });

  it('"None of these" keeps the photo and shows the recovery options', async () => {
    await scanToResult();
    await fireEvent.press(screen.getByRole('button', { name: 'Not it' }));
    await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'None of these' })); });
    expect(await screen.findByText('Not the right pin?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'None of these' })).toBeNull();
  });

  it('a failed identify says what went wrong in plain words, never the raw error (UX-046)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockIdentify.mockRejectedValueOnce(new TypeError('Network request failed'));
    await render(<ScanScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose Photo' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Identify Pin' }, { timeout: 3000 }));
    expect(await screen.findByRole('alert', { name: "You're offline. Check your connection and try again." })).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
    // Try again re-runs the identify with the same photo.
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('header', { name: 'Best match' });
    expect(mockIdentify).toHaveBeenCalledTimes(2);
  });
});
