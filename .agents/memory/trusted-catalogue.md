---
name: Trusted catalogue lifecycle
description: How the 182-pin trusted beta catalogue replaced the 13k speculative one — flags, RLS, importer, pitfalls
---

# Trusted catalogue

- Pins now carry `catalogue_status` ('trusted' | 'active' | 'archived') and `is_searchable`. The old 13k speculative pins are archived + unsearchable, NOT deleted; full pre-change backup lives in DB schema `backup_20260731`.
- Public read RLS: `(verification_status='verified' AND is_searchable)` OR the caller owns the pin via `user_pins`. Owners keep seeing archived pins they hold. Admins see everything (`pins_admin_read_all`).
- **Why the owner clause needs guarding:** `set_user_pin_status` is SECURITY DEFINER — without an eligibility check users could "claim" archived pins to read them. Migration 028 blocks adding non-searchable pins unless already owned; keep this invariant if the function is edited.
- Reusable importer: `artifacts/api-server/scripts/import-trusted-catalogue.mjs` (node, service role). Flags: `--dry-run` / `--apply --archive-rest --remap-user-pins`. Upserts by pinhunt_id → Pin&Pop id → normalised name+series+year. Fail-safe: any row error skips archive/remap. Always clears pin_characters before reinsert.
- `pin_sets` table drives "X of Y released" for ongoing monthly sets (Enchanted Doors, Windows of Attraction: 7 of 12). Never create blank future-month pins.
- Search is tokenised: each word of a multi-word query must match one of title/brand/collection/characters/search_aliases/normalised_series/main_subject/release_scope — needed so "2026 mystery" works via aliases.
- Never show internal validation tiers (e.g. "Gold – Web checked") to users; the only user-facing signal is the "Verified catalogue pin" badge for `catalogueStatus==='trusted'`.
- 42 of 47 user_pins remain pointed at archived pins (no confident trusted match); they stay visible to owners via RLS. Remap only on pinhunt_id / Pin&Pop / normalised-triple matches.
