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

type Calls = {
  select?: unknown;
  range?: [number, number];
  limit?: number;
  rpc: Array<{ fn: string; args: unknown; opts: unknown }>;
  from: number;
  ors: string[];
  eqs: Array<[string, unknown]>;
};

/** Minimal chainable stand-in for the PostgREST builder (table and rpc). */
function fakeClient({ rpcMissing = false } = {}) {
  const calls: Calls = { rpc: [], from: 0, ors: [], eqs: [] };
  let viaRpc = false;
  const builder: any = {
    select: (_cols: string, opts?: unknown) => { calls.select = opts; return builder; },
    is: () => builder,
    or: (expr: string) => { calls.ors.push(expr); return builder; },
    eq: (col: string, v: unknown) => { calls.eqs.push([col, v]); return builder; },
    order: () => builder,
    limit: (n: number) => { calls.limit = n; return builder; },
    range: (a: number, b: number) => { calls.range = [a, b]; return builder; },
    then: (resolve: (v: unknown) => void) => {
      if (viaRpc && rpcMissing) {
        resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, count: null });
        return;
      }
      const [from, to] = calls.range ?? [0, (calls.limit ?? ROWS.length) - 1];
      resolve({ data: ROWS.slice(from, to + 1), error: null, count: ROWS.length });
    },
  };
  const client = {
    from: () => { calls.from++; viaRpc = false; return builder; },
    rpc: (fn: string, args: unknown, opts: unknown) => { calls.rpc.push({ fn, args, opts }); viaRpc = true; return builder; },
  } as any;
  return { client, calls };
}

describe('searchPinsPage', () => {
  it('returns the first page with the total count', async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabasePinRepository(client);
    const { pins, total } = await repo.searchPinsPage('Tinker Bell', { limit: 30, offset: 0 });
    expect(calls.rpc[0].opts).toEqual({ count: 'exact' });
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

describe('search via search_catalogue_pins (migration 076)', () => {
  it('sends the words to the function instead of ilike filters on the table', async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabasePinRepository(client);
    await repo.searchPins('Haunted (Mansion), 2026', { status: 'active', limit: 80 });
    expect(calls.rpc).toEqual([{ fn: 'search_catalogue_pins', args: { p_tokens: ['Haunted', 'Mansion', '2026'], p_character: null }, opts: undefined }]);
    expect(calls.ors.some(o => o.includes('title.ilike'))).toBe(false);
    expect(calls.eqs).toContainEqual(['status', 'active']); // other filters still apply on top
  });

  it('passes the character filter to the function', async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabasePinRepository(client);
    await repo.searchPins('', { character: ' Stitch ', limit: 120 });
    expect(calls.rpc[0].args).toEqual({ p_tokens: [], p_character: 'Stitch' });
  });

  it('uses the table, not the function, when there is nothing to match on', async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabasePinRepository(client);
    await repo.searchPins('', { collection: 'Tinker Bell' });
    expect(calls.rpc).toHaveLength(0);
    expect(calls.eqs).toContainEqual(['collection', 'Tinker Bell']);
  });

  it('falls back to the table query when the function is missing, and stops trying it', async () => {
    const { client, calls } = fakeClient({ rpcMissing: true });
    const repo = createSupabasePinRepository(client);
    const { pins, total } = await repo.searchPinsPage('Tinker Bell', { limit: 30, offset: 0 });
    expect(pins).toHaveLength(30);
    expect(total).toBe(42);
    expect(calls.ors.filter(o => o.includes('title.ilike'))).toHaveLength(2); // one per word
    await repo.searchPins('Bell');
    expect(calls.rpc).toHaveLength(1);
  });
});
