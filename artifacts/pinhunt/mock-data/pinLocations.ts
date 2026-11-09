/**
 * Demo-mode places and pin locations (#547). Mock data only: used by the
 * screenshot harness, never by a build that talks to Supabase. Follows the
 * same rules as migration 067 through the shared validation helpers.
 */
import {
  normaliseLocationInput,
  normalisePlaceInput,
  type CollectionPlace,
  type PinLocation,
  type PinLocationInput,
  type PlaceInput,
} from '@workspace/pin-repository';
import type { PinLocationService } from '@/lib/pinLocationService';

const now = '2026-01-01T00:00:00.000Z';

export function createDemoPinLocations(): PinLocationService {
  let places: CollectionPlace[] = [
    { id: 'demo-place-book-1', name: 'Trade book 1', kind: 'book', pages: 12, pocketsPerPage: 9, sortOrder: 0, createdAt: now },
    { id: 'demo-place-book-2', name: 'Trade book 2', kind: 'book', pages: 12, pocketsPerPage: 9, sortOrder: 1, createdAt: now },
    { id: 'demo-place-frame', name: 'Display frame, hallway', kind: 'display', pages: null, pocketsPerPage: null, sortOrder: 2, createdAt: now },
    { id: 'demo-place-lanyard', name: 'Paris lanyard', kind: 'lanyard', pages: null, pocketsPerPage: null, sortOrder: 3, createdAt: now },
  ];
  // Some pins placed, some still without a home.
  let locations: PinLocation[] = [
    { pinId: 'dp-001', placeId: 'demo-place-frame', page: null, pocket: null, note: null, updatedAt: now },
    { pinId: 'dp-002', placeId: 'demo-place-book-2', page: 5, pocket: 1, note: null, updatedAt: now },
    { pinId: 'dp-004', placeId: 'demo-place-book-2', page: 5, pocket: 2, note: null, updatedAt: now },
  ];
  let next = 1;

  return {
    async getMyPlaces() { return [...places].sort((a, b) => a.sortOrder - b.sortOrder); },
    async createPlace(input: PlaceInput) {
      const p = normalisePlaceInput(input);
      const place: CollectionPlace = { id: `demo-place-new-${next++}`, ...p, sortOrder: places.length, createdAt: now };
      places = [...places, place];
      return place;
    },
    async updatePlace(placeId: string, input: PlaceInput) {
      const p = normalisePlaceInput(input);
      const existing = places.find(x => x.id === placeId);
      if (!existing) throw new Error('Place not found');
      const updated = { ...existing, ...p };
      places = places.map(x => (x.id === placeId ? updated : x));
      return updated;
    },
    async deletePlace(placeId: string) {
      places = places.filter(p => p.id !== placeId);
      locations = locations.filter(l => l.placeId !== placeId);
    },
    async getMyPinLocations() { return [...locations]; },
    async setPinLocations(pinIds: string[], input: PinLocationInput | PinLocationInput[], place?: CollectionPlace) {
      const inputs = Array.isArray(input) ? input : pinIds.map(() => input);
      const rows = pinIds.map((pinId, i) => {
        const l = normaliseLocationInput(inputs[i], place);
        return { pinId, placeId: l.placeId, page: l.page, pocket: l.pocket, note: l.note, updatedAt: now };
      });
      const ids = new Set(pinIds);
      locations = [...locations.filter(l => !ids.has(l.pinId)), ...rows];
    },
    async clearPinLocations(pinIds: string[]) {
      const ids = new Set(pinIds);
      locations = locations.filter(l => !ids.has(l.pinId));
    },
  };
}
