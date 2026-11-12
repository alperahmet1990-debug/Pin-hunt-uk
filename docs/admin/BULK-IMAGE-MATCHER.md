# Admin Bulk Image Matcher (staging)

Upload a batch of individual pin photos → review suggested catalogue matches → confirm → clean with Pixian → publish approved photos as catalogue images.

**Status:** built and tested with mocks. Not yet run against staging. Not in production. Off unless `BULK_IMAGE_MATCHER_ENABLED=true`.

## How it works

| Step | What happens | Where |
|---|---|---|
| Batch | App Creator records title, supplier, permission basis, licence and whether public display is allowed | `bulk_image_batches` |
| Upload | Drag-and-drop or choose photos. Each one is EXIF-rotated, stripped of metadata, capped at 2400 px and stored privately. The same file again is recognised and skipped | `bulk-image-matcher` bucket, `bulk_image_items` |
| Match (automatic) | The scan's own recognition: describe → indexed catalogue search (≤150 candidates) → AI rank top 5 → compare against up to 3 reference images (PinHunt photo, else the admin-only Pin & Pop reference) | `services/bulkImages/match.ts` |
| Review | Photo beside the best match. Enter confirms, 1–5 picks another candidate, S skips, F flags, / searches. Moves on by itself | `app/admin/bulk-images/[batchId].tsx` |
| Clean (automatic) | Pixian runs only after a match is confirmed. The cleaned result is kept, so changing the match doesn't call Pixian again | `services/bulkImages/pipeline.ts` |
| Publish | Preview grid. Publish, clean again, or change match. Pins that already have a photo need an explicit "Replace it" | `services/bulkImages/publish.ts` |

**Confidence bands.** *Confident* only when a reference image confirmed the match (≥85 and ≥20 points ahead of the next candidate). *Possible* ≥50. *Uncertain* ≥25. Below 25 is *No match*. A pin with no reference image can never be *Confident*.

**Provenance.** Each published image is a `pin_images` row with `source = 'pinhunt_bulk_upload'` and `source_record_id = bulk item id`. The bulk item links to its batch, which holds the supplier, permission basis and licence. The bulk item also keeps any replaced image URL. Watermarking and the `pin-catalogue` path follow the contributed-photo rules.

**Pin & Pop.** Reference images are used only for internal matching and are shown only to the App Creator, labelled "admin only". They are never stored in these tables or this bucket, and never published.

## Cost controls

AI calls per photo: 2, or 3 when a reference image exists. Never one call per catalogue record. Pixian: one call per confirmed photo.

| Env var | Default | Meaning |
|---|---|---|
| `BULK_MATCH_CONCURRENCY` / `BULK_CLEAN_CONCURRENCY` | 2 / 2 | Parallel calls, server-wide |
| `BULK_MATCH_DAILY_LIMIT` / `BULK_CLEAN_DAILY_LIMIT` | 1500 / 1000 | Per rolling 24 h. Work pauses and the dashboard says so |
| `BULK_PIXIAN_MAX_PER_ITEM` | 3 | Clean-ups one photo may use. A failed or timed-out call counts |
| `BULK_MAX_BATCH_ITEMS` | 1000 | Photos per batch |
| `BULK_MATCH_ALWAYS_COMPARE` | true | Compare with reference images even when the ranking looks confident |
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
