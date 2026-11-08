/**
 * Where each pin lives (#547; migration 067, #544).
 *
 * A collector's real-world places (trade books with pages and pockets,
 * display frames, lanyards, boxes) and which place, page and pocket each pin
 * in their collection is in. Both tables are owner only (RLS): nobody else can
 * read them, not even for For Trade pins, which is why the location isn't a
 * column on user_pins.
 *
 * The app's pin ids are pins.pinhunt_id; the tables hold pins.id (uuid), so
 * calls resolve one to the other. Until migration 067 is applied the tables
 * don't exist and calls throw a PinRepositoryError with code NOT_FOUND (see
 * isPinLocationsUnavailable), so screens can hide the feature.
 *
 * The server also clears a pin's location when it moves to ISO, and removes it
 * when the pin leaves the collection (067 trigger and foreign key).
 */
import { PinRepositoryError } from './repository';

export type PlaceKind = 'book' | 'board' | 'display' | 'lanyard' | 'box' | 'other';
export const PLACE_KINDS: readonly PlaceKind[] = ['book', 'board', 'display', 'lanyard', 'box', 'other'];

export interface CollectionPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  /** Books and binders: how many pages. */
  pages: number | null;
  /** Books and binders: pockets on each page. */
  pocketsPerPage: number | null;
  sortOrder: number;
  createdAt: string;
}

export interface PlaceInput {
  name: string;
  kind: PlaceKind;
  pages?: number | null;
  pocketsPerPage?: number | null;
}

export interface PinLocation {
  /** pins.pinhunt_id: the app's pin id. */
  pinId: string;
  placeId: string;
  page: number | null;
  pocket: number | null;
  note: string | null;
  updatedAt: string;
}

export interface PinLocationInput {
  placeId: string;
  page?: number | null;
  pocket?: number | null;
  note?: string | null;
}

/**
 * The slice of a Supabase client this module uses. Query builders are chained
 * and awaited, so they're typed loosely here (any supabase-js version works).
 */
export interface PinLocationsClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

/** Largest batch of pins resolved or written per call. */
export const PIN_LOCATION_BATCH = 500;

const UNAVAILABLE = 'Pin locations are not available yet.';
export const MAX_PLACE_NAME = 60;
export const MAX_LOCATION_NOTE = 120;

/** True when the error means migration 067 isn't applied (or reachable) yet. */
export function isPinLocationsUnavailable(err: unknown): boolean {
  return err instanceof PinRepositoryError && err.code === 'NOT_FOUND' && err.message === UNAVAILABLE;
}

function toError(error: unknown, fallback: string): PinRepositoryError {
  const e = (error ?? {}) as { code?: string; message?: string };
  const message = String(e.message ?? '');
  // Table missing from the schema cache: migration 067 not applied yet.
  if (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(message)) {
    return new PinRepositoryError('NOT_FOUND', UNAVAILABLE, error);
  }
  if (e.code === '23503') {
    return new PinRepositoryError('INVALID_INPUT', 'Only pins in your collection can have a place, and only in your own places.', error);
  }
  if (e.code === '23514') {
    return new PinRepositoryError('INVALID_INPUT', 'Check the name, page and pocket.', error);
  }
  return new PinRepositoryError('UPSTREAM_ERROR', fallback, error);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function positiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function isPlaceKind(value: unknown): value is PlaceKind {
  return typeof value === 'string' && (PLACE_KINDS as readonly string[]).includes(value);
}

// ── Validation (client side, matching migration 067's checks) ────────────

export function normalisePlaceInput(input: PlaceInput): Required<PlaceInput> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new PinRepositoryError('INVALID_INPUT', 'Give the place a name.');
  if (name.length > MAX_PLACE_NAME) throw new PinRepositoryError('INVALID_INPUT', `Keep the name to ${MAX_PLACE_NAME} characters.`);
  if (!isPlaceKind(input.kind)) throw new PinRepositoryError('INVALID_INPUT', 'Choose what kind of place it is.');
  const pages = input.pages == null ? null : positiveInt(input.pages);
  const pocketsPerPage = input.pocketsPerPage == null ? null : positiveInt(input.pocketsPerPage);
  if (input.pages != null && (pages === null || pages > 500)) throw new PinRepositoryError('INVALID_INPUT', 'Pages must be between 1 and 500.');
  if (input.pocketsPerPage != null && (pocketsPerPage === null || pocketsPerPage > 100)) {
    throw new PinRepositoryError('INVALID_INPUT', 'Pockets per page must be between 1 and 100.');
  }
  return { name, kind: input.kind, pages, pocketsPerPage };
}

