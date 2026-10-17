import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ContributeImageScreen from '../app/contribute-image/[pinId]';

// #383: "Suggest a better photo" from the pin page proposes a replacement for
// a pin's current photo, with a reason, then returns to the pin page.
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
let mockPins: Array<{ id: string; title: string; imageUrl?: string }> = [];
let mockIsAdmin = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, ensurePins: jest.fn() }),
}));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));
jest.mock('@/hooks/useMyAccess', () => ({ useMyAccess: () => ({ isAdmin: mockIsAdmin }) }));
jest.mock('@/hooks/useCatalogueCoverage', () => ({
  findNextContributionTarget: () => undefined,
  getCachedCoverage: () => undefined,
  markCoveragePending: jest.fn(),
  markCoveragePublished: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: false, assets: [{ base64: 'new64', mimeType: 'image/jpeg' }] })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: false, assets: [{ base64: 'new64', mimeType: 'image/jpeg' }] })),
}));

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { pinId: 'PHUK-1', from: 'replace' };
  mockPins = [{ id: 'PHUK-1', title: 'Star Badge', imageUrl: 'https://img.test/current.jpg' }];
  mockIsAdmin = false;
  fetchMock.mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.endsWith('/preview')
      ? { previewBase64: 'clean', draftPath: 'u/drafts/1.jpg' }
      : { image: { id: 'img-1' } }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const bodyOf = (suffix: string) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(suffix));
  return call ? JSON.parse(call[1].body) : null;
};

describe('Suggest a better photo (#383)', () => {
  it('shows the current photo and asks why it should be replaced', async () => {
    await render(<ContributeImageScreen />);
    expect(screen.getByText('Propose a better photo')).toBeTruthy();
    expect(screen.getByTestId('current-photo-card')).toBeTruthy();
    expect(screen.getByText('Current photo')).toBeTruthy();
    expect(screen.getByText('Why replace the current photo?')).toBeTruthy();
    expect(screen.getByText('The current photo stays until a PinHunt moderator reviews yours — nothing changes unless it’s approved.')).toBeTruthy();
  }, 20_000);

  it('needs a reason and consent, then sends the reason with the photo', async () => {
    await render(<ContributeImageScreen />);
    await fireEvent(screen.getByRole('switch'), 'valueChange', true);
    // Still no reason: Take Photo does nothing.
    await fireEvent.press(screen.getByText('Take Photo'));
    expect(fetchMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Current photo is poor quality'));
    await fireEvent.press(screen.getByText('Take Photo'));
    await waitFor(() => expect(bodyOf('/contribute/preview')).toMatchObject({ pinId: 'PHUK-1', proposalReason: 'poor_quality' }));
  });

  it('goes back to the pin page, not a new copy of it', async () => {
    await render(<ContributeImageScreen />);
    await fireEvent.press(screen.getByText('Maybe later'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('without the replace entry point, a pin with a photo is not treated as a replacement', async () => {
    mockParams = { pinId: 'PHUK-1' };
    await render(<ContributeImageScreen />);
    expect(screen.queryByText('Why replace the current photo?')).toBeNull();
    expect(screen.queryByTestId('current-photo-card')).toBeNull();
  });
});
