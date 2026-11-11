import {
  confirmMyAge,
  confirmMyAgeFromSignup,
  createSupabaseUserRepository,
  getMyAgeStatus,
  type AgeConfirmationClient,
} from '@workspace/pin-repository';

// LP-8 (#530) / LP-9 (#531): every age call goes through a migration 072 function.

type Call = { fn: string; args?: Record<string, unknown> };

function fakeClient(reply: (call: Call) => { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const client: AgeConfirmationClient = {
    rpc(fn, args) {
      const call = { fn, args };
      calls.push(call);
      const r = reply(call);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
  return { client, calls };
}

const missing = { code: 'PGRST202', message: 'Could not find the function public.get_my_age_status' };

describe('getMyAgeStatus', () => {
  it('returns the server status', async () => {
    for (const status of ['confirmed', 'declined', 'unconfirmed']) {
      const { client } = fakeClient(() => ({ data: status }));
      await expect(getMyAgeStatus(client)).resolves.toBe(status);
    }
  });
  it('is unavailable before migration 072, so nobody is locked out', async () => {
    const { client } = fakeClient(() => ({ error: missing }));
    await expect(getMyAgeStatus(client)).resolves.toBe('unavailable');
  });
  it('throws on other errors instead of guessing', async () => {
    const { client } = fakeClient(() => ({ error: { code: '08006', message: 'network' } }));
    await expect(getMyAgeStatus(client)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});

describe('confirmMyAge', () => {
  it('sends only the ISO date and returns the result', async () => {
    const { client, calls } = fakeClient(() => ({ data: 'confirmed' }));
    await expect(confirmMyAge(client, '1990-05-01')).resolves.toBe('confirmed');
    expect(calls).toEqual([{ fn: 'confirm_my_age', args: { p_birth_date: '1990-05-01' } }]);
  });
  it('refuses a malformed date before calling the server', async () => {
    const { client, calls } = fakeClient(() => ({}));
    await expect(confirmMyAge(client, '1/5/1990')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(calls).toHaveLength(0);
  });
  it('explains a declined account and an invalid date', async () => {
    const declined = fakeClient(() => ({ error: { code: '42501', message: 'age declined' } }));
    await expect(confirmMyAge(declined.client, '1990-05-01')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Sorry, PinHunt is for collectors aged 18 and over.',
    });
    const invalid = fakeClient(() => ({ error: { code: '22023', message: 'invalid birth date' } }));
    await expect(confirmMyAge(invalid.client, '1990-05-01')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('confirmMyAgeFromSignup', () => {
  it('calls the sign-up function with no arguments', async () => {
    const { client, calls } = fakeClient(() => ({ data: 'confirmed' }));
    await expect(confirmMyAgeFromSignup(client)).resolves.toBe('confirmed');
    expect(calls).toEqual([{ fn: 'confirm_my_age_from_signup', args: undefined }]);
  });
});

describe('setAgeDeclined (admins, LP-9)', () => {
  it('closes and undoes through the admin function', async () => {
    const { client, calls } = fakeClient(() => ({}));
    const repo = createSupabaseUserRepository(client as never);
    await repo.setAgeDeclined('u1', true);
    await repo.setAgeDeclined('u1', false);
    expect(calls).toEqual([
      { fn: 'admin_set_age_declined', args: { p_user_id: 'u1', p_declined: true } },
      { fn: 'admin_set_age_declined', args: { p_user_id: 'u1', p_declined: false } },
    ]);
  });
  it('explains protected accounts', async () => {
    const { client } = fakeClient(() => ({ error: { code: '42501', message: 'not allowed for this account' } }));
    await expect(createSupabaseUserRepository(client as never).setAgeDeclined('u1', true)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
