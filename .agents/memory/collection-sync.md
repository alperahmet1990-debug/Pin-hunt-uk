---
name: Collection cloud sync
description: How the user collection syncs between AsyncStorage and Supabase user_pins, and the catalogue-slice pitfalls that bit us.
---

# Collection cloud sync

- Collection is no longer AsyncStorage-only. `CollectionContext` pulls `user_pins` (join `pins(pinhunt_id)`) on sign-in, pushes status changes via SECURITY DEFINER RPC `set_user_pin_status` (migration 024), with a persisted pending-push queue, pull retry (3×5s), and server-authoritative reconcile for returning users.
- Account hygiene: local collection is cleared on sign-out and on a different account signing in (`@pinhunt_collection_owner_v1` tracks the owning account). Guest data is adopted and pushed up on first sign-in.
- **Pitfall — catalogue slice races:** `PinCatalogueContext` loads only a ~500-pin slice. `fetchCatalogue` must MERGE into state, not replace — replacing silently wiped pins already added by `ensurePins` (the bug showed as "synced pins counted in header but invisible in UI").
- **Pitfall — set totals:** set completion/ghost slots must not be computed from the slice; the Collection screen calls `ensureCollections(names)` (fetch full sets by `collection` name) or every partially-loaded set looks "complete".
- `user_pins.pin_id` is the internal UUID; app pin ids are `pins.pinhunt_id`. Any query taking an app pin id must resolve the UUID first (a raw `.eq('pin_id', pinhuntId)` 400s with invalid-uuid).
- Expo web testing quirk: `window.scrollY` is always 0 — ScrollView scrolls an inner div; measure that div's scrollTop instead.
