import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ContributeCatalogueScreen from '../app/contribute';

// Contribute pictures: opens on Needs photo, honours filter/sort/set params,
// and the By set / Newest toggle (migration 088).
const mockRows = [
  { pinhuntId: 'PHUK-10000001', title: 'Mickey Castle', setName: 'Park Icons', imageSource: null, pendingCount: 0 },
  { pinhuntId: 'PHUK-10000003', title: 'Stitch Surf', setName: 'Ohana', imageSource: 'reference', imageUrl: 'https://x/2.jpg', pendingCount: 0 },
  { pinhuntId: 'PHUK-10000002', title: 'Lilo Hula', setName: 'Ohana', imageSource: null, pendingCount: 0 },
];
let mockParams: Record<string, string> = {};
let mockSupportsNewest = true;
const mockViews: Array<{ filter: string; sort?: string; facets: Record<string, unknown> }> = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: true, loading: false }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));
// Stand-in for the paged hook: the repository's on-device rules, and the
// database's answer to "newest" depending on whether 088 is applied.
jest.mock('@/hooks/useCatalogueCoverage', () => ({
  useCoveragePage: (
    _enabled: boolean,
    view: { query: string; filter: string; mineOnly: boolean; sort?: string; facets: Record<string, unknown> },
  ) => {
    mockViews.push(view);
    const repo = jest.requireActual('@workspace/pin-repository');
    const wantNewest = view.sort === 'newest';
    const sort = wantNewest && mockSupportsNewest ? 'newest' : 'set';
    const page = repo.coveragePageLocal(mockRows, { ...view.facets, query: view.query, filter: view.filter, sort, offset: 0, limit: 1000 });
    return {
      rows: page.rows, total: page.total, stats: repo.coverageSummaryLocal(mockRows, view.facets, [], null).stats,
      setTotals: {}, sort, sortUnavailable: wantNewest && !mockSupportsNewest,
      loading: false, loadingMore: false, hasMore: false, error: null,
      loadMore: jest.fn(), refresh: jest.fn(), loadFacet: async () => [],
    };
  },
}));

const titles = () => screen.queryAllByText(/^(Mickey Castle|Stitch Surf|Lilo Hula)$/).map(n => n.props.children);

beforeEach(() => {
  mockParams = {};
  mockSupportsNewest = true;
  mockViews.length = 0;
});

describe('Contribute pictures', () => {
  it('opens on Needs photo with no params', async () => {
    await render(<ContributeCatalogueScreen />);
    expect(mockViews.at(-1)).toEqual(expect.objectContaining({ filter: 'needs', sort: 'set' }));
    expect(titles().sort()).toEqual(['Lilo Hula', 'Mickey Castle']);
  });

  it('honours the filter, set and sort params', async () => {
    mockParams = { filter: 'all', set: 'Ohana', sort: 'newest' };
    await render(<ContributeCatalogueScreen />);
    expect(mockViews.at(-1)).toEqual(expect.objectContaining({ filter: 'all', sort: 'newest', facets: expect.objectContaining({ set: 'Ohana' }) }));
    expect(screen.getByText('Newest first')).toBeTruthy();
    expect(titles()).toEqual(['Stitch Surf', 'Lilo Hula']);
  });

  it('keeps Newest selected after tapping it when the database can sort that way', async () => {
    await render(<ContributeCatalogueScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText('Newest pins first')); });
    expect(screen.getByLabelText('Newest pins first').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(mockViews.at(-1)?.sort).toBe('newest');
    expect(titles()).toEqual(['Lilo Hula', 'Mickey Castle']);
  });

  it('falls back to By set and hides the toggle only when a newest page comes back in set order', async () => {
    mockSupportsNewest = false;
    await render(<ContributeCatalogueScreen />);
    expect(screen.getByLabelText('Newest pins first')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText('Newest pins first')); });
    expect(screen.queryByLabelText('Newest pins first')).toBeNull();
    expect(mockViews.at(-1)?.sort).toBe('set');
  });
});
