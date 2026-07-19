---
name: PinHunt architecture
description: Key decisions for the PinHunt Expo app — repository pattern, CataloguePin type, provider hierarchy, lib build requirements
---

# PinHunt — Architecture Decisions

## Repository pattern
All screens use `usePinCatalogue()` from `context/PinCatalogueContext.tsx`. No screen queries Supabase or mock data directly. The context provides `{ pins, newReleases, loading, error }`. Fallback: when Supabase env vars are absent, it adapts mock data from `mock-data/pins.ts` (which uses `MockPin` type with `retailPrice` / `image` — NOT `CataloguePin`).

**Why:** Allows swapping the data source (external licensed API, etc.) without touching screens.

## CataloguePin vs MockPin
- `CataloguePin` lives in `@workspace/pin-repository` — use this in all screens, components, contexts.
- `MockPin` (local interface in `mock-data/pins.ts`) has legacy fields: `retailPrice`, `image: any`, `backImage?: any`. The context maps MockPin → CataloguePin.
- `types/pin.ts` re-exports `CataloguePin as Pin` for backward compat; also exports `CollectionStatus` and `Brand`.
- `getPinImageSource(pin: CataloguePin)` in `utils/pinImage.ts` returns `{uri: imageUrl}` or placeholder — always use this; never `pin.image`.

## Provider hierarchy (must maintain this order in _layout.tsx)
```
PinCatalogueProvider        ← outermost (data source)
  CollectionProvider        ← uses collection state only
    BoardsProvider          ← uses both collection AND usePinCatalogue()
```
`BoardsContext` uses `usePinCatalogue()` so it MUST be a child of `PinCatalogueProvider`.

## lib/pin-repository build
- tsconfig extends `../../tsconfig.base.json` (moduleResolution: bundler).
- `emitDeclarationOnly: true`, `composite: true`, outDir: `dist`.
- Must run `pnpm --filter @workspace/pin-repository run build` after changes.
- After build, Expo typecheck and api-server typecheck both pass.
- Internal imports use no `.js` extension (bundler resolution).

## lib/integrations-openai-ai-server build
- Also needs `pnpm --filter @workspace/integrations-openai-ai-server run build` for api-server typecheck.
- Has `@types/node` and same composite/emitDeclarationOnly pattern.

## Supabase setup (still pending)
- Env vars needed: `SUPABASE_URL` + `SUPABASE_ANON_KEY` (server), `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (mobile).
- User must add Supabase connector via workspace Settings → Connectors first.
- After connecting: run `POST /api/admin/seed-pins` to populate the catalogue.
- `POST /api/admin/catalogue-status` to verify the seed ran.

## api-server scan route
- Reads pin catalogue from Supabase at request time (via repository).
- Falls back gracefully: if Supabase not configured, returns 503 with clear message.
- Filters matches to only return pinIds that exist in the live catalogue.

## eBay mock / estimated value
- `pin.estimatedValueGBP` is optional in CataloguePin — always use `?? 0` before arithmetic.
- `pin.retailPriceGBP` replaces old `pin.retailPrice`.
- `pin.origin`, `pin.edition` are optional — use `?? '—'` when passed to MetaRow (expects string).
