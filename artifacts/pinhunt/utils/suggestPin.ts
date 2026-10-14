/**
 * Helpers for "Suggest a missing pin" (UX-011, #121): set-name suggestions
 * from the catalogue's own sets, and a light "is it already here?" check on
 * the name the collector types.
 */
import type { CataloguePin } from '@workspace/pin-repository';

/** The server and database require a brand; a blank one is sent as this. */
export const UNKNOWN_BRAND = 'Unknown';

/** Names shorter than this don't trigger the already-in-the-catalogue check. */
export const MIN_DUPLICATE_QUERY = 3;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Catalogue set names that match what was typed: names starting with it
 * first, then names containing it. Nothing until something is typed, and
 * nothing once the text already equals a set name.
 */
export function setSuggestions(series: string[], typed: string, limit = 4): string[] {
  const q = norm(typed);
  if (!q) return [];
  if (series.some(s => norm(s) === q)) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const s of series) {
    const n = norm(s);
    if (n.startsWith(q)) starts.push(s);
    else if (n.includes(q)) contains.push(s);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Pins from a loaded list whose title matches the typed name (every word of
 * the name appears in the title). Used when no repository search is available.
 */
export function localDuplicateCandidates(pins: CataloguePin[], name: string, limit = 3): CataloguePin[] {
  const words = norm(name).split(' ').filter(Boolean);
  if (norm(name).length < MIN_DUPLICATE_QUERY || words.length === 0) return [];
  return pins.filter(p => {
    const title = norm(p.title);
    return words.every(w => title.includes(w));
  }).slice(0, limit);
}
