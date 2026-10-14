import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AddPinScreen from '../app/add-pin';

// UX-011 (#121): "Suggest a missing pin" in three short steps.
const mockPush = jest.fn();
const mockPins = [
  { id: 'dp-006', title: 'Dumbo Blue Sky', collection: 'Park Icons' },
  { id: 'dp-003', title: 'Castle Fireworks', collection: 'Park Icons' },
];
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
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
});
