import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AddPinScreen from '../app/add-pin';

// UX-011 (#121): "Suggest a missing pin" in three short steps.
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPins = [
  { id: 'dp-006', title: 'Dumbo Blue Sky', collection: 'Park Icons' },
  { id: 'dp-003', title: 'Castle Fireworks', collection: 'Park Icons' },
];
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, series: ['Park Icons', 'Halloween 2023'], repository: null }),
}));
jest.mock('@/utils/submissionImage', () => ({
  pickSubmissionImage: jest.fn(() => Promise.resolve({ uri: 'file:///front.jpg', width: 800, height: 800, base64: 'front64' })),
  compressSubmissionImage: jest.fn(),
}));
jest.mock('@/components/KeyboardAwareScrollViewCompat', () => ({ KeyboardAwareScrollViewCompat: require('react-native').ScrollView }));

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  fetchMock.mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.endsWith('/preview')
      ? { draftPath: 'drafts/x.jpg', previewBase64: 'clean', cleaned: true }
      : { id: 'sub-1' }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

async function toDetails() {
  await render(<AddPinScreen />);
  expect(screen.getByRole('header', { name: 'Help build the catalogue' })).toBeTruthy();
  expect(screen.getByText(/An admin checks it/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
  await fireEvent.press(screen.getByText('Choose from Library', { exact: false }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/pin-submissions/preview'), expect.anything()));
  expect(await screen.findByLabelText('Your photo')).toBeTruthy();
  await fireEvent.press(await screen.findByRole('button', { name: 'Next' }));
  await screen.findByRole('header', { name: 'About this pin' });
}

const submitted = () => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/pin-submissions'));
  return call ? JSON.parse(call[1].body) : null;
};

describe('Suggest a missing pin (UX-011)', () => {
  it('needs only a front photo and a name; a blank brand is sent as Unknown', async () => {
    await toDetails();
    // Brand and the rest are folded away.
    expect(screen.queryByPlaceholderText('e.g. Disney Parks, Loungefly')).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), 'Tinker Bell Lantern');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByText('Pin Submitted!');
    expect(submitted()).toMatchObject({ proposedName: 'Tinker Bell Lantern', brand: 'Unknown', frontDraftPath: 'drafts/x.jpg' });
  });

  it('Done returns to where the collector came from (#350)', async () => {
    await toDetails();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), 'Tinker Bell Lantern');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByText('Pin Submitted!');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('Done after a scan goes Home, not back to the old scan (#350)', async () => {
    const { compressSubmissionImage } = jest.requireMock('@/utils/submissionImage');
    compressSubmissionImage.mockResolvedValue({ uri: 'file:///scan.jpg', width: 800, height: 800, base64: 'scan64' });
    jest.spyOn(require('react-native').Image, 'getSize').mockImplementation((...args: unknown[]) => (args[1] as (w: number, h: number) => void)(800, 800));
    mockParams = { frontUri: 'file:///scan.jpg' };
    await render(<AddPinScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Next' }));
    await screen.findByRole('header', { name: 'About this pin' });
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), 'Scanned Pin');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByText('Pin Submitted!');
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('asks for a name before submitting', async () => {
    await toDetails();
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    expect(screen.getByText('Give the pin a name.')).toBeTruthy();
    expect(submitted()).toBeNull();
  });

  it('the photo step still requires a front photo', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<AddPinScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(alert).toHaveBeenCalledWith('Front photo required', expect.any(String));
  });

  it('suggests catalogue sets as you type', async () => {
    await toDetails();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Park Icons'), 'park');
    await fireEvent.press(screen.getByRole('button', { name: 'Use set Park Icons' }));
    expect(screen.getByDisplayValue('Park Icons')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use set Park Icons' })).toBeNull();
  });

  it('shows pins already in the catalogue with that name, without blocking the suggestion', async () => {
    jest.useFakeTimers();
    try {
      await toDetails();
      await fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), 'dumbo');
      await act(async () => { jest.advanceTimersByTime(450); });
      expect(screen.getByText('Already in the catalogue?')).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Dumbo Blue Sky. Open pin details' }));
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'dp-006' } });
      await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
      await waitFor(() => expect(submitted()).toMatchObject({ proposedName: 'dumbo' }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('More details keeps every optional field', async () => {
    await toDetails();
    await fireEvent.press(screen.getByRole('button', { name: 'More details (optional)' }));
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), 'Lantern');
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Disney Parks, Loungefly'), 'Disneyland Paris');
    await fireEvent.press(screen.getByRole('button', { name: 'Limited Edition' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByText('Pin Submitted!');
    expect(submitted()).toMatchObject({ brand: 'Disneyland Paris', editionType: 'limited_edition' });
  });

  it('shows the characters a scan recognised without opening More details', async () => {
    mockParams = { characters: 'Dumbo, Timothy' };
    await toDetails();
    expect(screen.getByDisplayValue('Dumbo, Timothy')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), 'Dumbo Circus');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByText('Pin Submitted!');
    expect(submitted()).toMatchObject({ characterNames: ['Dumbo', 'Timothy'] });
  });

  it('fills in the scan\'s guesses (#301), editable, with a chip to bring one back', async () => {
    mockParams = { nameHint: 'Happy  30th\nAnniversary', brandHint: 'Disneyland Paris', setHint: 'Park Icons' };
    await toDetails();
    expect(screen.getByTestId('scan-prefill-note')).toBeTruthy();
    expect(screen.getByDisplayValue('Happy 30th Anniversary')).toBeTruthy();
    expect(screen.getByDisplayValue('Park Icons')).toBeTruthy();
    // Brand sits under More details, which opens to show it.
    expect(screen.getByDisplayValue('Disneyland Paris')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Use name from your scan/ })).toBeNull();
    // Changing a guess offers it back.
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), 'Lantern');
    await fireEvent.press(screen.getByRole('button', { name: 'Use name from your scan: Happy 30th Anniversary' }));
    expect(screen.getByDisplayValue('Happy 30th Anniversary')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByText('Pin Submitted!');
    expect(submitted()).toMatchObject({ proposedName: 'Happy 30th Anniversary', seriesName: 'Park Icons', brand: 'Disneyland Paris' });
  });

  it('shows no scan suggestions when not coming from a scan', async () => {
    await toDetails();
    expect(screen.queryByRole('button', { name: /from your scan/ })).toBeNull();
    expect(screen.queryByTestId('scan-prefill-note')).toBeNull();
  });
});

