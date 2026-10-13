import type { CataloguePin } from '@workspace/pin-repository';
import {
  SEARCH_PAGE_SIZE,
  appendSearchPage,
  hasMoreResults,
  resultCountLabel,
} from '../searchPaging';

const pin = (n: number) => ({ id: `id-${n}`, title: `Pin ${n}` }) as CataloguePin;
const pins = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => pin(from + i));

describe('search paging', () => {
  it('appends pages and stops at the total', () => {
    const total = 42;
    let list: CataloguePin[] = [];
    let offset = 0;
    let more = true;
    let pages = 0;
    while (more) {
      const page = pins(offset, Math.min(offset + SEARCH_PAGE_SIZE, total));
      list = appendSearchPage(list, page);
      offset += page.length;
      more = hasMoreResults(offset, total, page.length);
      pages++;
    }
    expect(pages).toBe(2);
    expect(list).toHaveLength(42);
    expect(new Set(list.map(p => p.id)).size).toBe(42);
  });

  it('drops duplicates across pages', () => {
    const list = appendSearchPage(pins(0, 3), pins(2, 5));
    expect(list.map(p => p.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4']);
  });

  it('stops on an empty page even if the total is higher', () => {
    expect(hasMoreResults(10, 42, 0)).toBe(false);
  });

  it('formats the count', () => {
    expect(resultCountLabel(42)).toBe('42 results');
    expect(resultCountLabel(1)).toBe('1 result');
  });
});
