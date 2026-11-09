import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { CollectionPlace, PinLocation } from '@workspace/pin-repository';
import { LocationEditor } from '../components/locations/LocationEditor';
import { resetPinLocationsForTests, usePinLocations } from '../hooks/usePinLocations';
import { setPinLocationServiceForTests, type PinLocationService } from '@/lib/pinLocationService';

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    collection: {
      a: { pinId: 'a', status: 'owned', quantity: 1 },
      b: { pinId: 'b', status: 'for_trade', quantity: 1 },
      c: { pinId: 'c', status: 'owned', quantity: 1 },
      x: { pinId: 'x', status: 'owned', quantity: 1 },
    },
  }),
}));

const book: CollectionPlace = { id: 'book', name: 'Trade book 2', kind: 'book', pages: 2, pocketsPerPage: 4, sortOrder: 0, createdAt: '' };
const frame: CollectionPlace = { id: 'frame', name: 'Display frame, hallway', kind: 'display', pages: null, pocketsPerPage: null, sortOrder: 1, createdAt: '' };
const taken: PinLocation = { pinId: 'x', placeId: 'book', page: 1, pocket: 1, note: null, updatedAt: '' };

let svc: PinLocationService;
beforeEach(() => {
  resetPinLocationsForTests();
  svc = {
    getMyPlaces: jest.fn(async () => [book, frame]),
    getMyPinLocations: jest.fn(async () => [taken]),
    createPlace: jest.fn(async input => ({ ...frame, id: 'new', name: input.name, kind: input.kind })),
    updatePlace: jest.fn(),
    deletePlace: jest.fn(),
    setPinLocations: jest.fn(async () => {}),
    clearPinLocations: jest.fn(async () => {}),
  };
  setPinLocationServiceForTests(svc);
});
afterAll(() => setPinLocationServiceForTests(undefined));

async function renderReady(pinIds: string[], onDone = jest.fn()) {
  // Load the shared store first, as the screens do before opening the editor.
  const hook = await renderHook(() => usePinLocations());
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  await render(<LocationEditor pinIds={pinIds} onDone={onDone} />);
  return onDone;
}

describe('LocationEditor (#547)', () => {
  it('puts one pin in the exact pocket tapped; taken pockets are disabled', async () => {
    const onDone = await renderReady(['a']);
    const pocket1 = screen.getByRole('radio', { name: 'Pocket 1, taken' });
    expect(pocket1.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole('radio', { name: 'Pocket 3' }));
    await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Save' })); });
    expect(svc.setPinLocations).toHaveBeenCalledWith(['a'], [{ placeId: 'book', page: 1, pocket: 3 }], book);
    expect(onDone).toHaveBeenCalledWith('Saved: Trade book 2 · page 1 · pocket 3');
  }, 20_000);

  it('fills free pockets in order for several pins', async () => {
    const onDone = await renderReady(['a', 'b', 'c']);
    await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Put 3 pins here' })); });
    expect(svc.setPinLocations).toHaveBeenCalledWith(['a', 'b', 'c'], [
      { placeId: 'book', page: 1, pocket: 2 },
      { placeId: 'book', page: 1, pocket: 3 },
      { placeId: 'book', page: 1, pocket: 4 },
    ], book);
    expect(onDone).toHaveBeenCalledWith('3 pins now live in Trade book 2');
  }, 20_000);

  it('puts pins in a frame without pages', async () => {
    await renderReady(['a', 'b']);
    await fireEvent.press(screen.getByRole('radio', { name: 'Display frame, hallway, Display frame' }));
    await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Put 2 pins here' })); });
    expect(svc.setPinLocations).toHaveBeenCalledWith(['a', 'b'], [{ placeId: 'frame' }, { placeId: 'frame' }], frame);
  }, 20_000);

  it('shows the error and keeps the sheet open when saving fails', async () => {
    svc.setPinLocations = jest.fn(async () => { throw new Error('Only pins in your collection can have a place, and only in your own places.'); });
    const onDone = await renderReady(['a']);
    await act(async () => { await fireEvent.press(screen.getByRole('button', { name: 'Save' })); });
    expect(screen.getByText(/Only pins in your collection/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  }, 20_000);
});
