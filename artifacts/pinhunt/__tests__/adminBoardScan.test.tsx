import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AdminBoardScanScreen, { boardPoint } from '../app/admin/board-scan/[id]';
import AdminBoardScansScreen from '../app/admin/board-scans';

// Board scanning review (Step A): pins without a catalogue photo first,
// one-tap confirm/correct/exclude, publishing only on approval, and an
// upload that can't start without a permission record.

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'scan-1' }),
  useFocusEffect: (cb: () => void) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); },
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));
jest.mock('expo-image-picker', () => ({}));

const baseItem = {
  origin: 'detected', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, quality: { suitable: true, reasons: [], widthPx: 600, heightPx: 600 },
  match_status: 'suggested', decision: 'undecided', exclude_reason: null, cleanup_note: null, image_review: 'none', error: null,
  cropUrl: 'https://x/crop.jpg', cleanedUrl: null,
};
const view = {
  scan: {
    id: 'scan-1', title: 'Toy Story board', status: 'ready', image_width: 4000, image_height: 3000, imageUrl: 'https://x/board.jpg',
    processing: false, permission_public_display: true, contributor_name: 'A Collector', detection_truncated: false, error: null,
  },
  items: [
    {
      ...baseItem, id: 'i1', position: 1, priority: 30, suggested_pin_id: 'PHUK-2', match_confidence: 88, cleanup_status: 'skipped',
      cleanup_note: 'This pin already has a catalogue photo.', targetPinId: 'PHUK-2',
      targetPin: { title: 'Woody', imageUrl: 'https://x/woody.jpg', pendingImages: 0 },
      candidates: [{ pinId: 'PHUK-2', title: 'Woody', collection: 'Toy Story', imageUrl: 'https://x/woody.jpg', confidence: 88, reasoning: 'hat' }],
    },
    {
      ...baseItem, id: 'i2', position: 2, priority: 139, suggested_pin_id: 'PHUK-1', match_confidence: 91, cleanup_status: 'done',
      cleanedUrl: 'https://x/clean.jpg', targetPinId: 'PHUK-1', targetPin: { title: 'Jessie', imageUrl: null, pendingImages: 0 },
      candidates: [
        { pinId: 'PHUK-1', title: 'Jessie', collection: 'Toy Story', imageUrl: null, confidence: 91, reasoning: 'red hat, yodel' },
        { pinId: 'PHUK-9', title: 'Jessie (glitter)', collection: 'Toy Story', imageUrl: null, confidence: 40, reasoning: '' },
      ],
    },
  ],
  metrics: {
    detected: 2, manualAdds: 0, falsePositives: 0, pinsOnBoard: 2, detectionRate: 1, matchAccuracy: null, reviewedMatches: 0, corrected: 0,
    suitableCrops: 2, cleaned: 1, published: 0, manualCorrections: 0, undecided: 2, pixianCalls: 1, openaiCalls: 3,
    inputTokens: 30000, outputTokens: 2000, estimatedCostUsd: null, totalSeconds: 42,
  },
  config: { maxPins: 30, pixianConfigured: true },
};

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockImplementation((url: string, init?: { method?: string }) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(
      url.endsWith('/approve-ready') ? { approved: ['i2'], skipped: [] }
        : init?.method && init.method !== 'GET' ? { item: {} } : view,
    ),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/admin/, '/admin')} ${init?.body ?? ''}`.trim());

describe('admin board scan review', () => {
  it('lists the pin with no catalogue photo first, with its cleaned photo ready to approve', async () => {
    await render(<AdminBoardScanScreen />);
    expect(await screen.findByText('Ready to review')).toBeTruthy();
    const titles = screen.getAllByText(/^#\d/).map((n) => n.props.children.join(''));
    expect(titles).toEqual(['#2', '#1']);
    expect(screen.getByText('No catalogue photo')).toBeTruthy();
    expect(screen.getByText('Approve all ready (1)')).toBeTruthy();
    expect(screen.getByText('This pin already has a catalogue photo.')).toBeTruthy();
  });

  it('confirms, switches to an alternative and excludes with one tap each', async () => {
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getAllByText('Confirm match')[0]);
    await waitFor(() => expect(calls()).toContain('PATCH /admin/board-scans/scan-1/items/i2 {"action":"confirm"}'));
    await fireEvent.press(screen.getByText('Jessie (glitter) · 40%'));
    await waitFor(() => expect(calls()).toContain('PATCH /admin/board-scans/scan-1/items/i2 {"action":"set_pin","pinId":"PHUK-9"}'));
    await fireEvent.press(screen.getAllByText('Not a pin')[1]);
    await waitFor(() => expect(calls()).toContain('PATCH /admin/board-scans/scan-1/items/i1 {"action":"exclude","reason":"not_a_pin"}'));
  });

  it('publishes only when asked', async () => {
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    expect(calls().some((c) => c.includes('approve'))).toBe(false);
    await fireEvent.press(screen.getByText('Approve all ready (1)'));
    expect(await screen.findByText('Published 1 photo.')).toBeTruthy();
    expect(calls()).toContain('POST /admin/board-scans/scan-1/approve-ready');
  });
});

describe('admin board scan: match checks', () => {
  it('says whether the suggested match was checked against reference pictures', async () => {
    const checked = { ...view, items: view.items.map((i, n) => ({ ...i, candidates: i.candidates.map((c) => ({ ...c, verified: n === 1 })) })) };
    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve(checked) }));
    await render(<AdminBoardScanScreen />);
    expect(await screen.findByText('Checked against reference pictures.')).toBeTruthy();
    expect(screen.getByText('Not checked against a picture: compare carefully.')).toBeTruthy();
  });
});

describe('admin board scan: reference images and straightening', () => {
  it('shows the Pin & Pop reference beside the match, labelled admin only, when the server sends one', async () => {
    const withRefs = { ...view, pinAndPop: { 'PHUK-1': { imageUrl: 'https://pinandpop.example/1.jpg', externalId: '4321' } } };
    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve(withRefs) }));
    await render(<AdminBoardScanScreen />);
    expect(await screen.findByText(/Pin & Pop reference #4321 \(admin only\)/)).toBeTruthy();
    expect(screen.getByLabelText('Pin & Pop reference image')).toBeTruthy();
  });

  it('shows no reference image when the server sends none (not the App Creator)', async () => {
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    expect(screen.queryByText(/Pin & Pop reference/)).toBeNull();
  });

  it('straightens or turns a cleaned photo before approval', async () => {
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getByText('Straighten'));
    await waitFor(() => expect(calls()).toContain('POST /admin/board-scans/scan-1/items/i2/rotate {"degrees":"auto"}'));
    await fireEvent.press(screen.getByText('↻ Turn right'));
    await waitFor(() => expect(calls()).toContain('POST /admin/board-scans/scan-1/items/i2/rotate {"degrees":3}'));
  });
});

describe('admin board scan upload', () => {
  it("can't start without a photo and a permission record", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ scans: [] }) }));
    await render(<AdminBoardScansScreen />);
    expect(await screen.findByText('No boards yet.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Scan board'));
    expect(calls().filter((c) => c.startsWith('POST'))).toEqual([]);
  });

  it('says when board scanning is switched off on the server', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Not found' }) }));
    await render(<AdminBoardScansScreen />);
    expect(await screen.findByText(/Board scanning is not switched on for this server/)).toBeTruthy();
  });
});

describe('adding a missed pin: where a tap lands', () => {
  it('measures from the board on the web, even when the tap lands on an outline', () => {
    // An outline at (200, 100) inside a board at page (40, 300): locationX/Y would be
    // relative to the outline (10, 10), but the page position puts it at (210, 110) on the board.
    const ev = { locationX: 10, locationY: 10, pageX: 250, pageY: 410 };
    expect(boardPoint(ev, { left: 40, top: 300 }, { x: 0, y: 0 }, 400, 300)).toEqual({ x: 210 / 400, y: 110 / 300 });
    // The page scrolled by 50: the board's on-screen top is 50 higher.
    expect(boardPoint({ ...ev, pageY: 410 }, { left: 40, top: 250 }, { x: 0, y: 50 }, 400, 300)).toEqual({ x: 210 / 400, y: 110 / 300 });
  });

  it('uses locationX/Y on native, and keeps the point on the board', () => {
    expect(boardPoint({ locationX: 100, locationY: 150, pageX: 0, pageY: 0 }, null, { x: 0, y: 0 }, 400, 300)).toEqual({ x: 0.25, y: 0.5 });
    expect(boardPoint({ locationX: -20, locationY: 900, pageX: 0, pageY: 0 }, null, { x: 0, y: 0 }, 400, 300)).toEqual({ x: 0, y: 1 });
  });
});
