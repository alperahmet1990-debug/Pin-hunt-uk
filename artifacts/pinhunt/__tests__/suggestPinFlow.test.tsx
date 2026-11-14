import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AddPinScreen from '../app/add-pin';
import { saveAiPhotoConsent } from '../utils/aiPhotoConsent';

// Add a pin (#394; was UX-011, #121; three steps since #612): photo, then an
// explicit "Is it one of these?" check, then details with a required name and
// a park picker. The AI suggests matches and fills in its guesses.
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPins = [
  { id: 'dp-006', title: 'Dumbo Blue Sky', collection: 'Park Icons' },
  { id: 'dp-003', title: 'Castle Fireworks', collection: 'Park Icons' },
];
let mockParams: Record<string, string> = {};
const mockIdentify = jest.fn();

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
jest.mock('@/utils/identifyPin', () => ({ identifyPin: (...args: unknown[]) => mockIdentify(...args), recordScanOutcome: jest.fn() }));
jest.mock('@/components/KeyboardAwareScrollViewCompat', () => ({ KeyboardAwareScrollViewCompat: require('react-native').ScrollView }));

const RIGHTS = 'I took this photo and PinHunt may use it as this pin’s catalogue image.';

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockIdentify.mockResolvedValue({ matches: [], imageInsights: null });
  fetchMock.mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.endsWith('/preview')
      ? { draftPath: 'drafts/x.jpg', previewBase64: 'clean', cleaned: true }
      : { id: 'sub-1' }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

async function toPhoto() {
  await render(<AddPinScreen />);
  await fireEvent.press(screen.getByText('Choose from Library', { exact: false }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/pin-submissions/preview'), expect.anything()));
  expect(await screen.findByLabelText('Your photo')).toBeTruthy();
  await waitFor(() => expect(screen.queryByText('Cleaning up your photo…')).toBeNull());
}

const tickRights = () => fireEvent.press(screen.getAllByRole('checkbox', { name: RIGHTS })[0]);

/** Photo, rights, then the Check step once the scan has answered. */
async function toCheck() {
  await toPhoto();
  await tickRights();
  await fireEvent.press(screen.getByRole('button', { name: 'Check the catalogue' }));
  await screen.findByTestId('catalogue-check');
  await waitFor(() => expect(screen.queryByText('Checking the catalogue…')).toBeNull());
}

/** Through the Check step ("No, it's new" or "Continue") to the details. */
async function toDetails() {
  await toCheck();
  await fireEvent.press(screen.getByRole('button', { name: /^(No, it’s new|Continue to the details)/ }));
  await screen.findByRole('header', { name: 'About this pin' });
}

async function toDetailsFromHere() {
  await tickRights();
  await fireEvent.press(screen.getByRole('button', { name: 'Check the catalogue' }));
  await waitFor(() => expect(screen.queryByText('Checking the catalogue…')).toBeNull());
  await fireEvent.press(screen.getByRole('button', { name: /^(No, it’s new|Continue to the details)/ }));
  await screen.findByRole('header', { name: 'About this pin' });
}

const typeName = (name: string) => fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), name);

const submit = async () => {
  await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
  await screen.findByText('Pin Submitted!');
};

const submitted = () => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/pin-submissions'));
  return call ? JSON.parse(call[1].body) : null;
};

describe('Add a pin: photo, then name (#394, #612)', () => {
  it('Submit is only on the details step, and the name is required', async () => {
    await toPhoto();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).toBeNull();
    await toDetailsFromHere();
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText(/Enter the pin’s name/)).toBeTruthy();
    expect(submitted()).toBeNull();
    await typeName('Lantern');
    expect(screen.queryByText(/Enter the pin’s name/)).toBeNull();
    await submit();
    const body = submitted();
    expect(body).toMatchObject({ proposedName: 'Lantern', frontDraftPath: 'drafts/x.jpg', rightsConfirmed: true });
    expect(body).not.toHaveProperty('brand');
    expect(screen.getByText(/"Lantern" has been submitted/)).toBeTruthy();
  });

  it('without the rights tick, Submit is disabled and says why', async () => {
    await render(<AddPinScreen />);
    await fireEvent.press(screen.getByText('Choose from Library', { exact: false }));
    await screen.findByLabelText('Your photo');
    await waitFor(() => expect(screen.queryByText('Cleaning up your photo…')).toBeNull());
    await fireEvent.press(screen.getByRole('button', { name: 'Check the catalogue' }));
    await waitFor(() => expect(screen.queryByText('Checking the catalogue…')).toBeNull());
    await fireEvent.press(screen.getByRole('button', { name: 'Continue to the details' }));
    await typeName('Lantern');
    const button = screen.getByRole('button', { name: 'Submit for review' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('rights-needed')).toBeTruthy();
    await fireEvent.press(button);
    expect(submitted()).toBeNull();
    await tickRights();
    expect(screen.queryByTestId('rights-needed')).toBeNull();
  });

  it('the photo is still required before the check', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<AddPinScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Check the catalogue' }));
    expect(alert).toHaveBeenCalledWith('Front photo required', expect.any(String));
  });

  it('Take Photo opens the full-screen camera on a phone (#392)', async () => {
    await render(<AddPinScreen />);
    await fireEvent.press(screen.getByText('Take Photo'));
    expect(screen.getByTestId('full-screen-camera')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close camera' })).toBeTruthy();
  });
});

