# Full-screen scan camera: investigation (UX-009a, #290 for #117)

This is the "investigate first" step of #117: should the Find tab use a live,
full-screen camera with framing guidance instead of the system camera?
This note covers what that takes and recommends how to go ahead.

## How scanning works today

- The Find tab shows a large card that looks like a viewfinder but is only a
  button. Tapping it opens the **system camera** (`expo-image-picker`
  `launchCameraAsync`) with `allowsEditing` and a 1:1 crop.
- The photo goes through `prepareScanPhoto`, which makes one 1024 pt JPEG,
  then to `POST /api/scan/identify`. Identification starts as soon as the
  photo is taken (#115).
- There is no guidance at the moment of capture. Two common causes of bad
  matches are several pins in one frame and backer cards in shot.
- Every scan needs 3 taps before identification starts: Scan, the shutter,
  then "Use Photo" on the crop screen.

## The option: `expo-camera`

| Question | Finding |
|---|---|
| **Expo 57 compatibility** | `expo-camera ~57.0.4` is the version Expo 57 bundles (`expo/bundledNativeModules.json`), so `npx expo install expo-camera` picks a matching version. It uses `CameraView` and the `useCameraPermissions` hook. |
| **Dependency size** | The npm package unpacks to about 30.7 MB, mostly native iOS and Android source for both platforms. That isn't what the app grows by. To measure the real cost, compare the EAS build sizes before and after; expect a few MB. |
| **Native change** | Yes. It changes the runtime fingerprint, so it **needs a new TestFlight build** (`testflight-build`). After that, OTA updates only reach the new build, and the old TestFlight build stops receiving them. |
| **Permissions** | **Camera only.** The live preview doesn't use the microphone, so `recordAudioAndroid: false` and no microphone text is needed. The photo library is still the existing picker. |
| **Permission text (already true today)** | The current build uses iOS's generic defaults ("Allow PinHunt to access your camera / photos"), because neither plugin sets its own wording. App Review prefers a specific reason. Set it through plugin config at the same time as adding `expo-camera`, since it's the same native build. Suggested wording: camera "PinHunt uses the camera to identify pins you scan."; photos "PinHunt uses your photos to identify a pin from a picture you already took." |
| **Permission flow** | On first use of the Find tab: (1) show the camera if access was already granted; (2) if not decided yet, a short explanation card with an "Allow camera" button that triggers the system prompt; (3) if denied, "Choose from Photos" plus "Open Settings" (`Linking.openSettings()`). Scanning always works from the library, so a denied camera never blocks it. |
| **Web** | `expo-camera` has web support through the browser camera on HTTPS, but it's unreliable across browsers and the web build is mainly for demos and screenshots. **Recommendation: keep today's photo-picker flow on web** (`Platform.OS === 'web'`). |
| **Capture → identify** | `takePictureAsync()`, then crop to the on-screen frame square with `expo-image-manipulator` (already installed), then the existing `prepareScanPhoto` → identify. The system crop screen goes away, so a scan is **one tap**. |
| **Torch** | The `enableTorch` prop on `CameraView`, as a toggle button. Useful for pins in display cases. |
| **Framing guidance** | Corner brackets around a square frame, plus a one-line coach: "One pin, fill the frame." A gentle pulse on the brackets is switched off with Reduce Motion (`AccessibilityInfo.isReduceMotionEnabled`). |
| **Search** | A search field at the top of the Find tab, opening the existing Search screen. |
| **Testing** | Jest can cover the permission states and the crop maths. The camera itself needs a device: iPhone via TestFlight, plus Android if available (#85 device matrix). |

## Risks

- **A native build is required.** Anything merged after the camera PR reaches
  your phone only once you've installed the new TestFlight build.
- **Battery and heat:** keep the camera active only while the Find tab is
  focused (`useIsFocused`).
- **Android camera differences** (aspect ratio, autofocus): test on at least
  one device before release.
- #117's own condition is to decide once real scans show that framing is the
  main failure. We don't have that data yet. #263 (scan accuracy telemetry)
  would provide it, but it needs a privacy decision.

## Build plan if approved

1. **PR A, native (TestFlight build):** add `expo-camera`; set specific camera
   and photo permission text through the `expo-camera` and `expo-image-picker`
   config plugins; no UI change. After merging, run `testflight-build` and
   install from TestFlight.
2. **PR B, UI (OTA):**
   - full-screen `CameraView` on the Find tab, with frame, coach line and torch;
   - library button, search field and the permission states;
   - the web fallback;
   - one-tap capture → crop → identify (the "Scan next pin" flow from #264 is kept);
   - tests for the permission states and the crop;
   - device check before merge.

Splitting it this way means the risky native step is small and checked on
the phone first, and the UI arrives by OTA in the usual way.

## Recommendation

Go ahead. The 3-tap system camera is the biggest remaining friction in the
main flow, and adding framing guidance targets the most common bad-photo
causes. The cost is one TestFlight build. Do PR A first, then PR B. Read the
accuracy telemetry (#263) when it exists rather than waiting for it, as the
maintainer's 12 Oct note asks: "don't delay a working scanner", and this
replaces nothing until it's ready.
