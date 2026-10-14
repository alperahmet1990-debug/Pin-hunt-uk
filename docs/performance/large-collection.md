# Large-collection performance (UX-051, #159)

How My Collection behaves for collectors with thousands of pins, measured
on 14 October 2026.

## The fixture

`artifacts/pinhunt/mock-data/largeFixture.ts` generates a deterministic
catalogue in sets of 12, and a collector holding most of it. Out of every
20 pins, 13 are owned, 3 are For Trade and 2 are on the ISO.

- **Jest:** `__tests__/collection.bench.tsx` uses it directly.
- **Demo app (web or Expo Go):** build with `EXPO_PUBLIC_DEMO_MODE=1 EXPO_PUBLIC_DEMO_PINS=2000`. Supabase must not be configured.
  - The catalogue context swaps in the generated catalogue, and a fresh install seeds the matching collection.
  - `demoCatalogueSize` is 0 outside demo mode, so a real build never uses it.
  - When changing `EXPO_PUBLIC_DEMO_PINS`, export with `--clear`. Metro caches the inlined env value.

## Results

### Data work (what My Collection recomputes on every status change)

The previous inline code is kept as the reference in
`utils/__tests__/previousCollectionDerive.ts`, and
`utils/__tests__/collectionDerive.test.ts` checks the new code gives
identical output. Times are medians of 7 runs in jest, on the same machine.

| Catalogue pins | Sets | Previous | Now | Speed-up |
|---:|---:|---:|---:|---:|
| 2,000 | 167 | 15 ms | 1 ms | 15× |
| 5,000 | 417 | 54 ms | 2 ms | 27× |
| 10,000 | 834 | 163 ms | 4 ms | 41× |

The previous cost grew with sets × catalogue, because every set re-scanned
the whole catalogue. Now it grows with the catalogue only.

### Whole screen in jest (render, tab switches, one status change)

The real screen is rendered by the test renderer: medians of 5 runs, three
benchmark runs each. Rendering tiles dominates here, so the data speed-up
shows mainly in "status change". These are relative numbers, not device fps.

| Step | 2,000 before | 2,000 after | 5,000 before | 5,000 after |
|---|---:|---:|---:|---:|
| First render | 276–319 ms | 270–321 ms | 432–444 ms | 228–392 ms |
| Sets tab | 110–163 ms | 104–121 ms | 90–185 ms | 87–145 ms |
| For Trade tab | 81–112 ms | 96–108 ms | 89–138 ms | 89–129 ms |
| One status change | 215–332 ms | 155–238 ms | 365–442 ms | 313–374 ms |

### Web demo, 2,000 pins (headless Chromium, after)

- First tiles on screen, including page load: 0.8–0.9 s.
- Sets tab: 100–150 ms.

## What changed

- **`utils/collectionDerive.ts`:**
  - one pass for the Owned / For Trade / ISO lists, instead of three catalogue filters;
  - pins indexed by set once, so set grouping is O(catalogue);
  - date sorts compare ISO strings directly, and name sorts use one shared `Intl.Collator` instead of `localeCompare` per comparison.
- **My Collection `FlatList`:** `maxToRenderPerBatch=4`, `windowSize=7`, and `removeClippedSubviews` on Android. First render keeps the default 10 rows; 15 rows measured slower.
- **Images:** already disk-cached through `PinImage` and `PinTile` (#39).

## Not measured here

- Scroll frame rate on the reference devices (target ≥ 55 fps on a mid-range Android and an older iPhone). That needs a device profile (React DevTools profiler or Flipper) on a demo build with `EXPO_PUBLIC_DEMO_PINS=2000`.
- Set detail and search. Both already work on one set or one page of results.