/** Checks a location against the database rules and, when known, the place's size. */
export function normaliseLocationInput(input: PinLocationInput, place?: CollectionPlace): Required<PinLocationInput> {
  if (!input.placeId) throw new PinRepositoryError('INVALID_INPUT', 'Choose a place.');
  const page = input.page == null ? null : positiveInt(input.page);
  const pocket = input.pocket == null ? null : positiveInt(input.pocket);
  if (input.page != null && page === null) throw new PinRepositoryError('INVALID_INPUT', 'Pages start at 1.');
  if (input.pocket != null && pocket === null) throw new PinRepositoryError('INVALID_INPUT', 'Pockets start at 1.');
  if (pocket !== null && page === null) throw new PinRepositoryError('INVALID_INPUT', 'Choose a page for the pocket.');
  if (place?.pages && page !== null && page > place.pages) {
    throw new PinRepositoryError('INVALID_INPUT', `${place.name} has ${place.pages} pages.`);
  }
  if (place?.pocketsPerPage && pocket !== null && pocket > place.pocketsPerPage) {
    throw new PinRepositoryError('INVALID_INPUT', `Each page has ${place.pocketsPerPage} pockets.`);
  }
  const note = input.note?.trim() ? input.note.trim().slice(0, MAX_LOCATION_NOTE) : null;
  return { placeId: input.placeId, page, pocket, note };
}

// ── Display helpers ──────────────────────────────────────────────────────

/** "Trade book 2 · page 5 · pocket 2", or just the place name. */
export function describeLocation(location: Pick<PinLocation, 'page' | 'pocket' | 'note'>, place: Pick<CollectionPlace, 'name'> | undefined): string {
  const parts = [place?.name ?? 'Unknown place'];
  if (location.page) parts.push(`page ${location.page}`);
  if (location.pocket) parts.push(`pocket ${location.pocket}`);
  if (location.note) parts.push(location.note);
  return parts.join(' · ');
}

/** Free page/pocket slots in a book, in order. Empty for places without pages and pockets. */
export function freePockets(place: CollectionPlace, locations: PinLocation[]): Array<{ page: number; pocket: number }> {
  if (!place.pages || !place.pocketsPerPage) return [];
  const taken = new Set(locations.filter(l => l.placeId === place.id && l.page && l.pocket).map(l => `${l.page}:${l.pocket}`));
  const free: Array<{ page: number; pocket: number }> = [];
  for (let page = 1; page <= place.pages; page++) {
    for (let pocket = 1; pocket <= place.pocketsPerPage; pocket++) {
      if (!taken.has(`${page}:${pocket}`)) free.push({ page, pocket });
    }
  }
  return free;
}

/**
 * Where `count` pins could go in a book: the first page with enough free
 * pockets for them all (so they stay together), else the first free pockets.
 */
export function suggestPockets(place: CollectionPlace, locations: PinLocation[], count: number): Array<{ page: number; pocket: number }> {
  const free = freePockets(place, locations);
  if (count <= 0 || free.length === 0) return [];
  const byPage = new Map<number, Array<{ page: number; pocket: number }>>();
  for (const slot of free) byPage.set(slot.page, [...(byPage.get(slot.page) ?? []), slot]);
  for (const slots of byPage.values()) if (slots.length >= count) return slots.slice(0, count);
  return free.slice(0, count);
}

// ── Row mapping ──────────────────────────────────────────────────────────

export function mapPlaceRow(row: Record<string, unknown>): CollectionPlace | null {
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null;
  return {
    id: row.id,
    name: row.name,
    kind: isPlaceKind(row.kind) ? row.kind : 'other',
    pages: positiveInt(row.pages),
    pocketsPerPage: positiveInt(row.pockets_per_page),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    createdAt: String(row.created_at ?? ''),
  };
}

const PLACE_COLUMNS = 'id,name,kind,pages,pockets_per_page,sort_order,created_at';

// ── Places ───────────────────────────────────────────────────────────────

export async function getMyPlaces(client: PinLocationsClient): Promise<CollectionPlace[]> {
  const { data, error } = await client.from('collection_places').select(PLACE_COLUMNS)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw toError(error, 'Could not load your places.');
  return ((data ?? []) as Record<string, unknown>[]).map(mapPlaceRow).filter((p): p is CollectionPlace => p !== null);
}

export async function createPlace(client: PinLocationsClient, input: PlaceInput): Promise<CollectionPlace> {
  const p = normalisePlaceInput(input);
  const { data, error } = await client.from('collection_places')
    .insert({ name: p.name, kind: p.kind, pages: p.pages, pockets_per_page: p.pocketsPerPage })
    .select(PLACE_COLUMNS).single();
  if (error) throw toError(error, 'Could not add the place.');
  const place = mapPlaceRow(data as Record<string, unknown>);
  if (!place) throw new PinRepositoryError('UPSTREAM_ERROR', 'Could not add the place.');
  return place;
}

