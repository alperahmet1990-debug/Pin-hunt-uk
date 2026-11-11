import { classifyError, DEFAULT_COOLDOWN_MS, toUserError, userErrorLine } from '../userError';
import { SCAN_NETWORK_MESSAGE, SCAN_SERVER_UNREACHABLE_MESSAGE, SCAN_TIMEOUT_MESSAGE } from '../identifyPin';

// UX-046 (#156): every failure maps to plain copy; raw text is never shown.
describe('classifyError', () => {
  it.each([
    ['fetch TypeError', new TypeError('Failed to fetch'), 'offline'],
    ['React Native network error', new TypeError('Network request failed'), 'offline'],
    ['iOS offline text', new Error('The Internet connection appears to be offline.'), 'offline'],
    ['scan network message', new Error(SCAN_NETWORK_MESSAGE), 'offline'],
    ['server unreachable while online', new Error(SCAN_SERVER_UNREACHABLE_MESSAGE), 'unreachable'],
    ['429 daily limit', Object.assign(new Error('limit'), { status: 429, capReached: true }), 'limit'],
    ['429 cooldown', Object.assign(new Error('wait'), { status: 429, retryAfterMs: 3000 }), 'limit'],
    ['413 photo too large', Object.assign(new Error('too big'), { status: 413 }), 'too_large'],
    ['abort', Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }), 'timeout'],
    ['scan timeout message', new Error(SCAN_TIMEOUT_MESSAGE), 'timeout'],
    ['504', Object.assign(new Error('Gateway Timeout'), { status: 504 }), 'timeout'],
    ['401', Object.assign(new Error('nope'), { status: 401 }), 'auth'],
    ['403', Object.assign(new Error('forbidden'), { status: 403 }), 'auth'],
    ['PostgREST JWT error object', { message: 'JWT expired', code: 'PGRST301' }, 'auth'],
    ['expired session text', new Error('Auth session missing!'), 'auth'],
    ['500 from the scan API', Object.assign(new Error('Vision API quota exceeded for project x'), { status: 500 }), 'server'],
    ['503', { message: 'Service Unavailable', status: 503 }, 'server'],
    ['bare string', 'something odd', 'unknown'],
    ['nothing', undefined, 'unknown'],
  ])('%s → %s', (_label, err, kind) => {
    expect(classifyError(err)).toBe(kind);
  });
});

describe('toUserError', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('never repeats the raw message to the collector', () => {
    const raw = 'duplicate key value violates unique constraint "user_pins_pkey"';
    const e = toUserError(new Error(raw), 'test');
    expect(e.kind).toBe('unknown');
    expect(`${e.title} ${e.message}`).not.toContain('duplicate key');
    expect(e).toEqual({ kind: 'unknown', title: 'Something went wrong', message: 'Please try again.' });
  });

  it('logs the raw error in development', () => {
    const err = new Error('boom');
    toUserError(err, 'search');
    expect(console.warn).toHaveBeenCalledWith('[search] unknown:', err);
  });

  it('gives each kind its own wording', () => {
    expect(toUserError(new TypeError('Failed to fetch')).title).toBe("You're offline");
    expect(toUserError(Object.assign(new Error('x'), { status: 401 })).title).toBe('Please sign in again');
    expect(userErrorLine(Object.assign(new Error('x'), { status: 500 }))).toBe("Something went wrong on our side. It's not you. Please try again in a moment.");
  });
});

// WP3: the scan API's limit, cooldown and too-large answers (429, 413).
describe('scan limits', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  const DAILY = "You've reached today's limit for photo identification. You can still add the pin without it.";
  const COOLDOWN = 'One moment — please wait a few seconds between scans.';
  const TOO_LARGE = 'Photo is too large — please retake it.';

  it("today's limit: the server's words, and no retry", () => {
    const e = toUserError(Object.assign(new Error(DAILY), { status: 429, capReached: true }));
    expect(e).toEqual({ kind: 'limit', title: "You've reached today's scan limit", message: DAILY, retry: false });
  });

  it('cooldown: its own message, with a retry only after the time left', () => {
    const e = toUserError(Object.assign(new Error(COOLDOWN), { status: 429, retryAfterMs: 3000 }));
    expect(e).toEqual({ kind: 'limit', title: 'Ready again in a few seconds', message: COOLDOWN, retry: 3000 });
  });

  it('cooldown without a time left waits the default 5 s', () => {
    expect(toUserError(Object.assign(new Error(COOLDOWN), { status: 429 })).retry).toBe(DEFAULT_COOLDOWN_MS);
    expect(DEFAULT_COOLDOWN_MS).toBe(5000);
  });

  it('photo too large: its own message, no retry with the same photo', () => {
    const e = toUserError(Object.assign(new Error(TOO_LARGE), { status: 413 }));
    expect(e).toEqual({ kind: 'too_large', title: 'That photo is too large', message: TOO_LARGE, retry: false });
  });

  it('falls back to plain copy when the server sent nothing usable', () => {
    expect(toUserError(Object.assign(new Error('Identification failed'), { status: 413 })).message)
      .toBe('Please retake it, a little further from the pin.');
    expect(toUserError(Object.assign(new Error(''), { status: 429, capReached: true })).message)
      .toBe('You can still find the pin by searching and add it without a scan.');
    expect(toUserError(Object.assign(new Error('{"error":"x"}'), { status: 429, retryAfterMs: 1000 })).message)
      .toBe('Please wait a few seconds between scans.');
  });

  it("a server outage isn't described as the collector being offline", () => {
    const e = toUserError(new Error(SCAN_SERVER_UNREACHABLE_MESSAGE));
    expect(e.kind).toBe('unreachable');
    expect(e.title).toBe("PinHunt can't reach its server right now");
    expect(`${e.title} ${e.message}`).not.toMatch(/offline/i);
  });

  it('other failures keep retrying straight away', () => {
    expect(toUserError(new TypeError('Failed to fetch')).retry).toBeUndefined();
    expect(toUserError(Object.assign(new Error('x'), { status: 500 })).retry).toBeUndefined();
  });
});
