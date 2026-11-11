import {
  identifyPin,
  recordScanOutcome,
  SCAN_NETWORK_MESSAGE,
  SCAN_SERVER_UNREACHABLE_MESSAGE,
  SCAN_TIMEOUT_MESSAGE,
  SCAN_TIMEOUT_MS,
} from '../identifyPin';

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

  it('replaces the raw network error with a friendly message', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    await expect(identifyPin('abc', 'image/jpeg')).rejects.toThrow(SCAN_NETWORK_MESSAGE);
    expect(jest.getTimerCount()).toBe(0);
  });

  const refuse = (status: number, body: object, headers: Record<string, string> = {}) =>
    jest.fn().mockResolvedValue({
      ok: false,
      status,
      headers: { get: (h: string) => headers[h] ?? null },
      json: async () => body,
    }) as unknown as typeof fetch;

  it('marks the daily limit (429 + capReached) so no retry is offered', async () => {
    globalThis.fetch = refuse(429, { error: "You've reached today's limit for photo identification.", capReached: true });
    await expect(identifyPin('abc', 'image/jpeg')).rejects.toMatchObject({ status: 429, capReached: true });
  });

  it('carries the cooldown time left, from the body or the Retry-After header', async () => {
    globalThis.fetch = refuse(429, { error: 'One moment', retryAfterSeconds: 3 });
    await expect(identifyPin('abc', 'image/jpeg')).rejects.toMatchObject({ status: 429, retryAfterMs: 3000 });
    globalThis.fetch = refuse(429, { error: 'One moment' }, { 'Retry-After': '4' });
    await expect(identifyPin('abc', 'image/jpeg')).rejects.toMatchObject({ status: 429, retryAfterMs: 4000 });
  });

  it('keeps the 413 status for a photo that is too large', async () => {
    globalThis.fetch = refuse(413, { error: 'Photo is too large — please retake it.' });
    await expect(identifyPin('abc', 'image/jpeg')).rejects.toMatchObject({ status: 413, message: 'Photo is too large — please retake it.' });
  });

  describe('server unreachable vs offline', () => {
    const realUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    beforeEach(() => { process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://db.example.test'; });
    afterEach(() => {
      if (realUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      else process.env.EXPO_PUBLIC_SUPABASE_URL = realUrl;
    });

    it("says PinHunt can't reach its server when the device is otherwise online", async () => {
      const fetchMock = jest.fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({ ok: false, status: 401 });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      await expect(identifyPin('abc', 'image/jpeg')).rejects.toThrow(SCAN_SERVER_UNREACHABLE_MESSAGE);
      expect(fetchMock).toHaveBeenLastCalledWith('https://db.example.test/auth/v1/health', expect.anything());
      expect(jest.getTimerCount()).toBe(0);
    });

    it('still says offline when the device reaches nothing', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
      await expect(identifyPin('abc', 'image/jpeg')).rejects.toThrow(SCAN_NETWORK_MESSAGE);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
  it('passes the scan id through, or null when an older server sends none', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [], scanId: 'abc-123' }),
    }) as unknown as typeof fetch;
    expect((await identifyPin('abc', 'image/jpeg')).scanId).toBe('abc-123');
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) }) as unknown as typeof fetch;
    expect((await identifyPin('abc', 'image/jpeg')).scanId).toBeNull();
  });
});

// #113: fire-and-forget; never throws, sends nothing without a scan id or token.
describe('recordScanOutcome', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('posts the scan id and the chosen pin (or null)', () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    recordScanOutcome('scan-1', null, 'tok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/scan\/outcome$/);
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ scanId: 'scan-1', chosenPinId: null });
  });

  it('sends nothing without a scan id or a session', () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    recordScanOutcome(null, 'p1', 'tok');
    recordScanOutcome('scan-1', 'p1', undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed request doesn't throw", async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;
    expect(() => recordScanOutcome('scan-1', 'p1', 'tok')).not.toThrow();
    await new Promise<void>(r => setImmediate(() => r()));
    jest.restoreAllMocks();
  });
});
