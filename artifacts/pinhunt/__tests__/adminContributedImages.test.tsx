import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AdminContributedImagesScreen from '../app/admin/contributed-images';

// Admin photo review: raw | cleaned | Pin & Pop side by side, and a pin that
// gained a photo since is only replaced after the admin confirms.

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));

const pending = [
  {
    id: 'img-1',
    pinId: 'pin-uuid',
    pinhuntId: 'PHUK-00000001',
    pinTitle: 'Dumbo Blue Sky',
    uploadedBy: 'user-1',
    storagePath: 'user-1/PHUK-00000001/1.jpg',
    status: 'pending',
    contributorConsentAt: '2026-11-14T10:00:00Z',
    createdAt: '2026-11-14T10:00:00Z',
    proposalReason: 'missing',
    signedUrl: 'https://signed.test/cleaned.jpg',
    rawSignedUrl: 'https://signed.test/raw.jpg',
    pinAndPop: { externalId: '123', imageUrl: 'https://pinandpop.test/123.jpg' },
  },
  {
    id: 'img-2',
    pinId: 'pin-uuid-2',
    pinhuntId: 'PHUK-00000002',
    pinTitle: 'Castle Fireworks',
    uploadedBy: 'user-2',
    storagePath: 'user-2/PHUK-00000002/1.jpg',
    status: 'pending',
    contributorConsentAt: '2026-11-14T10:00:00Z',
    createdAt: '2026-11-14T10:00:00Z',
    signedUrl: 'https://signed.test/cleaned2.jpg',
    rawSignedUrl: null,
    pinAndPop: null,
  },
];

const fetchMock = jest.fn();
let approveResponses: Array<{ status: number; body: unknown }> = [];

beforeEach(() => {
  jest.clearAllMocks();
  approveResponses = [];
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/admin/pending-pin-images')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ images: pending }) });
    }
    const next = approveResponses.shift() ?? { status: 200, body: { image: { id: 'img-1' } } };
    return Promise.resolve({ ok: next.status < 400, status: next.status, json: () => Promise.resolve(next.body) });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const approveCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/approve'));

describe('Admin contributed photos', () => {
  it('shows raw, cleaned and Pin & Pop side by side', async () => {
    await render(<AdminContributedImagesScreen />);
    await screen.findByText('Dumbo Blue Sky');
    expect(screen.getAllByText('Raw')).toHaveLength(2);
    expect(screen.getAllByText('Cleaned')).toHaveLength(2);
    expect(screen.getAllByText('Pin & Pop')).toHaveLength(2);
    const uri = (label: string) => screen.getAllByLabelText(label)[0].props.source.uri;
    expect(uri('Raw photo')).toBe('https://signed.test/raw.jpg');
    expect(uri('Cleaned photo')).toBe('https://signed.test/cleaned.jpg');
    expect(uri('Pin & Pop photo')).toBe('https://pinandpop.test/123.jpg');
    // An older row without a raw original says so.
    expect(screen.getByText('Not kept')).toBeTruthy();
  }, 20_000);

  it('asks before replacing a photo the pin gained since, then replaces it', async () => {
    approveResponses = [
      { status: 409, body: { error: 'has photo', code: 'has_image', existingImageUrl: 'https://cdn.test/bulk.jpg' } },
      { status: 200, body: { image: { id: 'img-1' } } },
    ];
    await render(<AdminContributedImagesScreen />);
    await screen.findByText('Dumbo Blue Sky');
    await fireEvent.press(screen.getAllByText('Approve')[0]);
    await screen.findByTestId('replace-confirm');
    expect(JSON.parse(approveCalls()[0][1].body)).toEqual({ replaceExisting: false });
    expect(screen.getByText('Dumbo Blue Sky')).toBeTruthy();

    await fireEvent.press(screen.getByText('Replace and approve'));
    await waitFor(() => expect(approveCalls()).toHaveLength(2));
    expect(JSON.parse(approveCalls()[1][1].body)).toEqual({ replaceExisting: true });
    await waitFor(() => expect(screen.queryByText('Dumbo Blue Sky')).toBeNull());
  });
});
