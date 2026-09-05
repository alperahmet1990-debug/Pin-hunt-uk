---
name: Collectible PinTrader rights record
description: Permission basis for using the Collectible PinTrader export as Catalogue V2's seed data/images — evidence pointers, not just DB metadata.
---

# Collectible PinTrader — rights record

Database-side rights gating lives in `catalogue_sources` (id `collectible_pintrader`, added in migration `037_catalogue_v2_provenance.sql`):

```
source_name            = Collectible PinTrader
rights_basis            = Public Creative Commons export + explicit permission from Collectible PinTrader developer
public_display_allowed  = true
storage_allowed         = true
app_use_allowed         = true
attribution_required    = true
exact_license_variant   = pending confirmation
```

The exact CC license variant (CC BY, CC BY-SA, CC0, etc.) is **not yet confirmed** — do not label it as any specific variant anywhere (code, UI, or docs) until it is.

## Evidence record

**TODO — fill in before relying on this for anything beyond the import itself:**

- **Date permission was received:** _(not yet supplied)_
- **Source/contact:** _(who confirmed it, and how — e.g. "Collectible PinTrader operator, via [channel]")_
- **Scope of permission granted:** data use + image storage + public display + app use, per the rights fields above — confirm this matches what was actually said
- **Location of retained evidence** (screenshot/message, if kept): _(not yet supplied — do not commit anything containing personal contact details to this repo; note a location instead, e.g. a specific local folder or password manager entry)_
- **Original public Creative Commons export statement/announcement:** _(link or exact quoted text, if available)_

## Two-part basis, both should hold up independently

1. The original public statement made when Collectible PinTrader's export was released — that the developer intended the data/images to be reusable under a Creative Commons approach, explicitly including use by other Disney pin apps/websites.
2. A subsequent direct confirmation from the Collectible PinTrader developer that PinHunt specifically has permission to use the export (data + images), including public display in the app.

Keep both threads of evidence, since (1) supports general reuse and (2) is PinHunt-specific confirmation — together they're the basis for `public_display_allowed = true` even before the exact CC variant is pinned down.
