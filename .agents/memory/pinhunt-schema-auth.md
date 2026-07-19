---
name: PinHunt schema & auth implementation
description: Migration status, key decisions, and outstanding manual steps
---

## Migration status

| File | Status |
|------|--------|
| 001_schema.sql | ✅ Applied manually |
| 002_rls.sql | ✅ Applied manually |
| 003_profiles_v2.sql | ✅ Applied manually |
| 004_external_sale_listings.sql | ✅ Applied manually |
| 005_pin_submissions_v2.sql | ⏳ User must apply in Supabase SQL editor |

## Key decisions

### Profile system (003)
- New profile fields added to existing `profiles` table (not separate).
- `updateProfile` uses upsert so it works for pre-trigger accounts.
- Usernames always stored lowercase; unique index on `lower(username)`.
- `complete-profile` is a root Stack screen guarded by `AuthGuard` which checks `needsUsername` from `ProfileContext`.
- Find Collectors and Collector Profile are pushed Stack screens, not extra tabs.

### External sale listings (004)
- `external_sale_listings.pin_id` is the internal UUID.
- `createExternalSaleListing` and `getExternalListingsForPin` both accept pinhunt_id and resolve to UUID internally — consistent with `addPinToCollection`.
- URL validation is client-side in `utils/marketplaceUrl.ts`.
- `useMarketplace` hook (not context) — screens manage own fetch state.

### Pin submissions (005)
- Old JSONB pin_submissions table dropped and replaced with explicit columns.
- `createPinSubmission` generates the UUID client-side upfront so storage paths can be built before the DB row is inserted. This avoids the NOT NULL front_image_path constraint problem.
- Images uploaded via `fetch(localUri) → blob → supabase.storage.upload`. Works in Expo because `fetch` is global.
- Image compression in `utils/submissionImage.ts` (not in the repo layer): resize to 1400px max, JPEG 0.8 quality.
- `deleteDraftSubmission` deletes DB row first (RLS enforces draft-only), then cleans up storage as best-effort (no throw on storage failure).
- Signed URLs (1h TTL) generated in screens directly via `supabase.storage.createSignedUrl` — also exposed via `repo.getSubmissionImageUrl` for consistency.
- RLS: users can only set status to draft/submitted/needs_changes themselves; approved/rejected/under_review require is_admin().

### Views and Database type
- `Views: Record<string, never>` must stay in `database.types.ts`. Adding a typed view entry breaks all table type inference.

## Outstanding items

1. **Migration 005** — user must paste `005_pin_submissions_v2.sql` into Supabase SQL editor.
2. **Avatar upload** — deferred; `avatar_url` field exists in DB/types but upload UI skipped (no storage bucket yet).
3. **Catalogue data** — pins table is empty; import pipeline not run.
4. **Storage buckets** — avatars, catalogue-images, user-pin-images, scan-images still need creating (pin-submissions bucket is now created by migration 005 via storage.buckets insert).
5. **`SUPABASE_SERVICE_ROLE_KEY`** — needed for the import pipeline.
6. **Expo typecheck** — passes clean as of last session (`tsc --noEmit` exits 0).
