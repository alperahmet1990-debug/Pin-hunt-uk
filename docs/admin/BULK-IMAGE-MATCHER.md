# Admin Bulk Image Matcher (staging)

Upload a batch of individual pin photos → review suggested catalogue matches → confirm → clean with Pixian → publish approved photos as catalogue images.

**Status:** built and tested with mocks. Not yet run against staging. Not in production. Off unless `BULK_IMAGE_MATCHER_ENABLED=true`.

## How it works

| Step | What happens | Where |
|---|---|---|
| Batch | App Creator records title, supplier, permission basis, licence and whether public display is allowed | `bulk_image_batches` |
| Upload | Drag-and-drop or choose photos. Each one is EXIF-rotated, stripped of metadata, capped at 2400 px and stored privately. The same file again is recognised and skipped | `bulk-image-matcher` bucket, `bulk_image_items` |
| Match (automatic) | Describe, then the board scanner's matching (`boardScan/match.ts` `matchCrop`): the catalogue search built for ~116k pins (character + specific word first), picture-index look-alikes when the index is on, AI rank top 5, then a comparison with every ranked candidate's reference picture (PinHunt photo, else the admin-only Pin & Pop reference; downloaded by the server), with the format-first rule. Unchecked suggestions are capped at 60%; a checked match under 40% is not identified. See `artifacts/api-server/scripts/BOARD-SCANNING.md` → Matching accuracy | `services/bulkImages/match.ts` |
| Review | Photo beside the best match. Enter confirms, 1–5 picks another candidate, S skips, F flags, / searches. Moves on by itself | `app/admin/bulk-images/[batchId].tsx` |
| Clean (automatic) | Pixian runs only after a match is confirmed. The photo is first cropped to the main pin: the describe step returns its box at no extra cost, so neighbouring pins on a board are left out. The cleaned result is kept, so changing the match doesn't call Pixian again | `services/bulkImages/pipeline.ts` |
| Publish | Preview grid. Publish, change match, or **Crop & clean**: drag a box around the pin and only that area is cleaned again. Pins that already have a photo need an explicit "Replace it" | `services/bulkImages/publish.ts` |

**Confidence bands.** *Confident* only when a reference image confirmed the match (≥85 and ≥20 points ahead of the next candidate). *Possible* ≥50. *Uncertain* ≥25. Below 25 is *No match*. A pin with no reference image can never be *Confident*.

**Provenance.** Each published image is a `pin_images` row with `source = 'pinhunt_bulk_upload'` and `source_record_id = bulk item id`. The bulk item links to its batch, which holds the supplier, permission basis and licence. The bulk item also keeps any replaced image URL. Watermarking and the `pin-catalogue` path follow the contributed-photo rules.

**Pin & Pop.** Reference images are used only for internal matching and are shown only to the App Creator, labelled "admin only". They are never stored in these tables or this bucket, and never published.

## Sets and the accuracy check (migration 086)

Both need `supabase/migrations/086_bulk_batch_stats.sql` (one `stats` column on `bulk_image_batches`). Without it, matching and review work as before. Naming a set, set learning and saving an accuracy report fail with a column error, and set learning only logs a warning.

- **Set (optional):** name the set the photos come from when creating a batch, or later with **Name the set** / **Change sets** on the batch page (at most 5, comma-separated). It's searched first for every photo, the way board scanning uses a board's sets, so pins titled only by character ("Lumière") are told apart. Changing the sets matches the photos not decided yet again.
- **Learned sets:** once **two** confirmed photos come from the same catalogue set (`pins.collection`), the batch learns it and matches its suggested and unmatched photos again with it first. One photo alone isn't enough, because batches can mix sets.
- **Accuracy check (N):** matches the batch's confirmed photos again (confirmed, cleaning, cleaned or published; at most 300), **without changing them**. It reports how often your pin came first and how often it was in the top 5, and lists the misses. It runs in the background, one check per batch at a time, and is saved on the batch (`stats.accuracy`). Cost: about 3 AI calls per photo.

