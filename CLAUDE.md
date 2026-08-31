# PinHunt UK — CLAUDE.md

Permanent development context and safety guardrails for Claude Code sessions on this repository. Keep this concise and practical — update it when the architecture actually changes, not speculatively.

## ARCHITECTURE

### Monorepo layout

pnpm workspace (`pnpm-workspace.yaml`), Node 20+/24, TypeScript 5.9.

```
artifacts/
  pinhunt/          Expo React Native app (iOS-first) — THE primary product
  api-server/       Express 5 API — AI scan, admin, eBay, valuation, geocode
  mockup-sandbox/   Vite + Radix/shadcn web sandbox for visual mockups/prototyping
lib/
  pin-repository/   Shared types + repository interface + Supabase implementation
  integrations-openai-ai-server/, integrations-openai-ai-react/  OpenAI wrappers
  integrations/openai_ai_integrations/  related OpenAI integration code
  db/, api-spec/, api-zod/, api-client-react/  Drizzle/Postgres/Orval scaffolding
                    (see TECHNICAL DEBT — not part of the real Supabase data path)
scripts/            catalogue import (xlsx → Supabase), setup verification
supabase/migrations/  ~50 hand-written SQL files, applied manually in the Supabase SQL editor
.agents/memory/     prior agent session notes — read before touching a covered area
```

- `artifacts/pinhunt` is the primary Expo/React Native application. It is Expo Router–based (file routing under `app/`), React Native 0.81 / React 19 / Expo ~54, iOS-first (`ios.supportsTablet: false`), also runs on web/Android via `react-native-web`.
- **Supabase is the current canonical backend/data path**: Postgres, Auth, Storage, RLS. Do not replace it or route around it.

### API server

`artifacts/api-server` — Express 5. Roles: AI pin-scan identification (`POST /api/scan/identify`), admin routes, eBay valuation/deletion/dry-run, catalogue import/validation, geocoding for "Collectors Nearby". The mobile app never calls OpenAI, Google Vision, or eBay directly — it always goes through this server.

### Catalogue / repository data flow

```
Screen → usePinCatalogue() / useCollection() / etc.
       → PinRepository interface (lib/pin-repository)
       → SupabasePinRepository → Supabase (Postgres + RLS)
```

- All catalogue/collection data access from the Expo app goes through `lib/pin-repository` — no screen should import `mock-data/` or call Supabase directly.
- Mock fallback: `artifacts/pinhunt/lib/supabase.ts` exposes `isSupabaseConfigured`; `PinCatalogueContext.tsx` dynamically imports `mock-data/pins.ts` only when Supabase env vars are absent.
- After editing `lib/pin-repository/src/*`, rebuild it (`pnpm --filter @workspace/pin-repository run build`) — Metro cannot resolve workspace TS source directly, only compiled output.
- `pins.id` is an internal UUID; `pins.pinhunt_id` (e.g. `PHUK-00000001`) is the stable public identifier.
- Public reads are gated on `verification_status = 'verified'` via RLS — no client-side filtering needed or expected.

### Existing screen/feature architecture

- **Home** — `app/(tabs)/index.tsx`. Greeting/avatar header, pins/traders/ISO stat row, "Find a Pin" hero → scan, shortcuts to Collection/Trades/Community, "For You" (unread messages, submission updates, admin community post), "What's Happening" (pickup-type community posts), "Continue Collecting" (active-set progress).
- **Catalogue** — `app/catalogue.tsx` (browse) + `app/set/[collection].tsx` (set detail). Sets are first-class catalogue objects, not an ad-hoc grouping.
- **Collection, ISO/Wishlist, For Trade** — single screen `app/(tabs)/collection.tsx` with tabs `boards | sets | traders | iso`. State is driven by `CollectionContext` entry `status`: `owned`, `for_trade`, `wanted` (ISO). **ISO/Wishlist and For Trade are distinct states** — do not conflate them. `BoardsContext` manages custom boards.
- **For Trade / Trading** — `app/trade/[id].tsx` (trade detail flow), `app/traders/[pinId].tsx` (who has a pin for trade), `app/sell/[pinId].tsx`, `app/my-listings.tsx`.
- **Community** — `app/community/*` (feed, posts, conversations, chat) surfaced via `useCommunity` and referenced from Home.
- **Valuation** — `components/MarketValueSection.tsx` + `hooks/useMarketValue.ts` (client) → `api-server/src/routes/market-value.ts` → `services/valuation.ts` + `services/ebay.ts` (server-side eBay pricing); `utils/marketplaceUrl.ts` / `hooks/useMarketplace.ts` build outbound marketplace links.
- **Navigation** — `app/_layout.tsx` wraps the app in a fixed provider order (Auth → Profile → PinCatalogue → Collection → Boards → SubmissionNotifications → UnreadMessages → ...) then an `AuthGuard` redirects on session/profile state before the root `Stack`. `app/(tabs)/_layout.tsx` renders native `NativeTabs` (iOS Liquid Glass) or classic `Tabs` (Android/web): Home, Community, Find (scan), Collection, Profile.

### External integrations identified