describe('Add a pin: AI suggestions (#394)', () => {
  const scan = {
    matches: [
      { pinId: 'dp-006', confidence: 86, reasoning: '' },
      { pinId: 'dp-003', confidence: 61, reasoning: '' },
    ],
    imageInsights: { characters: ['Dumbo'], keywords: [], textOnPin: 'Happy 30th', logos: ['Disneyland Paris'], webGuesses: [] },
  };

  it('asks "Is it one of these?"; "Yes, it’s this one" opens that pin and submits nothing', async () => {
    mockIdentify.mockResolvedValue(scan);
    await toCheck();
    expect(mockIdentify).toHaveBeenCalledWith('front64', 'image/jpeg', 'token');
    expect(screen.getByRole('header', { name: 'Is it one of these?' })).toBeTruthy();
    // No way on to the details except answering.
    expect(screen.queryByRole('header', { name: 'About this pin' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, it’s Dumbo Blue Sky, 86% match. Open this pin' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/pin/[id]', params: { id: 'dp-006' } });
    expect(submitted()).toBeNull();
  });

  it('"No, it’s new" goes on to the details', async () => {
    mockIdentify.mockResolvedValue(scan);
    await toCheck();
    await fireEvent.press(screen.getByRole('button', { name: 'No, it’s new. Add its details' }));
    expect(await screen.findByRole('header', { name: 'About this pin' })).toBeTruthy();
  });

  it('never blocks on a slow scan: "Continue without checking"', async () => {
    mockIdentify.mockReturnValue(new Promise(() => {}));
    await toPhoto();
    await tickRights();
    await fireEvent.press(screen.getByRole('button', { name: 'Check the catalogue' }));
    expect(screen.getByRole('header', { name: 'Checking the catalogue…' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue without checking' }));
    expect(await screen.findByRole('header', { name: 'About this pin' })).toBeTruthy();
    await typeName('Lantern');
    await submit();
    expect(submitted()).not.toHaveProperty('aiIdentification');
  });

  it('fills empty fields with its guesses, marked as suggestions, and sends them as hints', async () => {
    mockIdentify.mockResolvedValue(scan);
    await toDetails();
    expect(screen.getByTestId('scan-prefill-note')).toBeTruthy();
    expect(screen.getByDisplayValue('Happy 30th')).toBeTruthy();
    expect(screen.getByDisplayValue('Dumbo')).toBeTruthy();
    // Both top matches share a set, so that's the set guess.
    expect(screen.getByDisplayValue('Park Icons')).toBeTruthy();
    await submit();
    expect(submitted()).toMatchObject({
      proposedName: 'Happy 30th',
      seriesName: 'Park Icons',
      characterNames: ['Dumbo'],
      aiIdentification: {
        matches: [{ pinId: 'dp-006', confidence: 86 }, { pinId: 'dp-003', confidence: 61 }],
        suggested: { name: 'Happy 30th', brand: 'Disneyland Paris', setName: 'Park Icons' },
      },
    });
  });

  it('a failed scan never blocks: it says so, and the pin still submits', async () => {
    mockIdentify.mockRejectedValue(new Error('429'));
    await toCheck();
    expect(screen.getByRole('header', { name: 'We couldn’t check the catalogue' })).toBeTruthy();
    expect(screen.getByTestId('ai-unavailable')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue to the details' }));
    await typeName('Lantern');
    await submit();
    expect(submitted()).not.toHaveProperty('aiIdentification');
  });

  it('says when the scan finds nothing, and shows no suggestions', async () => {
    await toCheck();
    expect(screen.getByRole('header', { name: 'No match in the catalogue' })).toBeTruthy();
    expect(screen.getByTestId('ai-no-match')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue to the details' }));
    await screen.findByRole('header', { name: 'About this pin' });
    expect(screen.queryByRole('button', { name: /from your scan/ })).toBeNull();
    expect(screen.queryByTestId('scan-prefill-note')).toBeNull();
  });
});

describe('Add a pin: details (UX-011)', () => {
  it('Done returns to where the collector came from (#350)', async () => {
    await toDetails();
    await typeName('Lantern');
    await submit();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('after a scan: no second scan, and Done goes Home (#350)', async () => {
    const { compressSubmissionImage } = jest.requireMock('@/utils/submissionImage');
    compressSubmissionImage.mockResolvedValue({ uri: 'file:///scan.jpg', width: 800, height: 800, base64: 'scan64' });
    jest.spyOn(require('react-native').Image, 'getSize').mockImplementation((...args: unknown[]) => (args[1] as (w: number, h: number) => void)(800, 800));
    mockParams = { frontUri: 'file:///scan.jpg' };
    await render(<AddPinScreen />);
    await screen.findByLabelText('Your photo');
    await tickRights();
    // The scan screen already checked: straight to the details (#612).
    await fireEvent.press(screen.getByRole('button', { name: 'Add details' }));
    expect(await screen.findByRole('header', { name: 'About this pin' })).toBeTruthy();
    expect(screen.queryByTestId('catalogue-check')).toBeNull();
    await typeName('Lantern');
    await submit();
    expect(mockIdentify).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('suggests catalogue sets as you type', async () => {
    await toDetails();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Park Icons'), 'park');
    await fireEvent.press(screen.getByRole('button', { name: 'Use set Park Icons' }));
    expect(screen.getByDisplayValue('Park Icons')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use set Park Icons' })).toBeNull();
  });

  it('shows pins already in the catalogue with that name, without blocking the suggestion', async () => {
    await toDetails();
    jest.useFakeTimers();
    try {
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
    await submit();
    expect(submitted()).toMatchObject({ proposedName: 'Lantern', brand: 'Disneyland Paris', editionType: 'limited_edition' });
  });

  it('shows the characters a scan recognised without opening More details', async () => {
    mockParams = { characters: 'Dumbo, Timothy' };
    await toDetails();
    expect(screen.getByDisplayValue('Dumbo, Timothy')).toBeTruthy();
    await typeName('Lantern');
    await submit();
    expect(submitted()).toMatchObject({ characterNames: ['Dumbo', 'Timothy'] });
  });

  it('fills in the scan screen\'s guesses (#301), editable, with a chip to bring one back', async () => {
    mockParams = { nameHint: 'Happy  30th\nAnniversary', brandHint: 'Disneyland Paris', setHint: 'Park Icons' };
    await toDetails();
    expect(screen.getByTestId('scan-prefill-note')).toBeTruthy();
    expect(screen.getByDisplayValue('Happy 30th Anniversary')).toBeTruthy();
    expect(screen.getByDisplayValue('Park Icons')).toBeTruthy();
    expect(screen.getByDisplayValue('Disneyland Paris')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Use name from your scan/ })).toBeNull();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Dumbo Blue Sky'), 'Lantern');
    await fireEvent.press(screen.getByRole('button', { name: 'Use name from your scan: Happy 30th Anniversary' }));
    expect(screen.getByDisplayValue('Happy 30th Anniversary')).toBeTruthy();
    await submit();
    expect(submitted()).toMatchObject({ proposedName: 'Happy 30th Anniversary', seriesName: 'Park Icons', brand: 'Disneyland Paris' });
  });
});

describe('Add a pin: park (#612)', () => {
  it('picks a park, sent as the release location', async () => {
    await toDetails();
    await typeName('Lantern');
    const paris = screen.getByRole('radio', { name: 'Disneyland Paris' });
    await fireEvent.press(paris);
    expect(screen.getByRole('radio', { name: 'Disneyland Paris' }).props.accessibilityState).toMatchObject({ selected: true });
    await submit();
    expect(submitted()).toMatchObject({ releaseLocation: 'Disneyland Paris' });
  });

  it('"Other" lets the collector type one; tapping a picked park clears it', async () => {
    await toDetails();
    await typeName('Lantern');
    await fireEvent.press(screen.getByRole('radio', { name: 'Walt Disney World' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Walt Disney World' }));
    expect(screen.getByRole('radio', { name: 'Walt Disney World' }).props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(screen.getByRole('radio', { name: 'Other' }));
    await fireEvent.changeText(screen.getByPlaceholderText('Where was it released? e.g. Disney Store UK'), 'Disney Store UK');
    expect(screen.getByRole('radio', { name: 'Other' }).props.accessibilityState).toMatchObject({ selected: true });
    await submit();
    expect(submitted()).toMatchObject({ releaseLocation: 'Disney Store UK' });
  });

  it('no park picked: none sent', async () => {
    await toDetails();
    await typeName('Lantern');
    await submit();
    expect(submitted()).not.toHaveProperty('releaseLocation');
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
    expect(screen.getByText(/Background removal isn’t available right now/)).toBeTruthy();
    expect(screen.queryByText(/Retake it on a plain background/)).toBeNull();
  });

  it('clean-up failed or over the daily limit: suggests a retake', async () => {
    await pickPhoto({ draftPath: 'drafts/x.jpg', previewBase64: 'raw', cleaned: false, cleanupSkipped: 'limit' });
    expect(screen.getByText(/couldn’t remove the background.*Retake it on a plain background/)).toBeTruthy();
  });

  it('preview request failed: same as a failed clean-up', async () => {
    await pickPhoto(null);
    expect(screen.getByText(/couldn’t remove the background/)).toBeTruthy();
  });
});

// #257: an optional back photo, sent as taken for the admin.
describe('Add a pin: back photo (#257)', () => {
  const pick = () => jest.requireMock('@/utils/submissionImage').pickSubmissionImage as jest.Mock;

  it('is optional: submitting without it sends no back photo', async () => {
    await toDetails();
    await typeName('Lantern');
    await submit();
    expect(submitted()).not.toHaveProperty('backImageBase64');
  });

  it('says only admins see it, and sends it with the pin', async () => {
    await toPhoto();
    expect(screen.getByText('Back of the pin (optional)')).toBeTruthy();
    expect(screen.getByText(/Only admins see it\./)).toBeTruthy();
    pick().mockResolvedValueOnce({ uri: 'file:///back.jpg', width: 800, height: 800, base64: 'back64' });
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a back photo from your library' }));
    expect(await screen.findByLabelText('Back of the pin')).toBeTruthy();
    expect(pick()).toHaveBeenLastCalledWith('library');
    await toDetailsFromHere();
    await typeName('Lantern');
    await submit();
    expect(submitted()).toMatchObject({ frontDraftPath: 'drafts/x.jpg', backImageBase64: 'back64' });
  });

  it('can be removed before submitting', async () => {
    await toPhoto();
    pick().mockResolvedValueOnce({ uri: 'file:///back.jpg', width: 800, height: 800, base64: 'back64' });
    await fireEvent.press(screen.getByRole('button', { name: 'Add a back photo' }));
    expect(pick()).toHaveBeenLastCalledWith('camera');
    await screen.findByLabelText('Back of the pin');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove the back photo' }));
    expect(screen.queryByLabelText('Back of the pin')).toBeNull();
    await toDetailsFromHere();
    await typeName('Lantern');
    await submit();
    expect(submitted()).not.toHaveProperty('backImageBase64');
  });

  it('"Add Another Pin" starts fresh: no back photo, rights unticked', async () => {
    await toPhoto();
    pick().mockResolvedValueOnce({ uri: 'file:///back.jpg', width: 800, height: 800, base64: 'back64' });
    await fireEvent.press(screen.getByRole('button', { name: 'Add a back photo' }));
    await screen.findByLabelText('Back of the pin');
    await toDetailsFromHere();
    await typeName('Lantern');
    await submit();
    await fireEvent.press(screen.getByText('Add Another Pin'));
    expect(screen.queryByLabelText('Back of the pin')).toBeNull();
    expect(screen.queryAllByRole('checkbox', { name: RIGHTS })).toHaveLength(0);
  });
});

// These flows test what happens after the AI photo permission (#501) was given;
// aiPhotoConsent.test.tsx covers the question itself.
beforeEach(() => saveAiPhotoConsent(null));