export async function updatePlace(client: PinLocationsClient, placeId: string, input: PlaceInput): Promise<CollectionPlace> {
  const p = normalisePlaceInput(input);
  const { data, error } = await client.from('collection_places')
    .update({ name: p.name, kind: p.kind, pages: p.pages, pockets_per_page: p.pocketsPerPage })
    .eq('id', placeId).select(PLACE_COLUMNS).single();
  if (error) throw toError(error, 'Could not save the place.');
  const place = mapPlaceRow(data as Record<string, unknown>);
  if (!place) throw new PinRepositoryError('UPSTREAM_ERROR', 'Could not save the place.');
  return place;
}

/** Deletes the place; its pins lose their location (067: on delete cascade). */
export async function deletePlace(client: PinLocationsClient, placeId: string): Promise<void> {
  const { error } = await client.from('collection_places').delete().eq('id', placeId);
  if (error) throw toError(error, 'Could not delete the place.');
}

// ── Locations ────────────────────────────────────────────────────────────

/** pinhunt_id → pins.id for the given app pin ids (unknown ids are left out). */
async function resolvePinIds(client: PinLocationsClient, pinIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const batch of chunks([...new Set(pinIds)], PIN_LOCATION_BATCH)) {
    const { data, error } = await client.from('pins').select('id,pinhunt_id').in('pinhunt_id', batch);
    if (error) throw toError(error, 'Could not find those pins.');
    for (const row of (data ?? []) as Array<{ id: string; pinhunt_id: string }>) out.set(row.pinhunt_id, row.id);
  }
  return out;
}

/** Every location the signed-in collector has saved. */
export async function getMyPinLocations(client: PinLocationsClient): Promise<PinLocation[]> {
  const { data, error } = await client.from('user_pin_locations').select('pin_id,place_id,page,pocket,note,updated_at');
  if (error) throw toError(error, 'Could not load where your pins live.');
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const uuids = [...new Set(rows.map(r => String(r.pin_id)))];
  const appIds = new Map<string, string>();
  for (const batch of chunks(uuids, PIN_LOCATION_BATCH)) {
    const res = await client.from('pins').select('id,pinhunt_id').in('id', batch);
    if (res.error) throw toError(res.error, 'Could not load where your pins live.');
    for (const row of (res.data ?? []) as Array<{ id: string; pinhunt_id: string }>) appIds.set(row.id, row.pinhunt_id);
  }
  return rows.flatMap(r => {
    const pinId = appIds.get(String(r.pin_id));
    if (!pinId || typeof r.place_id !== 'string') return [];
    return [{
      pinId,
      placeId: r.place_id,
      page: positiveInt(r.page),
      pocket: positiveInt(r.pocket),
      note: typeof r.note === 'string' && r.note ? r.note : null,
      updatedAt: String(r.updated_at ?? ''),
    }];
  });
}

/**
 * Put pins in a place. With one input, every pin gets the same place (and
 * page/pocket, if given); pass one input per pin (same order) for different
 * pockets. Pins must be in the collection (owned or For Trade).
 */
export async function setPinLocations(
  client: PinLocationsClient,
  pinIds: string[],
  input: PinLocationInput | PinLocationInput[],
  place?: CollectionPlace,
): Promise<void> {
  if (pinIds.length === 0) return;
  const inputs = Array.isArray(input) ? input : pinIds.map(() => input);
  if (inputs.length !== pinIds.length) throw new PinRepositoryError('INVALID_INPUT', 'One location per pin.');
  const normalised = inputs.map(i => normaliseLocationInput(i, place));
  const resolved = await resolvePinIds(client, pinIds);
  const rows = pinIds.flatMap((id, i) => {
    const uuid = resolved.get(id);
    if (!uuid) return [];
    const l = normalised[i];
    return [{ pin_id: uuid, place_id: l.placeId, page: l.page, pocket: l.pocket, note: l.note }];
  });
  if (rows.length === 0) throw new PinRepositoryError('NOT_FOUND', 'That pin isn’t in the catalogue.');
  for (const batch of chunks(rows, PIN_LOCATION_BATCH)) {
    // user_id defaults to auth.uid() and RLS keeps it there.
    const { error } = await client.from('user_pin_locations').upsert(batch, { onConflict: 'user_id,pin_id' });
    if (error) throw toError(error, 'Could not save where your pins live.');
  }
}

/** Forget where pins live (they stay in the collection). */
export async function clearPinLocations(client: PinLocationsClient, pinIds: string[]): Promise<void> {
  if (pinIds.length === 0) return;
  const resolved = [...(await resolvePinIds(client, pinIds)).values()];
  for (const batch of chunks(resolved, PIN_LOCATION_BATCH)) {
    const { error } = await client.from('user_pin_locations').delete().in('pin_id', batch);
    if (error) throw toError(error, 'Could not clear where those pins live.');
  }
}
