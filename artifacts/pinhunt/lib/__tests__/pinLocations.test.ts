import {
  clearPinLocations,
  createPlace,
  describeLocation,
  freePockets,
  getMyPinLocations,
  isPinLocationsUnavailable,
  normaliseLocationInput,
  normalisePlaceInput,
  PinRepositoryError,
  setPinLocations,
  suggestPockets,
  type CollectionPlace,
  type PinLocation,
} from '@workspace/pin-repository';

/** A chainable stand-in for the Supabase query builder: records calls, answers per table. */
function fakeClient(answers: Record<string, (q: Query) => { data?: unknown; error?: unknown }>) {
  const calls: Query[] = [];
  const client = {
    from(table: string) {
      const q: Query = { table, ops: [] };
      calls.push(q);
      const builder: Record<string, unknown> = {};
      for (const op of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'order', 'single']) {
        builder[op] = (...args: unknown[]) => { q.ops.push([op, ...args]); return builder; };
      }
      builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(answers[table]?.(q) ?? { data: [], error: null }).then(resolve, reject);
      return builder;
    },
  };
  return { client, calls };
}
type Query = { table: string; ops: unknown[][] };
const op = (q: Query, name: string) => q.ops.find(o => o[0] === name);

const book: CollectionPlace = {
  id: 'place-1', name: 'Trade book 2', kind: 'book', pages: 2, pocketsPerPage: 3, sortOrder: 0, createdAt: '',
};
const loc = (pinId: string, page: number | null, pocket: number | null): PinLocation => ({
  pinId, placeId: 'place-1', page, pocket, note: null, updatedAt: '',
});

describe('pin locations: validation', () => {
  it('trims place names and rejects blanks, long names and silly sizes', () => {
    expect(normalisePlaceInput({ name: '  Trade   book 2 ', kind: 'book', pages: 12, pocketsPerPage: 9 }))
      .toEqual({ name: 'Trade book 2', kind: 'book', pages: 12, pocketsPerPage: 9 });
    expect(() => normalisePlaceInput({ name: '   ', kind: 'book' })).toThrow('Give the place a name.');
    expect(() => normalisePlaceInput({ name: 'x'.repeat(61), kind: 'box' })).toThrow(/60 characters/);
    expect(() => normalisePlaceInput({ name: 'Book', kind: 'book', pages: 0 })).toThrow(/Pages/);
    expect(() => normalisePlaceInput({ name: 'Book', kind: 'shelf' as never })).toThrow(/kind of place/);
  });

  it('needs a page for a pocket, and keeps within the book', () => {
    expect(normaliseLocationInput({ placeId: 'place-1', page: 2, pocket: 3 }, book)).toEqual({ placeId: 'place-1', page: 2, pocket: 3, note: null });
    expect(() => normaliseLocationInput({ placeId: 'place-1', pocket: 1 })).toThrow('Choose a page for the pocket.');
    expect(() => normaliseLocationInput({ placeId: 'place-1', page: 3 }, book)).toThrow('Trade book 2 has 2 pages.');
    expect(() => normaliseLocationInput({ placeId: 'place-1', page: 1, pocket: 4 }, book)).toThrow('Each page has 3 pockets.');
    expect(() => normaliseLocationInput({ placeId: '' })).toThrow('Choose a place.');
  });
});

describe('pin locations: helpers', () => {
  it('describes a location the way a collector says it', () => {
    expect(describeLocation(loc('a', 5, 2), book)).toBe('Trade book 2 · page 5 · pocket 2');
    expect(describeLocation(loc('a', null, null), { name: 'Display frame, hallway' })).toBe('Display frame, hallway');
  });

  it('finds free pockets and keeps a batch together on one page', () => {
    const taken = [loc('a', 1, 1), loc('b', 1, 3)];
    expect(freePockets(book, taken)).toEqual([{ page: 1, pocket: 2 }, { page: 2, pocket: 1 }, { page: 2, pocket: 2 }, { page: 2, pocket: 3 }]);
    // Two pins: page 1 only has one free pocket, so both go on page 2.
    expect(suggestPockets(book, taken, 2)).toEqual([{ page: 2, pocket: 1 }, { page: 2, pocket: 2 }]);
    expect(suggestPockets({ ...book, pages: null }, taken, 2)).toEqual([]);
  });
});

describe('pin locations: Supabase calls', () => {
  it('resolves app pin ids and upserts one row per pin', async () => {
    const { client, calls } = fakeClient({
      pins: () => ({ data: [{ id: 'uuid-a', pinhunt_id: 'PHUK-1' }, { id: 'uuid-b', pinhunt_id: 'PHUK-2' }] }),
    });
    await setPinLocations(client, ['PHUK-1', 'PHUK-2'], [{ placeId: 'place-1', page: 1, pocket: 1 }, { placeId: 'place-1', page: 1, pocket: 2 }], book);
    const upsert = calls.find(q => q.table === 'user_pin_locations')!;
    expect(op(upsert, 'upsert')).toEqual(['upsert', [
      { pin_id: 'uuid-a', place_id: 'place-1', page: 1, pocket: 1, note: null },
      { pin_id: 'uuid-b', place_id: 'place-1', page: 1, pocket: 2, note: null },
    ], { onConflict: 'user_id,pin_id' }]);
  });

  it('maps saved locations back to app pin ids', async () => {
    const { client } = fakeClient({
      user_pin_locations: () => ({ data: [{ pin_id: 'uuid-a', place_id: 'place-1', page: 5, pocket: 2, note: null, updated_at: 't' }] }),
      pins: () => ({ data: [{ id: 'uuid-a', pinhunt_id: 'PHUK-1' }] }),
    });
    expect(await getMyPinLocations(client)).toEqual([{ pinId: 'PHUK-1', placeId: 'place-1', page: 5, pocket: 2, note: null, updatedAt: 't' }]);
  });

  it('clears locations by pin', async () => {
    const { client, calls } = fakeClient({ pins: () => ({ data: [{ id: 'uuid-a', pinhunt_id: 'PHUK-1' }] }) });
    await clearPinLocations(client, ['PHUK-1']);
    const del = calls.find(q => q.table === 'user_pin_locations')!;
    expect(op(del, 'delete')).toBeTruthy();
    expect(op(del, 'in')).toEqual(['in', 'pin_id', ['uuid-a']]);
  });

  it('says the feature is unavailable until migration 067 is applied', async () => {
    const { client } = fakeClient({
      collection_places: () => ({ error: { code: 'PGRST205', message: "Could not find the table 'public.collection_places'" } }),
    });
    const err = await createPlace(client, { name: 'Trade book 1', kind: 'book' }).catch(e => e);
    expect(isPinLocationsUnavailable(err)).toBe(true);
  });

  it('explains a pin that is not in the collection', async () => {
    const { client } = fakeClient({
      pins: () => ({ data: [{ id: 'uuid-a', pinhunt_id: 'PHUK-1' }] }),
      user_pin_locations: () => ({ error: { code: '23503', message: 'violates foreign key constraint' } }),
    });
    const err = await setPinLocations(client, ['PHUK-1'], { placeId: 'place-1' }).catch(e => e);
    expect(err).toBeInstanceOf(PinRepositoryError);
    expect(err.message).toMatch(/Only pins in your collection/);
  });
});
