# Deploying the API server (Render)

The API server (`artifacts/api-server`) runs on **Render** as two web services, both building `main`:

| Service | Address | Supabase project | Used by |
|---|---|---|---|
| `pinhunt-api-production` (since 15 Nov 2026) | `https://pinhunt-api-production.onrender.com` | production | TestFlight (`preview`) |
| `pin-hunt-uk` | `https://pin-hunt-uk.onrender.com` | staging | `development` builds, contributor-website preview, staging test runs |

Build command `NODE_ENV=development npx --yes pnpm@9.15.9 install --frozen-lockfile && npx --yes pnpm@9.15.9 --filter @workspace/api-server run build`,
start command `node --enable-source-maps artifacts/api-server/dist/index.mjs`, root directory blank, auto-deploy on commit.
The production service sets `NODE_ENV=production` and `PIXIAN_TEST_MODE=false`, and leaves out the eBay
account-deletion variables (eBay's notices still go to staging's address) and the switched-off feature flags.

The app reaches the API through `EXPO_PUBLIC_API_BASE_URL`, set in the Expo project's environment variables:
https://expo.dev/accounts/alperahm1990s-team/projects/uk-pin-app/environment-variables

The Replit configuration in this repo (`.replit`, `artifacts/*/.replit-artifact/`) is kept as a fallback
development environment (see CLAUDE.md). It is not where production runs.

## Deploy the latest `main`

1. Open https://dashboard.render.com, then each service in turn (**pinhunt-api-production** and **pin-hunt-uk**).
2. Open the **Events** tab and check the latest deploy shows the newest `main` commit.
   - If **auto-deploy** is on, merging to `main` deploys by itself.
   - If not: **Manual Deploy → Deploy latest commit**.
3. When it shows **Live**, open `/api/healthz` on that service's address. It should respond without an error.

## Release order when a change needs a migration

Migration (Supabase SQL editor; staging first, then production with approval) → API deploy (this page) → app
update (`ota-update`, see `EAS-PREVIEW.md`).

Example: photo-only submissions (#393/#394) need migration 047 before the API and app changes can work.

## Settings

Server secrets (Supabase service key, OpenAI, Google Vision, Pixian, eBay) are set in the Render service's
**Environment** tab, never in the repo. The variable names are listed in `.env.example`.

Optional contributor caps (#393): `CONTRIBUTOR_DAILY_SCANS`, `CONTRIBUTOR_DAILY_CLEANUPS`,
`CONTRIBUTOR_DAILY_SUBMISSIONS`. See `supabase/verify/047_RUNBOOK.md`.
