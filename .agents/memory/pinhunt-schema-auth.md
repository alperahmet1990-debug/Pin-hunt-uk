---
name: PinHunt schema & auth implementation
description: Migration status, key decisions, and outstanding manual steps
---

## Migration status

| File | Status |
|------|--------|
| 001_schema.sql | ✅ Applied manually in Supabase SQL editor |
| 002_rls.sql | ✅ Applied manually |
| 003_profiles_v2.sql | ✅ Applied manually |
| 004_external_sale_listings.sql | ✅ Applied manually |

## Key decisions

### Profile system (003)
- New profile fields added to existing `profiles` table (not separate): `trading_region`, `international_trading_enabled`, `allow_trade_requests`, `allow_messages`, `profile_visibility`.
- `updateProfile` uses upsert so it works for pre-trigger accounts.
- Usernames always stored lowercase; unique index on `lower(username)`.
- `complete-profile` is a root Stack screen guarded by `AuthGuard` which checks `needsUsername` from `ProfileContext`.
- Find Collectors and Collector Profile are pushed Stack screens, not extra tabs.

### External sale listings (004)
- `external_sale_listings.pin_id` is the internal UUID (not pinhunt_id).
- `createExternalSaleListing` and `getExternalListingsForPin` both accept pinhunt_id and resolve to UUID internally — consistent with `addPinToCollection`.
- URL validation is client-side in `utils/marketplaceUrl.ts`; domain allowlists for vinted/ebay, any https:// for other.
- `useMarketplace` hook (not context) — screens manage their own fetch state.
- Listings section in pin detail only shows "List for Sale" CTA when pin is marked `for_trade`.

### Views and Database type
- `Views: Record<string, never>` must stay in `database.types.ts`. Adding a typed view entry breaks all table type inference (resolves as `never[]`). Use `as unknown as` casts in the repo for view queries.

## Outstanding items

1. **Avatar upload** — deferred; `avatar_url` field exists in DB/types but upload UI skipped (no storage bucket yet). Shows initials only.
2. **Catalogue data** — pins table is empty; `SUPABASE_SERVICE_ROLE_KEY` not yet set. Import pipeline not run.
3. **Storage buckets** — avatars, catalogue-images, user-pin-images, scan-images need creating in Supabase dashboard with policies from `002_rls.sql` comments.
4. **`SUPABASE_SERVICE_ROLE_KEY`** — needed for the import pipeline (admin operations). Not yet added to Replit secrets.
5. **Expo typecheck** — passes clean as of last session (`tsc --noEmit` exits 0).