// #300: when the photo isn't cleaned up, say so plainly, and why.
describe('Photo clean-up notice (#300)', () => {
  async function pickPhoto(preview: Record<string, unknown> | null) {
    fetchMock.mockImplementation((url: string) => Promise.resolve({
      ok: preview !== null,
      json: () => Promise.resolve(url.endsWith('/preview') ? (preview ?? { error: 'x' }) : { id: 'sub-1' }),
    }));
    await render(<AddPinScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    await fireEvent.press(screen.getByText('Choose from Library', { exact: false }));
    await screen.findByLabelText('Your photo');
    await waitFor(() => expect(screen.queryByText('Cleaning up your photo…')).toBeNull());
  }

  it('cleaned up: no notice', async () => {
    await pickPhoto({ draftPath: 'drafts/x.jpg', previewBase64: 'clean', cleaned: true });
    expect(screen.getByText('This is how your photo will look in the catalogue.')).toBeTruthy();
    expect(screen.queryByTestId('cleanup-notice')).toBeNull();
  });

  it('clean-up not set up on the server: says it is unavailable, not the photo’s fault', async () => {
    await pickPhoto({ draftPath: 'drafts/x.jpg', previewBase64: 'raw', cleaned: false, cleanupSkipped: 'off' });
    expect(screen.getByTestId('cleanup-notice')).toBeTruthy();
    expect(screen.getByText('Photo not cleaned up')).toBeTruthy();
    expect(screen.getByText(/Background removal isn’t available right now/)).toBeTruthy();
    expect(screen.queryByText(/Retake it on a plain background/)).toBeNull();
  });

  it('clean-up failed: suggests a retake', async () => {
    await pickPhoto({ draftPath: 'drafts/x.jpg', previewBase64: 'raw', cleaned: false, cleanupSkipped: 'failed' });
    expect(screen.getByText('Photo not cleaned up')).toBeTruthy();
    expect(screen.getByText(/couldn’t remove the background.*Retake it on a plain background/)).toBeTruthy();
  });

  it('preview request failed: same as a failed clean-up', async () => {
    await pickPhoto(null);
    expect(screen.getByText(/couldn’t remove the background/)).toBeTruthy();
  });
});
