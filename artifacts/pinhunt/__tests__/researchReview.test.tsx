import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  candidateTitle, confidenceTone, needsStructureChoice, pageCheckNote, describeSetDecision, evidenceByField, groupBySet, safeExternalUrl, setRoute, type ResearchCandidate,
} from '../utils/researchReview';
import ResearchReviewScreen from '../app/admin/research-review';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ session: { access_token: 'tok' } }) }));
jest.mock('@/lib/apiBase', () => ({ API_BASE: 'https://api.test/api' }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ readAsStringAsync: jest.fn(), EncodingType: { UTF8: 'utf8' } }));

const cand = (over: Partial<ResearchCandidate>): ResearchCandidate => ({
  id: '00000000-0000-4000-8000-000000000001', research_key: 'brush-of-magic/mystery-series-3/zazu', entity_type: 'pin',
  set_research_key: 'brush-of-magic/mystery-series-3', proposed: { 'Pin name': 'Zazu – Brush of Magic' },
  record_confidence: 'High', engine_verified: true, review_reasons: [], warnings: [], duplicate_status: 'NEW',
  status: 'needs_direct_verification', ...over,
});

describe('research review helpers', () => {
  it('opens only https evidence links', () => {
    expect(safeExternalUrl('https://www.disneystore.co.uk/x')).toBe('https://www.disneystore.co.uk/x');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('http://example.com')).toBeNull();
    expect(safeExternalUrl(42)).toBeNull();
  });

  it('groups pins by set and ignores set candidates', () => {
    const groups = groupBySet([
      cand({ id: 'a', proposed: { 'Pin name': 'Zazu' } }),
      cand({ id: 'b', proposed: { 'Pin name': 'Gaston' } }),
      cand({ id: 'c', entity_type: 'set', research_key: 'brush-of-magic/mystery-series-3' }),
      cand({ id: 'd', set_research_key: 'animated-cuties/series-1', proposed: { 'Pin name': 'Alice' } }),
    ]);
    expect(groups.map(g => g.setKey)).toEqual(['animated-cuties/series-1', 'brush-of-magic/mystery-series-3']);
    expect(groups[1].items.map(i => i.id)).toEqual(['b', 'a']);
  });

  it('labels and tones', () => {
    expect(candidateTitle(cand({ proposed: {} }))).toBe('brush-of-magic/mystery-series-3/zazu');
    expect(confidenceTone('High')).toBe('owned');
    expect(confidenceTone('Low')).toBe('neutral');
    expect(evidenceByField([
      { id: '1', field: 'release_date', value: '2026-09-01', source_url: null, publisher: null, source_class: 'fan', method: 'search_snippet', note: null },
      { id: '2', field: 'characters', value: ['Zazu'], source_url: null, publisher: null, source_class: 'official', method: 'search_snippet', note: null },
    ]).map(g => g.field)).toEqual(['characters', 'release_date']);
  });
});

