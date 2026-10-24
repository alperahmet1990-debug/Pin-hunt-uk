import { isDeleteConfirmed, requestAccountDeletion } from '../deleteAccount';

describe('isDeleteConfirmed', () => {
  it('requires DELETE exactly', () => {
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed('delete')).toBe(false);
    expect(isDeleteConfirmed('DELET')).toBe(false);
    expect(isDeleteConfirmed('DELETE')).toBe(true);
    expect(isDeleteConfirmed(' DELETE ')).toBe(true);
  });
});

describe('requestAccountDeletion', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const mockStatus = (status: number) => {
    globalThis.fetch = jest.fn().mockResolvedValue({ status }) as unknown as typeof fetch;
  };

  it('sends DELETE with the bearer token', async () => {
    mockStatus(200);
    await requestAccountDeletion('tok');
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/account$/);
    expect(init).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer tok' } });
  });

  it.each([
    [200, 'deleted'],
    [401, 'unauthorized'],
    [409, 'not_allowed'],
    [500, 'retry'],
    [503, 'retry'],
  ])('maps %i to %s', async (status, outcome) => {
    mockStatus(status);
    expect(await requestAccountDeletion('tok')).toBe(outcome);
  });

  it('retries on network failure and skips the call without a token', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    expect(await requestAccountDeletion('tok')).toBe('retry');
    (globalThis.fetch as jest.Mock).mockClear();
    expect(await requestAccountDeletion(undefined)).toBe('unauthorized');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
