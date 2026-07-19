# PinHunt UK

A production-quality iPhone-first Expo React Native app for Disney pin collectors in the UK.

Browse the catalogue, manage your collection, scan pins with AI, and trade with other collectors.

---

## Architecture

```
pinhunt-uk/
├── artifacts/
│   ├── pinhunt/          Expo React Native app (iOS-first)
│   └── api-server/       Express API server (AI scan, admin)
├── lib/
│   └── pin-repository/   Shared library — types, repository interface, Supabase impl
├── scripts/              Node.js scripts — catalogue import, setup verification
└── supabase/
    └── migrations/       SQL migration files (apply manually in Supabase SQL editor)
```

### Repository pattern

All catalogue data flows through a single interface:

```
Screen → usePinCatalogue() → PinRepository interface → SupabasePinRepository → Supabase
```

No screen may import from `mock-data/` or call Supabase directly.
The mock fallback only activates when `EXPO_PUBLIC_SUPABASE_*` env vars are not set.

### Data model highlights

- `pins.id` is a UUID primary key (internal, never exposed to the app)
- `pins.pinhunt_id` is the stable public identifier (e.g. `PHUK-00000001`)
- Characters and categories live in normalised lookup tables (`characters`, `categories`) joined via `pin_characters` and `pin_categories`
- Public reads are gated on `verification_status = 'verified'` via Supabase RLS
- The anon key automatically enforces this — no client-side filtering needed

---

## Local setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Expo Go app on your phone (or iOS Simulator)
- A Supabase project (free tier is fine)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure Replit Secrets

Add these in the Replit Secrets panel (or in a `.env` file for local dev):

| Secret | Where used | Notes |
|--------|-----------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | Expo app | From Supabase → Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Expo app | Public anon key — safe to expose |
| `SUPABASE_URL` | API server, scripts | Same URL as above |
| `SUPABASE_ANON_KEY` | API server | Same anon key as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Import script, admin routes | **Never commit or expose client-side** |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | API server (scan) | Via Replit AI Integrations |
| `SESSION_SECRET` | API server | Any random string |

### 3. Apply Supabase migrations

In the [Supabase SQL editor](https://supabase.com/dashboard), run these files **in order**:

1. `supabase/migrations/001_schema.sql` — creates all 17 tables, triggers, indexes
2. `supabase/migrations/002_rls.sql` — enables Row Level Security on all tables

### 4. Create Storage buckets

In Supabase → Storage, create four buckets:

| Bucket name | Public? | Purpose |
|-------------|---------|---------|
| `avatars` | ✅ Yes | User profile photos |
| `catalogue-images` | ✅ Yes | Official pin front/back images |
| `user-pin-images` | ❌ No | Photos taken by individual collectors |
| `scan-images` | ❌ No | Temporary AI scan uploads |

Then apply the storage RLS policies documented as comments at the bottom of `002_rls.sql`.

### 5. Verify setup

```bash
pnpm --filter @workspace/scripts run verify
```

This checks DB connectivity, schema completeness, RLS correctness, and auth endpoint reachability.

### 6. Import the catalogue

```bash
# Standard import (keeps verification_status from spreadsheet)
pnpm --filter @workspace/scripts run import path/to/catalogue.xlsx

# Development shortcut — marks all imported pins as 'verified' so they appear in the app immediately
pnpm --filter @workspace/scripts run import:verify-all path/to/catalogue.xlsx
```

> **⚠️ Important:** Pins with `verification_status ≠ 'verified'` are hidden from the app by RLS.
> If you run a standard import and the app shows no pins, either use `import:verify-all` or run:
>
> ```sql
> UPDATE pins SET verification_status = 'verified' WHERE verification_status != 'verified';
> ```

The import is idempotent — safe to run multiple times. Existing rows are updated in place.

Alternatively, seed 20 mock development pins via the API:

```bash
curl -X POST http://localhost:3001/api/admin/seed-pins
```

---

## Running the app

```bash
# Expo app (scan the QR code with Expo Go)
pnpm --filter @workspace/pinhunt run dev

# API server (scan routes, admin)
pnpm --filter @workspace/api-server run dev
```

Or use the Replit workflow buttons.

---

## Authentication

Email/password auth is implemented via Supabase Auth.

- Sessions persist to `AsyncStorage` and survive app restarts
- `AuthContext` wraps `supabase.auth` and exposes `signIn`, `signUp`, `signOut`, `session`, `user`
- `AuthGuard` in `_layout.tsx` redirects unauthenticated users to `/(auth)/login`
- On sign-up, Supabase fires the `handle_new_user` trigger which creates a `profiles` row automatically

No OAuth providers are configured yet. To add Google/Apple sign-in:
1. Configure the provider in Supabase Dashboard → Authentication → Providers
2. Add the scheme redirect in `app.json` (`scheme: "pinhunt"`)
3. Update `AuthContext.tsx` to call `supabase.auth.signInWithOAuth()`

---

## AI Scan

The mobile app posts images to `POST /api/scan/identify` on the API server.
The API server loads the current verified catalogue and asks GPT-4 Vision to match the pin.

```
Phone camera → POST /api/scan/identify → GPT-4V → [{pin, confidence}] → app
```

The mobile app never calls OpenAI directly.

---

## Future: Licensed external catalogue API

The app is architected to support a licensed external catalogue API (e.g. PinPics, official Disney data)
without changing any screen code.

To add an external data source:
1. Implement `PinRepository` in `lib/pin-repository/src/`
2. Optionally wrap both sources in a `CachedPinRepository` or `MergedPinRepository`
3. Update `PinCatalogueContext.tsx` to swap the implementation

---

## Contributing

- All catalogue writes go through `PinRepository.createPin()` / `updatePin()` — never raw SQL from app code
- New screens must use `usePinCatalogue()` — never import mock data directly
- Database schema changes → new migration file in `supabase/migrations/`
- Keep `lib/pin-repository/src/database.types.ts` in sync with the schema manually (or use `supabase gen types` if the CLI is available)

---

## Manual steps checklist

Before going live, ensure these are done:

- [ ] Supabase migrations `001_schema.sql` and `002_rls.sql` applied
- [ ] Storage buckets created with correct public/private settings
- [ ] Storage RLS policies applied (see `002_rls.sql` comments)
- [ ] Catalogue imported with `import:verify-all`
- [ ] `SESSION_SECRET` set to a strong random value
- [ ] Admin routes in `api-server` protected behind authentication
- [ ] Apple/Google sign-in configured (optional but recommended for UX)
