# Release configuration (#20, B-P0-08)

What is committed for store builds, and the manual steps only the maintainer
can do. Agents never run `eas build`, `eas submit` or anything that signs in to
Expo, Apple or Google. Everyday TestFlight and OTA use is in `EAS-PREVIEW.md`.

## What is in the repo

| Setting | Value | Where |
|---|---|---|
| App name | `PinHunt` (#19) | `app.json` → `expo.name` |
| iOS bundle identifier | `uk.pinhunt.app` (already registered, unchanged) | `app.json` → `ios.bundleIdentifier` |
| Android package | `uk.pinhunt.app` (new) | `app.json` → `android.package` |
| Marketing version | `1.0.0` | `app.json` → `version` |
| Build number / versionCode | Managed by EAS (`appVersionSource: "remote"`, `autoIncrement` on store profiles). Not stored in `app.json`, because EAS ignores local values in remote mode. | `eas.json` |
| Runtime version | `{ "policy": "fingerprint" }` | `app.json` + `fingerprint.config.js` |
| Camera string | "PinHunt uses the camera to scan pins, take photos of pins you add and take your profile picture." | `expo-camera` and `expo-image-picker` plugin options |
| Photo library string | "PinHunt uses your photos so you can choose pictures to identify or add a pin, share in posts and chats, and use as your profile picture." | `expo-image-picker` plugin options |
| Microphone | Not requested (`microphonePermission: false`, `RECORD_AUDIO` removed) | plugin options |
| Location | Not requested. `expo-location` was installed but never imported, and its auto-applied plugin added generic "Always" location and motion strings on iOS and fine/coarse location on Android. It is removed. | `package.json` |
| Android overlay permission | `SYSTEM_ALERT_WINDOW` blocked in the release manifest (debug builds keep it for the dev menu) | `app.json` → `android.blockedPermissions` |
| Export compliance | `usesNonExemptEncryption: false` | `app.json` → `ios.config` |
| Replit | `expo-router` `origin: "https://replit.com/"` unchanged | `app.json` |

### EAS profiles (`eas.json`)

| Profile | Distribution | Channel | EAS environment | Notes |
|---|---|---|---|---|
| `development` | internal | `development` | `development` | Ad hoc iOS build / Android APK for named devices. Not a dev client: that needs `expo-dev-client`, which would be a separate decision. |
| `preview` | store | `preview` | `preview` | TestFlight + Play **internal** track. Points at staging. |
| `production` | store | `production` | `production` | App Store / Play production track. Unused until launch. |

Per-profile values (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_API_BASE_URL`) live in EAS environment variables, never in
`eas.json`. Submit profiles: iOS uses the existing `ascAppId`; Android submits
to `internal` (preview) or `production`, both with `releaseStatus: "draft"`, so
nothing is rolled out until someone presses the button in Play Console.

`__tests__/releaseConfig.test.ts` (part of `pnpm test`) fails if identifiers,
purpose strings, profiles or the Replit origin disappear, if location comes
back, or if `eas.json` gains anything that looks like a credential.

## Runbook (maintainer)

Do these in order. Nothing here is automated.

1. **Check the identifiers.** iOS stays `uk.pinhunt.app` (already registered,
   TestFlight builds exist). Confirm `uk.pinhunt.app` is what you want for
   Android: a Play package name **can never be changed** after the first upload.
2. **EAS environments.** expo.dev → `@alperahm1990s-team/uk-pin-app` →
   Environment variables. `preview` should already have staging values (see
   `EAS-PREVIEW.md`). Add the same three variables to `development` (staging).
   Leave `production` empty until the production API exists.
3. **Apple.** Nothing new: the App Store Connect app, certificates and
   `ascAppId` already exist. The camera/photo strings changed and
   `expo-location` was removed, so the native fingerprint changes: the next
   `testflight-build` is required before OTA updates reach phones again.
4. **Google Play** (once):
   - Create the Play developer account and an app with package
     `uk.pinhunt.app`.
   - Google Cloud → service account with Play Console access ("Release
     manager" for this app). Download its JSON key. **Do not commit it.**
     Upload it with `npx eas-cli@latest credentials -p android` → Google
     Service Account → upload key. EAS stores it.
   - First build, interactive, from `artifacts/pinhunt` with a clean
     `git status`:
     ```sh
     npx eas-cli@latest build --platform android --profile preview
     ```
     Let EAS generate and store the upload keystore. Enrol in Play App
     Signing when Play Console asks.
   - Play requires the very first AAB to be uploaded by hand: download it
     from the EAS build page and upload it to Internal testing in Play
     Console. After that, `npx eas-cli@latest submit -p android --profile preview`
     works and creates a draft release on the internal track.
   - Complete Data safety, content rating, target audience and the account
     deletion URL before external testing.
5. **iOS build with the new config:**
   ```sh
   npx eas-cli@latest build --platform ios --profile preview --auto-submit
   ```
   On the device, open Scan and allow the camera: the new camera text should
   show. Settings → PinHunt should list only Camera and Photos (no Location).
6. **Development profile (optional).** Register devices with
   `npx eas-cli@latest device:create`, then
   `npx eas-cli@latest build --profile development --platform ios`.

## Rollback

All changes are config only; no data or server is touched.

- Revert the PR. That restores `expo-location`, the old strings and the
  missing Android package. Run `pnpm install` afterwards.
- Builds already uploaded stay in TestFlight / Play; expire or halt them in
  the store console if needed. Remote build numbers keep counting up, which
  is harmless.
- Because the fingerprint changes in both directions, a reverted app needs a
  new store build before OTA updates match it again.
- Do not revert the Android package after an AAB has been uploaded to Play:
  the package is permanent there.
