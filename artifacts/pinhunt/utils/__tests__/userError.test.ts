import { classifyError, toUserError, userErrorLine } from '../userError';
import { SCAN_NETWORK_MESSAGE, SCAN_TIMEOUT_MESSAGE } from '../identifyPin';

// UX-046 (#156): every failure maps to plain copy; raw text is never shown.
describe('classifyError', () => {
  it.each([
    ['fetch TypeError', new TypeError('Failed to fetch'), 'offline'],
    ['React Native network error', new TypeError('Network request failed'), 'offline'],
    ['iOS offline text', new Error('The Internet connection appears to be offline.'), 'offline'],
    ['scan network message', new Error(SCAN_NETWORK_MESSAGE), 'offline'],
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
