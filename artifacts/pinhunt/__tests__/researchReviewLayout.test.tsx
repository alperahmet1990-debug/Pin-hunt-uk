import React from 'react';
const RN = require('react-native');
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ResearchReviewScreen from '../app/admin/research-review';
import { groupsForTab, isWideLayout, WIDE_BREAKPOINT } from '../utils/researchLayout';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'cancel' })) }));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({ EncodingType: { UTF8: 'utf8' } }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 't' } }) }));
jest.mock('@/lib/apiBase', () => ({ API_BASE: 'http://api.test' }));

const cand = (id: string, set: string | null, name: string) => ({
  id, run_id: 'run1', research_key: id, entity_type: 'pin', set_research_key: set,
  proposed: { 'Pin name': name }, record_confidence: 'High', engine_verified: true,
  review_reasons: [], warnings: [], duplicate_status: 'NEW', status: 'needs_direct_verification',
});
const CANDS = [cand('a', 'Set One', 'Alpha'), cand('b', 'Set One', 'Beta'), cand('c', null, 'Solo')];

beforeEach(() => {
  (globalThis as any).fetch = jest.fn(async (url: string) => {
    let data: unknown = {};
    if (url.includes('/runs')) data = { runs: [{ id: 'run1', git_commit: 'abc', loaded_at: '', summary: {} }] };
    else if (url.includes('/candidates/a')) data = { candidate: CANDS[0], evidence: [], duplicatePin: null };
    else if (url.includes('/candidates?')) data = url.includes('entity=set') ? { candidates: [] } : { candidates: CANDS };
    return { ok: true, json: async () => data };
  });
});
afterEach(() => jest.restoreAllMocks());

const setWidth = (width: number) =>
  jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });

describe('researchLayout helpers', () => {
  it('goes wide at 900 px', () => {
    expect(isWideLayout(WIDE_BREAKPOINT - 1)).toBe(false);
    expect(isWideLayout(WIDE_BREAKPOINT)).toBe(true);
  });
  it('splits set pins from singles', () => {
    expect(groupsForTab('queue', CANDS as any).map(g => g.setKey)).toEqual(['Set One']);
    expect(groupsForTab('singles', CANDS as any).map(g => g.setKey)).toEqual(['(no set)']);
  });
});

