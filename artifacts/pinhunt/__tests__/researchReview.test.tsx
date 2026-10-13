import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  candidateTitle, confidenceTone, evidenceByField, groupBySet, safeExternalUrl, type ResearchCandidate,
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
