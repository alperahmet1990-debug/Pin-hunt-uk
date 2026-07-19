---
name: PinHunt schema & auth implementation
description: Completion status of the full DB schema, repository rewrite, and auth layer — pick up from here next session.
---

## Status: COMPLETE (all 5 batches done as of 2026-07-19)

### What was built this session (Batch 2–5)

**Batch 2 — Repository layer (lib/pin-repository/src/)**
- `repository.ts` — added `getPinByPinhuntId`, `getPinsByCategory` to interface
- `user-repository.ts` — NEW: `IUserPinRepository`, `ITradeRepository` interfaces
- `supabase-repository.ts` — FULL REWRITE: constructor now takes `SupabaseClient`; factory supports both `(client, opts)` and `(url, key, opts)` overloads; joins `pin_characters(characters(name))` and `pin_categories(categories(name))`; `getPinById` queries by `pinhunt_id`; `createPin` / `updatePin` manage junction rows; character/category filters use two-step ID resolution
- `supabase-user-repository.ts` — NEW: full `IUserPinRepository` impl (collection CRUD, profiles, trades)
- `index.ts` — updated exports
- `seed-data.ts` — updated 20 pins to use `pinhuntId: 'PHUK-MOCK-000X'` + `verificationStatus: 'verified'`

**Batch 3 — App layer (artifacts/pinhunt/)**
- `lib/supabase.ts` — NEW: singleton client using `EXPO_PUBLIC_SUPABASE_*` + AsyncStorage session persistence
- `context/AuthContext.tsx` — NEW: `AuthProvider` + `useAuth` hook; wraps supabase.auth; `signIn`, `signUp`, `signOut`, `session`, `user`, `loading`
- `app/(auth)/_layout.tsx` — NEW: simple Stack, no header
- `app/(auth)/login.tsx` — NEW: email/password login screen, uses `useColors()`
- `app/(auth)/register.tsx` — NEW: register screen with email-confirm success state
- `context/PinCatalogueContext.tsx` — updated to use singleton supabase client; mock adapter updated with `categories`, `backImageUrl`, `verificationStatus`, `currency` fields
- `app/_layout.tsx` — added `AuthProvider` outermost; `AuthGuard` component using `useSegments` + `useRouter`; added `(auth)` Stack.Screen

**Batch 4 — Scripts (scripts/)**
- `package.json` — `@workspace/scripts`; deps: `xlsx`, `@supabase/supabase-js`, `dotenv`, `tsx`
- `tsconfig.json` — standalone (no extends); `module: NodeNext`, `types: ["node"]`
- `import-catalogue.ts` — reads XLSX, upserts pins by pinhunt_id, manages junction tables and pin_sources; `--verify-all` flag sets all to `verified`; detailed import report
- `verify-setup.ts` — checks env vars, DB connectivity (service role + anon), all 16 tables, RLS correctness (unverified blocked, verified readable, anon writes blocked), auth endpoint

**Batch 5 — API server & docs**
- `artifacts/api-server/src/routes/admin.ts` — uses `SUPABASE_SERVICE_ROLE_KEY` for writes (RLS blocks anon writes); catalogue-status now shows counts by `verificationStatus`
- `README.md` — full rewrite: architecture, setup steps, migrations, storage buckets, import, auth, AI scan, future licensed API

### Key decisions

- `@supabase/supabase-js` must be in `artifacts/pinhunt/package.json` as a direct dep (Metro bundler doesn't hoist from lib/pin-repository)
- `createSupabasePinRepository` is overloaded: `(SupabaseClient)` for Expo, `(url, key)` for api-server/scripts — both work
- Seed pins use `PHUK-MOCK-000X` IDs and `verificationStatus: 'verified'` so they appear immediately in dev
- Scripts tsconfig is standalone (no extends tsconfig.base.json) with `module: NodeNext` and `types: ["node"]`
- `muted` token = background color; use `mutedForeground` for placeholder text in auth screens

### Outstanding manual steps (user must do in Supabase)

1. SQL editor → run `supabase/migrations/001_schema.sql`
2. SQL editor → run `supabase/migrations/002_rls.sql`
3. Storage → create 4 buckets: `avatars` (public), `catalogue-images` (public), `user-pin-images` (private), `scan-images` (private); apply storage RLS from `002_rls.sql` comments
4. Add `SUPABASE_SERVICE_ROLE_KEY` as a Replit Secret
5. Run `pnpm --filter @workspace/scripts run verify` to confirm setup
6. Run `pnpm --filter @workspace/scripts run import:verify-all path/to/catalogue.xlsx`

**Why:** All 22 xlsx pins have `needs_source_verification` so without `--verify-all`, the app shows nothing (RLS hides unverified pins from anon key).
