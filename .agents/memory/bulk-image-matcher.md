---
name: Bulk image matcher
description: Admin batch photo → catalogue match → Pixian → publish pipeline (migration 076, staging-only, flag-gated)
---
- Routes `artifacts/api-server/src/routes/bulk-images.ts` (App Creator only, 404 unless `BULK_IMAGE_MATCHER_ENABLED=true`); services in `services/bulkImages/` (match, pipeline, publish); screens `app/admin/bulk-images/`. Runbook: `docs/admin/BULK-IMAGE-MATCHER.md`.
- Migration is **076** because 075 is taken by the board-scanning branch. `services/pinRank.ts` is a byte-identical copy of that branch's file so both can merge cleanly — keep them identical; `scan.ts` was deliberately not refactored here.
- The DB is the job queue: claim = conditional `update … eq('status', from)`; stale `matching`/`cleaning` (>10 min) are released when a batch is reopened. Retry resets only `failed_stage`.
- Pixian runs only after confirmation; the cleaned file is kept so re-matching never calls Pixian again. Failed/timed-out Pixian calls still count against `BULK_PIXIAN_MAX_PER_ITEM`.
- "Confident" requires a reference-image comparison; with no Pin & Pop/PinHunt reference image a match tops out at "possible".
- Pin & Pop images: used for matching + shown to the App Creator only; never stored in bulk tables/bucket, never published. Published rows: `pin_images.source='pinhunt_bulk_upload'`, `source_record_id`=item id → batch permission record.
- No embeddings/pgvector exist in the repo (Nov 2026). Retrieval is the scan's indexed text search (`findCandidates`).
