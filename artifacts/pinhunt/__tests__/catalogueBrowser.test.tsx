import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CatalogueBrowser, { browseQuery } from '../components/research/CatalogueBrowser';

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, research_key: `wdw/2019/oe/${id}`, entity_type: 'pin', set_research_key: null, proposed: { 'Pin name': `Pin ${id}` },
  record_confidence: 'Medium', engine_verified: false, review_reasons: [], warnings: [], duplicate_status: 'NEW',
  status: 'needs_direct_verification', year: 2019, line: 'wdw', edition: 'OE', flags: [], duplicate: false,
  set_expected: null, set_identified: null, ...extra,
});

function mockApi() {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const api = jest.fn(async (path: string, init?: RequestInit) => {
    calls.push([path, init]);
    if (path.startsWith('/admin/research/catalogue?')) {
      return { total: 2, candidates: [row('a', { duplicate: true }), row('b', { flags: ['wrong year'] })],
        facets: { year: { 2019: 2 }, line: { wdw: 2 }, edition: { OE: 2 }, status: { needs_direct_verification: 2 } } };
    }
    if (path === '/admin/research/catalogue/decisions') return { decided: 0, results: [{ ok: false, reason: 'Open a source first' }] };
    return { ok: true };
  });
  return { api, calls };
}

describe('CatalogueBrowser', () => {
  it('builds the browse query from the filters only', () => {
    expect(browseQuery({ runId: 'r', year: '2019', line: '', edition: 'OE', status: '', only: 'flagged', q: '', source: '', set: '' }, 50))
      .toBe('offset=50&limit=50&runId=r&year=2019&edition=OE&only=flagged');
  });

  it('starts with nothing selected and shows duplicate and flag chips', async () => {
    const { api } = mockApi();
    render(<CatalogueBrowser api={api} runId="r" onOpen={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Pin a')).toBeTruthy());
    expect(screen.queryByTestId('batch-bar')).toBeNull();
    expect(screen.getAllByRole('checkbox').every(c => !c.props.accessibilityState?.checked)).toBe(true);
    expect(screen.getByText('Possible duplicate')).toBeTruthy();
    expect(screen.getByText('Flagged: wrong year')).toBeTruthy();
  });

  it('batch "Research needed" sends one request with the selected pins and a note', async () => {
    const { api, calls } = mockApi();
    render(<CatalogueBrowser api={api} runId="r" onOpen={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Pin a')).toBeTruthy());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByLabelText('Select Pin a'));
    await waitFor(() => expect(screen.getByText('1 selected')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Pin b'));
    await waitFor(() => expect(screen.getByText('2 selected')).toBeTruthy());
    const bar = screen.getByTestId('batch-bar');
    fireEvent.press(require('@testing-library/react-native').within(bar).getByText('Research needed'));
    await waitFor(() => expect(screen.getByLabelText('Decision note')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Decision note'), 'find a second source');
    await waitFor(() => expect(screen.getByLabelText('Decision note').props.value).toBe('find a second source'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(calls.some(([p]) => p === '/admin/research/catalogue/decisions')).toBe(true));
    const [, init] = calls.find(([p]) => p === '/admin/research/catalogue/decisions')!;
    expect(JSON.parse(String(init!.body))).toEqual({ candidateIds: ['a', 'b'], decision: 'needs_more_research', notes: 'find a second source' });
  });

  it('opens the existing detail panel for validation', async () => {
    const { api } = mockApi();
    const onOpen = jest.fn();
    render(<CatalogueBrowser api={api} runId="r" onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByText('Pin a')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Open Pin a'));
    expect(onOpen).toHaveBeenCalledWith('a');
  });
});

describe('spreadsheet checks summary', () => {
  it('groups held pins by reason, most common first', () => {
    const { heldSummary } = require('@/components/research/CatalogueBrowser');
    expect(heldSummary([
      { research_key: 'a', reason: 'Identity confidence is too low to approve' },
      { research_key: 'b', reason: 'Possible duplicate: decide on the pin\'s own page' },
      { research_key: 'c', reason: 'Identity confidence is too low to approve' },
    ])).toEqual(['2 × Identity confidence is too low to approve', '1 × Possible duplicate: decide on the pin\'s own page']);
  });
});
