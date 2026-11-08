import { createSupabaseUserRepository, PinRepositoryError } from '@workspace/pin-repository';

// #503: account suspensions use user_suspensions (migration 050). RLS decides
// who may suspend whom; these methods turn its refusals into plain errors.

type Result = { data?: unknown; error?: { code?: string; message: string } | null };

function fakeClient(result: Result) {
  const calls: { table: string; op: string; args?: unknown; filters: [string, unknown][] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, op: '', args: undefined as unknown, filters: [] as [string, unknown][] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        select: (cols: string) => { if (!call.op) call.op = 'select'; call.args ??= cols; return builder; },
        insert: (row: unknown) => { call.op = 'insert'; call.args = row; return builder; },
        delete: () => { call.op = 'delete'; return builder; },
        eq: (col: string, v: unknown) => { call.filters.push([col, v]); return builder; },
        order: () => builder,
        then: (resolve: (r: Result) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve),
      };
      return builder;
    },
  };
  return { repo: createSupabaseUserRepository(client as never), calls };
}

describe('suspensions repository (#503)', () => {
  it('lists suspensions', async () => {
    const { repo } = fakeClient({ data: [{ user_id: 'u2', suspended_by: null, reason: 'Spam', created_at: '2026-11-08T10:00:00Z' }] });
    await expect(repo.getSuspensions()).resolves.toEqual([
      { userId: 'u2', suspendedBy: undefined, reason: 'Spam', createdAt: '2026-11-08T10:00:00Z' },
    ]);
  });

  it('suspends with the admin as suspended_by and a trimmed reason', async () => {
    const { repo, calls } = fakeClient({});
    await repo.suspendUser('admin', 'u2', '  Spam  ');
    expect(calls[0]).toMatchObject({ table: 'user_suspensions', op: 'insert', args: { user_id: 'u2', suspended_by: 'admin', reason: 'Spam' } });
  });

  it('an empty reason is stored as none', async () => {
    const { repo, calls } = fakeClient({});
    await repo.suspendUser('admin', 'u2', '   ');
    expect(calls[0].args).toMatchObject({ reason: null });
  });

  it('refuses yourself and over-long reasons before calling the server', async () => {
    const { repo, calls } = fakeClient({});
    await expect(repo.suspendUser('admin', 'admin')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(repo.suspendUser('admin', 'u2', 'x'.repeat(501))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(calls).toHaveLength(0);
  });

  it('already suspended is not an error', async () => {
    const { repo } = fakeClient({ error: { code: '23505', message: 'duplicate key' } });
    await expect(repo.suspendUser('admin', 'u2')).resolves.toBeUndefined();
  });

  it('an RLS refusal explains the rule', async () => {
    const { repo } = fakeClient({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    const err = await repo.suspendUser('admin', 'u2').catch(e => e);
    expect(err).toBeInstanceOf(PinRepositoryError);
    expect(err.message).toMatch(/Only the App Creator can suspend an admin/);
  });

  it('lifts by user id and checks a row was removed', async () => {
    const { repo, calls } = fakeClient({ data: [{ user_id: 'u2' }] });
    await repo.liftSuspension('u2');
    expect(calls[0]).toMatchObject({ table: 'user_suspensions', op: 'delete', filters: [['user_id', 'u2']] });
  });

  it('a lift RLS hides (nothing removed) says so', async () => {
    const { repo } = fakeClient({ data: [] });
    await expect(repo.liftSuspension('me')).rejects.toThrow(/only the App Creator can lift that/);
  });
});
