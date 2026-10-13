import { createSupabasePinRepository } from '@workspace/pin-repository';

const ROWS = Array.from({ length: 42 }, (_, i) => ({
  id: `uuid-${String(i).padStart(2, '0')}`,
  pinhunt_id: `PHUK-${i}`,
  title: `Tinker Bell ${String(i).padStart(2, '0')}`,
  brand: 'Disney',
  collection: 'Tinker Bell',
  external_identifiers: {},
  verification_status: 'verified',
  status: 'active',
  pin_characters: [],
  pin_categories: [],
}));

/** Minimal chainable stand-in for the PostgREST builder. */
function fakeClient() {
  const calls: { select?: unknown; range?: [number, number]; limit?: number } = {};
  const builder: any = {
    select: (_cols: string, opts?: unknown) => { calls.select = opts; return builder; },
    is: () => builder,
    or: () => builder,
    order: () => builder,
    limit: (n: number) => { calls.limit = n; return builder; },
    range: (a: number, b: number) => { calls.range = [a, b]; return builder; },
    then: (resolve: (v: unknown) => void) => {
      const [from, to] = calls.range ?? [0, (calls.limit ?? ROWS.length) - 1];
      resolve({ data: ROWS.slice(from, to + 1), error: null, count: ROWS.length });
    },
  };
  return { client: { from: () => builder } as any, calls };
}

describe('searchPinsPage', () => {
  it('returns the first page with the total count', async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabasePinRepository(client);
    const { pins, total } = await repo.searchPinsPage('Tinker Bell', { limit: 30, offset: 0 });
    expect(calls.select).toEqual({ count: 'exact' });
    expect(pins).toHaveLength(30);
    expect(total).toBe(42);
  });

  it('returns the remainder at an offset with no overlap', async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabasePinRepository(client);
    const first = await repo.searchPinsPage('Tinker Bell', { limit: 30, offset: 0 });
    const second = await repo.searchPinsPage('Tinker Bell', { limit: 30, offset: 30 });
    expect(calls.range).toEqual([30, 59]);
    expect(second.pins).toHaveLength(12);
    const ids = [...first.pins, ...second.pins].map(p => p.id);
    expect(new Set(ids).size).toBe(42);
  });
});
