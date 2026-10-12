import { identifyPin, SCAN_TIMEOUT_MESSAGE, SCAN_TIMEOUT_MS } from '../identifyPin';

describe('identifyPin', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it('aborts a hung request at 35 s with a friendly error', async () => {
    let signal: AbortSignal | undefined;
    globalThis.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;

    const promise = identifyPin('abc', 'image/jpeg');
    const assertion = expect(promise).rejects.toThrow(SCAN_TIMEOUT_MESSAGE);

    jest.advanceTimersByTime(SCAN_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal?.aborted).toBe(true);
    await assertion;
  });

  it('returns matches and clears the timer on success', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [{ pinId: 'p1', confidence: 90, reasoning: 'r' }] }),
    }) as unknown as typeof fetch;

    const result = await identifyPin('abc', 'image/jpeg', 'tok');
    expect(result.matches).toHaveLength(1);
    expect(result.imageInsights).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('surfaces the server error message for non-ok responses', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Scan limit reached' }),
    }) as unknown as typeof fetch;

    await expect(identifyPin('abc', 'image/jpeg')).rejects.toThrow('Scan limit reached');
  });
});
