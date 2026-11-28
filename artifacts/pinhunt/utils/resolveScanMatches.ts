import type { CataloguePin } from '@workspace/pin-repository';

export interface RawScanMatch {
  pinId: string;
  confidence: number;
  reasoning: string;
}

export interface ResolvedScanMatch {
  pin: CataloguePin;
  confidence: number;
  reasoning: string;
}

export interface ResolveScanMatchesResult {
  resolved: ResolvedScanMatch[];
  /** The first lookup error, if any repository lookup threw. */
  lookupError: unknown;
  hadLookupError: boolean;
}

/**
 * Resolve identify-API matches to catalogue pins: the cached list first, then
 * the repository. A lookup that throws is recorded (not swallowed) so the
 * caller can tell "lookup failed" from "genuinely not in the catalogue" (#669).
 *
 * If nothing resolved and any lookup threw (even when others returned null),
 * `hadLookupError` is true: the caller should show the error state, because
 * the pin may well be in the catalogue.
 */
export async function resolveScanMatches(
  rawMatches: RawScanMatch[],
  cachedPins: CataloguePin[],
  getPinById?: (id: string) => Promise<CataloguePin | null>,
): Promise<ResolveScanMatchesResult> {
  let hadLookupError = false;
  let lookupError: unknown = null;
  const resolved = (
    await Promise.all(
      rawMatches.map(async m => {
        let pin = cachedPins.find(p => p.id === m.pinId) ?? null;
        if (!pin && getPinById) {
          try {
            pin = await getPinById(m.pinId);
          } catch (err) {
            if (!hadLookupError) lookupError = err;
            hadLookupError = true;
            pin = null;
          }
        }
        if (!pin) return null;
        return { pin, confidence: m.confidence, reasoning: m.reasoning };
      }),
    )
  ).filter((m): m is ResolvedScanMatch => m !== null);
  return { resolved, lookupError, hadLookupError };
}
