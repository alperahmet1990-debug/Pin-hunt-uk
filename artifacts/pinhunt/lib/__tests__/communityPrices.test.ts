import {
  createSupabaseUserRepository,
  getCommunityPrices,
  isCommunityPricesUnavailable,
  PinRepositoryError,
  type CommunityPricesClient,
} from '@workspace/pin-repository';

// CV-02 (#513): collector prices and community prices go through the
// migration 065 functions, and only totals come back.

type Call = { fn: string; args?: Record<string, unknown> };

function fakeClient(reply: (call: Call) => { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const client: CommunityPricesClient = {
    rpc(fn, args) {
      const call = { fn, args };
      calls.push(call);
      const r = reply(call);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
  return { client, calls };
}

const repoWith = (client: CommunityPricesClient) => createSupabaseUserRepository(client as never);

describe('collector prices (CV-02)', () => {
  it('saves a price with the pin id, currency and a two-decimal amount', async () => {
    const { client, calls } = fakeClient(() => ({}));
    await repoWith(client).setMyPinPrice('PHUK-1', 'GBP', 12.499);
    expect(calls).toEqual([{ fn: 'set_my_pin_price', args: { p_pinhunt_id: 'PHUK-1', p_currency: 'GBP', p_amount: 12.5 } }]);
  });

  it('refuses zero, negative and silly amounts before calling the server', async () => {
    const { client, calls } = fakeClient(() => ({}));
    for (const amount of [0, -3, Number.NaN, 100001]) {
      await expect(repoWith(client).setMyPinPrice('PHUK-1', 'GBP', amount)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
    expect(calls).toHaveLength(0);
  });

  it('explains a pin that is not owned or For Trade', async () => {
    const { client } = fakeClient(() => ({ error: { code: 'P0001', message: 'pin not in your collection' } }));
    await expect(repoWith(client).setMyPinPrice('PHUK-1', 'USD', 5)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'You can only price pins in your collection or For Trade.',
    });
  });

  it('clears one currency', async () => {
    const { client, calls } = fakeClient(() => ({}));
    await repoWith(client).clearMyPinPrice('PHUK-1', 'USD');
    expect(calls[0]).toEqual({ fn: 'clear_my_pin_price', args: { p_pinhunt_id: 'PHUK-1', p_currency: 'USD' } });
  });

  it('reads my own prices and drops malformed rows', async () => {
    const { client } = fakeClient(() => ({
      data: [
        { pinhunt_id: 'PHUK-1', currency: 'GBP', amount: '12.50', updated_at: '2026-11-08T10:00:00Z' },
        { pinhunt_id: 'PHUK-2', currency: 'EUR', amount: 3, updated_at: '2026-11-08T10:00:00Z' },
      ],
    }));
    await expect(repoWith(client).getMyPinPrices(['PHUK-1', 'PHUK-2'])).resolves.toEqual([
      { pinId: 'PHUK-1', currency: 'GBP', amount: 12.5, updatedAt: '2026-11-08T10:00:00Z' },
    ]);
  });
});

describe('community prices (CV-02)', () => {
  const early = { pinhunt_id: 'PHUK-1', collector_count: 2, median: '13.50', low: 12, high: 15, entries: ['12', '15'], step: 'early' };
  const confident = { pinhunt_id: 'PHUK-2', collector_count: 11, median: 14, low: 12, high: 16, entries: null, step: 'confident' };

  it('maps early and confident prices; entries only for an early price', async () => {
    const { client, calls } = fakeClient(() => ({ data: [early, confident] }));
    const prices = await repoWith(client).getCommunityPrices(['PHUK-1', 'PHUK-2', 'PHUK-3'], 'GBP');
    expect(calls[0]).toEqual({ fn: 'get_community_prices', args: { p_pinhunt_ids: ['PHUK-1', 'PHUK-2', 'PHUK-3'], p_currency: 'GBP' } });
    expect(prices).toEqual([
      { pinId: 'PHUK-1', currency: 'GBP', collectorCount: 2, median: 13.5, low: 12, high: 15, entries: [12, 15], step: 'early' },
      { pinId: 'PHUK-2', currency: 'GBP', collectorCount: 11, median: 14, low: 12, high: 16, step: 'confident' },
    ]);
  });

  it('returns null for a pin nobody has priced', async () => {
    const { client } = fakeClient(() => ({ data: [] }));
    await expect(repoWith(client).getCommunityPrice('PHUK-9', 'USD')).resolves.toBeNull();
  });

  it('asks in batches of 1000 and never repeats a pin', async () => {
    const ids = Array.from({ length: 2300 }, (_, i) => `PHUK-${i}`);
    const { client, calls } = fakeClient(() => ({ data: [] }));
    await getCommunityPrices(client, [...ids, 'PHUK-1'], 'GBP');
    expect(calls.map(c => (c.args?.p_pinhunt_ids as string[]).length)).toEqual([1000, 1000, 300]);
  });

  it('says plainly when migration 065 is not applied yet', async () => {
    const { client } = fakeClient(() => ({ error: { code: 'PGRST202', message: 'Could not find the function public.get_community_prices' } }));
    const err = await repoWith(client).getCommunityPrices(['PHUK-1'], 'GBP').catch(e => e);
    expect(err).toBeInstanceOf(PinRepositoryError);
    expect(isCommunityPricesUnavailable(err)).toBe(true);
  });

  it('other failures are not mistaken for "not available"', async () => {
    const { client } = fakeClient(() => ({ error: { code: '500', message: 'boom' } }));
    const err = await repoWith(client).getCommunityPrices(['PHUK-1'], 'GBP').catch(e => e);
    expect(err).toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(isCommunityPricesUnavailable(err)).toBe(false);
  });

  it('the privacy setting is on unless turned off, and saves', async () => {
    const replies = [{ data: null }, { data: false }, {}];
    const { client, calls } = fakeClient(() => replies.shift() ?? {});
    const repo = repoWith(client);
    await expect(repo.getMyCommunityPriceSetting()).resolves.toBe(true);
    await expect(repo.getMyCommunityPriceSetting()).resolves.toBe(false);
    await repo.setMyCommunityPriceSetting(false);
    expect(calls[2]).toEqual({ fn: 'set_my_community_price_setting', args: { p_include: false } });
  });
});

describe('demo community prices (CV-02)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createDemoCommunityPrices, summarise } = require('../../mock-data/communityPrices');

  it('follows the server rules: median, confident from 3, entries for 1–2, outliers from 5', () => {
    expect(summarise('x', 'GBP', [15, 12])).toMatchObject({ collectorCount: 2, median: 13.5, entries: [12, 15], step: 'early' });
    expect(summarise('x', 'GBP', [20, 22, 30])).toMatchObject({ collectorCount: 3, median: 22, low: 20, high: 30, step: 'confident' });
    expect(summarise('x', 'GBP', [20, 22, 30]).entries).toBeUndefined();
    expect(summarise('x', 'GBP', [10, 11, 12, 13, 14, 200])).toMatchObject({ collectorCount: 5, median: 12 });
    expect(summarise('x', 'GBP', [])).toBeNull();
  });

  it('seeds every state and counts the demo collector\'s own price', async () => {
    const demo = createDemoCommunityPrices();
    const steps = Object.fromEntries((await demo.getCommunityPrices(['dp-001', 'dp-002', 'dp-003', 'dp-004'], 'GBP'))
      .map((p: { pinId: string; step: string; collectorCount: number }) => [p.pinId, `${p.step}:${p.collectorCount}`]));
    expect(steps).toEqual({ 'dp-001': 'confident:11', 'dp-002': 'early:2', 'dp-003': 'early:1' });

    await demo.setMyPinPrice('dp-004', 'GBP', 7);
    expect(await demo.getCommunityPrice('dp-004', 'GBP')).toMatchObject({ collectorCount: 1, entries: [7] });
    await demo.setMyCommunityPriceSetting(false);
    expect(await demo.getCommunityPrice('dp-004', 'GBP')).toBeNull();
    expect(await demo.getMyPinPrices(['dp-004'])).toHaveLength(1);
  });
});
