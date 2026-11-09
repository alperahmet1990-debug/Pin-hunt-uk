import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ScanScreen from '../app/(tabs)/scan';
import AddPinScreen from '../app/add-pin';
import ContributeImageScreen from '../app/contribute-image/[pinId]';
import {
  AI_PHOTO_CONSENT_COPY, AI_PHOTO_CONSENT_VERSION, aiPhotoConsentKey, hasAiPhotoConsent, saveAiPhotoConsent,
} from '../utils/aiPhotoConsent';

// #501 (LP-1): no photo goes to OpenAI or Pixian until the collector agrees.
jest.setTimeout(30_000);

let mockUserId = 'u1';
let mockParams: Record<string, string> = {};
const mockIdentify = jest.fn();

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: false, assets: [{ uri: 'file:///photo.jpg', width: 1024, height: 1024, base64: 'b64', mimeType: 'image/jpeg' }] })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: false, assets: [{ uri: 'file:///photo.jpg', width: 1024, height: 1024, base64: 'b64', mimeType: 'image/jpeg' }] })),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(() => Promise.resolve({ uri: 'file:///small.jpg', width: 1024, height: 1024, base64: 'small' })),
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('@/utils/identifyPin', () => ({ identifyPin: (...args: unknown[]) => mockIdentify(...args), recordScanOutcome: jest.fn() }));
jest.mock('@/utils/submissionImage', () => ({
  pickSubmissionImage: jest.fn(() => Promise.resolve({ uri: 'file:///front.jpg', width: 800, height: 800, base64: 'front64' })),
  compressSubmissionImage: jest.fn(),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'token' }, user: { id: mockUserId } }),
}));
jest.mock('@/hooks/useMyAccess', () => ({ useMyAccess: () => ({ isAdmin: false, isAppCreator: false, isContributor: false, loading: false }) }));
const mockCollectionCtx = { collection: {}, markViewed: () => {} };
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => mockCollectionCtx }));
// Stable references, as in the real context: new arrays each render would loop the screens' effects.
const mockCatalogue = { pins: [{ id: 'PHUK-1', title: 'Star Badge' }], series: [] as string[], repository: null, ensurePins: () => {} };
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => mockCatalogue }));
jest.mock('@/hooks/useCatalogueCoverage', () => ({
  findNextContributionTarget: () => undefined,
  getCachedCoverage: () => undefined,
  markCoveragePending: jest.fn(),
  markCoveragePublished: jest.fn(),
}));
jest.mock('@/components/QuickAddSheet', () => ({ QuickAddSheet: () => null }));
jest.mock('@/components/KeyboardAwareScrollViewCompat', () => ({ KeyboardAwareScrollViewCompat: require('react-native').ScrollView }));

const fetchMock = jest.fn();
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockUserId = 'u1';
  mockParams = {};
  mockIdentify.mockResolvedValue({ matches: [], imageInsights: null });
  fetchMock.mockImplementation(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ draftPath: 'drafts/x.jpg', previewBase64: 'clean', cleaned: true }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const sheetShown = () => screen.findByRole('header', { name: AI_PHOTO_CONSENT_COPY.title });
const allow = () => fireEvent.press(screen.getByRole('button', { name: AI_PHOTO_CONSENT_COPY.allow }));
const decline = () => fireEvent.press(screen.getByRole('button', { name: AI_PHOTO_CONSENT_COPY.decline }));

describe('stored permission', () => {
  it('is per user and per copy version', async () => {
    expect(await hasAiPhotoConsent('u1')).toBe(false);
    await saveAiPhotoConsent('u1');
    expect(await AsyncStorage.getItem('@pinhunt_ai_photo_consent_v1:u1')).toBe(AI_PHOTO_CONSENT_VERSION);
    expect(await hasAiPhotoConsent('u1')).toBe(true);
    expect(await hasAiPhotoConsent('u2')).toBe(false);
    // An older version on record asks again.
    await AsyncStorage.setItem(aiPhotoConsentKey('u1'), '2020-01-01');
    expect(await hasAiPhotoConsent('u1')).toBe(false);
  });
});

