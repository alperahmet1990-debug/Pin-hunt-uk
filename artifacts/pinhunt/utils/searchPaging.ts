import type { CataloguePin } from '@workspace/pin-repository';

export const SEARCH_PAGE_SIZE = 30;

/** Appends a page to the loaded results, skipping pins already shown. */
export function appendSearchPage(existing: CataloguePin[], page: CataloguePin[]): CataloguePin[] {
  const seen = new Set(existing.map(p => p.id));
  const out = existing.slice();
  for (const pin of page) {
    if (!seen.has(pin.id)) { seen.add(pin.id); out.push(pin); }
  }
  return out;
}

/** True while the server reports more matches than the page offset has consumed. */
export function hasMoreResults(offset: number, total: number, lastPageSize: number): boolean {
  return lastPageSize > 0 && offset < total;
}

export function resultCountLabel(total: number): string {
  return `${total} ${total === 1 ? 'result' : 'results'}`;
}