describe('Research Review screen', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (url: string) => {
      const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
      if (url.endsWith('/admin/research/runs')) return json({ runs: [{ id: 'r1', git_commit: 'abc1234', loaded_at: '', summary: { pins: 28, engineVerified: 28 } }] });
      if (url.includes('/admin/research/candidates?')) return json({ candidates: [cand({})] });
      if (url.endsWith('/decision')) return json({ error: "Open a source and confirm the pin's identity before approving" }, false, 409);
      if (url.includes('/admin/research/candidates/')) return json({ candidate: cand({}), evidence: [], duplicatePin: null });
      return json({});
    });
  });

  it('lists staged pins and states that the catalogue is unchanged', async () => {
    await render(<ResearchReviewScreen />);
    await waitFor(() => expect(screen.getByText('Zazu – Brush of Magic')).toBeTruthy());
    expect(screen.getByText(/Nothing on this screen changes the catalogue/)).toBeTruthy();
    expect(screen.getByText(/Latest run abc1234 · 28 pins/)).toBeTruthy();
    const urls = fetchMock.mock.calls.map(c => c[0] as string);
    expect(urls.some(u => u.includes('status=needs_direct_verification'))).toBe(true);
    expect(fetchMock.mock.calls.every(c => (c[1]?.headers as Record<string, string>)?.Authorization === 'Bearer tok')).toBe(true);
  });

  it('shows the server refusal when approving before a direct check', async () => {
    await render(<ResearchReviewScreen />);
    await waitFor(() => screen.getByText('Zazu – Brush of Magic'));
    await fireEvent.press(screen.getByRole('button', { name: 'Open Zazu – Brush of Magic' }));
    await waitFor(() => screen.getByText('Proposed record'));
    await fireEvent.press(screen.getByRole('button', { name: 'Approve' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Approve' });
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(screen.getByText(/confirm the pin's identity before approving/)).toBeTruthy());
  });
});

describe('Research Review set view', () => {
  const fetchMock = jest.fn();
  const SET = 'brush-of-magic/mystery-series-3';
  const a = cand({ id: '00000000-0000-4000-8000-0000000000a1', run_id: 'r1', proposed: { 'Pin name': 'Zazu' } });
  const b = cand({ id: '00000000-0000-4000-8000-0000000000b2', run_id: 'r1', research_key: `${SET}/gaston`, proposed: { 'Pin name': 'Gaston' } });
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
      if (url.endsWith('/admin/research/runs')) return json({ runs: [{ id: 'r1', git_commit: 'abc1234', loaded_at: '', summary: {} }] });
      if (url.includes('entity=set')) return json({ candidates: [] });
      if (url.includes('/admin/research/candidates?')) return json({ candidates: [a, b] });
      if (url.endsWith('/decision')) return json({ ok: true, approved: [a.id], skipped: [{ candidateId: b.id, reason: 'Open a source first' }] });
      return json({});
    });
  });

  it('builds encoded set routes and describes partial approvals', () => {
    expect(setRoute('r1', SET, 'direct-check')).toBe(`/admin/research/sets/r1/${encodeURIComponent(SET)}/direct-check`);
    expect(describeSetDecision({ approved: ['x'], skipped: [{ candidateId: 'y', reason: 'Why' }] }, id => `pin ${id}`))
      .toMatch(/Approved 1 pin\./);
    expect(describeSetDecision({ approved: [], skipped: [] }, () => '')).toMatch(/Approved 0 pins/);
  });

  it('starts with every pin unticked, has no select-all, and confirms before approving', async () => {
    await render(<ResearchReviewScreen />);
    await waitFor(() => screen.getByText('Zazu'));
    await fireEvent.press(screen.getByRole('tab', { name: 'Set Board' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Review set' }));
    await waitFor(() => screen.getByText('Set source'));

    const boxes = screen.getAllByRole('checkbox', { name: /^Tick / });
    expect(boxes).toHaveLength(2);
    boxes.forEach(box => expect(box.props.accessibilityState?.checked).toBe(false));
    expect(screen.queryByText(/select all/i)).toBeNull();
    expect(screen.getByText(/0 ticked/)).toBeTruthy();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tick Zazu' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Approve ticked pins' }));
    await waitFor(() => screen.getByText('Approve 1 ticked pin?'));
    expect(fetchMock.mock.calls.some(c => String(c[0]).endsWith('/decision'))).toBe(false);

    const approve = screen.getAllByRole('button', { name: 'Approve' });
    await fireEvent.press(approve[approve.length - 1]);
    await waitFor(() => expect(screen.getByText(/Approved 1 pin\./)).toBeTruthy());
    expect(screen.getByText(/Gaston: Open a source first/)).toBeTruthy();
    const call = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/decision'))!;
    expect(call[0]).toBe(`https://api.test/api${setRoute('r1', SET, 'decision')}`);
    expect(JSON.parse(call[1].body).candidateIds).toEqual([a.id]);
  });
});


