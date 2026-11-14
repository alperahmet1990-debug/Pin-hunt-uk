import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import ContributeImageScreen from '../app/contribute-image/[pinId]';
import { saveAiPhotoConsent } from '../utils/aiPhotoConsent';
import { clearScanPhotoForContribution, getScanPhotoForContribution, setScanPhotoForContribution } from '../utils/scanPhotoHandoff';

// Scan → "Add your photo": the scan photo is the starting image, the
// collector can still take a new one, and admins are reviewed by default.
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
let mockIsAdmin = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token', user: { id: 'user-1' } } }) }));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: [{ id: 'PHUK-2', title: 'Dumbo Blue Sky' }], ensurePins: jest.fn() }),
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
  saveAiPhotoConsent(null);
  mockParams = { pinId: 'PHUK-2', from: 'scan' };
  mockIsAdmin = false;
  setScanPhotoForContribution({ pinId: 'PHUK-2', userId: 'user-1', uri: 'file:///scan.jpg', base64: 'scan64', mimeType: 'image/jpeg' });
  fetchMock.mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.endsWith('/preview')
      ? { previewBase64: 'clean', draftPath: 'u/drafts/1.jpg' }
      : { image: { id: 'img-1' }, autoApproved: false }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => clearScanPhotoForContribution());

const bodyOf = (suffix: string) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(suffix));
  return call ? JSON.parse(call[1].body) : null;
};

async function consent() {
  await fireEvent(screen.getByRole('switch'), 'valueChange', true);
}

describe('Add your photo from a scan', () => {
  it('offers the scan photo as the starting image', async () => {
    await render(<ContributeImageScreen />);
    expect(screen.getByText('We don’t have a photo of this pin yet')).toBeTruthy();
    expect(screen.getByLabelText('Your scan photo')).toBeTruthy();
    expect(screen.getByText('Use this photo')).toBeTruthy();
    expect(screen.getByText('Take a new photo')).toBeTruthy();
  }, 20_000);

  it('"Use this photo" cleans the scan photo without opening the camera', async () => {
    await render(<ContributeImageScreen />);
    await consent();
    await fireEvent.press(screen.getByText('Use this photo'));
    await waitFor(() => expect(bodyOf('/contribute/preview')).toMatchObject({ pinId: 'PHUK-2', imageBase64: 'scan64', keepOriginalConsent: true }));
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    await screen.findByText('Happy with this?');
  });

  it('"Take a new photo" uses a new shot instead', async () => {
    await render(<ContributeImageScreen />);
    await consent();
    await fireEvent.press(screen.getByText('Take a new photo'));
    await waitFor(() => expect(bodyOf('/contribute/preview')).toMatchObject({ imageBase64: 'new64' }));
  });

  it('needs the rights consent first', async () => {
    await render(<ContributeImageScreen />);
    await fireEvent.press(screen.getByText('Use this photo'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('without a scan photo for this pin it falls back to Take Photo', async () => {
    clearScanPhotoForContribution();
    await render(<ContributeImageScreen />);
    expect(screen.queryByText('Use this photo')).toBeNull();
    expect(screen.getByText('Take Photo')).toBeTruthy();
  });

  it('never offers a scan photo taken by a different signed-in user', async () => {
    setScanPhotoForContribution({ pinId: 'PHUK-2', userId: 'someone-else', uri: 'file:///theirs.jpg', base64: 'theirs64', mimeType: 'image/jpeg' });
    await render(<ContributeImageScreen />);
    expect(screen.queryByLabelText('Your scan photo')).toBeNull();
    expect(screen.queryByText('Use this photo')).toBeNull();
  });

  it('says the original is kept privately for moderators', async () => {
    await render(<ContributeImageScreen />);
    expect(screen.getByText(/We also keep your original photo privately, without its location/)).toBeTruthy();
  });

  it('forgets the scan photo once the photo is submitted', async () => {
    await render(<ContributeImageScreen />);
    await consent();
    await fireEvent.press(screen.getByText('Use this photo'));
    await fireEvent.press(await screen.findByText('Submit Photo'));
    await screen.findByText(/Your photo is being reviewed/);
    expect(getScanPhotoForContribution('PHUK-2', 'user-1')).toBeNull();
  });

  it('goes back to the scan result when done', async () => {
    await render(<ContributeImageScreen />);
    await fireEvent.press(screen.getByText('Maybe later'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('Admin contributions are reviewed by default', () => {
  async function toConfirm() {
    await render(<ContributeImageScreen />);
    await consent();
    await fireEvent.press(screen.getByText('Use this photo'));
    await screen.findByText('Happy with this?');
  }

  it('an admin is told their photo goes to the review queue', async () => {
    mockIsAdmin = true;
    await render(<ContributeImageScreen />);
    expect(screen.getByText(/your photo goes to the review queue too/)).toBeTruthy();
  });

  it('an admin submits for review unless they switch on Publish now', async () => {
    mockIsAdmin = true;
    await toConfirm();
    await fireEvent.press(screen.getByText('Submit Photo'));
    await waitFor(() => expect(bodyOf('/pin-images/contribute')).not.toBeNull());
    expect(bodyOf('/pin-images/contribute').publishNow).toBeUndefined();
    await screen.findByText(/Your photo is being reviewed/);
  });

  it('an admin can choose to publish now', async () => {
    mockIsAdmin = true;
    await toConfirm();
    await fireEvent(screen.getByLabelText('Publish now, skip review'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Submit Photo'));
    await waitFor(() => expect(bodyOf('/pin-images/contribute')).toMatchObject({ publishNow: true }));
  });

  it('a collector never sees Publish now', async () => {
    await toConfirm();
    expect(screen.queryByTestId('publish-now-row')).toBeNull();
  });
});
