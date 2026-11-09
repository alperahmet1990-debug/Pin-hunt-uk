import { API_BASE } from '@/lib/apiBase';

/** What the scan understood from the photo (AI description + Google Vision). */
export interface ImageInsights {
  characters: string[];
  keywords: string[];
  textOnPin: string | null;
  logos: string[];
  webGuesses: string[];
}

export interface IdentifyResult {
  matches: Array<{ pinId: string; confidence: number; reasoning: string }>;
  imageInsights: ImageInsights | null;
}

/** The scan request is abandoned after this long so the spinner can't hang. */
export const SCAN_TIMEOUT_MS = 35_000;

export const SCAN_TIMEOUT_MESSAGE =
  'The scan is taking too long. Check your connection and try again, or search for the pin instead.';

export const SCAN_NETWORK_MESSAGE =
  "We couldn't reach PinHunt. Check your connection and try again, or search for the pin instead.";

/** The device is online, but the PinHunt server didn't answer. */
export const SCAN_SERVER_UNREACHABLE_MESSAGE = "PinHunt can't reach its server right now.";

/** How long the "is the device online at all?" check may take. */
const ONLINE_PROBE_MS = 4_000;

/**
 * After the scan API can't be reached: is the device online at all? Any
 * HTTP answer from our other host (Supabase), even an error status, means
 * it is, so the problem is our server and not the collector's connection.
 * With no Supabase (demo mode) the browser's own flag is used where there
 * is one; otherwise we assume offline, as before.
 */
export async function deviceSeemsOnline(): Promise<boolean> {
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  if (supabaseUrl.startsWith('https://')) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ONLINE_PROBE_MS);
    try {
      await fetch(`${supabaseUrl}/auth/v1/health`, { method: 'GET', signal: controller.signal });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  const nav = (globalThis as { navigator?: { onLine?: unknown } }).navigator;
  return typeof nav?.onLine === 'boolean' ? nav.onLine : false;
}

/** The error a failed scan request rejects with. */
export interface ScanRequestError extends Error {
  status?: number;
  /** 429 because today's limit is used up (not the short cooldown). */
  capReached?: boolean;
  /** 429 cooldown: how long until another scan is allowed. */
  retryAfterMs?: number;
}

function retryAfterMs(res: Response, body: { retryAfterSeconds?: unknown }): number | undefined {
  const fromBody = Number(body.retryAfterSeconds);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody * 1000;
  const fromHeader = Number(res.headers?.get?.('Retry-After'));
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader * 1000;
  return undefined;
}

export async function identifyPin(
  imageBase64: string,
  mimeType: string,
  accessToken?: string,
): Promise<IdentifyResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SCAN_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/scan/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ imageBase64, mimeType }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string; capReached?: unknown; retryAfterSeconds?: unknown };
      // The status lets the app say "server problem" vs "sign in again"
      // without showing the server's own message (UX-046). Only the limit
      // and too-large answers (429, 413) are shown in the server's words.
      const failure: ScanRequestError = Object.assign(new Error(err.error ?? 'Identification failed'), { status: res.status });
      if (res.status === 429) {
        if (err.capReached === true) failure.capReached = true;
        else failure.retryAfterMs = retryAfterMs(res, err);
      }
      throw failure;
    }
    const data = await res.json() as {
      matches: IdentifyResult['matches'];
      imageInsights?: ImageInsights;
    };
    return { matches: data.matches, imageInsights: data.imageInsights ?? null };
  } catch (err) {
    if (timedOut) throw new Error(SCAN_TIMEOUT_MESSAGE);
    // fetch rejects with a TypeError ("Failed to fetch", "Network request failed")
    // when the server can't be reached; don't show that raw text to the user.
    // If the device is otherwise online, it's our server, not their connection.
    if (err instanceof TypeError) {
      throw new Error((await deviceSeemsOnline()) ? SCAN_SERVER_UNREACHABLE_MESSAGE : SCAN_NETWORK_MESSAGE);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
