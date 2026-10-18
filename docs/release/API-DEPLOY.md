# Deploying the API server (Render)

The production API server (`artifacts/api-server`) runs on **Render** as a web service at
`https://pin-hunt-uk.onrender.com`. The app reaches it through `EXPO_PUBLIC_API_BASE_URL`
(`https://pin-hunt-uk.onrender.com/api`), set in the Expo project's environment variables:
https://expo.dev/accounts/alperahm1990s-team/projects/uk-pin-app/environment-variables

The Replit configuration in this repo (`.replit`, `artifacts/*/.replit-artifact/`) is kept as a fallback
development environment (see CLAUDE.md). It is not where production runs.

## Deploy the latest `main`

1. Open https://dashboard.render.com, then the **pin-hunt-uk** service.
2. Open the **Events** tab and check the latest deploy shows the newest `main` commit.
   - If **auto-deploy** is on, merging to `main` deploys by itself.
   - If not: **Manual Deploy → Deploy latest commit**.
3. When it shows **Live**, open https://pin-hunt-uk.onrender.com/api/healthz. It should respond without an error.

## Release order when a change needs a migration

Migration (Supabase SQL editor; staging first, then production with approval) → API deploy (this page) → app
update (`ota-update`, see `EAS-PREVIEW.md`).

Example: photo-only submissions (#393/#394) need migration 047 before the API and app changes can work.

## Settings

Server secrets (Supabase service key, OpenAI, Google Vision, Pixian, eBay) are set in the Render service's
**Environment** tab, never in the repo. The variable names are listed in `.env.example`.

Optional contributor caps (#393): `CONTRIBUTOR_DAILY_SCANS`, `CONTRIBUTOR_DAILY_CLEANUPS`,
`CONTRIBUTOR_DAILY_SUBMISSIONS`. See `supabase/verify/047_RUNBOOK.md`.