**Limits** (security review of #762, migration 087):
- **Accuracy check:** one at a time on the server, and the same batch again only after 10 minutes.
- **Sets:** changes by hand at most once a minute per batch.
- **Re-matching:** a set change or a learned set re-matches at most 200 photos, oldest first.
- **Set input:** at most 2,000 characters or 20 entries, refused before it's processed.

## Correcting a match: Which pin is it?

On the review card, **Which pin is it? Look-alikes & sets** opens:
- **Looks like your pin:** the 24 catalogue pins whose reference pictures look most like the photo. This needs the picture index (`PICTURE_INDEX_ENABLED`) and costs one Vertex call, about $0.0001, each time it's opened.
- **Browse a set:** the batch's sets and the sets of its suggestions, as chips. Tap one to see that set as a picture grid, 30 at a time (**Show more**). **Narrow** filters it, for example by a character.

Tap a picture to choose it, then **Use …**. The photo is confirmed as a manual pick (`match_method = manual_search`). Pictures are the catalogue photo, or else the admin-only Pin & Pop reference. The text search and the keyboard shortcuts work as before.

## Cost controls

AI calls per photo: 2, or 3 when a reference image exists. Never one call per catalogue record. Pixian: one call per confirmed photo.

| Env var | Default | Meaning |
|---|---|---|
| `BULK_MATCH_CONCURRENCY` / `BULK_CLEAN_CONCURRENCY` | 2 / 2 | Parallel calls, server-wide |
| `BULK_MATCH_DAILY_LIMIT` / `BULK_CLEAN_DAILY_LIMIT` | 1500 / 1000 | Per rolling 24 h. Work pauses and the dashboard says so |
| `BULK_PIXIAN_MAX_PER_ITEM` | 4 | Clean-ups one photo may use. A failed or timed-out call counts |
| `BULK_AUTO_CROP` | true | Crop to the main pin before Pixian |
| `BULK_MAX_BATCH_ITEMS` | 1000 | Photos per batch |
| `BULK_AI_DAILY_CALLS` | 4500 | OpenAI calls per UTC day across every match: uploads, re-matches after a set change or a learned set, and accuracy checks. 3 are reserved per photo before matching (migration 087). When they run out, matching pauses ("Daily AI limit…") and an accuracy check stops early and says how many photos it didn't reach. If the budget can't be checked (087 not applied), matching pauses and says so |
| `BOARD_MAX_REFERENCES`, `BOARD_MAX_CANDIDATES`, `BOARD_MATCH_ALWAYS_COMPARE`, `BOARD_REFERENCE_DETAIL` | 8, 150, true, high | Matching settings, shared with board scanning (`BULK_MATCH_ALWAYS_COMPARE` and `BULK_MATCH_MAX_CANDIDATES` are no longer read) |
| `PICTURE_INDEX_ENABLED` | off | Picture-index look-alikes for each photo (Google Vertex AI, one call ≈ $0.0001). Same switch as board scanning |
| `OPENAI_BULK_MATCH_MODEL` | `OPENAI_SCAN_MODEL` | Model override |

## Interruptions and retries

The database is the queue. Items are claimed with a conditional status update, so two processes can't take the same one. Opening a batch resumes work. Items stuck mid-step for more than 10 minutes go back to the start of that step. **Retry** on a failed item reruns only its failed stage: match, clean or publish.

## First staging run (20 photos)

1. **Migration.** Apply `supabase/migrations/076_bulk_image_matcher.sql` in the **staging** SQL editor. Run `supabase/verify/076_verify.sql` and expect `ALL 076 CHECKS PASSED`. Then run `notify pgrst, 'reload schema';`.
2. **API env (staging).** Set `BULK_IMAGE_MATCHER_ENABLED=true`, plus the OpenAI, Pixian and service-role keys. Keep `PIXIAN_TEST_MODE=true` for the first run: results are free but watermarked. Restart the API.
3. **Reference images.** Matching is much stronger when candidates have a reference image. Check how many staging pins have one:
   `select count(*) from pin_images where source = 'pin_and_pop';`
   If the answer is close to 0, every match tops out at *Possible*. That still works, but expect more manual choosing.
4. **Run it.** In the web app (signed in as App Creator), go to **Admin → Bulk Image Matcher → New batch**. Fill in the permission record, tick public display, drop in 20 photos and review them.
5. **Record.** For each photo, note whether the correct pin was rank 1, ranks 2–5, or missing. Note the seconds per photo, from the API log. Note how many were *Confident* but wrong; this should be 0. These numbers decide the next step below.

## Not done yet / next

- **Not yet run against real photos or staging.** This container had no credentials.
- **No visual-similarity index exists.** There is no pgvector and there are no embeddings anywhere in the repo. If the 20-photo run shows retrieval misses the right pin (it isn't in the top 5 because text search didn't surface it), the simplest scalable next step is image embeddings with pgvector, kept as an internal-only index:
  - an image encoder such as CLIP or SigLIP over the reference images
  - nearest neighbours to add candidates alongside the text search
  - the existing ranking and compare steps unchanged

  Do this only if the Pin & Pop licence allows storing derived embeddings of their images. Otherwise, index PinHunt-owned photos only. Each published batch grows that set.
- Possible later additions: "Confirm all confident" and keyboard shortcuts on the publish grid.
