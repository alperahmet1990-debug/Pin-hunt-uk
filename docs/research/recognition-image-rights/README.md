# Recognition reference images: legal sourcing research (Oct 2026)

**Status: research only.** Separate from the development queue and the autonomous sprint. No issues, labels, routines, code, migrations or data were created or changed. No third-party image was downloaded, stored, processed or embedded. Every source was assessed from public terms pages, search-engine extracts and the repository only.

**Not legal advice.** The rights conclusions below are a product/engineering reading of public terms. Get a UK IP solicitor to review before any production use (see §7).

**Verification limits in this session.** The network policy blocked direct fetches of commons.wikimedia.org, Openverse, Flickr, pinandpop.com, pinpics.com, developer.ebay.com and pixian.ai. Items marked **[verified]** were confirmed from search-engine extracts of the cited page. Before anyone relies on them, re-read the primary text. Items marked **[estimate]** are judgement.

Related: `../scan-independence/` (Arm C "own-image vector benchmark" and its 99-case `test_manifest.csv`), `.agents/memory/collectible-pintrader-rights.md`, `.agents/memory/pinhunt-images.md`, migrations 037/038/042.

---

## 0. The constraint that applies to every source

Every pin photo carries **two layers of rights**:

1. **The photographer's copyright** in the photo. A CC licence, a dealer licence or a contributor consent clears only this layer.
2. **Disney's copyright (and trade marks) in the pin artwork.** No collector, dealer, database or CC licence can grant this. [Commons:Derivative works](https://commons.wikimedia.org/wiki/Commons:Derivative_works) uses a Disney toy as its worked example of exactly this problem.