describe('Research Review by page', () => {
  const fetchMock = jest.fn();
  const PAGE = 'https://www.disneystore.com/pins';
  const mk = (id: string, set: string, name: string, over: Partial<ResearchCandidate> = {}) =>
    cand({ id, run_id: 'r1', set_research_key: set, research_key: `${set}/${name}`, proposed: { 'Pin name': name }, ...over });
  const solo = mk('00000000-0000-4000-8000-0000000000a1', 'set-a', 'Zazu');
  const duo = mk('00000000-0000-4000-8000-0000000000b2', 'set-a', 'Duo', { proposed: { 'Pin name': 'Duo', Characters: 'Mickey, Minnie' } });
  const flagged = mk('00000000-0000-4000-8000-0000000000c3', 'set-b', 'Flagged', { review_reasons: ['structure: maybe two pins'] });

  beforeEach(() => {
    fetchMock.mockReset();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (url: string) => {
      const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
      if (url.endsWith('/admin/research/runs')) return json({ runs: [{ id: 'r1', git_commit: 'abc', loaded_at: '', summary: {} }] });
      if (url.includes('/admin/research/pages/candidates')) return json({ candidates: [solo, duo, flagged] });
      if (url.includes('/admin/research/pages?')) return json({ pages: [{ source_url: PAGE, source_class: 'official', pin_count: 3, unchecked_count: 3, set_keys: ['set-a', 'set-b'] }], total: 1 });
      if (url.includes('/admin/research/candidates?')) return json({ candidates: [] });
      if (url.endsWith('/direct-check')) return json({ ok: true, results: [{ candidateId: solo.id, status: 'direct_verified', recorded: 1 }], skipped: [] });
      if (url.endsWith('/decision')) return json({ ok: true });
      return json({});
    });
  });

  const openPage = async () => {
    await render(<ResearchReviewScreen />);
    await fireEvent.press(await screen.findByRole('tab', { name: 'Set Board' }));
    await waitFor(() => screen.getByText('By page'));
    await fireEvent.press(screen.getByRole('tab', { name: 'By page' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Open page disneystore.com/pins' }));
    await waitFor(() => screen.getByText('set-b'));
  };

  it('lists pages with counts and opens only https links', async () => {
    await openPage();
    expect(Linking.openURL).toHaveBeenCalledWith(PAGE);
    expect(screen.getAllByText('set-a').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('checkbox', { name: /^Tick / })).toHaveLength(3);
    screen.getAllByRole('checkbox', { name: /^Tick / }).forEach(b => expect(b.props.accessibilityState?.checked).toBe(false));
    expect(screen.queryByText(/select all/i)).toBeNull();
  });

  it('blocks recording until a structure choice is made, then calls the route once per set', async () => {
    await openPage();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tick Zazu' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tick Duo' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tick Flagged' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Character(s)' }));
    expect(screen.getByText(/Choose one pin or separate pins for: Duo, Flagged/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record page check' }).props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByRole('radio', { name: 'One pin showing all of these: Duo' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'One pin showing all of these: Flagged' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Record page check' }));
    await waitFor(() => expect(screen.getByText(/Zazu: check recorded/)).toBeTruthy());

    const checks = fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/direct-check'));
    expect(checks).toHaveLength(2);
    const bodyA = JSON.parse(checks.find(c => String(c[0]).includes('set-a'))![1].body);
    expect(bodyA.confirmed.map((x: { candidateId: string }) => x.candidateId).sort()).toEqual([solo.id, duo.id].sort());
    expect(bodyA.source_url).toBe(PAGE);
    expect(bodyA.note).toMatch(/one pin showing all characters/);
  });

  it('sends "separate pins" back for more research with the note and records no check for it', async () => {
    await openPage();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tick Duo' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Separate pins: Duo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Record page check' }));
    await waitFor(() => expect(screen.getByText(/Duo: sent back for more research/)).toBeTruthy());
    const decision = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/decision'))!;
    expect(String(decision[0])).toContain(`/candidates/${duo.id}/decision`);
    expect(JSON.parse(decision[1].body)).toEqual({ decision: 'needs_more_research', notes: 'structure: separate pins on source' });
    expect(fetchMock.mock.calls.some(c => String(c[0]).endsWith('/direct-check'))).toBe(false);
  });
});

describe('structure helpers', () => {
  it('requires a choice for 2+ characters or a structure: reason only', () => {
    const base = { proposed: {}, review_reasons: [] as string[] };
    expect(needsStructureChoice({ ...base, proposed: { Characters: 'Mickey' } })).toBe(false);
    expect(needsStructureChoice({ ...base, proposed: { Characters: 'Mickey & Minnie' } })).toBe(true);
    expect(needsStructureChoice({ ...base, proposed: { Characters: ['A', 'B'] } })).toBe(true);
    expect(needsStructureChoice({ ...base, review_reasons: ['structure: x'] })).toBe(true);
  });
  it('keeps the check note within 240 characters', () => {
    expect(pageCheckNote('', 0)).toBeNull();
    expect(pageCheckNote('x'.repeat(300), 2)!.length).toBe(240);
  });
});