describe('Research Review layout shell (RR-20)', () => {
  it.each([1180, 1440])('shows tabs and a side panel at %i px', async width => {
    setWidth(width);
    await render(<ResearchReviewScreen />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
    for (const label of ['Queue', 'OE & singles', 'Set Board']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByTestId('rr-side-panel')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Alpha' }));
    await waitFor(() => expect(screen.getByTestId('pane-candidate')).toBeTruthy());
    expect(screen.getByTestId('rr-side-panel')).toContainElement(screen.getByTestId('pane-candidate'));
  });

  it('has no side panel at 390 px and opens the detail as a sheet', async () => {
    setWidth(390);
    await render(<ResearchReviewScreen />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
    expect(screen.queryByTestId('rr-side-panel')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Alpha' }));
    await waitFor(() => expect(screen.getByTestId('pane-candidate')).toBeTruthy());
  });

  it('puts only pins without a set under OE & singles', async () => {
    setWidth(1180);
    await render(<ResearchReviewScreen />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
    expect(screen.queryByText('Solo')).toBeNull();
    await fireEvent.press(screen.getByText('OE & singles'));
    expect(screen.getByText('Solo')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('ticks nothing on first render of a set review, and keeps the selection across tabs', async () => {
    setWidth(1180);
    await render(<ResearchReviewScreen />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    await fireEvent.press(screen.getByText('Set Board'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Review set' }));
    await waitFor(() => expect(screen.getByTestId('pane-set')).toBeTruthy());
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(b.props.accessibilityState?.checked).toBeFalsy();

    // Tick one, switch tabs and back: the set review and its tick are still there.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tick Alpha' }));
    await fireEvent.press(screen.getByText('Queue'));
    await fireEvent.press(screen.getByText('Set Board'));
    expect(screen.getByTestId('pane-set')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Tick Alpha' }).props.accessibilityState?.checked).toBe(true);
  });
});

describe('Source sheet (RR-21)', () => {
  const openBrowser = require('expo-web-browser').openBrowserAsync as jest.Mock;
  const URL_A = 'https://disney.example.com/pin-a';
  const EVIDENCE = [
    { id: 'e1', field: 'pin_name', value: 'Alpha', source_url: URL_A, publisher: 'disney', source_class: 'official', method: 'engine', note: null },
    { id: 'e2', field: 'attraction', value: 'x', source_url: 'https://www.pinpics.com/a', publisher: 'pinpics', source_class: 'unclassified', method: 'engine', note: null },
    { id: 'e3', field: 'characters', value: 'y', source_url: 'https://other.example.com/z', publisher: 'o', source_class: 'unclassified', method: 'human_direct_check', note: null },
  ];
  let calls: Array<{ url: string; body: any }>;

  beforeEach(() => {
    openBrowser.mockClear();
    calls = [];
    (globalThis as any).fetch = jest.fn(async (url: string, init?: any) => {
      let data: unknown = {};
      if (init?.method === 'POST') calls.push({ url, body: JSON.parse(init.body) });
      else if (url.includes('/runs')) data = { runs: [{ id: 'run1', git_commit: 'abc', loaded_at: '', summary: {} }] };
      else if (url.includes('/candidates/a')) data = { candidate: CANDS[0], evidence: EVIDENCE, duplicatePin: null };
      else if (url.includes('/candidates?')) data = url.includes('entity=set') ? { candidates: [] } : { candidates: CANDS };
      return { ok: true, json: async () => data };
    });
  });

  const openAlpha = async () => {
    setWidth(1180);
    await render(<ResearchReviewScreen />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Open Alpha' }));
    await waitFor(() => expect(screen.getByTestId('pane-candidate')).toBeTruthy());
  };

  it('labels evidence lead / checked / doesn\'t count', async () => {
    await openAlpha();
    expect(screen.getByTestId('evidence-label-e1').props.children).toMatch(/^lead/);
    expect(screen.getByTestId('evidence-label-e2').props.children).toBe("doesn't count");
    expect(screen.getByTestId('evidence-label-e3').props.children).toBe('checked');
  });

  it('opens the source, shows the bar with nothing ticked, and saves the opened URL', async () => {
    await openAlpha();
    expect(screen.queryByTestId('field-tick-bar')).toBeNull();
    // Evidence is grouped by field (attraction, characters, pin_name): the third row is URL_A.
    await fireEvent.press(screen.getAllByText('Open source')[2]);
    await waitFor(() => expect(screen.getByTestId('field-tick-bar')).toBeTruthy());
    expect(openBrowser).toHaveBeenCalledWith(URL_A);
    for (const b of screen.getAllByRole('checkbox', { name: /^Confirmed:/ })) expect(b.props.accessibilityState?.checked).toBeFalsy();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Confirmed: Pin name' }));
    await fireEvent.press(screen.getByText('Save checks'));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toContain('/candidates/a/direct-check');
    expect(calls[0].body).toMatchObject({ sourceUrl: URL_A, fields: ['pin_name'] });
  });

  it('"Tick all shown" ticks every chip', async () => {
    await openAlpha();
    await fireEvent.press(screen.getAllByText('Open source')[0]);
    await waitFor(() => expect(screen.getByTestId('field-tick-bar')).toBeTruthy());
    await fireEvent.press(screen.getByText('Tick all shown'));
    for (const b of screen.getAllByRole('checkbox', { name: /^Confirmed:/ })) expect(b.props.accessibilityState?.checked).toBe(true);
  });

  it("\"Doesn't match\" closes the bar without saving", async () => {
    await openAlpha();
    await fireEvent.press(screen.getAllByText('Open source')[0]);
    await waitFor(() => expect(screen.getByTestId('field-tick-bar')).toBeTruthy());
    await fireEvent.press(screen.getByText("Doesn't match"));
    expect(screen.queryByTestId('field-tick-bar')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
