import type { CatalogueBrowsePin, CatalogueBrowsePageQuery } from '@workspace/pin-repository';
import { START, browseTotal, nextBrowsePage, splitYear, type BrowseCursor, type BrowseFilters } from '../catalogueBrowsePager';

// In-memory stand-in for getCatalogueBrowsePage: same ordering (set, title, id) and filters.
function catalogue(sets: Array<[string, number]>, uncategorised = 0) {
  const all: Array<CatalogueBrowsePin & { collection: string }> = [];
  for (const [name, n] of sets) {
    for (let i = 0; i < n; i++) all.push({ id: `${name}-${i}`, title: `Pin ${String(i).padStart(3, '0')}`, setName: name, collection: name, releaseYear: i % 2 ? 2024 : 2025 });
  }
  for (let i = 0; i < uncategorised; i++) all.push({ id: `u-${i}`, title: `Loose ${i}`, setName: 'Uncategorised', collection: '', releaseYear: 2024 });
  all.sort((a, b) => a.collection.localeCompare(b.collection) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const calls: CatalogueBrowsePageQuery[] = [];
  const page = async (q: CatalogueBrowsePageQuery) => {
    calls.push(q);
    const words = (q.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const match = all.filter(p =>
      (q.setName === undefined || p.collection === q.setName)
      && (q.uncategorised !== true || p.collection === '')
      && (q.uncategorised !== false || p.collection !== '')
      && (!q.year || p.releaseYear === q.year)
      && words.every(w => `${p.title} ${p.setName}`.toLowerCase().includes(w)));
    return { rows: match.slice(q.offset, q.offset + q.limit), total: q.withCount ? match.length : null };
  };
  return { page, calls, all };
}

const NONE: BrowseFilters = { query: '', setName: null, year: null, edition: null };

async function loadAll(page: Parameters<typeof nextBrowsePage>[0], f: BrowseFilters, size: number) {
  const pages: CatalogueBrowsePin[][] = [];
  let cursor: BrowseCursor = START;
  for (let guard = 0; cursor.phase !== 'done' && guard < 100; guard++) {
    const r = await nextBrowsePage(page, f, cursor, size);
    pages.push(r.rows);
    cursor = r.cursor;
  }
  return pages;
}

describe('nextBrowsePage', () => {
  it('loads every pin exactly once, named sets first and Uncategorised last', async () => {
    const { page, all } = catalogue([['Alpha', 7], ['Beta', 3], ['Gamma', 12]], 5);
    const pages = await loadAll(page, NONE, 4);
    const ids = pages.flat().map(p => p.id);
    expect(ids).toHaveLength(all.length);
    expect(new Set(ids).size).toBe(all.length);
    expect(pages.flat().slice(-5).every(p => p.setName === 'Uncategorised')).toBe(true);
    expect(pages.flat()[0].setName).toBe('Alpha');
  });

  it('never splits a named set across pages', async () => {
    const { page } = catalogue([['Alpha', 7], ['Beta', 3], ['Gamma', 12], ['Delta', 1]]);
    const pages = await loadAll(page, NONE, 4);
    const pageOfSet = new Map<string, Set<number>>();
    pages.forEach((rows, i) => rows.forEach(r => {
      if (!pageOfSet.has(r.setName)) pageOfSet.set(r.setName, new Set());
      pageOfSet.get(r.setName)!.add(i);
    }));
    for (const [, pagesSeen] of pageOfSet) expect(pagesSeen.size).toBe(1);
  });

  it('finishes a set bigger than the page (and bigger than one tail request)', async () => {
    const { page } = catalogue([['Huge', 2600], ['Next', 2]]);
    const first = await nextBrowsePage(page, NONE, START, 240);
    expect(first.rows).toHaveLength(2600);
    expect(first.rows.every(r => r.setName === 'Huge')).toBe(true);
    const second = await nextBrowsePage(page, NONE, first.cursor, 240);
    expect(second.rows.map(r => r.setName)).toEqual(['Next', 'Next']);
  });

  it('pages a chosen set without the named/uncategorised split', async () => {
    const { page, calls } = catalogue([['Alpha', 10], ['Beta', 3]], 4);
    const pages = await loadAll(page, { ...NONE, setName: 'Alpha' }, 4);
    expect(pages.flat()).toHaveLength(10);
    expect(calls.every(c => c.setName === 'Alpha' && c.uncategorised === undefined)).toBe(true);
  });

  it('goes straight to Uncategorised when no named set matches', async () => {
    const { page } = catalogue([['Alpha', 3]], 6);
    const first = await nextBrowsePage(page, { ...NONE, query: 'loose' }, START, 4);
    expect(first.rows.map(r => r.setName)).toEqual(['Uncategorised', 'Uncategorised', 'Uncategorised', 'Uncategorised']);
  });

  it('passes search, year and edition through to every request', async () => {
    const { page, calls } = catalogue([['Alpha', 9]]);
    await loadAll(page, { query: 'pin', setName: null, year: 2024, edition: 'Limited Edition' }, 3);
    expect(calls.every(c => c.query === 'pin' && c.year === 2024 && c.edition === 'Limited Edition')).toBe(true);
  });
});

describe('browseTotal', () => {
  it('adds named and uncategorised matches', async () => {
    const { page } = catalogue([['Alpha', 7], ['Beta', 3]], 5);
    expect(await browseTotal(page, NONE)).toBe(15);
    expect(await browseTotal(page, { ...NONE, setName: 'Beta' })).toBe(3);
    expect(await browseTotal(page, { ...NONE, year: 2024 })).toBe(3 + 1 + 5);
  });
});

describe('splitYear', () => {
  it('turns a typed year into the year filter', () => {
    expect(splitYear({ ...NONE, query: 'stitch 2024' })).toEqual({ ...NONE, query: 'stitch', year: 2024 });
  });
  it('leaves other numbers and an explicit year alone', () => {
    expect(splitYear({ ...NONE, query: 'LE 300' })).toEqual({ ...NONE, query: 'LE 300' });
    expect(splitYear({ ...NONE, query: 'stitch 2024', year: 2020 })).toEqual({ ...NONE, query: 'stitch 2024', year: 2020 });
  });
});
