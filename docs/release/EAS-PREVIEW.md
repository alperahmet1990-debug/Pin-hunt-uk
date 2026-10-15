# EAS preview: TestFlight builds and OTA updates

How the maintainer tests the latest approved (`main`) version of PinHunt on an
iPhone without a Mac running. Nothing here runs automatically.

## How it fits together

| Piece | Where | What it does |
|---|---|---|
| `expo-updates` | `artifacts/pinhunt/package.json` | Lets an installed build download new JS bundles over the air. |
| `runtimeVersion: { policy: "fingerprint" }` | `app.json` + `fingerprint.config.js` | The runtime version is a hash of everything native (native packages, Expo SDK, native `app.json` settings). An update is only delivered to builds with the same hash, so JS that needs new native code can never reach an old build. `eas.json` and `package.json` scripts are excluded from the hash. |
| `preview` build profile | `eas.json` | Store-signed iOS build for TestFlight, on the `preview` channel, using the EAS `preview` environment variables. Build numbers auto-increment on EAS. |
| `production` build profile | `eas.json` | Same, on the `production` channel. Not used yet. |
| Manual workflow (proposed) | `docs/release/proposed/eas-preview.yml` | GitHub Actions "Run workflow" button: `ota-update` or `testflight-build`, from `main` only. |

Development is unchanged: Replit / `expo start` / Expo Go ignore EAS Update.

Rule of thumb: **JS/TS or asset changes → OTA update. New native package, Expo
SDK upgrade, or `app.json` native settings → new TestFlight build.** If an OTA
update is published after a native change, it is not lost or harmful: installed
builds simply ignore it (the `eas update` log shows the runtime version it
targeted). Make a `testflight-build` and it picks the change up.

## Test data safety

Preview builds use whatever the EAS `preview` environment points at. Point it
at the **staging** Supabase project and a staging API server, never production:

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`: staging project.
- `EXPO_PUBLIC_API_BASE_URL`: an API deployment whose own Supabase settings point
  at the same staging project (sign-in tokens are checked against it), and
  whose scan/eBay keys you accept test usage on (AI scans cost money).
- Leave `EXPO_PUBLIC_DEMO_MODE` unset: demo mode only activates
  without Supabase anyway.

The `production` environment and channel stay unused until launch.

## One-time setup (maintainer)

Agents cannot run `eas`, edit `.github/**` or set secrets, so these steps are
manual.

1. **Expo project.** On expo.dev create a project with slug `pinhunt` and send
   the project ID (a UUID, not secret) and your Expo username. They go into
   `app.json` as `extra.eas.projectId`, `owner` and
   `updates.url = https://u.expo.dev/<projectId>`.
2. **EAS environment variables** (expo.dev → project → Environment variables →
   `preview`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
   `EXPO_PUBLIC_API_BASE_URL` (the public, always-on API server URL ending in
   `/api`). Use "Plain text" or "Sensitive" visibility, not "Secret": `EXPO_PUBLIC_*`
   values are embedded in the app bundle.
3. **First build, interactive (once).** From any computer with Node 20+ (a Mac,
   a Windows PC or a GitHub Codespace in the browser), from a checkout of this
   branch or `main` after merge, with a clean `git status`:

   ```sh
   corepack enable && corepack prepare pnpm@9.15.9 --activate
   pnpm install --frozen-lockfile
   cd artifacts/pinhunt
   npx eas-cli@latest login
   npx eas-cli@latest build --platform ios --profile preview --auto-submit
   ```

   Answer yes to: log in to Apple, generate a distribution certificate and
   provisioning profile, create the App Store Connect app, and create an App
   Store Connect API key. EAS stores all of these; nothing is committed.
   Run it from `artifacts/pinhunt` (where `eas.json` lives): EAS uploads the
   whole repo (about 180 MB, mostly `attached_assets/`) and installs the pnpm
   workspace from the root with the committed lockfile.
4. **`ascAppId`.** App Store Connect → the app → App Information → Apple ID
   (a number). It goes into `eas.json` → `submit.preview.ios.ascAppId` so CI
   can submit without prompting.
5. **TestFlight.** When the build finishes processing (about 10–30 min after
   upload), add yourself as an internal tester in App Store Connect → TestFlight
   and install the TestFlight app on the iPhone.
6. **Manual workflow (optional, enables the phone-only flow).**
   - expo.dev → Account settings → Access tokens → create a token.
   - GitHub → repo Settings → Environments → New environment `eas-preview` →
     Deployment branches: `main` only → add secret `EXPO_TOKEN`. Do not add it
     as a repository secret: those are readable by PR workflows.
   - Move `docs/release/proposed/eas-preview.yml` to
     `.github/workflows/eas-preview.yml` in a PR labelled `human-approved-config`.

## Everyday use

- **Test the latest approved JS:** GitHub → Actions → *EAS preview (manual)* →
  Run workflow → branch `main`, task `ota-update`. Then force-quit and reopen
  PinHunt on the iPhone (it may take two launches: the first downloads, the
  next runs it).
- **New native build:** same workflow with task `testflight-build`; install
  from TestFlight when Apple finishes processing.
- Without the workflow, the same commands run from any computer:
  `npx eas-cli update --channel preview --environment preview --platform ios --message "..."`.
