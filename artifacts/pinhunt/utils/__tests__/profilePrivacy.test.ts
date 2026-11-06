import { createSupabaseUserRepository } from '@workspace/pin-repository';

const row = { id: 'u1', username: 'alex', updated_at: '', created_at: '' };

/** A fake Supabase client that records every profile column list and write. */
function setup(postcode: { data: unknown; error: unknown }) {
  const selects: string[] = [];
  const upserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const query = {
    select: (columns: string) => { selects.push(columns); return query; },
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
    single: async () => ({ data: row, error: null }),
    upsert: (values: Record<string, unknown>) => { upserts.push(values); return query; },
    update: (values: Record<string, unknown>) => {
      updates.push(values);
      return { eq: async () => ({ error: null }) };
    },
  };
  const client = { from: () => query, rpc: jest.fn().mockResolvedValue(postcode) };
  return { selects, upserts, updates, client, repo: createSupabaseUserRepository(client as never) };
}

describe('profile privacy', () => {
  it('never asks for postcode or coordinates in a profile read', async () => {
    const { selects, repo } = setup({ data: null, error: null });
    await repo.getProfile('u2');
    await repo.getMyProfile('u1');
    expect(selects.length).toBeGreaterThan(0);
    for (const columns of selects) expect(columns).not.toMatch(/postcode|approx_/);
  });

  it('reads your own postcode through the function', async () => {
    const { client, repo } = setup({ data: 'AA1 1AA', error: null });
    expect((await repo.getMyProfile('u1'))?.postcode).toBe('AA1 1AA');
    expect(client.rpc).toHaveBeenCalledWith('get_my_postcode');
  });

  it('still returns your profile if the postcode can’t be read', async () => {
    const { repo } = setup({ data: null, error: { message: 'not found' } });
    const profile = await repo.getMyProfile('u1');
    expect(profile?.username).toBe('alex');
    expect(profile?.postcode).toBeUndefined();
  });

  it('does not ask for another collector’s postcode', async () => {
    const { client, repo } = setup({ data: 'AA1 1AA', error: null });
    await repo.getProfile('u2');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('never writes postcode or coordinates from the app', async () => {
    const { upserts, updates, repo } = setup({ data: 'AA1 1AA', error: null });
    await repo.updateMyProfile('u1', { bio: 'Hi' });
    expect(Object.keys(upserts[0])).toEqual(expect.not.arrayContaining(['postcode', 'approx_lat', 'approx_lng']));
    expect(updates).toEqual([]);
  });
});
