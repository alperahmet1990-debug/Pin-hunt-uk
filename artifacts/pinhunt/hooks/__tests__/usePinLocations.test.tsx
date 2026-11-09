import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PinRepositoryError, type CollectionPlace, type PinLocation } from '@workspace/pin-repository';
import { resetPinLocationsForTests, usePinLocations } from '../usePinLocations';
import { setPinLocationServiceForTests, type PinLocationService } from '@/lib/pinLocationService';

let mockUser: { id: string } | null = { id: 'user-a' };
let mockCollection: Record<string, { pinId: string; status: string; quantity: number }> = {};
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection }) }));

const book: CollectionPlace = { id: 'p1', name: 'Trade book 2', kind: 'book', pages: 12, pocketsPerPage: 9, sortOrder: 0, createdAt: '' };
const at = (pinId: string, page: number, pocket: number): PinLocation => ({ pinId, placeId: 'p1', page, pocket, note: null, updatedAt: '' });

function service(over: Partial<PinLocationService> = {}): PinLocationService {
  return {
    getMyPlaces: jest.fn(async () => [book]),
    getMyPinLocations: jest.fn(async () => [at('a', 5, 1), at('iso', 5, 2)]),
    createPlace: jest.fn(),
    updatePlace: jest.fn(),
    deletePlace: jest.fn(async () => {}),
    setPinLocations: jest.fn(async () => {}),
    clearPinLocations: jest.fn(async () => {}),
    ...over,
  };
}

beforeEach(() => {
  resetPinLocationsForTests();
  mockUser = { id: 'user-a' };
  mockCollection = {
    a: { pinId: 'a', status: 'owned', quantity: 1 },
    b: { pinId: 'b', status: 'for_trade', quantity: 1 },
    iso: { pinId: 'iso', status: 'wanted', quantity: 1 },
  };
});
afterAll(() => setPinLocationServiceForTests(undefined));

describe('usePinLocations (#547)', () => {
  it('loads places and locations, and hides locations of ISO pins', async () => {
    setPinLocationServiceForTests(service());
    const { result } = await renderHook(() => usePinLocations());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.places).toEqual([book]);
    expect(Object.keys(result.current.locations)).toEqual(['a']);
    expect(result.current.locationFor('iso')).toBeUndefined();
  });

  it('shows a new location at once and keeps it when the save succeeds', async () => {
    const svc = service();
    setPinLocationServiceForTests(svc);
    const { result } = await renderHook(() => usePinLocations());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => { await result.current.setPinLocations(['b'], { placeId: 'p1', page: 6, pocket: 1 }, book); });
    expect(svc.setPinLocations).toHaveBeenCalledWith(['b'], { placeId: 'p1', page: 6, pocket: 1 }, book);
    expect(result.current.locationFor('b')).toMatchObject({ placeId: 'p1', page: 6, pocket: 1 });
  });

  it('puts things back when a save fails', async () => {
    setPinLocationServiceForTests(service({ setPinLocations: jest.fn(async () => { throw new Error('offline'); }) }));
    const { result } = await renderHook(() => usePinLocations());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await expect(result.current.setPinLocations(['a'], { placeId: 'p1', page: 1, pocket: 1 })).rejects.toThrow('offline');
    });
    expect(result.current.locationFor('a')).toMatchObject({ page: 5, pocket: 1 });
  });

  it('deleting a place unplaces its pins', async () => {
    setPinLocationServiceForTests(service());
    const { result } = await renderHook(() => usePinLocations());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => { await result.current.deletePlace('p1'); });
    expect(result.current.places).toEqual([]);
    expect(result.current.locationFor('a')).toBeUndefined();
  });

  it('is off when migration 067 is not applied, or when signed out', async () => {
    setPinLocationServiceForTests(service({
      getMyPlaces: jest.fn(async () => { throw new PinRepositoryError('NOT_FOUND', 'Pin locations are not available yet.'); }),
    }));
    const { result } = await renderHook(() => usePinLocations());
    await waitFor(() => expect(result.current.status).toBe('off'));

    resetPinLocationsForTests();
    mockUser = null;
    setPinLocationServiceForTests(service());
    const signedOut = await renderHook(() => usePinLocations());
    expect(signedOut.result.current.status).toBe('off');
  });
});
