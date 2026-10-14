/**
 * Plain-English errors for collectors (UX-046, #156). Raw exception text —
 * server messages, Supabase codes, "TypeError: Failed to fetch" — is logged
 * in development, never shown. Every failure maps to one of five kinds with
 * fixed copy, so screens say the same thing for the same problem.
 */
import { SCAN_NETWORK_MESSAGE, SCAN_TIMEOUT_MESSAGE } from './identifyPin';

export type UserErrorKind = 'offline' | 'timeout' | 'auth' | 'server' | 'unknown';

export interface UserError {
  kind: UserErrorKind;
  title: string;
  message: string;
}

const COPY: Record<UserErrorKind, { title: string; message: string }> = {
  offline: { title: "You're offline", message: 'Check your connection and try again.' },
  timeout: { title: 'That took too long', message: "PinHunt didn't hear back in time. Please try again." },
  auth: { title: 'Please sign in again', message: 'Your session has ended. Sign in again to carry on.' },
  server: { title: 'Something went wrong on our side', message: "It's not you. Please try again in a moment." },
  unknown: { title: 'Something went wrong', message: 'Please try again.' },
};

/** Status, code and text from an Error, a Supabase/PostgREST error object or a string. */
function details(err: unknown): { status?: number; code?: string; text: string; name?: string } {
  if (typeof err === 'string') return { text: err };
  if (err && typeof err === 'object') {
    const e = err as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown; name?: unknown };
    const status = Number(e.status ?? e.statusCode);
    return {
      status: Number.isFinite(status) && status > 0 ? status : undefined,
      code: typeof e.code === 'string' ? e.code : undefined,
      text: typeof e.message === 'string' ? e.message : '',
      name: typeof e.name === 'string' ? e.name : undefined,
    };
  }
  return { text: '' };
}

export function classifyError(err: unknown): UserErrorKind {
  const { status, code, text, name } = details(err);
  const t = text.toLowerCase();
  if (text === SCAN_NETWORK_MESSAGE) return 'offline';
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
  return { kind, ...COPY[kind] };
}

/** One line for alerts and small banners: "You're offline. Check your connection and try again." */
export function userErrorLine(err: unknown, context?: string): string {
  const e = toUserError(err, context);
  return `${e.title}. ${e.message}`;
}
