import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AdminBoardScanScreen, { boardPoint, pickGrid } from '../app/admin/board-scan/[id]';
import AdminBoardScansScreen from '../app/admin/board-scans';

// Board scanning review (Step A): pins without a catalogue photo first,
// one-tap confirm/correct/exclude, publishing only on approval, and an
// upload that can't start without a permission record.

const mockPush = jest.fn();
const mockReplace = jest.fn();
// The first test pays the board-scan screen's cold start (268 ms locally),
// which passed 5 s on a busy CI runner (#713); the same allowance as the
// other large screens (scanResultFlow, aboutBuildInfo).
jest.setTimeout(20_000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
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

/** The board with Jessie's match confirmed: ready to approve in one go. */
const confirmedView = { ...view, items: view.items.map((i) => (i.id === 'i2' ? { ...i, decision: 'confirmed' } : i)) };
const serve = (v: unknown) => fetchMock.mockImplementation((url: string, init?: { method?: string }) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(
    url.endsWith('/approve-ready') ? { approved: ['i2'], skipped: [] }
      : init?.method && init.method !== 'GET' ? { item: {} } : v,
  ),
}));

const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/admin/, '/admin')} ${init?.body ?? ''}`.trim());

describe('admin board scan review', () => {
  it('lists the pin with no catalogue photo first; approving all waits for its match to be confirmed', async () => {
    await render(<AdminBoardScanScreen />);
    expect(await screen.findByText('Ready to review')).toBeTruthy();
    const titles = screen.getAllByText(/^#\d/).map((n) => n.props.children.join(''));
    expect(titles).toEqual(['#2', '#1']);
    expect(screen.getByText('No catalogue photo')).toBeTruthy();
    expect(screen.queryByText(/Approve all ready/)).toBeNull();
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

  it('shows a weak match as a best guess, with any problem from the picture check', async () => {
    const guess = {
      ...baseItem, id: 'i3', position: 3, priority: 10, match_status: 'unmatched', suggested_pin_id: 'PHUK-5', match_confidence: 35,
      cleanup_status: 'skipped', targetPinId: 'PHUK-5', targetPin: { title: 'Bo Peep', imageUrl: null, pendingImages: 0 },
      error: "Reference pictures couldn't be downloaded, so this wasn't checked against a picture.",
      candidates: [{ pinId: 'PHUK-5', title: 'Bo Peep', collection: 'Toy Story', imageUrl: null, confidence: 35, reasoning: '' }],
    };
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(init?.method && init.method !== 'GET' ? { item: {} } : { ...view, items: [guess] }),
    }));
    await render(<AdminBoardScanScreen />);
    expect(await screen.findByText(/Not identified — best guess: Bo Peep/)).toBeTruthy();
    expect(screen.getByText(/couldn't be downloaded/)).toBeTruthy();
    expect(screen.queryByText('Confirm match')).toBeNull();
    await fireEvent.press(screen.getByText('Use best guess'));
    await waitFor(() => expect(calls()).toContain('PATCH /admin/board-scans/scan-1/items/i3 {"action":"confirm"}'));
  });

  it('publishes only when asked', async () => {
    serve(confirmedView);
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    expect(calls().some((c) => c.includes('approve'))).toBe(false);
    await fireEvent.press(screen.getByText('Approve all ready (1)'));
    expect(await screen.findByText('Published 1 photo.')).toBeTruthy();
    expect(calls()).toContain('POST /admin/board-scans/scan-1/approve-ready');
  });
});

describe('admin board scan: searching and what was searched for', () => {
  it('shows what the describe step searched for', async () => {
    const described = { ...view, items: view.items.map((i, n) => (n === 1 ? { ...i, detection: { characters: ['Lucifer'], keywords: ['cat', 'silver frame'], text: '', described: true } } : i)) };
    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve(described) }));
    await render(<AdminBoardScanScreen />);
    expect(await screen.findByText('Searched for: Lucifer, cat, silver frame')).toBeTruthy();
  });

  it('shows the Pin & Pop picture in Change pin results when there is no catalogue photo', async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes('pin-search')
        ? { pins: [{ pinId: 'PHUK-10122801', title: 'Meeko', collection: 'Tails of Friendship', imageUrl: null, referenceUrl: 'https://pinandpop.example/m.jpg' }] }
        : view),
    }));
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getAllByText('Change pin')[0]);
    await fireEvent.changeText(screen.getByPlaceholderText('Title, character, set or PHUK-…'), 'meeko');
    await fireEvent(screen.getByPlaceholderText('Title, character, set or PHUK-…'), 'submitEditing');
    expect(await screen.findByLabelText('Pin & Pop reference for Meeko')).toBeTruthy();
    // Enlarged, it says where the picture comes from, and can be chosen there.
    await fireEvent.press(screen.getByLabelText('Enlarge Meeko'));
    expect(screen.getByText(/Meeko · PHUK-10122801 · Pin & Pop \(admin only\)/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Choose this pin'));
    await waitFor(() => expect(calls()).toContain('PATCH /admin/board-scans/scan-1/items/i2 {"action":"set_pin","pinId":"PHUK-10122801"}'));
  });

  it('opens with the pin\'s crop, its look-alikes and the board\'s sets to browse', async () => {
    const meeko = { pinId: 'PHUK-10122801', title: 'Meeko', collection: 'Tails of Friendship', imageUrl: null, referenceUrl: 'https://pinandpop.example/m.jpg' };
    const nana = { pinId: 'PHUK-NANA', title: 'Nana', collection: 'Tails of Friendship', imageUrl: null, referenceUrl: 'https://pinandpop.example/n.jpg' };
    fetchMock.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(
        String(url).includes('/picks') ? { sets: ['Tails of Friendship'], lookalikes: [meeko] }
          : String(url).includes('pin-search') ? { pins: [nana], total: 31, more: true }
          : view,
      ),
    }));
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getAllByText('Change pin')[0]);
    expect(await screen.findByText('Looks like your pin')).toBeTruthy();
    expect(screen.getByLabelText('Your pin')).toBeTruthy();
    expect(screen.getByLabelText('Choose Meeko')).toBeTruthy();

    // Browse the set as pictures, page by page.
    await fireEvent.press(screen.getByText('Tails of Friendship'));
    expect(await screen.findByLabelText('Choose Nana')).toBeTruthy();
    expect(calls().some((c) => c.includes('pin-search?q=&offset=0&set=Tails+of+Friendship'))).toBe(true);
    await fireEvent.press(screen.getByText('Show more'));
    await waitFor(() => expect(calls().some((c) => c.includes('offset=1&set=Tails+of+Friendship'))).toBe(true));

    await fireEvent.press(screen.getAllByLabelText('Choose Nana')[0]);
    await waitFor(() => expect(calls()).toContain('PATCH /admin/board-scans/scan-1/items/i2 {"action":"set_pin","pinId":"PHUK-NANA"}'));
  });

  it('enlarges a picture on the card when tapped', async () => {
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getAllByLabelText('Enlarge the crop')[0]);
    expect(screen.getByText('#2 · Crop')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close the picture'));
    await waitFor(() => expect(screen.queryByText('#2 · Crop')).toBeNull());
  });
});

describe('admin board scan: scan again and delete', () => {
  it('scans the board again with a set, after confirming on the page', async () => {
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getByText('Scan again'));
    expect(calls().some((c) => c.includes('/rescan'))).toBe(false); // nothing until confirmed
    await fireEvent.changeText(screen.getByLabelText('Set on this board'), 'Tails of Friendship');
    await fireEvent.press(screen.getByText('Scan again now'));
    await waitFor(() => expect(calls()).toContain('POST /admin/board-scans/scan-1/rescan {"setHint":"Tails of Friendship"}'));
    expect(await screen.findByText('Scanning this board again from the start…')).toBeTruthy();
  });

  it('deletes the board after confirming, then goes back to the list', async () => {
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getByText('Delete board'));
    expect(calls().some((c) => c.startsWith('DELETE'))).toBe(false); // nothing until confirmed
    expect(screen.getByText(/This can't be undone/)).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Delete board')[0]);
    await waitFor(() => expect(calls()).toContain('DELETE /admin/board-scans/scan-1'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/admin/board-scans'));
  });

  it('says why a board with published photos is kept', async () => {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => Promise.resolve(init?.method === 'DELETE'
      ? { ok: false, status: 409, json: () => Promise.resolve({ error: '1 photo from this board is published to the catalogue, so the board is kept as their record.', code: 'board_has_published' }) }
      : { ok: true, json: () => Promise.resolve(view) }));
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getByText('Delete board'));
    await fireEvent.press(screen.getAllByText('Delete board')[0]);
    expect(await screen.findByText(/published to the catalogue, so the board is kept/)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('admin board scan: sets', () => {
  it("shows the board's sets and says when confirming a pin re-matches the others", async () => {
    const withSets = { ...view, scan: { ...view.scan, stats: { setHints: ['Tails of Friendship'] } } };
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(init?.method === 'PATCH' ? { item: {}, rematching: 3, set: 'Tails of Friendship' } : withSets),
    }));
    await render(<AdminBoardScanScreen />);
    expect(await screen.findByText('Sets searched first: Tails of Friendship')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Confirm match')[0]);
    expect(await screen.findByText('Re-matching 3 other pins with "Tails of Friendship" searched first.')).toBeTruthy();
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

describe('accuracy check', () => {
  const answered = { ...view, items: view.items.map((i) => (i.id === 'i2' ? { ...i, decision: 'confirmed' } : i)) };
  const report = {
    at: '2026-11-22T12:00:00Z', checked: 20, top1: 14, top5: 18, errors: 1,
    misses: [{ itemId: 'i2', position: 2, expected: { pinId: 'PHUK-1', title: 'Jessie' }, got: { pinId: 'PHUK-9', title: 'Jessie (glitter)', confidence: 72 }, rank: 2 }],
  };

  it('offers the check once pins are answered, and starts it', async () => {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => Promise.resolve({
      ok: true, status: init?.method === 'POST' ? 202 : 200,
      json: () => Promise.resolve(String(url).endsWith('/accuracy') ? { running: true, pins: 1 } : answered),
    }));
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    await fireEvent.press(screen.getByText('Accuracy check (1)'));
    await waitFor(() => expect(calls()).toContain('POST /admin/board-scans/scan-1/accuracy'));
    expect(await screen.findByText(/Checking matching on 1 confirmed pins/)).toBeTruthy();
  });

  it('isn\'t offered before any pin is confirmed', async () => {
    await render(<AdminBoardScanScreen />);
    await screen.findByText('Ready to review');
    expect(screen.queryByText(/Accuracy check/)).toBeNull();
  });

  it('shows the last result and each miss', async () => {
    const withReport = { ...answered, scan: { ...answered.scan, stats: { accuracy: report } } };
    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve(withReport) }));
    await render(<AdminBoardScanScreen />);
    expect(await screen.findByText(/Right first time: 14 of 20 \(70%\) · In the top 5: 18 of 20 \(90%\)/)).toBeTruthy();
    expect(screen.getByText(/1 pin couldn't be checked/)).toBeTruthy();
    expect(screen.getByText(/#2: should be Jessie/)).toBeTruthy();
    expect(screen.getByText(/Matching picked Jessie \(glitter\) \(72%\) · the right pin was #2/)).toBeTruthy();
  });
});

describe('pick grid', () => {
  it('fills the row: 2 across on the smallest phones, 3 from about 390 pt', () => {
    // Grid width = screen − 2 × 16 (backdrop) − 2 × 16 (window padding).
    expect(pickGrid(320 - 64)).toEqual({ cols: 2, tileWidth: 124 });
    expect(pickGrid(390 - 64)).toEqual({ cols: 3, tileWidth: 103 });
    expect(pickGrid(560 - 32)).toEqual({ cols: 3, tileWidth: 170 });
    // No space left over beyond rounding.
    for (const w of [256, 299, 300, 326, 528]) {
      const { cols, tileWidth } = pickGrid(w);
      expect(w - (cols * tileWidth + 8 * (cols - 1))).toBeLessThan(cols);
    }
  });
});
