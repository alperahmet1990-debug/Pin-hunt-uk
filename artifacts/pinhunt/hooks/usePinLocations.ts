/**
 * usePinLocations(): the signed-in collector's places (trade books, frames,
 * lanyards, boxes) and where each pin in their collection lives (#547).
 *
 * One shared store for every screen (pin detail, the Organise panel, Find
 * them a home, browse by place), loaded once per account. Changes apply on
 * screen first and roll back if the save fails.
 *
 * status 'off' when there's no source (unit tests, signed out) or migration
 * 067 isn't applied: screens hide the feature then.
 *
 * Only pins you have (owned or For Trade) have a location. The server clears
 * a location when a pin moves to ISO or leaves the collection; this hook hides
 * those straight away too, so the UI never shows a stale place.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isPinLocationsUnavailable,
  type CollectionPlace,
  type PinLocation,
  type PinLocationInput,
  type PlaceInput,
} from '@workspace/pin-repository';
import { getPinLocationService } from '@/lib/pinLocationService';
import { useAuth } from '@/context/AuthContext';
import { useCollection } from '@/context/CollectionContext';

export type PinLocationsStatus = 'off' | 'loading' | 'ready' | 'error';

interface StoreState {
  owner: string | null;
  status: PinLocationsStatus;
  places: CollectionPlace[];
  locations: Record<string, PinLocation>;
}

const EMPTY: StoreState = { owner: null, status: 'off', places: [], locations: {} };
let state: StoreState = EMPTY;
const listeners = new Set<(s: StoreState) => void>();

function publish(next: StoreState) {
  state = next;
  listeners.forEach(l => l(next));
}

function byPin(list: PinLocation[]): Record<string, PinLocation> {
  return Object.fromEntries(list.map(l => [l.pinId, l]));
}

async function load(owner: string) {
  const service = getPinLocationService();
  if (!service) { publish({ ...EMPTY, owner }); return; }
  publish({ ...state, owner, status: state.owner === owner && state.status === 'ready' ? 'ready' : 'loading' });
  try {
    const [places, locations] = await Promise.all([service.getMyPlaces(), service.getMyPinLocations()]);
    if (state.owner !== owner) return; // account changed while loading
    publish({ owner, status: 'ready', places, locations: byPin(locations) });
  } catch (err) {
    if (state.owner !== owner) return;
    publish({ ...EMPTY, owner, status: isPinLocationsUnavailable(err) ? 'off' : 'error' });
  }
}

function requireService() {
  const service = getPinLocationService();
  if (!service) throw new Error('Pin locations are not available.');
  return service;
}

/** Put pins in a place (one input for all, or one per pin). Rolls back on failure. */
export async function setPinLocations(pinIds: string[], input: PinLocationInput | PinLocationInput[], place?: CollectionPlace) {
  const service = requireService();
  const before = state;
  const inputs = Array.isArray(input) ? input : pinIds.map(() => input);
  const updatedAt = new Date().toISOString();
  const optimistic = { ...state.locations };
  pinIds.forEach((pinId, i) => {
    const l = inputs[i];
    optimistic[pinId] = { pinId, placeId: l.placeId, page: l.page ?? null, pocket: l.pocket ?? null, note: l.note ?? null, updatedAt };
  });
  publish({ ...state, locations: optimistic });
  try {
    await service.setPinLocations(pinIds, input, place);
  } catch (err) {
    publish({ ...state, locations: before.locations });
    throw err;
  }
}

/** Forget where pins live. Rolls back on failure. */
export async function clearPinLocations(pinIds: string[]) {
  const service = requireService();
  const before = state;
  const next = { ...state.locations };
  for (const id of pinIds) delete next[id];
  publish({ ...state, locations: next });
  try {
    await service.clearPinLocations(pinIds);
  } catch (err) {
    publish({ ...state, locations: before.locations });
    throw err;
  }
}

export async function createPlace(input: PlaceInput): Promise<CollectionPlace> {
  const place = await requireService().createPlace(input);
  publish({ ...state, places: [...state.places, place] });
  return place;
}

export async function updatePlace(placeId: string, input: PlaceInput): Promise<CollectionPlace> {
  const place = await requireService().updatePlace(placeId, input);
  publish({ ...state, places: state.places.map(p => (p.id === placeId ? place : p)) });
  return place;
}

/** Deleting a place unplaces its pins (the server does the same). */
export async function deletePlace(placeId: string): Promise<void> {
  await requireService().deletePlace(placeId);
  const locations = Object.fromEntries(Object.entries(state.locations).filter(([, l]) => l.placeId !== placeId));
  publish({ ...state, places: state.places.filter(p => p.id !== placeId), locations });
}

/** For tests. */
export function resetPinLocationsForTests() {
  state = EMPTY;
  listeners.clear();
}

export function usePinLocations() {
  const { user } = useAuth();
  const { collection } = useCollection();
  const owner = user?.id ?? null;
  const [snapshot, setSnapshot] = useState<StoreState>(state);

  useEffect(() => {
    listeners.add(setSnapshot);
    setSnapshot(state);
    return () => { listeners.delete(setSnapshot); };
  }, []);

  useEffect(() => {
    if (!owner) { if (state.owner !== null) publish(EMPTY); return; }
    if (state.owner !== owner || (state.status === 'off' && getPinLocationService())) void load(owner);
  }, [owner]);

  const status: PinLocationsStatus = owner && snapshot.owner === owner ? snapshot.status : owner && getPinLocationService() ? 'loading' : 'off';

  // Only pins you have keep a location (067 clears ISO and removed pins).
  const locations = useMemo(() => {
    const out: Record<string, PinLocation> = {};
    for (const [pinId, l] of Object.entries(snapshot.locations)) {
      const s = collection[pinId]?.status;
      if (s === 'owned' || s === 'for_trade') out[pinId] = l;
    }
    return out;
  }, [snapshot.locations, collection]);

  const placeById = useMemo(() => new Map(snapshot.places.map(p => [p.id, p])), [snapshot.places]);
  const locationFor = useCallback((pinId: string) => locations[pinId], [locations]);
  const reload = useCallback(() => (owner ? load(owner) : Promise.resolve()), [owner]);

  return {
    status,
    places: snapshot.places,
    placeById,
    locations,
    locationFor,
    reload,
    setPinLocations,
    clearPinLocations,
    createPlace,
    updatePlace,
    deletePlace,
  };
}
