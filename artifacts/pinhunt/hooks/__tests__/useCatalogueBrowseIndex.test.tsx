import { renderHook, waitFor } from '@testing-library/react-native';
import { useCatalogueBrowseIndex } from '../useCatalogueBrowseIndex';

let mockPins: Array<Record<string, unknown>> = [];
let mockRepository: { getCatalogueBrowseIndex: jest.Mock } | null = null;
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: mockRepository }),
}));

const pin = (id: string) => ({ id, title: id, collection: 'Classics 2024', brand: 'Disney Parks', characters: [] });

// The hook caches Supabase rows at module level, so the mock-mode test runs first.
describe('useCatalogueBrowseIndex', () => {
  it('mock mode: shows the catalogue once it loads after the first pass (#202)', async () => {
    mockRepository = null;
    mockPins = [];
    const { result, rerender } = await renderHook(() => useCatalogueBrowseIndex());
    expect(result.current.rows).toHaveLength(0);

    mockPins = [pin('a'), pin('b')];
    await rerender({});
    await waitFor(() => expect(result.current.rows.map(r => r.id)).toEqual(['a', 'b']));
    expect(result.current.rows[0].setName).toBe('Classics 2024');
  });

  it('Supabase mode: fetches once and does not refetch when the catalogue slice changes', async () => {
    mockRepository = { getCatalogueBrowseIndex: jest.fn().mockResolvedValue([{ id: 'x', title: 'X', setName: 'S' }]) };
    mockPins = [pin('a')];
    const { result, rerender } = await renderHook(() => useCatalogueBrowseIndex());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    mockPins = [pin('a'), pin('b')];
    await rerender({});
    expect(mockRepository.getCatalogueBrowseIndex).toHaveBeenCalledTimes(1);
    expect(result.current.rows.map(r => r.id)).toEqual(['x']);
  });
});
