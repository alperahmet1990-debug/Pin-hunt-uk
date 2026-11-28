import { createSupabaseUserRepository } from '@workspace/pin-repository';

// catalogue_coverage_page with p_sort needs migration 088. Without it the page
// comes back in set order and says so, so Home never shows set order as "new".
const dbRow = (id: string) => ({ pinhunt_id: id, title: id, set_name: 'Set', image_source: null, pending_count: 0, total: 1 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeClient = (rpc: jest.Mock) => ({ rpc }) as any;

describe('getCatalogueCoveragePage sort', () => {
  it('sends p_sort=newest when 088 is there', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [dbRow('PHUK-10000009')], error: null });
    const repo = createSupabaseUserRepository(fakeClient(rpc));
    const page = await repo.getCatalogueCoveragePage({ filter: 'needs', sort: 'newest', offset: 0, limit: 12 });
    expect(rpc).toHaveBeenCalledWith('catalogue_coverage_page', expect.objectContaining({ p_sort: 'newest', p_filter: 'needs', p_limit: 12 }));
    expect(page).toEqual(expect.objectContaining({ sort: 'newest', total: 1 }));
    expect(page.rows[0].pinhuntId).toBe('PHUK-10000009');
  });

  it('falls back to set order (once) when the database has no p_sort', async () => {
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'no function' } })
      .mockResolvedValue({ data: [dbRow('PHUK-10000001')], error: null });
    const repo = createSupabaseUserRepository(fakeClient(rpc));
    const first = await repo.getCatalogueCoveragePage({ sort: 'newest', offset: 0, limit: 12 });
    expect(first.sort).toBe('set');
    expect(rpc.mock.calls[1][1]).not.toHaveProperty('p_sort');
    await repo.getCatalogueCoveragePage({ sort: 'newest', offset: 0, limit: 12 });
    expect(rpc).toHaveBeenCalledTimes(3); // no second try with p_sort
    expect(rpc.mock.calls[2][1]).not.toHaveProperty('p_sort');
  });

  it('never sends p_sort for set order, so older databases are unaffected', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
    const repo = createSupabaseUserRepository(fakeClient(rpc));
    const page = await repo.getCatalogueCoveragePage({ offset: 0, limit: 5 });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_sort');
    expect(page).toEqual({ rows: [], total: 0, sort: 'set' });
  });
});
