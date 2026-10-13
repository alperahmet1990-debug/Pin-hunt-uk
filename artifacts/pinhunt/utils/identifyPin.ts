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
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error ?? 'Identification failed');
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
    if (err instanceof TypeError) throw new Error(SCAN_NETWORK_MESSAGE);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