- **Supabase** — Postgres, Auth, Storage, RLS. The canonical backend.
- **OpenAI (GPT-4 Vision)** — pin identification from scanned photos, via `lib/integrations-openai-ai-server`/`-react`, using Replit's AI Integrations connector pattern (`AI_INTEGRATIONS_OPENAI_*`, `@replit/connectors-sdk`).
- **Google Cloud Vision** — `@google-cloud/vision`, `services/google-vision.ts`, `routes/vision-test.ts`.
- **eBay** — `services/ebay.ts`, `routes/ebay-deletion.ts`, `routes/ebay-image-dryrun.ts` — market-value lookups and catalogue image/price validation, plus an account-deletion compliance webhook. See `.agents/memory/ebay-integration.md` for known quirks (prod keyset lock, App ID vs Cert ID 401s).
- **Geocoding** — `routes/geocode.ts`, used for "Collectors Nearby".
- No OAuth (Google/Apple sign-in) is wired up yet.

### Replit configuration — preserve it

Replit remains a fallback development/deployment environment. Do not remove or rewrite any of the following without an explicit request:

- `.replit`, `.replitignore`, `scripts/post-merge.sh`
- `artifacts/*/.replit-artifact/artifact.toml` (all three `artifacts/*` packages)
- `pnpm-workspace.yaml` catalog entries for `@replit/vite-plugin-*` and the `@replit/*` supply-chain exclusion
- root `@replit/connectors-sdk` dependency
- `pinhunt/package.json` `dev` script's use of `REPLIT_EXPO_DEV_DOMAIN` / `REPLIT_DEV_DOMAIN` / `REPL_ID` / `EXPO_PACKAGER_PROXY_URL`
- `app.json` → `expo-router` plugin `origin: "https://replit.com/"`

---

## DEVELOPMENT GUARDRAILS

- Inspect the existing implementation before creating new components, services, routes, database tables, or architectural patterns. Reuse what's there.
- Prefer targeted changes over broad refactors. A bug fix or single feature doesn't need surrounding cleanup.
- Preserve existing working functionality unless a task explicitly asks for it to be replaced.
- Read relevant `.agents/memory/*.md` files before modifying an area with existing notes (see `.agents/memory/MEMORY.md` for the index — covers architecture, schema/auth, community, eBay, images, collection sync/mutation ordering, Expo web quirks, RLS patterns, trusted catalogue, unread messages, visual direction, and more).
- Never expose, print, or commit API keys, credentials, or secrets — in code, comments, commit messages, or chat output.
- Never perform destructive Supabase/database migrations, and never apply any migration automatically, without explicit approval. Migrations are hand-written SQL in `supabase/migrations/`, applied manually via the Supabase SQL editor.
- Preserve existing RLS and security behaviour unless explicitly asked to change it.
- Do not remove or rewrite Replit-specific configuration unless explicitly requested (see above).
- Do not clean up unrelated TypeScript errors, prototype code, or mockup code while completing another task — known mockup/prototype errors are expected and out of scope unless specifically requested.
- Do not remove apparently unused code or scaffolding merely because it looks unnecessary — investigate first and get approval (e.g. the `lib/db` / `lib/api-spec` / `lib/api-zod` / `lib/api-client-react` scaffolding below).

---

## PINHUNT PRODUCT CONTEXT

- PinHunt UK is primarily a **UK/Paris Disney pin collecting and trading** product.
- Trading and collection management are core experiences, alongside pin valuation.
- **The Master Catalogue is the canonical source of truth for pin catalogue information.** Catalogue corrections, IDs, characters, sets, pricing/source research, and validation should ultimately be represented in the Master Catalogue rather than maintained uniquely elsewhere (e.g. in a one-off screen, script, or side table).
- **Sets are first-class catalogue objects**, not an incidental grouping — treat them as such in any catalogue work.
- **ISO/Wishlist and For Trade are distinct and important collection/trading states** (`wanted` vs `for_trade` in `CollectionContext`) — don't merge or conflate them.
- Planned/roadmap capabilities (not yet built — check before assuming they exist):
  - Trade Circle / repeat trusted traders
  - Shareable ISO and For Trade pages
  - Collector-set trade values
  - Improved trade matching
  - Trade-only shipping, where **each collector purchases their own shipping** — PinHunt does **not** process payment between collectors.
  - **Do not introduce marketplace payments or escrow** unless explicitly requested.
  - **Pin & Pop catalogue integration** is planned/being explored — do not create a conflicting replacement catalogue architecture without checking first. (The README also describes a "licensed external catalogue API" extension point via a new `PinRepository` implementation — any external catalogue integration should go through that seam.)

---

## TECHNICAL DEBT / UNCERTAINTIES

Investigate before acting on these — do not delete or "clean up" without approval:

- **`lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`** — implement a generic Drizzle/Postgres/Orval pattern (`DATABASE_URL`, an OpenAPI spec, codegen'd hooks). Nothing in `artifacts/api-server` or `artifacts/pinhunt` appears to import them, and `lib/db/src/index.ts` imports a `./schema` module that doesn't exist in the repo — this looks like unused generic Replit-workspace-template scaffolding, not part of PinHunt's real (Supabase) data path. Confirm before treating it as reserved for a planned future direction vs. safe to eventually retire.
- **`replit.md`** is still the generic unfilled project template (placeholder headings, doesn't mention PinHunt, Supabase, or Expo) — likely stale, not an active source of truth. `README.md` is the accurate architecture doc.
- Two branches exist (`main` and `claude/pinhunt-repo-inspection-f2ttkl`) — confirm sync status and target branch conventions before larger work.
- The provider hierarchy in `app/_layout.tsx` is order-dependent (documented in `.agents/memory/pinhunt-arch.md`) — changing provider nesting order without understanding the dependencies (e.g. `ProfileProvider` needs `useAuth` internally and must sit outside `AuthGuard`) can break auth/profile redirects.
