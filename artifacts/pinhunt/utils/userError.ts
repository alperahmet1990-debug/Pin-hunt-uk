/**
 * Plain-English errors for collectors (UX-046, #156). Raw exception text —
 * server messages, Supabase codes, "TypeError: Failed to fetch" — is logged
 * in development, never shown. Every failure maps to a kind with fixed copy,
 * so screens say the same thing for the same problem. The one exception is
 * the scan API's own limit and too-large answers (429, 413), whose words are
 * written for collectors; they're shown, with fixed copy as the fallback.
 */
import { SCAN_NETWORK_MESSAGE, SCAN_SERVER_UNREACHABLE_MESSAGE, SCAN_TIMEOUT_MESSAGE } from './identifyPin';

export type UserErrorKind =
  | 'offline'
  | 'unreachable'
  | 'timeout'
  | 'auth'
  | 'limit'
  | 'too_large'
  | 'server'
  | 'unknown';

export interface UserError {
  kind: UserErrorKind;
  title: string;
  message: string;
  /**
   * When trying again can help. Absent: straight away. `false`: not with
   * this photo or not today (daily limit, photo too large), so screens
   * offer no "Try again". A number: after that many ms (scan cooldown).
   */
  retry?: false | number;
}

/** The scan cooldown if the server doesn't say how long is left. */
export const DEFAULT_COOLDOWN_MS = 5_000;

const COPY: Record<UserErrorKind, { title: string; message: string }> = {
  offline: { title: "You're offline", message: 'Check your connection and try again.' },
  unreachable: { title: "PinHunt can't reach its server right now", message: "It's not your connection. Please try again in a few minutes." },
  limit: { title: "You've reached today's scan limit", message: 'You can still find the pin by searching and add it without a scan.' },
  too_large: { title: 'That photo is too large', message: 'Please retake it, a little further from the pin.' },
  timeout: { title: 'That took too long', message: "PinHunt didn't hear back in time. Please try again." },
  auth: { title: 'Please sign in again', message: 'Your session has ended. Sign in again to carry on.' },
  server: { title: 'Something went wrong on our side', message: "It's not you. Please try again in a moment." },
  unknown: { title: 'Something went wrong', message: 'Please try again.' },
};

/** Status, code and text from an Error, a Supabase/PostgREST error object or a string. */
interface Details {
  status?: number;
  code?: string;
  text: string;
  name?: string;
  capReached?: boolean;
  retryAfterMs?: number;
}

function details(err: unknown): Details {
  if (typeof err === 'string') return { text: err };
  if (err && typeof err === 'object') {
    const e = err as {
      status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown; name?: unknown;
      capReached?: unknown; retryAfterMs?: unknown;
    };
    const status = Number(e.status ?? e.statusCode);
    const retryAfterMs = Number(e.retryAfterMs);
    return {
      status: Number.isFinite(status) && status > 0 ? status : undefined,
      code: typeof e.code === 'string' ? e.code : undefined,
      text: typeof e.message === 'string' ? e.message : '',
      name: typeof e.name === 'string' ? e.name : undefined,
      capReached: e.capReached === true,
      retryAfterMs: Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : undefined,
    };
  }
  return { text: '' };
}

/** The server's own words for a 429/413, if they look like a sentence for people. */
function serverWords(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 200 || t === 'Identification failed' || /[{}<>]|error:|exception/i.test(t)) return null;
  return t;
}

export function classifyError(err: unknown): UserErrorKind {
  const { status, code, text, name } = details(err);
  const t = text.toLowerCase();
  if (text === SCAN_NETWORK_MESSAGE) return 'offline';
  if (text === SCAN_SERVER_UNREACHABLE_MESSAGE) return 'unreachable';
  if (status === 429) return 'limit';
  if (status === 413) return 'too_large';
  if (text === SCAN_TIMEOUT_MESSAGE) return 'timeout';
  if (name === 'AbortError' || /timed? ?out|timeout/.test(t) || status === 408 || status === 504) return 'timeout';
  if (
    (name === 'TypeError' && /fetch|network/.test(t)) ||
    /network request failed|failed to fetch|network ?error|internet connection appears to be offline|load failed/.test(t)
  ) return 'offline';
  if (
    status === 401 || status === 403 || code === 'PGRST301' ||
    /jwt|not authenticated|unauthori[sz]ed|session (has )?expired|invalid refresh token|auth session missing/.test(t)
  ) return 'auth';
  if ((status !== undefined && status >= 500) || /internal server error|bad gateway|service unavailable|identification failed/.test(t)) return 'server';
  return 'unknown';
}

/**
 * The collector-facing version of any failure. `context` (e.g. "scan") is
 * only used in the development log line.
 */
export function toUserError(err: unknown, context?: string): UserError {
  const kind = classifyError(err);
  if (__DEV__) console.warn(`[${context ?? 'error'}] ${kind}:`, err);
  if (kind === 'limit' || kind === 'too_large') {
    const d = details(err);
    const words = serverWords(d.text);
    if (kind === 'too_large') {
      return { kind, title: COPY.too_large.title, message: words ?? COPY.too_large.message, retry: false };
    }
    // A 429 is either today's limit (capReached) or the few seconds between scans.
    if (d.capReached || (!d.retryAfterMs && /today|daily|limit/i.test(d.text))) {
      return { kind, title: COPY.limit.title, message: words ?? COPY.limit.message, retry: false };
    }
    return {
      kind,
      title: 'Ready again in a few seconds',
      message: words ?? 'Please wait a few seconds between scans.',
      retry: d.retryAfterMs ?? DEFAULT_COOLDOWN_MS,
    };
  }
  return { kind, ...COPY[kind] };
}

/** One line for alerts and small banners: "You're offline. Check your connection and try again." */
export function userErrorLine(err: unknown, context?: string): string {
  const e = toUserError(err, context);
  return `${e.title}. ${e.message}`;
}

/**
 * Plain words for a failed profile save (Complete Profile, Edit Profile,
 * profile photo). The database's own text, e.g. "permission denied for
 * table profiles" seen on TestFlight on 8 Nov 2026, is never shown.
 */
export function profileSaveErrorLine(err: unknown): string {
  const { code, text } = details(err);
  const t = text.toLowerCase();
  if (code === '23505' || /duplicate key|unique constraint|already (taken|exists)/.test(t)) {
    return 'That username is already taken. Try another one.';
  }
  if (code === '23514' || /violates check constraint/.test(t)) {
    return 'Something in your profile isn’t allowed. Check your username: 3–20 letters, numbers, _ or .';
  }
  if (code === '42501' || /permission denied|row-level security/.test(t)) {
    if (__DEV__) console.warn('[profile] save refused:', err);
    return 'Couldn’t save your profile. Please try again. If it keeps happening, make sure you have the latest version of PinHunt.';
  }
  const friendly = toUserError(err, 'profile');
  if (friendly.kind === 'unknown') return 'Couldn’t save your profile. Please try again.';
  return `${friendly.title}. ${friendly.message}`;
}
