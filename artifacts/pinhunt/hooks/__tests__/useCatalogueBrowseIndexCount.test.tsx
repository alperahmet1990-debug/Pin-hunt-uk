// Own file: useCatalogueBrowseIndex caches the unfiltered list at module level,
// so this needs a fresh module to see a first, uncached open.
import { renderHook, waitFor } from '@testing-library/react-native';
import type { CatalogueBrowsePageQuery } from '@workspace/pin-repository';
import { useCatalogueBrowseIndex } from '../useCatalogueBrowseIndex';

let mockRepository: { getCatalogueBrowsePage: jest.Mock; getAllSetNames: jest.Mock } | null = null;
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: [], repository: mockRepository }),
}));

it('opening the unfiltered list counts the catalogue once (named + uncategorised)', async () => {
  const getPage = jest.fn(async (q: CatalogueBrowsePageQuery) => ({
    rows: [],
    total: q.withCount ? (q.uncategorised ? 4 : 100) : null,
  }));
  mockRepository = { getCatalogueBrowsePage: getPage, getAllSetNames: jest.fn() };
  const { result } = await renderHook(() => useCatalogueBrowseIndex());
  await waitFor(() => expect(result.current.catalogueTotal).toBe(104));
  expect(result.current.total).toBe(104);
  const countCalls = getPage.mock.calls.filter(([q]) => q.withCount);
  expect(countCalls).toHaveLength(2);
});
