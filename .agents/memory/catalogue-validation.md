---
name: Catalogue validation via eBay
description: How the eBay-evidence validation of pin records works and its safety rules
---
- Findings live in `pin_ebay_validations` (suggestions only); pins change only via the decision endpoint, which calls the `apply_validation_changes` Postgres function so the pin update and `pin_change_audit` rows commit atomically.
- **Why:** spec requires every approved change to be audited and reversible; a two-step update+insert could leave unaudited changes.
- Only one validation run may be `running` at a time — enforced by a unique partial index on `ebay_validation_runs`, not just in-process state. Map Postgres error code 23505 to a 409.
- Vague records ("Mickey pin") are marked `insufficient_data` and never searched — forcing matches on generic names creates false corrections.
- A strong match (85+) requires ≥2 independent agreeing listings unless there's an exact SKU hit; suggestions (year/LE size) require ≥2 listings agreeing.
- Always label eBay prices as *current asking prices* in UI and notes — never value or sold price.
- Re-imports protect admin-corrected fields: columns with `pin_change_audit` rows keep their DB value over the spreadsheet value, unless the import request passes `overwriteProtectedFields: true`. Protection loading fails closed — an audit-read failure aborts the import.
- Pin selection round-robins across brand/origin/edition buckets plus "incomplete" and "speculative" buckets, and skips pins with any existing validation row, so successive runs extend coverage.