describe('Scan', () => {
  const pick = async () => {
    await render(<ScanScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo from your library' }));
  };

  it('shows the agreed copy, naming each provider, before anything is sent', async () => {
    await pick();
    await sheetShown();
    expect(screen.getByText(AI_PHOTO_CONSENT_COPY.body)).toBeTruthy();
    expect(screen.getByText(/OpenAI/)).toBeTruthy();
    expect(screen.getByText(/Pixian/)).toBeTruthy();
    expect(screen.getByText(AI_PHOTO_CONSENT_COPY.storage)).toBeTruthy();
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('"Not now" sends nothing and keeps the photo, with Identify Pin to ask again', async () => {
    await pick();
    await sheetShown();
    await decline();
    await screen.findByRole('button', { name: 'Identify Pin' });
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(await hasAiPhotoConsent('u1')).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Identify Pin' }));
    await sheetShown();
    await allow();
    await waitFor(() => expect(mockIdentify).toHaveBeenCalledTimes(1));
  });

  it('"Allow and continue" identifies, and is remembered for this user', async () => {
    await pick();
    await sheetShown();
    await allow();
    await waitFor(() => expect(mockIdentify).toHaveBeenCalledTimes(1));
    expect(await hasAiPhotoConsent('u1')).toBe(true);
  });

  it('once agreed, later scans go straight through', async () => {
    await saveAiPhotoConsent('u1');
    await pick();
    await waitFor(() => expect(mockIdentify).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('header', { name: AI_PHOTO_CONSENT_COPY.title })).toBeNull();
  });

  it('another account on the same device is asked again', async () => {
    await saveAiPhotoConsent('u1');
    mockUserId = 'u2';
    await pick();
    await sheetShown();
    expect(mockIdentify).not.toHaveBeenCalled();
  });
});

describe('Add Pin', () => {
  const picker = () => jest.requireMock('@/utils/submissionImage').pickSubmissionImage as jest.Mock;

  it('asks before the library opens; "Not now" picks and sends nothing', async () => {
    await render(<AddPinScreen />);
    await fireEvent.press(screen.getByText('Choose from Library', { exact: false }));
    await sheetShown();
    await decline();
    expect(picker()).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
    // Still in the flow, free to try again.
    expect(screen.getByText('Choose from Library', { exact: false })).toBeTruthy();
  });

  it('after "Allow and continue" the background clean-up and scan run', async () => {
    await render(<AddPinScreen />);
    await fireEvent.press(screen.getByText('Choose from Library', { exact: false }));
    await sheetShown();
    await allow();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/pin-submissions/preview'), expect.anything()));
    await waitFor(() => expect(mockIdentify).toHaveBeenCalled());
  });

  it('a photo handed over from Scan is not sent without permission', async () => {
    const { Image } = jest.requireActual('react-native');
    jest.spyOn(Image, 'getSize').mockImplementation((...args: unknown[]) => (args[1] as (w: number, h: number) => void)(800, 800));
    const compress = jest.requireMock('@/utils/submissionImage').compressSubmissionImage as jest.Mock;
    compress.mockResolvedValue({ uri: 'file:///front.jpg', width: 800, height: 800, base64: 'front64' });
    mockParams = { frontUri: 'file:///scan.jpg' };
    await render(<AddPinScreen />);
    await sheetShown();
    await decline();
    expect(compress).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Contribute a photo', () => {
  it('asks before the camera opens; "Not now" sends nothing', async () => {
    mockParams = { pinId: 'PHUK-1' };
    const imagePicker = jest.requireMock('expo-image-picker');
    await render(<ContributeImageScreen />);
    await fireEvent(screen.getByRole('switch'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Take Photo'));
    await sheetShown();
    await decline();
    expect(imagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(imagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Take Photo'));
    await sheetShown();
    await allow();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/pin-images/contribute/preview'), expect.anything()));
  });
});
