# Device compatibility audit — iPhone, iPad, Android

_Audited 8 Nov 2026 against `main` @ `d2f7ef2`. This was a static code review only: `node_modules` isn't installed in the audit environment, so no typecheck, tests or device runs were done._

## Summary

| Platform | Status | Effort to "good" |
|---|---|---|
| **iPhone** | Shipping target. Only a few known risks (below). | Small: testing, plus 3 fixed-width screens |
| **iPad** | **Off.** `ios.supportsTablet: false`, so iPads run the app in iPhone compatibility mode (scaled, portrait only). | Medium: enable, make layouts width-aware, then add a two-pane layout |
| **Android** | **Close.** Expo/RN runs the same code. Android tab bar, icons, keyboard and picker workarounds already exist. Not yet configured for the store. | Small–medium: config, store setup, device QA |

Market context: US iOS share is ~58%, UK ~51/49. Competitor pin apps are mostly iPhone-only, so Android is a gap PinHunt can fill, especially in the UK and France.

## Stack facts that matter

- Expo SDK **57**, React Native **0.86**, React 19, Expo Router, EAS Build/Update (fingerprint runtime). _`CLAUDE.md` still says SDK 54 / RN 0.81, so that needs updating._
- Auth is Supabase email. There's no Apple/Google sign-in, no IAP library and no push notifications. **That removes the three usual Android porting costs** (Play Billing, FCM, Google sign-in).
- Native modules in use: expo-camera, image-picker, image-manipulator, document-picker, file-system, sharing, haptics, blur, glass-effect, symbols, location, keyboard-controller, reanimated, gesture-handler, screens, svg. Every one of them supports Android.

## iPhone

1. **Screens that read the width once at load.** `Dimensions.get('window')` is read at import time in:
   - `app/(tabs)/community.tsx:38` (card width)
   - `components/QuickAddSheet.tsx:39` (board card width)
   - `app/community/post/[id].tsx:34` (image carousel paging)

   These are fine on a fixed iPhone, but they break on rotation, iPad Split View and Android foldables. Switch them to `useWindowDimensions()`.
2. **Small screens.** 320–375pt (SE/mini) is already handled in the classic tab bar (`narrow < 360`). Hero/home screens still need checking on an SE in TestFlight.
3. **Camera.** `takePictureAsync({ quality: 1 })` followed by one re-encode is sensible. Check ID accuracy on older/lower-end cameras and in dim light, and check memory on old devices given full-quality capture.
4. **iOS version floor.** Nothing currently forces a high minimum. Liquid Glass is already gated (`isLiquidGlassAvailable`). Supporting iOS 18+ covers almost all active devices.

## iPad

Current state: no tablet support, and no `isTablet`/`isPad` logic anywhere.

**Step 1 — enable (a few days of work, mostly QA)**
- Set `ios.supportsTablet: true`. The `orientation: "portrait"` setting also needs revisiting: iPad multitasking needs every orientation supported, or `requireFullScreen`.
- Fix the 3 width-at-import screens above.
- Cap content width on forms and detail screens. About 30 `maxWidth` uses already exist, so reuse that pattern.
- Grids are partly ready. `pinGridColumns()` already goes from 3 to 4 columns at ≥600pt, but the catalogue is hard-coded to 2 columns (`app/catalogue.tsx:81`). Add 5–6 columns at ≥900pt.
- iPad screenshots are required for App Store review once tablet support is on.

**Step 2 — the "richer" iPad experience (the two-screens idea)**
- **System Split View / Stage Manager** (PinHunt next to Safari, eBay or Messages) comes free once step 1 is done.
- **In-app two-pane layout:** an Expo Router layout that renders list + detail side by side at ≥768pt and falls back to the stack on phones. Good candidates:
  - Collection grid ↔ pin detail
  - Catalogue/set ↔ pin detail
  - Trade builder: *my For Trade* ↔ *their ISO* (`app/trade/[id].tsx`)
  - Community conversations ↔ chat
- Treat scanning as secondary on iPad. Holding up a tablet to scan is awkward, so make library/photo import prominent.

## Android

**Already in place**
- Classic `Tabs` with Feather icons on Android (`app/(tabs)/_layout.tsx`); SF Symbols and blur only on iOS.
- Android-specific modal/picker sequencing in `FullScreenCamera.tsx` and `community/chat/[id].tsx` (see `.agents/memory/expo-native-picker-presentation.md`).
- `removeClippedSubviews` on Android for large grids.

**Gaps**
1. **No Android config in `app.json`.** `"android": {}` has no `package`, `adaptiveIcon`, `edgeToEdgeEnabled`, permissions block or `versionCode` policy. Add at least `package: "uk.pinhunt.app"` and an adaptive icon foreground/background (only `icon.png` exists today). *Update (#20): `package` added and `versionCode` is managed remotely by EAS; the adaptive icon is still open.*
2. **No Android EAS submit profile.** `eas.json` `submit` only covers iOS. Add a Play service-account key and an internal-testing track. *Update (#20): `internal` / `production` tracks added as drafts; the service-account key is uploaded to EAS by the maintainer (see `RELEASE-CONFIG.md`).*
3. **Keyboard handling (highest UX risk).** About 20 screens use `KeyboardAvoidingView behavior={ios ? 'padding' : undefined}`. With RN 0.86 / Android 15+ edge-to-edge, `undefined` on Android can leave inputs hidden behind the keyboard; this needs checking on a real device. Affected areas include chat, post, trade, sell, auth and admin. `react-native-keyboard-controller` is already installed (only 4 uses), so standardising on its `KeyboardAvoidingView` is the clean fix.
4. **Camera differences.** Aspect ratio and autofocus vary by phone (already noted in `docs/design/scan-camera.md`). The crop-to-frame maths needs checking on 2–3 Android phones.
5. **Location permission.** expo-location is a dependency but has no plugin entry in `app.json`. Confirm how "Collectors Nearby" requests location and add the Android permission text. *Update (#20): nothing imports it and Nearby is hidden for V1, so the package was removed; no location permission is requested on either platform.*
6. **Store admin.** Google Play developer account, Data safety form, and closed testing (personal accounts need 12 testers for 14 days before production).
7. **eBay deletion webhook / account deletion.** `app/delete-account.tsx` exists, and Play also requires a web link for account deletion.

**Rough estimate:** 2–4 weeks to a Play Store closed test, most of it device QA rather than code.

## Recommended order

1. Quick fixes that help every platform: the 3 `Dimensions.get` screens and the keyboard standardisation.
2. Android config + EAS profile → internal test build on 2–3 phones (ties into issue #85 device matrix).
3. iPad step 1 (enable + width-aware layouts).
4. iPad step 2 (two-pane Collection/Trade).
5. Update `CLAUDE.md` versions and the "iOS-first" note once Android ships.

## Device test matrix (minimum)

| Device | Why |
|---|---|
| iPhone SE (3rd gen) | Smallest screen, older camera |
| iPhone 15/16 | Mainstream |
| iPhone Pro Max | Largest phone |
| iPad (10th gen) + iPad Pro | Split View, Stage Manager, two-pane |
| Samsung Galaxy A-series | Most common UK/FR Android, mid-range camera |
| Google Pixel | Reference Android |
| A foldable (optional) | Width changes at runtime |
