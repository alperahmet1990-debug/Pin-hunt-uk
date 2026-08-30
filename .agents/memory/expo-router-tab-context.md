---
name: Expo Router tab context
description: Navigation rule for actions launched inside one tab that must return to that exact tab.
---

Do not navigate to another tab for an action that is expected to behave like a pushed detail flow with reliable back navigation. Use an existing stack route or keep the action inside the originating tab.

**Why:** Launching an add flow by switching from Collection to the Scan tab made browser/app back land on the default Discover tab rather than returning to Collection.

**How to apply:** Use tab routes for deliberate primary-tab changes. For contextual search, selection, or add flows, push a stack screen; if the behavior can remain local, open an in-app sheet or switch local view state instead.