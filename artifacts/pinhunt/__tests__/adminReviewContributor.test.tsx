import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AdminReviewScreen from '../app/admin/review/[id]';
import AdminSubmissionsScreen from '../app/admin/submissions';
import { originalChanges } from '../utils/submissionProvenance';

// Admin review for the contributor programme (#395): unidentified pins,
// AI duplicate suggestions, merging, attribution and the original submission.
const mockBack = jest.fn();
const mockPush = jest.fn();
let mockSubmission: Record<string, unknown>;
let mockList: Record<string, unknown>[] = [];
const mockReview = jest.fn(() => Promise.resolve({}));
const mockRepo = {
  getPinSubmission: jest.fn(() => Promise.resolve(mockSubmission)),
  getAllPinSubmissions: jest.fn(() => Promise.resolve(mockList)),
  getProfile: jest.fn(() => Promise.resolve({ username: 'pinfan' })),
  reviewPinSubmission: mockReview,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: 'sub-1' }),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo }) }));
jest.mock('@/hooks/useMyAccess', () => ({ useMyAccess: () => ({ isAdmin: true, isAppCreator: false }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://x/img.jpg' } }) }) } },
}));

const candidate = {
  pinhuntId: 'PHUK-00000001', title: 'Stitch Surfing', brand: 'Disney', collection: 'Lilo & Stitch',
  matchReason: 'AI match (86%)', imageUrl: undefined,
};

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  mockSubmission = {
    id: 'sub-1', submittedBy: 'user-1', proposedName: '', brand: '', editionType: 'unknown',
    frontImagePath: 'user-1/sub-1/front.jpg', status: 'submitted', createdAt: '2026-10-18T00:00:00Z',
    rightsConfirmedAt: '2026-10-18T00:00:00Z',
    aiIdentification: { matches: [{ pinId: 'PHUK-00000001', confidence: 86 }], suggested: { name: 'Ohana', characters: ['Stitch'] } },
  };
  fetchMock.mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(url.includes('duplicate-candidates') ? { candidates: [candidate], failedChecks: [] } : { image: { id: 'img-1' } }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('admin review: unidentified submission (#395)', () => {
  it('shows it as unidentified, credits the contributor and shows the AI guesses', async () => {
    await render(<AdminReviewScreen />);
    expect(await screen.findByText('UNIDENTIFIED PIN')).toBeTruthy();
    expect(await screen.findByText('@pinfan')).toBeTruthy();
    expect(screen.getByText('Photo rights confirmed')).toBeTruthy();
    expect(screen.getByText(/AI guessed: "Ohana" · Stitch/)).toBeTruthy();
    expect(screen.getByText('Not given')).toBeTruthy();
  });

  it('lists the AI match as a duplicate; merging into a pin with no photo offers "Use this photo"', async () => {
    await render(<AdminReviewScreen />);
    expect(await screen.findByText(/AI match \(86%\)/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Merge'));
    await fireEvent.press(screen.getAllByText('Merge').at(-1)!);
    await waitFor(() => expect(mockReview).toHaveBeenCalledWith('sub-1', expect.objectContaining({ status: 'approved', approvedPinhuntId: 'PHUK-00000001' })));
    expect(await screen.findByTestId('use-this-photo')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Use this photo' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/submissions/sub-1/propose-photo'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ pinhuntId: 'PHUK-00000001' }) }),
    ));
    expect(await screen.findByText(/waiting in Contributed Photos for review/)).toBeTruthy();
  });

  it('without a rights confirmation, merging just goes back (no photo offer)', async () => {
    mockSubmission = { ...mockSubmission, rightsConfirmedAt: undefined };
    await render(<AdminReviewScreen />);
    expect(await screen.findByText('Photo rights not recorded (older app)')).toBeTruthy();
    await fireEvent.press(await screen.findByText('Merge'));
    await fireEvent.press(screen.getAllByText('Merge').at(-1)!);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(screen.queryByTestId('use-this-photo')).toBeNull();
  });

  it('shows what was originally sent when it has since changed', async () => {
    mockSubmission = { ...mockSubmission, proposedName: 'Stitch Ohana', originalMetadata: { proposed_name: null, brand: null } };
    await render(<AdminReviewScreen />);
    expect(await screen.findByTestId('original-submission')).toBeTruthy();
  });
});

describe('submission queue (#395)', () => {
  it('labels unnamed submissions and filters unidentified / named', async () => {
    mockList = [
      { ...mockSubmission, id: 'a' },
      { ...mockSubmission, id: 'b', proposedName: 'Castle Fireworks', brand: 'Disney' },
    ];
    await render(<AdminSubmissionsScreen />);
    expect(await screen.findByText('Unidentified pin')).toBeTruthy();
    expect(screen.getByText('Castle Fireworks')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show unidentified submissions' }));
    expect(screen.queryByText('Castle Fireworks')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Show named submissions' }));
    expect(screen.queryByText('Unidentified pin')).toBeNull();
    expect(screen.getByText('Castle Fireworks')).toBeTruthy();
  });
});

describe('originalChanges', () => {
  const sub = { proposedName: 'Stitch', brand: '', releaseYear: 2024 } as never;
  it('lists only fields that changed since submission', () => {
    expect(originalChanges({ ...(sub as object), originalMetadata: { proposed_name: null, brand: null, release_year: 2024 } } as never))
      .toEqual([{ label: 'Pin Name', original: '' }]);
  });
  it('is empty for submissions from before migration 047', () => {
    expect(originalChanges(sub)).toEqual([]);
  });
});
