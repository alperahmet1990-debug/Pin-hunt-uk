---
name: Collection mutation ordering
description: Reliability rules for rapid collection changes and persisted local-state upgrades.
---

Collection writes for one pin must be serialized and coalesced to the latest desired value; different pins may still sync concurrently. Counter controls must apply deltas against synchronously updated latest state rather than values captured by the last React render. Any new required field in persisted collection entries must be normalized when loading older AsyncStorage data. Hydrating a persisted pending-write queue must trigger its own flush after verifying the stored owner matches the active account; it cannot rely on the initial server pull finishing later. Pull reconciliation must preserve local entries that still have pending or in-flight writes.

**Why:** Network responses and startup pulls can complete out of order, multiple taps can occur before React renders, old local caches do not contain newly required fields, and asynchronous storage hydration can finish after the startup flush. Each case can silently persist the wrong count unless handled independently.

**How to apply:** For any collection mutation or persisted-field addition, test out-of-order latency, same-turn repeated actions, a pre-change cached entry, delayed pending-queue hydration, and a stale pull resolving during a pending write.