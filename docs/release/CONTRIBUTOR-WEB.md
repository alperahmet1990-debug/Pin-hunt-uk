# Contributor website (EAS Hosting)

One link for invited contributors to use PinHunt from any phone or computer, without TestFlight (#398).

It's the same app and the same accounts as the phone app, running in a browser. Someone who signs up on the
website can sign in on the phone, and the other way round. The contributor role, submissions and history are
shared too.

## What it is

- **Build:** `artifacts/pinhunt/scripts/build-contributor-web.mjs` exports the real app for web
  (`expo export --platform web`) against a real backend.
- **Settings:** it needs three public values, which ship inside the app anyway:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_API_BASE_URL` (production: `https://pin-hunt-uk.onrender.com/api`; see `API-DEPLOY.md`)
- **Safety built in:**
  - Demo mode is refused.
  - The anon key must really be an anon key.
  - Pages are `noindex` and `robots.txt` blocks crawling, because the site is invite-only.
  - Before anything can be published, a **credential scan** (`scripts/lib/webLeakCheck.mjs`, tested by
    `pnpm --filter @workspace/pinhunt run test:web-leak`) refuses any JWT that isn't `role: anon`, Supabase
    secret or personal keys, OpenAI keys, Google service-account keys, and server-only settings with values.
- **Direct links:** links people open from outside the app (`/login`, `/register`, `/reset`, `/update-password`,
  `/add-pin`, `/contribute`, `/my-submissions`) are written out as real pages, so they work without an SPA
  fallback.
- **Password reset on the web:** reset emails come back to `<site>/reset`, not to the phone app's
  `pinhunt://reset`.

## One-time setup (maintainer)

1. **GitHub environments** (Settings → Environments). Create `contributor-web-preview` and
   `contributor-web-production`. Each gets three **variables** (not secrets; these values are public):
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL`.
   - Preview: the **staging** Supabase project and a staging API.
   - Production: the production values from the Expo project's environment variables.
   - Restrict both to the `main` branch.
2. **Workflow.** Copy `docs/release/proposed/contributor-web.yml` to `.github/workflows/contributor-web.yml` in a
   PR labelled `human-approved-config`. Agents can't edit `.github/**`.
3. **Supabase Auth URLs** (each project → Authentication → URL Configuration). Add the site's reset address to
   **Redirect URLs**:
   - staging: `https://<contributor-preview address>/reset`
   - production: `https://<production address>/reset` (and the custom domain, if you add one)

   Keep `pinhunt://reset` for the phone app.
4. **API CORS.** The API currently allows every origin (`cors()` in `app.ts`), so the website works as is. It
   could later be limited to the website's address plus the app.
5. **Custom domain (optional).** In the Expo dashboard → Hosting, add a domain such as `contribute.<your
   domain>`, then add its `/reset` to Supabase as in step 3.

## Releasing

1. **Preview (staging).** Run the workflow with `target = preview`. Open the `contributor-preview` address and
   test on a phone and a desktop:
   - register, sign in, sign out
   - forgot password: the email link lands on "Set a new password"
   - Add a pin with just a photo (web upload)
   - Help Build the Catalogue filters (needs the contributor flag)
   - My Submissions
2. **Maintainer review.** Tick the security checklist below.
3. **Production.** Run the workflow with `target = production` and `confirm = production`.

### Security checklist (before production)

- [ ] The build step's log says `credential scan clean`.
- [ ] The production environment variables hold the **anon** key, never the service-role key.
- [ ] Supabase redirect URLs list only your own sites and `pinhunt://reset`.
- [ ] `robots.txt` on the live site says `Disallow: /`.
- [ ] The contributor feature (`catalogue_contributions`) is still limited until you open it (launch checklist
  #399).
- [ ] Usage caps are set on the API if wanted (`CONTRIBUTOR_DAILY_*`, see `API-DEPLOY.md`).

## Building locally

```sh
cd artifacts/pinhunt
EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… EXPO_PUBLIC_API_BASE_URL=… \
  pnpm run build:contributor-web          # → dist-contributor-web/ (gitignored)
```