What this means for the law and for us:
- **UK:** the only text-and-data-mining exception (CDPA s29A) covers **non-commercial research only**. Commentary reports that the UK decided in March 2026 not to add a commercial opt-out exception ([DLA Piper](https://www.dlapiper.com/en/insights/blogs/mse-today/2026/tdm-and-training-ai-models)); check the gov.uk primary source.
- **EU (DSM Art. 4):** allows commercial TDM unless the rightsholder opts out. Disney's UK sites carry an express AI/TDM reservation ([example](https://www.thelionking.co.uk/ai-opt-out)), and Disney's Terms of Use ban scraping and data mining.
- **Private embeddings are not a safe harbour.** Generating an embedding needs a copy of the image. Whether a vector is itself a copy or derivative is unsettled. We treat **embedding generation as a separate use needing its own permission**, never as implied by "storage" or "app use".
- **Lowest-risk shape:** embeddings computed from photos whose photographer layer is licensed for that purpose, held privately. Results show PinHunt's own licensed or contributed display image, or no image. Even this leaves residual Disney-layer risk, which the solicitor review must size.

---

## 1. Ranked shortlist

Ranked by **lawfulness × speed × useful coverage**. The catalogue holds ~13k pins (182 in the trusted catalogue served today). Per `pinhunt-images.md`, almost none have real images.

| Rank | Source | Licence to embed? | Est. coverage | Main obstacles | Speed |
|---|---|---|---|---|---|
| **1** | **PinHunt first-party capture**: admins, App Creator and invited collectors photograph pins they own, through the existing Pixian contribution flow under a new recognition consent | **Yes, if consent v2 says so** (we write the terms) | Pilot: 100–200 pins × 3–5 photos in ~4 weeks. Year one: ~1–3k pins **[estimate]**, skewed to what our users own (UK/Paris, which suits us) | Current consent doesn't cover embeddings (§4). Slow long tail. Disney layer remains. | **Fastest.** Starts with zero third-party negotiation |
| **2** | **Pin & Pop Data & Image Licence (v1.1)** | **Expressly, for internal use.** Docs permit images for private/internal purposes "including training image vectors for reverse image search", but **no public display** **[verified, search extract of [API docs](https://pinandpop.com/docs/api/v1-pins)]** | Likely the majority of our catalogue: the trusted catalogue is already 100% Pin & Pop-sourced, and Pin & Pop is a large community database **[estimate; size not verified]** | Full agreement only issued with a token. Is a user-facing scan "public-facing"? Needs written confirmation. Visible attribution required. Data can't sit only behind a paywall. No redistribution. Approval needs proof of community involvement. Pin & Pop's own right to sub-license user-uploaded photos is unverified. Disney layer remains. | Fast: application + $99 setup fee **[verified]**, then written Q&A |
| **3** | **Collectible PinTrader**: extend the existing permission | Not yet. Current grant covers display/storage/app use (`catalogue_sources` row, migration 037); **embedding not mentioned** | Unknown until the CTP export is sized (not in repo) | CC variant still "pending confirmation". Evidence record unfilled (`collectible-pintrader-rights.md`). Need an explicit written embedding grant. | Fast: one email to an existing contact |
| **4** | **UK/Paris pin dealers and serious collectors** who shot their own photos (eBay UK / Etsy sellers, Disneyland Paris trading-community photographers) | Only by a bespoke written licence | 1k–20k images per archive, Paris-weighted **[estimate]** | Finding and vetting each one. Proving they took the photos. Inconsistent quality and labelling. Many counterparties. Facebook-group photos have fragmented rights; deal with the photographer, never the group. | Medium: weeks per deal |
| **5** | **PinPics**: bespoke archive licence | Only by a bespoke licence | 156k+ listings, up to 6 photos each **[verified, [forum](https://pinpics.com/forums/topic/3468-pinpics-a-bit-about-how-it-works)]** | Photos are member-contributed. Whether PinPics can sub-license them is unknown (ToS not readable here). Needs a warranty + indemnity, maybe a member opt-out. Likely £10k–£50k+ or revenue share **[estimate]**. | Slow |
| **6** | **Open licence: Wikimedia Commons, Openverse, Flickr** | Photographer layer only, per image, CC BY / BY-SA / CC0 / PDM. NC and ND excluded. | **~150–500 identifiable pins total, under 5% of the catalogue, few Paris pins** **[estimate]** | Commons deletes character close-ups (COM:DW). [Openverse doesn't verify licences](https://webcf.waybackmachine.org/web/20231210110130/https://openverse.org/about). [Flickr API terms](https://www.flickr.com/services/api/tos/) limit caching and require approval for commercial use. Mostly lanyard/board shots with poor labels. | Slow per image; low yield |
| 7 | **eBay** listing images | **No.** API licence (2025) bars using eBay content to train AI without written consent ([EcommerceBytes](https://www.ecommercebytes.com/2025/07/18/ebay-restricts-developers-from-using-its-data-to-train-ai/)) | — | Also: existing eBay-backfilled `pins.image_url` photos have no display rights (`scan-independence` §1) and must not be embedded | Barred |
| 8 | **Retailer / affiliate feeds** (shopDisney via [FlexOffers/CJ](https://www.flexoffers.com/affiliate-programs/shopdisney-affiliate-program/), Amazon PA-API) | **No** | — | Affiliate creatives are promotion-only, unmodified, removed on withdrawal **[estimate; feed terms not read]**. Amazon: no storing or caching beyond 24 h ([summary](https://conductatlas.com/platform/amazon-associates/amazon-associates-program-policies/product-advertising-image-caching-limited-to-24-hours/)). Neither expressly permits vectors. Only a bespoke deal could. | Not viable |
| 9 | **Disney direct** (Disney Consumer Products licensing) | Would clear **both** layers | Total | Formal [licensee process](https://licensing.disney.com/licensee-requirements/?lang=en). A small third-party app is very unlikely to get a reply. | Long shot |

### Answer to brief item 3: can retailer or affiliate agreements permit embeddings?
Not as standard. No standard affiliate or product-feed agreement we found expressly permits vector embeddings. The only routes to an express permission are:
- a bespoke written addendum with the retailer, which still can't grant Disney's artwork rights unless the retailer is Disney itself; or
- Disney licensing, which is unrealistic short-term.

Pin & Pop (rank 2) is the one counterparty whose **published** terms name image-vector training.

---

## 2. Licensing obstacles, consolidated

1. **The Disney artwork layer:** unresolved for every source except Disney itself. It drives the solicitor question in §7.
2. **"Internal" vs. "public-facing"** (Pin & Pop): a scan feature *uses* the vectors to answer users. Get written confirmation that this counts as internal, provided no Pin & Pop image is ever returned or shown.
3. **Storage vs. transient copies:** the Pin & Pop source row has `storage_allowed = false` (migration 042). Confirm whether we may fetch, embed, then discard. If the licence ends, we need to know if derived embeddings must be deleted.
4. **Chain of title** for user-uploaded archives (Pin & Pop, PinPics): require a warranty and indemnity.
5. **Attribution and ShareAlike:** CC BY-SA terms on embeddings are untested. Exclude BY-SA from the pilot.
6. **Contributor consent scope:** today's consent text covers public display only (§4).
7. **Processor terms:** Pixian handles every contributed photo. Its retention and training policy could not be verified here. A secondhand listing claims images are deleted after processing; get Pixian's DPA or terms in writing.

---

## 3. Image-rights model (proposal, not a migration)

Today rights are recorded as three booleans (`public_display_allowed`, `storage_allowed`, `app_use_allowed`) on `catalogue_sources`, plus `public_display_allowed` / `contributor_consent_at` on `pin_images`. That can't express "may embed but not display", "must delete within 30 days of termination", or which consent version applied. The proposed model extends the existing `catalogue_sources` → `pin_images` seam and does **not** replace it.

**A. Source-level default terms**: new columns on `catalogue_sources`, or a sibling `catalogue_source_terms` table versioned by licence:

| Field | Meaning |
|---|---|
| `licence_name`, `licence_version`, `licence_url_or_ref` | e.g. "Pin & Pop Data & Image License Agreement", "v1.1" |
| `evidence_location` | Where the signed agreement or email is kept (a pointer, never contact details in the repo) |
| `display_allowed` | Show to collectors |
| `storage_allowed` | Persist the image bytes |
| `transformation_allowed` | Crop, background-remove (Pixian), resize, watermark |
| `embedding_allowed` | Generate vectors from the image |
| `embedding_scope` | `internal_only` / `user_facing_results_ok` |
| `embedding_survives_termination` | Keep already-generated vectors if the licence ends |
| `retention_days` | Max retention of image bytes (null = indefinite) |
| `deletion_sla_days` | Days to purge image and derived vectors on termination or withdrawal |
| `attribution_required`, `attribution_text` | Existing |
| `underlying_ip_status` | `unlicensed_third_party` (Disney) / `licensed` / `n/a`. Lets the solicitor's decision gate use. |
| `verified_by`, `verified_at`, `expires_at` | Who checked the terms, and when they lapse |

**B. Per-image overrides** on `pin_images`:
- `consent_version` (e.g. `contrib-v1-display`, `contrib-v2-display-recognition`)
- per-use booleans that may only *narrow* the source defaults
- `withdrawn_at`
- `content_hash` (already exists)

**C. Derived-artefact lineage**: a future `pin_image_embeddings` table:
- columns: `pin_image_id` FK `on delete cascade`, `model_id`, `model_version`, `created_at`
- every vector traces to an image row and its consent version
- withdrawal or termination deletes vectors by cascade, or by a purge job honouring `deletion_sla_days`

**D. Gates (enforced in SQL, like the existing `pin_images_pin_and_pop_reference_only` check):**
- The embedding job selects only `embedding_allowed AND verified AND withdrawn_at IS NULL AND (underlying_ip_status gate passes)`.
- Rows with no `source` are never embedded. That includes admin image-backfill "paste URL" rows and eBay-backfilled `pins.image_url`.
- Display stays gated by the existing `public_display_allowed` RLS.

---

## 4. Turning the Pixian / contributor / admin workflow into a recognition dataset

**What already works** (`routes/contribute-pin-image.ts`, `services/pixian.ts`, `services/contributed-images.ts`, `app/contribute-image/[pinId].tsx`, `app/admin/contributed-images.tsx`):
- explicit consent toggle
- Pixian normalisation to a 1200×1200 white-background crop
- contributor preview and confirm step
- admin review queue
- admin/App Creator auto-publish
- the clean original kept privately, with only the public copy watermarked (so embeddings can use the clean image)
- duplicate-hash index

**Gaps to close before any contributed photo is embedded:**
1. **Consent scope.** The toggle reads "I took this photo and I agree PinHunt can use it as this pin's public catalogue photo." It doesn't mention recognition or embeddings, third-party processing, retention or withdrawal.
   - Add a versioned **consent v2**: display + storage + transformation + "used to train and run PinHunt's pin recognition" + withdrawal.
   - **Do not embed photos given under v1**; ask those contributors to re-consent.
2. **Raw photo discarded.** Only the Pixian output is stored. Clean crops make good *gallery* references, but recognition also needs real-world, query-like shots (angled, in hand, on a lanyard).
   - With v2 consent, keep the raw upload privately as a training-only asset (never displayed), with its own retention.
3. **One photo per pin.** The flow targets a single canonical image. Recognition wants 3–5 per pin, from more than one contributor and device:
   - front (Pixian)
   - front raw
   - angled
   - back/backstamp, which identifies editions
   - in hand
   - Add an optional "help recognition" capture set after the main photo, reusing the P1/P2 protocol from `scan-independence/test_manifest.csv`.
4. **Withdrawal / deletion path.** Contributors have no update or delete policy (migration 038, by design). Add a withdrawal request that sets `withdrawn_at`, deletes private objects and cascades vectors.
5. **Unsourced admin uploads.** `app/admin/image-backfill.tsx` lets an admin paste any URL with no provenance. Exclude those rows from the dataset until `source` and rights are recorded.
6. **Label quality.**
   - Keep the human admin review.
   - Add the vision-model "does this photo match this pin title?" audit, which already found 4/25 wrong images (`pinhunt-images.md`).
   - Use set siblings as hard negatives.
7. **Processor and model choice.**
   - Get Pixian's retention and training terms in writing.
   - Compute embeddings on a **self-hosted open-weights encoder** (e.g. a DINOv2- or SigLIP-class model; check that model's own weights licence) so no image leaves our infrastructure for embedding.

---

## 5. Fastest lawful pilot: "First-party recognition pilot" (about 4 weeks, ~£0–£100)

**Goal:** answer "does image-embedding recognition beat today's pipeline on our own catalogue?" using only images we unambiguously control. This is Arm C of `scan-independence`, run with first-party images.

1. **Week 0: paperwork, no code.**
   - Draft a one-page **pilot consent** covering display (optional), storage, transformation, embedding, internal evaluation only, 12-month retention, and deletion on request.
   - Signers: the App Creator, admins and 5–10 invited trusted collectors.
   - Send three emails in parallel (templates in §6):
     - Pin & Pop application + questions
     - Collectible PinTrader embedding confirmation
     - Pixian processor terms
2. **Weeks 1–2: capture.**
   - Participants photograph pins they **own** from the 99-case `test_manifest.csv` (sibling sets, same-character sets, mystery boxes).
   - Target ≥100 pins × 3–5 shots. Use the existing contribution flow for the Pixian gallery image. Raw and extra angles are collected offline under the pilot consent; **no app change is needed**.
3. **Week 3: offline evaluation.** Embed with a self-hosted open-weights encoder on a local or staging machine, never production.
   - Split: one gallery image per pin, the rest as queries.
   - Measure top-1/top-3 accuracy, the sibling-confusion rate, and "not in catalogue" rejection at a distance threshold.
   - Compare against Arm A/B numbers.
4. **Week 4: decision memo.** Go/no-go on:
   - consent v2 in the app
   - the rights-model migration (needs explicit approval per CLAUDE.md)
   - Pin & Pop as a gallery extension, if its written answers allow it

**Not in the pilot:** any third-party image, any production data or schema change, any user-facing feature, any agent routine.

**Success bar** (proposed): top-3 ≥ 85% on clean front photos and ≥ 70% on real-world photos, with sibling confusion clearly lower than today's LLM ranker.

---

## 6. Outreach templates (send only after maintainer approval)

**Pin & Pop.** Applying for API access. Before we sign, please confirm in writing:
1. PinHunt (UK Disney pin trading app) may generate image embeddings from Pin & Pop images and use them server-side to identify a collector's photographed pin, where results show only PinHunt's own catalogue data and images and never a Pin & Pop image. Does that count as "internal" use?
2. May images be fetched, embedded and discarded without being stored?
3. On termination, may already-generated embeddings be kept, or must they be deleted, and within what period?
4. Does Pin & Pop hold sufficient rights from its uploaders to grant this?
5. Where should the attribution appear in a scan result?

**Collectible PinTrader.** Thank you for the existing permission. Could you confirm in writing:
- the exact CC licence variant of the export; and
- whether PinHunt may also generate private image embeddings from the export's images for pin recognition, including retention and deletion expectations.

**Dealers and collectors.** We'd like a non-exclusive licence to photos **you took yourself**, used only to generate private recognition embeddings, with no public display unless separately agreed. Terms would include:
- a warranty that you own the photos
- deletion on request
- a stated retention period
- a flat fee or per-image rate

**Pixian.** Please confirm:
- retention of uploaded images and results, including logs and backups
- whether API uploads are used for training
- the availability of a DPA

---

## 7. Decisions for the maintainer (none actioned)

| # | Decision |
|---|---|
| A | Approve the first-party pilot and the pilot consent wording |
| B | Approve sending the Pin & Pop / CTP / Pixian emails (outward-facing) |
| C | Commission a UK IP solicitor review of the Disney-layer risk for (i) private embeddings and (ii) displaying contributor photos. The display question already applies today. |
| D | Later and separate: consent v2 in the app and the rights-model migration (§3). Both need explicit approval; neither is queued. |
| E | Confirm that eBay-backfilled and unsourced admin-URL images are permanently excluded from any embedding work |
