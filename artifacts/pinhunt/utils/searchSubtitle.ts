/**
 * Search results' second line (B-P2-01, #56). The set name, unless the title
 * already says it; then the year and edition, which tell similar variants
 * apart. Falls back to the brand so the line is never empty.
 */
import type { CataloguePin } from '@workspace/pin-repository';

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** True when the set name already appears in the title (ignoring case and punctuation). */
export function titleIncludesSet(title: string, set: string): boolean {
  const s = normalise(set);
  return !!s && ` ${normalise(title)} `.includes(` ${s} `);
}

export function searchResultSubtitle(
  pin: Pick<CataloguePin, 'title' | 'collection' | 'brand' | 'releaseYear' | 'edition'>,
): string {
  const set = pin.collection?.trim() ?? '';
  const details = [pin.releaseYear ? String(pin.releaseYear) : '', pin.edition?.trim() ?? ''].filter(Boolean);
  if (set && !titleIncludesSet(pin.title || '', set)) return [set, ...details].join(' · ');
  if (details.length) return details.join(' · ');
  return pin.brand?.trim() ?? '';
}
