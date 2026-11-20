# Pin & Pop agreement: what needs confirming

**Updated 14 Nov 2026.** Since 12 Nov, Pin & Pop has been imported into **staging** (`artifacts/api-server/scripts/PINANDPOP.md`). That runbook records the licence as **"Data & Image License Agreement v1.3"**, with these rules:
- attribution shown to collectors;
- images internal only: never shown, never copied into our storage;
- no redistribution;
- no paywall-only use;
- a **maintainer decision on 12 Nov 2026** that every scan may show OpenAI the Pin & Pop reference image.

I can't see the signed agreement itself (it isn't in the repo, and no document connector is attached), so I can't check those rules against its clauses. What's below is what to confirm, and what the code does today.

The existing restrictions stay as they are:
- Pin & Pop images are never shown to collectors, stored in our buckets or published (042 constraint, RLS);
- they're excluded from catalogue copies, reports and promotion;
- the gap report never lists them.

**How to answer:** your own words plus the clause number. Don't paste contract text into the repo; it may be confidential (Q15). Keep the signed copy off-repo, as with Soldgraph (`docs/market-data/RIGHTS.md`).

## How the code uses Pin & Pop images (checked 14 Nov 2026, `main`)

| Where | Sent to OpenAI? | When |
|---|---|---|
| **Live scan** (`/api/scan/identify`, used by TestFlight) | **Yes, since 12 Nov** (`services/scanReferenceImages.ts`) | In the photo-comparison step, for a candidate pin with no public photo. That's every Pin & Pop pin, as they have none. Needs the API's service-role key; without it, it's skipped. |
| **Bulk image matcher** (merged; off unless `BULK_IMAGE_MATCHER_ENABLED=true`) | Yes, when switched on | The same comparison step, for **every** photo by default (`BULK_MATCH_ALWAYS_COMPARE=true`) |
| **Board scanning** (branch, not merged) | Yes, once merged and used | The same step, when the ranking is unsure and the candidate has no PinHunt photo |
| **Admin review** of contributed photos (042) | No | Shows the Pin & Pop image to admins beside a contributed photo. Display only. |

**What is sent, and to whom.** The code passes the Pin & Pop image's **web address** to **OpenAI** (the API server's OpenAI client, model in `OPENAI_SCAN_MODEL`). OpenAI's servers download the **full image** from Pin & Pop's own server. It isn't a derived representation: no fingerprints or embeddings exist in the code. The address is never returned to the app or logged (`routes/scan-references.test.ts`).

**Has it happened?**
- **Live scan:** probably yes, if the staging API on Render has been deployed from `main` since 12 Nov with a service-role key and anyone has scanned since. Staging holds 116,503 Pin & Pop reference records, so nearly every candidate qualifies. I can't see Render's deploy history; it's on the service's Events tab.
- **Bulk matcher:** only if `BULK_IMAGE_MATCHER_ENABLED=true` was set somewhere and a batch was run.
- **Board scanning:** only if its branch was run locally against staging.

**Testing with our own images only.** This is no longer possible just by "keeping staging free of Pin & Pop records": staging now holds one for every pin. The options are:
- a switch, e.g. `PIN_AND_POP_REFERENCES_ENABLED`, read by `scanReferenceImages.ts`, the bulk matcher and board scanning. That's a small code change for an agent, and it needs coordinating with whoever owns those files;
- or leave the API's service-role key out of a test server, so the scan skips Pin & Pop references. That doesn't help the bulk matcher, which needs the key for everything else.

Our own photos, collectors' photos (with permission) and PinHunt's own catalogue photos go to OpenAI either way. That's how the scan has always worked.

## Maintainer decision, 14 Nov 2026: the scan and admin tools may send Pin & Pop images to OpenAI

Pin & Pop reference images may be sent to OpenAI to compare them with a photo. This covers:
- the **collector scan** (as on `main` since 12 Nov);
- **admin and catalogue-building tools:** the bulk image matcher, board scanning, and linking Collectible PinTrader photos to Pin & Pop pins.

The images are used only inside the comparison. They're never shown to collectors, never returned to the app and never stored by PinHunt. Admin-only display and the other rules are unchanged.

This replaces the short-lived "never send to AI" rule of the same day: PR #601 was closed without merging, and issue #605 is superseded. The question below stays useful as a written confirmation from Pin & Pop.

## What to check with Jenn and Chris

**First, check your own records:** was the 12 Nov decision based on a specific clause of v1.3, or on something Pin & Pop confirmed in writing? If so, write down the clause number or keep the email, and the scan question is answered. The rest of this section is then only needed for what that clause doesn't cover.

