import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import BulkImageBatchScreen from '../app/admin/bulk-images/[batchId]';

// Admin Bulk Image Matcher: review one photo at a time, confirm the
// suggested match, and move on to the next photo automatically.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ batchId: 'batch-1' }),
  Stack: { Screen: () => null },
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));
jest.mock('@/utils/bulkImageUpload', () => ({ filesToUploads: () => [], pickPhotos: async () => [], uploadAll: async () => {} }));

const item = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, status: 'suggested', failed_stage: null, error: null, original_filename: `${id}.jpg`,
  originalUrl: `https://signed/${id}.jpg`, cleanedUrl: null, top_confidence: 91, match_band: 'confident',
  matched_pinhunt_id: null, matchedTitle: null, topCandidate: { pinhuntId: `PHUK-${id}`, title }, pixian_calls: 0,
  published_image_url: null, ...extra,
});

const batch = {
  batch: { id: 'batch-1', title: 'Paris haul', supplier_name: 'PinHunt team', permission_public_display: true },
  summary: {
    total: 2, awaitingMatching: 0, awaitingReview: 2, confirmed: 0, cleaned: 0, awaitingPublish: 0, published: 0,
    counts: { uploaded: 0, matching: 0, suggested: 2, unmatched: 0, flagged: 0, skipped: 0, confirmed: 0, cleaning: 0, cleaned: 0, published: 0, failed: 0 },
    failedByStage: {},
  },
  running: { match: false, clean: false },
  paused: {},
  services: { matching: true, pixian: true },
  items: [item('a', 'Castle Mickey'), item('b', 'Minnie Macaron')],
};

const detail = (id: string, title: string) => ({
  item: {
    ...item(id, title), match_verified: true, review_notes: null,
    candidates: [
      { pinhuntId: `PHUK-${id}`, title, collection: 'Paris 2026', brand: 'Disneyland Paris', edition: null, characters: ['Mickey Mouse'], imageUrl: null, confidence: 91, reasoning: 'Same castle' },
      { pinhuntId: `PHUK-${id}2`, title: `${title} (LE)`, collection: 'Paris 2026', brand: 'Disneyland Paris', edition: 'LE 500', characters: [], imageUrl: null, confidence: 40, reasoning: '' },
    ],
  },
  pinAndPop: { [`PHUK-${id}`]: { externalId: '123', imageUrl: 'https://pinandpop.example/123.jpg' } },
});

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    const body = url.endsWith('/batches/batch-1') ? batch
      : url.endsWith('/items/a') ? detail('a', 'Castle Mickey')
      : url.endsWith('/items/b') ? detail('b', 'Minnie Macaron')
      : { status: 'confirmed' };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('admin bulk image matcher', () => {
  it('shows the dashboard and the best match beside the uploaded photo, with the Pin & Pop reference labelled admin-only', async () => {
    await render(<BulkImageBatchScreen />);
    expect(await screen.findByText('Castle Mickey')).toBeTruthy();
    expect(screen.getByText('Review (2)')).toBeTruthy();
    expect(screen.getByText(/Confident · 91%/)).toBeTruthy();
    expect(screen.getByText(/Pin & Pop reference #123 · admin only/)).toBeTruthy();
    // Opening the batch resumes background work.
    expect(fetchMock.mock.calls.some(([u, init]) => String(u).endsWith('/batches/batch-1/process') && init?.method === 'POST')).toBe(true);
  });

  it('confirms the suggested match and advances to the next photo', async () => {
    await render(<BulkImageBatchScreen />);
    await screen.findByText('Castle Mickey');
    await fireEvent.press(screen.getByText('Confirm match'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/items/a/confirm'));
      expect(call).toBeTruthy();
      expect(JSON.parse(call![1].body)).toMatchObject({ pinhuntId: 'PHUK-a' });
    });
    expect(await screen.findByText('Minnie Macaron')).toBeTruthy();
  });

  it('can confirm an alternative candidate instead', async () => {
    await render(<BulkImageBatchScreen />);
    await screen.findByText('Castle Mickey');
    await fireEvent.press(screen.getByText('2. Castle Mickey (LE)'));
    await fireEvent.press(screen.getByText('Confirm candidate 2'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/items/a/confirm'));
      expect(JSON.parse(call![1].body)).toMatchObject({ pinhuntId: 'PHUK-a2' });
    });
  });
});
