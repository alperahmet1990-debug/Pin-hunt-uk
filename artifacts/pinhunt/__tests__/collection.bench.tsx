// Large-collection benchmark (UX-051, #159). Not part of `pnpm test` (the
// test pattern only matches *.test.*). Run it with:
//   pnpm exec jest --testMatch '<rootDir>/__tests__/collection.bench.tsx' --runInBand
// It renders the real My Collection screen with a large fixture catalogue
// (mock-data/largeFixture.ts) and logs the median time of each step. Jest
// timings are relative (same machine, before vs after), not device fps.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import CollectionScreen from '../app/(tabs)/collection';
import { buildLargeCatalogue, buildLargeCollection } from '../mock-data/largeFixture';
import { setSummariesFromPins } from '../utils/setSummariesFromPins';
import { buildSetGroups, compareIsoDesc, indexBySet, partitionByStatus } from '../utils/collectionDerive';
import { previousLists, previousSetGroups } from '../utils/__tests__/previousCollectionDerive';

let mockPins: ReturnType<typeof buildLargeCatalogue> = [];
let mockCollection: ReturnType<typeof buildLargeCollection> = {};
const mockEnsure = () => Promise.resolve();

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({ collection: mockCollection, getEntry: (id: string) => mockCollection[id] }),
}));
jest.mock('@/context/BoardsContext', () => ({ useBoards: () => ({ customBoards: [], createBoard: jest.fn(), getBoardPins: () => [] }) }));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, loading: false, repository: null, ensurePins: mockEnsure, ensureCollections: mockEnsure }),
}));

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function time(fn: () => Promise<unknown>) {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

jest.setTimeout(300_000);

describe.each([2000, 5000])('My Collection with %i catalogue pins', size => {
  const runs = { render: [] as number[], sets: [] as number[], forTrade: [] as number[], statusChange: [] as number[] };
  let base: ReturnType<typeof buildLargeCollection> = {};

  beforeAll(() => {
    mockPins = buildLargeCatalogue(size);
    base = buildLargeCollection(mockPins);
  });

  afterAll(() => {
    const owned = Object.values(base).filter(e => e.status !== 'wanted').length;
    console.log(
      `BENCH size=${size} owned+trade=${owned} sets=${Math.ceil(size / 12)} | ` +
      Object.entries(runs).map(([k, v]) => `${k} ${median(v).toFixed(0)}ms`).join(' | '),
    );
  });

  // Run 0 warms up (module compile, first-render costs); runs 1–5 are measured.
  // Tabs in order: All, Sets, For Trade, ISO.
  it.each([0, 1, 2, 3, 4, 5])('run %i: render, tab switches and a status change', async run => {
    mockCollection = base;
    const view = await time(async () => { await render(<CollectionScreen />); });
    const sets = await time(() => fireEvent.press(screen.getAllByRole('tab')[1]));
    const forTrade = await time(() => fireEvent.press(screen.getAllByRole('tab')[2]));
    await fireEvent.press(screen.getAllByRole('tab')[0]);
    // One pin changes status: every derived list recomputes.
    const first = Object.keys(base)[1];
    mockCollection = { ...base, [first]: { ...base[first], status: 'for_trade' } };
    const change = await time(async () => { await act(async () => { screen.rerender(<CollectionScreen />); }); });
    if (run === 0) return;
    runs.render.push(view); runs.sets.push(sets); runs.forTrade.push(forTrade); runs.statusChange.push(change);
  });
});

// The data work alone (no rendering): what My Collection recomputes on every
// status change, before (previous inline code) and after (collectionDerive).
describe.each([2000, 5000, 10000])('derivations with %i catalogue pins', size => {
  it('previous vs now', () => {
    const catalogue = buildLargeCatalogue(size);
    const collection = buildLargeCollection(catalogue);
    const summaries = setSummariesFromPins(catalogue);
    const before = () => {
      const { owned } = previousLists(catalogue, collection);
      previousSetGroups(catalogue, collection);
      [...owned].sort((a, b) => (collection[b.id]?.dateAdded || '').localeCompare(collection[a.id]?.dateAdded || ''));
    };
    const after = () => {
      const { owned } = partitionByStatus(catalogue, collection);
      buildSetGroups(summaries, indexBySet(catalogue), owned, collection);
      [...owned].sort((a, b) => compareIsoDesc(collection[a.id]?.dateAdded || '', collection[b.id]?.dateAdded || ''));
    };
    const measure = (fn: () => void) => {
      fn(); // warm-up
      const xs = Array.from({ length: 7 }, () => { const t = performance.now(); fn(); return performance.now() - t; });
      return median(xs);
    };
    const b = measure(before);
    const a = measure(after);
    console.log(`DERIVE size=${size} | previous ${b.toFixed(1)}ms | now ${a.toFixed(1)}ms | ${(b / a).toFixed(1)}× faster`);
  });
});
