# Pin & Pop agreement: what needs confirming

You've signed the agreement (Nov 2026). The repo has no copy or summary of it, so the current restrictions stay in force until the answers below are recorded. Those restrictions are:
- Pin & Pop images are reference-only and never shown, stored or published (042 constraint);
- Pin & Pop data and links are excluded from copies, reports and promotion (`catalogue-copy.mjs`, 053, the source registry, the gap report);
- board scanning and the bulk matcher may use Pin & Pop images only as internal matching references.

**How to answer:** for each question, write the answer in your own words plus the clause number. Don't paste the contract text here; it may be confidential (see Q15). Keep the signed copy and correspondence off-repo, as with Soldgraph (`docs/market-data/RIGHTS.md`). Once answered, each restriction is relaxed by its own, explicitly approved change (#431).

| # | Question | Why it matters here | Clause | Answer |
|---|---|---|---|---|
| 1 | Who are the parties (PinHunt Ltd?), when does it start, and how long does it run? | The rights record must name the right entity and dates | | |
| 2 | Which **data fields** may we use: names, series, year, edition size, release details, descriptions, prices, Pin & Pop IDs? | Decides what an importer may copy into `pins` | | |
| 3 | May we **show** that data to collectors in the app and contributor website? Signed-in only, or public? | The app shows the catalogue to every user | | |
| 4 | May we **display Pin & Pop images** to collectors? | Today the 042 constraint forbids it | | |
| 5 | May we **store copies** of their images in our storage, or only link to their servers? Caching or resizing for speed? | Promotion copies files into our buckets | | |
| 6 | May we **edit** their images: crop, remove background with Pixian, add our watermark? | Our clean-up and publish steps do all three | | |
| 7 | May we send their images to **third-party AI services** (OpenAI) for matching, and is internal reference use for recognition covered? | Board scanning and the bulk matcher already do this, with reference images only | | |
| 8 | May we create and keep **derived data**: image fingerprints or embeddings, match scores, links between their records and ours? | A visual-similarity index is the suggested next step for matching | | |
| 9 | May we **store and show Pin & Pop IDs**, and link or deep-link to Pin & Pop? | Migration 053 and #470 currently keep their IDs internal | | |
| 10 | What **attribution** is required: wording, logo, placement? | Feeds PNP-05 (#437) | | |
| 11 | Does it cover **test environments** (staging), or only the live service? | Staging holds copies of catalogue data | | |
| 12 | Must data be **kept in sync** (updates, removals, takedowns within a set time)? | Decides whether a scheduled sync (#436) is an obligation | | |
| 13 | On **termination**, what must be deleted, and by when? May we keep pins we created, our own photos, collectors' records and matches that used their data? | Pins are referenced by collections and trades | | |
| 14 | Any **exclusivity or non-compete**: limits on building our own catalogue, combining with other sources (Collectible PinTrader), or using collectors' photos? | Affects the independent catalogue and contributor programme | | |
| 15 | Is the agreement, or are their IDs and data, **confidential**? What may appear in our repo, reports and public pages? | Decides what agents and reports may mention | | |
| 16 | Any duty to **contribute back** (corrections, new pins, collectors' photos)? | Contributor terms must allow anything we'd pass on | | |
| 17 | Do they **warrant** they have the right to license the images? Who bears risk on the underlying Disney artwork? | Image rights ultimately sit with the rights holder | | |
| 18 | Any **usage limits**, fees per call or record, or delivery method (API, file)? | Sizes the importer and sync | | |

**After answering:**
1. Record the answers in a rights record (e.g. `docs/legal/` or a private ops note), dated, with no contract text.
2. Update production's `catalogue_sources` row for `pin_and_pop` to match: `public_display_allowed`, `storage_allowed`, `app_use_allowed`, `attribution_required`, `exact_license_variant`. Do it staging first, as a reviewed change.
3. Relax each code exclusion listed in #431 in its own approved PR.

Until then, the gap report and any catch-up treat Pin & Pop material as reference-only.
