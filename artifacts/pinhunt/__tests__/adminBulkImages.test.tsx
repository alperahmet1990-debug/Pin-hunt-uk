import React from 'react';
import { Image } from 'react-native';
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

describe('crop & clean (pin photographed on a board)', () => {
  it('sends the box drawn around the pin, as fractions of the photo', async () => {
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, ok) => ok(1000, 800));
    const cleaned = item('c', 'Chez Remy Restaurant Sign', {
      status: 'cleaned', cleanedUrl: 'https://signed/c-clean.jpg', matched_pinhunt_id: 'PHUK-10080740',
      matchedTitle: 'Chez Remy Restaurant Sign', pixian_calls: 2,
    });
    const withCleaned = { ...batch, items: [cleaned] };
    fetchMock.mockImplementation((url: string) => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(url.endsWith('/batches/batch-1') ? withCleaned : { status: 'confirmed' }),
    }));

    await render(<BulkImageBatchScreen />);
    await fireEvent.press(await screen.findByText(/^Publish \(/));
    await fireEvent.press(await screen.findByText('Crop & clean'));
    const surface = await screen.findByTestId('crop-surface');

    // The photo is shown at 1000x800 scaled to fit; read the scale back from the layout.
    const frame = surface.parent!;
    const width = (frame.props.style as { width: number }).width;
    const height = (frame.props.style as { height: number }).height;
    await fireEvent(surface, 'responderGrant', { nativeEvent: { locationX: width * 0.25, locationY: height * 0.2 } });
    await fireEvent(surface, 'responderMove', { nativeEvent: { locationX: width * 0.75, locationY: height * 0.9 } });
    const buttons = screen.getAllByText('Crop & clean');
    await fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/items/c/crop'));
      expect(call).toBeTruthy();
      const { box } = JSON.parse(call![1].body);
      expect(box.map((n: number) => Math.round(n * 100) / 100)).toEqual([0.25, 0.2, 0.75, 0.9]);
    });
  });
});

