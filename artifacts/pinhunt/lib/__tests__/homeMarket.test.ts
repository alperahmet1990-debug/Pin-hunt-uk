import { createSupabaseUserRepository, homeMarketFromCountry } from '@workspace/pin-repository';

// HM-01 (#561): profiles.home_market (migration 068), with a sensible
// answer before 068 is applied.

type Result = { data?: unknown; error?: { code?: string; message: string } | null };

/** Each query takes the next queued result; records columns asked for and rows written. */
function fakeClient(results: Result[]) {
  const calls: { op: string; columns?: string; row?: Record<string, unknown> }[] = [];
  const client = {
    from() {
      const call: { op: string; columns?: string; row?: Record<string, unknown> } = { op: 'select' };
      calls.push(call);
      const builder: Record<string, unknown> = {
        select: (columns: string) => { call.columns = columns; return builder; },
        upsert: (row: Record<string, unknown>) => { call.op = 'upsert'; call.row = row; return builder; },
        eq: () => builder,
        maybeSingle: () => builder,
        single: () => builder,
        then: (resolve: (r: Result) => unknown) => {
          const r = results.shift() ?? {};
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(resolve);
        },
      };
      return builder;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  return { repo: createSupabaseUserRepository(client as never), calls };
}

const row = (extra: object = {}) => ({ id: 'u1', username: 'alper', created_at: 'x', updated_at: 'x', ...extra });
const missing = { code: '42703', message: 'column profiles.home_market does not exist' };

describe('home market (HM-01)', () => {
  it('works out the market from a country', () => {
    expect(homeMarketFromCountry('United States')).toBe('US');
    expect(homeMarketFromCountry(' usa ')).toBe('US');
    expect(homeMarketFromCountry('United Kingdom')).toBe('UK');
    expect(homeMarketFromCountry(undefined)).toBe('UK');
  });

  it('reads home_market once 068 is applied', async () => {
    const { repo, calls } = fakeClient([{ data: row({ home_market: 'US', country: 'United Kingdom' }) }]);
    const p = await repo.getProfile('u1');
    expect(p?.homeMarket).toBe('US');
    expect(calls[0].columns).toContain('home_market');
  });

  it('before 068: retries without the column and uses the country', async () => {
    const { repo, calls } = fakeClient([{ error: missing }, { data: row({ country: 'United States', town: 'Austin' }) }]);
    const p = await repo.getProfile('u1');
    expect(p?.homeMarket).toBe('US');
    expect(p?.town).toBe('Austin'); // the discovery fields are kept
    expect(calls[1].columns).not.toContain('home_market');
  });

  it('saves the home market', async () => {
    const { repo, calls } = fakeClient([{ data: row({ home_market: 'US' }) }]);
    const p = await repo.updateMyProfile('u1', { homeMarket: 'US' });
    expect(calls[0].row).toMatchObject({ id: 'u1', home_market: 'US' });
    expect(p.homeMarket).toBe('US');
  });

  it('before 068: saving a market says it isn’t available, other saves still work', async () => {
    const a = fakeClient([{ error: missing }]);
    await expect(a.repo.updateMyProfile('u1', { homeMarket: 'US' })).rejects.toThrow(/isn’t available yet/);
    const b = fakeClient([{ error: missing }, { data: row({ bio: 'hi' }) }]);
    await expect(b.repo.updateMyProfile('u1', { bio: 'hi' })).resolves.toMatchObject({ bio: 'hi', homeMarket: 'UK' });
  });
});
