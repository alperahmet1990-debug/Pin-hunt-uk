/**
 * Paging for Browse Catalogue (useCatalogueBrowseIndex).
 *
 * The catalogue is ~116k pins (Pin & Pop), so the screen loads pages from
 * the server instead of the whole index. Two rules keep the set-grouped
 * screen honest:
 *
 *  - A page never ends part-way through a set: it's extended to the end of
 *    its last set, so set headers show the full count and "Select all" picks
 *    every pin in the set.
 *  - Pins with no set ("Uncategorised", ~4k) come after every named set
 *    rather than first (an empty set name would otherwise sort first).
 */
import type { CatalogueBrowsePin, CatalogueBrowsePageQuery } from '@workspace/pin-repository';

export interface BrowseFilters {
  query: string;
  setName: string | null;
  year: number | null;
  edition: string | null;
}

export interface BrowseCursor {
  phase: 'named' | 'uncategorised' | 'done';
  offset: number;
}

type PageFn = (q: CatalogueBrowsePageQuery) => Promise<{ rows: CatalogueBrowsePin[]; total: number | null }>;

export const BROWSE_PAGE_SIZE = 240;
const SET_TAIL_PAGE = 1000;

export const START: BrowseCursor = { phase: 'named', offset: 0 };

/** A 4-digit year typed into search acts as the year filter (the old on-device search matched years). */
export function splitYear(filters: BrowseFilters): BrowseFilters {
  if (filters.year) return filters;
  const words = filters.query.trim().split(/\s+/).filter(Boolean);
  const yearWord = words.find(w => /^(19[5-9]\d|20\d\d)$/.test(w));
  if (!yearWord) return filters;
  return { ...filters, year: Number(yearWord), query: words.filter(w => w !== yearWord).join(' ') };
}

function base(f: BrowseFilters): Omit<CatalogueBrowsePageQuery, 'offset' | 'limit'> {
  return {
    query: f.query.trim() || undefined,
    setName: f.setName ?? undefined,
    year: f.year ?? undefined,
    edition: f.edition ?? undefined,
  };
}

/** Total matching pins for these filters (named sets + uncategorised). */
export async function browseTotal(page: PageFn, f: BrowseFilters): Promise<number> {
  if (f.setName !== null) {
    return (await page({ ...base(f), offset: 0, limit: 1, withCount: true })).total ?? 0;
  }
  const [named, uncategorised] = await Promise.all([
    page({ ...base(f), uncategorised: false, offset: 0, limit: 1, withCount: true }),
    page({ ...base(f), uncategorised: true, offset: 0, limit: 1, withCount: true }),
  ]);
  return (named.total ?? 0) + (uncategorised.total ?? 0);
}

/** Loads the page after `cursor`. Returns the rows and the next cursor. */
export async function nextBrowsePage(
  page: PageFn,
  f: BrowseFilters,
  cursor: BrowseCursor,
  pageSize = BROWSE_PAGE_SIZE,
): Promise<{ rows: CatalogueBrowsePin[]; cursor: BrowseCursor }> {
  if (cursor.phase === 'done') return { rows: [], cursor };

  // One set chosen: a single list, nothing to keep whole or reorder.
  if (f.setName !== null) {
    const { rows } = await page({ ...base(f), offset: cursor.offset, limit: pageSize });
    return { rows, cursor: rows.length < pageSize ? { phase: 'done', offset: 0 } : { phase: 'named', offset: cursor.offset + rows.length } };
  }

  const uncategorised = cursor.phase === 'uncategorised';
  const { rows } = await page({ ...base(f), uncategorised, offset: cursor.offset, limit: pageSize });

  if (rows.length < pageSize) {
    // This phase is finished: named sets → uncategorised → done.
    const next: BrowseCursor = uncategorised ? { phase: 'done', offset: 0 } : { phase: 'uncategorised', offset: 0 };
    if (rows.length === 0 && !uncategorised) return nextBrowsePage(page, f, next, pageSize);
    return { rows, cursor: next };
  }

  if (uncategorised) return { rows, cursor: { phase: 'uncategorised', offset: cursor.offset + rows.length } };

  // Finish the last set so it's never split across pages.
  const lastSet = rows[rows.length - 1].setName;
  let inLastSet = 0;
  for (let i = rows.length - 1; i >= 0 && rows[i].setName === lastSet; i--) inLastSet++;
  const out = [...rows];
  const seen = new Set(rows.map(r => r.id));
  for (let offset = inLastSet; ; offset += SET_TAIL_PAGE) {
    const tail = await page({ ...base(f), setName: lastSet, offset, limit: SET_TAIL_PAGE });
    for (const r of tail.rows) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    if (tail.rows.length < SET_TAIL_PAGE) break;
  }
  return { rows: out, cursor: { phase: 'named', offset: cursor.offset + out.length } };
}
