---
name: Expo web action confirmations
description: Cross-platform confirmation behavior for important user actions in Expo web previews.
---

Do not rely on callback buttons inside native `Alert.alert` for important actions that must work in Expo web. Use an in-app modal or bottom sheet with ordinary pressable controls instead.

**Why:** In the web preview, action alerts could appear or be invoked without their button callback running, leaving attachment and trade-confirmation flows inert even though the native implementation looked valid.

**How to apply:** Use native alerts for informational errors only. For menus or confirmations that trigger uploads, database writes, navigation, or status changes, render the controls inside the app and test them in the web preview.