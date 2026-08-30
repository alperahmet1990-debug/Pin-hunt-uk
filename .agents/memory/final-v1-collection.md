---
name: Final V1 Collection architecture
description: The launch architecture and product rules for PinHunt's collector-facing Collection experience.
---

# Final V1 Collection architecture

Use one permanent category row: Boards, Sets, Traders, ISO. Boards is the default; All Pins is only a secondary search/filter result, never a primary destination.

**Why:** The launch experience must remain familiar and image-first without forcing collectors—especially large collectors—through a giant owned-pin grid or nested navigation.

**How to apply:** Keep Boards collector-created and multi-membership. Derive Sets dynamically from unique owned/for-trade catalogue membership and full catalogue set contents. Never add manual Track Set state or controls. Keep search, add, sharing, and one contextual Filter/Sort control close to content with practical 44px touch targets.

Set progress must wait for complete set-membership loading and agree across Collection, Home, and Set Detail. Duplicate quantity changes physical-copy counts but must not increase unique set-completion membership.

**Why:** Manual progress and partial catalogue slices drift from real ownership, while duplicate copies do not fill additional slots in an official set.

**How to apply:** Hydrate owned pin IDs, then load only the relevant full set collections through shared awaitable requests. Hide progress while those requests are in flight and retry empty/failed collection fetches.