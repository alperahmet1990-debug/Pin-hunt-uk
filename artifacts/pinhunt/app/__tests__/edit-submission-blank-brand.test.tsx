import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import EditSubmissionScreen from '../edit-submission/[id]';

// UXR-34 (#700): a needs-changes submission with no brand can be resubmitted.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 's1' }),
  useRouter: () => ({ replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useColors', () => ({ useColors: () => new Proxy({}, { get: () => '#000000' }) }));
jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://x/y.png' } }) }) } },
  isSupabaseConfigured: false,
}));
jest.mock('@/utils/submissionImage', () => ({ pickSubmissionImage: jest.fn() }));

let mockRepo: Record<string, jest.Mock>;
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'me' }) }));

const sub = {
  id: 's1', status: 'needs_changes', proposedName: 'Mickey Pin', brand: '',
  characterNames: null, seriesName: null, releaseLocation: null, releaseYear: null,
  editionType: 'unknown', editionSize: null, facNumber: null, sku: null, notes: null,
  frontImagePath: 'f.png', backImagePath: null,
};

describe('Edit submission: brand is optional', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo = {
      getPinSubmission: jest.fn().mockResolvedValue(sub),
      updatePinSubmission: jest.fn().mockResolvedValue(undefined),
      submitPinForReview: jest.fn().mockResolvedValue(undefined),
      uploadSubmissionFrontImage: jest.fn(),
      uploadSubmissionBackImage: jest.fn(),
    };
  });

  it('resubmits with a blank brand', async () => {
    const { findByText } = await render(<EditSubmissionScreen />);
    await fireEvent.press(await findByText('Submit for Review'));
    await waitFor(() => expect(mockRepo.submitPinForReview).toHaveBeenCalledWith('s1'));
    expect(mockRepo.updatePinSubmission).toHaveBeenCalledWith('s1', expect.objectContaining({ brand: '' }));
  });
});
