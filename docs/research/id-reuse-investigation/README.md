# Reused pinhunt_id investigation (read-only)

**Status:** investigation only. No data, schema or code was changed. I had no database access here (no Supabase credentials). Live impact must be confirmed by running `impact_queries.sql`, which is SELECT-only, in the Supabase SQL editor.

## What happened

- **Import:** the trusted-catalogue import (`artifacts/api-server/scripts/import-trusted-catalogue.mjs`, apply run **2026-07-31 20:59:39Z**) upserts by `pinhunt_id` first.
- **Collision:** the Trusted Test Catalogue reused `pinhunt_id`s already held by rows in the 13,000-row speculative seed.
- **Import logs** (`attached_assets/trusted-import-log-*.json`) confirm the result:
  - `inserted: 0, updated: 182, matchedBy.pinhunt_id: 182`. Every trusted pin **overwrote an existing seed row in place**: same `pins.id` UUID, new title, characters and series.
  - `archived: 12818`. The rest of the seed was archived.
  - `remap.untouched: 42`. User pins on archived rows had no confident match and were left alone.

So the scope is wider than the 25 IDs flagged in the first POC. Comparing all 182 trusted rows with the seed row that held the same ID before the import (`id_reuse_classification.csv`):

| Classification | IDs | Meaning | Risk |
|---|---|---|---|
| Same pin (refined) | 82 | Same design, better metadata | None |
| Placeholder → specific | 14 | e.g. "January 2026 – Windows of Attraction" became "Haunted Mansion – Windows of Attraction". Same release slot. | Low |
| **Same series, different design** | **86** | The ID now means a different pin. | **High**, for any user record created before the import |

**The 86 repurposed IDs by set**

| Set | IDs | Example |
|---|---|---|
| Animated Cuties | 8 | `PHUK-00000331` "Mickey Mouse – Animated Cutie" → "Alice" |
| Brush of Magic Mystery Series 1 | 10 | `PHUK-00000625` "Mickey Paintbrush" → "Dopey" |
| Daring Detectives (DLR) | 10 | |
| Daring Detectives (WDW) | 10 | |
| Ducks of Disney Series 2 | 16 | |
| Ice Cream Bar Series 2 | 16 | |
| Wishables Shimmer | 16 | `PHUK-00000511` "Mickey Mouse Wishable" → "Sarah Sanderson" |

All 86 seed rows were "AI expanded – speculative", so the *old* meaning was invented anyway. The risk is not lost truth. It is that a user's record silently changed which pin it refers to.

Of the 25 IDs from the first POC: 7 (Windows of Attraction) are benign placeholder refinements, and 18 (Animated Cuties, Brush of Magic) are repurposed.

## Is existing user data affected?

**What the repo evidence shows:**
- **Few rows at the time:** the import found **47 `user_pins`** in total (per `.agents/memory/trusted-catalogue.md`).
- **42 safe from this issue:** they pointed at seed rows that were then archived, so they still show their original (speculative) pin to their owners.
- **5 pointed at the 182 overwritten rows.** It is not known from the repo whether any of those 5 were on the 86 repurposed IDs or on the 82 refined ones.
- **Remap step:** it only looked at user pins on *archived* rows, so it never examined these 5.
- **Showcase account:** created later (August), it references pins by UUID created after the import. It is not affected.
- **Boards and structured messages** came later (migrations 031 and 043). `user_boards.pin_ids` stores `pinhunt_id` strings, but anything created after 31 July used the current meanings.

**Record types that could carry a stale meaning** (created before the import, keyed to a repurposed ID):
- `user_pins` (owned / wanted / for_trade) and, through them, `trade_items`
- `external_sale_listings`
- `community_posts.linked_pin_id`
- `conversations.context_pin_id`
- Pin-level caches attached to the UUID: `pin_market_estimates` (eBay estimates computed for the seed title), `pin_images`, `scan_attempts.matched_pin_id`, eBay validation results

**Likely impact:** small, at most 5 collection rows plus any pre-import listings, posts or market estimates. Most of these were probably test or beta accounts. **Not yet confirmed.** Run `impact_queries.sql`: it counts rows per table that point at the 86 (and 14) IDs and were created before the import.

## Recommendations (no action taken)

1. Run `impact_queries.sql` (read-only). If any count in `created_before_import` is greater than 0 for user-facing tables, review those rows with their owners before any further catalogue work.
2. **Invalidate pin-level caches** on the 86 repurposed UUIDs (market estimates, eBay validations, any eBay-backfilled images). They describe the old seed title. This is a later, approved data change.
3. **Rule for every future import:** never repurpose a `pinhunt_id`. Match on `pinhunt_id` *and* verify the name and character still agree. Otherwise mint a new ID and archive the old row. The research engine in `research/catalogue-engine/` never mints or reuses IDs; it only proposes `RESEARCH-NEW` rows.