describe('sets and the accuracy check', () => {
  const serve = (b: unknown, other: (url: string) => unknown = () => ({ status: 'confirmed' })) => fetchMock.mockImplementation((url: string) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(url.endsWith('/batches/batch-1') ? b : url.includes('/items/') ? detail('a', 'Castle Mickey') : other(url)),
  }));
  const posted = (suffix: string) => fetchMock.mock.calls.find(([u, init]) => String(u).endsWith(suffix) && init?.method === 'POST');

  it('names the batch\'s set, sent to the server and searched first', async () => {
    serve(batch, (url) => (url.endsWith('/sets') ? { sets: ['Beauty and the Beast'], rematching: 2 } : { status: 'confirmed' }));
    await render(<BulkImageBatchScreen />);
    expect(await screen.findByText(/No set yet/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Name the set'));
    await fireEvent.changeText(screen.getByPlaceholderText(/separate several with commas/), 'Beauty and the Beast');
    await fireEvent.press(screen.getByText('Save sets'));
    await waitFor(() => expect(posted('/batches/batch-1/sets')).toBeTruthy());
    expect(JSON.parse(String(posted('/batches/batch-1/sets')![1].body))).toEqual({ sets: 'Beauty and the Beast' });
    expect(await screen.findByText(/Matching 2 photos again with these sets searched first/)).toBeTruthy();
  });

  it('shows the batch\'s sets, and offers the check once photos are confirmed, with the last result and misses', async () => {
    const withAnswers = {
      ...batch,
      batch: { ...batch.batch, stats: {
        setHints: ['Beauty and the Beast'],
        accuracy: {
          at: '2026-11-28T18:00:00Z', checked: 10, top1: 8, top5: 9, errors: 0,
          misses: [{ itemId: 'b', filename: 'wardrobe.jpg', expected: { pinhuntId: 'PHUK-2', title: 'Wardrobe' }, got: { pinhuntId: 'PHUK-9', title: 'Madame Armoire', confidence: 62 }, rank: 2 }],
        },
      } },
      items: [item('a', 'Castle Mickey', { status: 'confirmed', matched_pinhunt_id: 'PHUK-a' }), item('b', 'Minnie Macaron')],
    };
    serve(withAnswers, (url) => (url.endsWith('/accuracy') ? { started: true, checking: 1 } : { status: 'confirmed' }));
    await render(<BulkImageBatchScreen />);
    expect(await screen.findByText('Searched first: Beauty and the Beast')).toBeTruthy();
    expect(screen.getByText(/right first 8 of 10 \(80%\), in the top 5 9 \(90%\)/)).toBeTruthy();
    expect(screen.getByText(/wardrobe.jpg: you chose Wardrobe — matching put Madame Armoire \(62%\) first; yours came #2/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Accuracy check (1)'));
    await waitFor(() => expect(posted('/batches/batch-1/accuracy')).toBeTruthy());
  });

  it('hides the check until a photo is confirmed', async () => {
    await render(<BulkImageBatchScreen />);
    await screen.findByText('Castle Mickey');
    expect(screen.queryByText(/Accuracy check/)).toBeNull();
  });
});

describe('which pin is it? (look-alikes and sets)', () => {
  const pick = (id: string, title: string, collection = 'Beauty and the Beast') =>
    ({ pinhuntId: id, title, collection, brand: 'Disney', edition: null, characters: [], imageUrl: `https://img/${id}.jpg` });
  const picks = {
    sets: ['Beauty and the Beast'],
    lookalikes: [pick('PHUK-7', 'Wardrobe'), pick('PHUK-8', 'Madame Armoire')],
    pinAndPop: {}, pictureIndex: true,
  };
  const page = (offset: number) => ({
    results: offset === 0 ? [pick('PHUK-1', 'Lumiere'), pick('PHUK-2', 'Cogsworth')] : [pick('PHUK-3', 'Chip')],
    pinAndPop: {}, total: 3, more: offset === 0,
  });
  beforeEach(() => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      const body = u.endsWith('/batches/batch-1') ? batch
        : u.endsWith('/items/a/picks') ? picks
        : u.includes('/search?set=') ? page(Number(/offset=(\d+)/.exec(u)?.[1] ?? 0))
        : u.endsWith('/items/a') ? detail('a', 'Castle Mickey')
        : u.endsWith('/items/b') ? detail('b', 'Minnie Macaron')
        : { status: 'confirmed' };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });
  });
  const confirmBody = () => {
    const c = fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/items/a/confirm') && init?.method === 'POST');
    return c ? JSON.parse(String(c[1].body)) : null;
  };

  it('shows look-alikes as pictures; tapping one and Use confirms it as a manual pick', async () => {
    await render(<BulkImageBatchScreen />);
    await screen.findByText('Castle Mickey');
    // Nothing is fetched until asked (a picture search per photo).
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/picks'))).toBe(false);
    await fireEvent.press(screen.getByText('Which pin is it? Look-alikes & sets'));
    expect(await screen.findByText('Looks like your pin')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Choose Wardrobe'));
    await fireEvent.press(screen.getByText('Use Wardrobe'));
    await waitFor(() => expect(confirmBody()).toEqual({ pinhuntId: 'PHUK-7', method: 'manual_search' }));
  });

  it('browses a set as a picture grid, a page at a time, and narrows it', async () => {
    await render(<BulkImageBatchScreen />);
    await screen.findByText('Castle Mickey');
    await fireEvent.press(screen.getByText('Which pin is it? Look-alikes & sets'));
    await fireEvent.press(await screen.findByText('Beauty and the Beast'));
    expect(await screen.findByLabelText('Choose Lumiere')).toBeTruthy();
    expect(screen.getByText('2 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show more'));
    expect(await screen.findByLabelText('Choose Chip')).toBeTruthy();
    expect(screen.getByLabelText('Choose Lumiere')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText(/Narrow Beauty and the Beast/), 'cogs');
    await fireEvent.press(screen.getByText('Narrow'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('set=Beauty%20and%20the%20Beast&q=cogs&offset=0'))).toBe(true));
  });
});