If it isn't covered in writing, this is the question to send:

> Under the Data & Image License Agreement (v1.3), may PinHunt send Pin & Pop images to a third-party AI service (currently OpenAI, which fetches the image from your server by its web address) to compare them with a collector's photo when identifying a pin? This would be in our scan feature and in our internal catalogue tools (matching batches of our own photos and photos of collectors' boards). The images would be used for that comparison only: not shown to users, not stored by PinHunt, and not used to train models. If yes: does that cover our test environment as well as the live service, and do you need us to name the AI provider or tell you if it changes?

Before sending, check your OpenAI account's data settings so "not used to train models" is accurate.

"Internal catalogue tools" matters: the 12 Nov decision covers **scans**. The bulk matcher and board scanning are a different use (building our catalogue), so make sure the answer covers them too.

## Full question list

| # | Question | Why it matters here | Clause | Answer |
|---|---|---|---|---|
| 1 | Who are the parties (PinHunt Ltd?), when does it start, and how long does it run? | The rights record must name the right entity and dates | | |
| 2 | Which **data fields** may we use: names, series, year, edition size, release details, descriptions, prices, Pin & Pop IDs? | Decides what an importer may copy into `pins` | | |
| 3 | May we **show** that data to collectors in the app and contributor website? Signed-in only, or public? | The app shows the catalogue to every user | | |
| 4 | May we **display Pin & Pop images** to collectors? | Today the 042 constraint forbids it | | |
| 5 | May we **store copies** of their images in our storage, or only link to their servers? Caching or resizing for speed? | Promotion copies files into our buckets | | |
| 6 | May we **edit** their images: crop, remove background with Pixian, add our watermark? | Our clean-up and publish steps do all three | | |
| 7 | May we send their images to **third-party AI services** (OpenAI) for matching, and is internal reference use for recognition covered? | Board scanning and the bulk matcher already do this, with reference images only | | |
| 8 | May we create and keep **derived data**: image fingerprints or embeddings, match scores, links between their records and ours? | A visual-similarity index is the suggested next step for matching | | **Decided by the maintainer, 20 Nov 2026:** proceed without asking Pin & Pop — the maintainer considers the existing licence to cover an internal-only picture index. Built as `pin_picture_index` (migration 085): embeddings only, images never stored, never shown or returned to the app, deletable in one step. Not confirmed with Pin & Pop in writing. |
| 9 | May we **store and show Pin & Pop IDs**, and link or deep-link to Pin & Pop? | Migration 053 and #470 currently keep their IDs internal | | |
| 10 | What **attribution** is required: wording, logo, placement? | Feeds PNP-05 (#437) | | |
| 11 | Does it cover **test environments** (staging), or only the live service? | Staging holds copies of catalogue data | | |
| 12 | Must data be **kept in sync** (updates, removals, takedowns within a set time)? | Decides whether a scheduled sync (#436) is an obligation | | |
| 13 | On **termination**, what must be deleted, and by when? May we keep pins we created, our own photos, collectors' records and matches that used their data? | Pins are referenced by collections and trades | | |
| 14 | Any **exclusivity or non-compete**: limits on building our own catalogue, combining with other sources (Collectible PinTrader), or using collectors' photos? | Affects the independent catalogue and contributor programme | (add clause no.) | **Answered by the maintainer, 14 Nov 2026:** PinHunt may display its own images, or images from another source, on pins whose data comes from Pin & Pop. Other parts of this question (exclusivity, building our own catalogue) are still open. |
| 15 | Is the agreement, or are their IDs and data, **confidential**? What may appear in our repo, reports and public pages? | Decides what agents and reports may mention | | |
| 16 | Any duty to **contribute back** (corrections, new pins, collectors' photos)? | Contributor terms must allow anything we'd pass on | | |
| 17 | Do they **warrant** they have the right to license the images? Who bears risk on the underlying Disney artwork? | Image rights ultimately sit with the rights holder | | |
| 18 | Any **usage limits**, fees per call or record, or delivery method (API, file)? | Sizes the importer and sync | | |

**After answering:**
1. Record the answers in a rights record (e.g. `docs/legal/` or a private ops note), dated, with no contract text.
2. Update production's `catalogue_sources` row for `pin_and_pop` to match: `public_display_allowed`, `storage_allowed`, `app_use_allowed`, `attribution_required`, `exact_license_variant`. Do it staging first, as a reviewed change.
3. Relax each code exclusion listed in #431 in its own approved PR.

Until then, the gap report and any catch-up treat Pin & Pop material as reference-only.
