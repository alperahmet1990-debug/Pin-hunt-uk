---
name: Photo to catalogue (contributed photos)
description: Scan → "Add your photo" → Pixian → admin review (raw | cleaned | Pin & Pop) → catalogue image; admins reviewed by default; raw originals admin-only (079)
---
- Entry points into `app/contribute-image/[pinId].tsx`: scan result "Add your photo" (`from=scan`, only when the match has no `imageUrl`; scan photo handed over in memory via `utils/scanPhotoHandoff.ts`), pin page card, `from=catalogue`, `from=replace`. Tapping the match itself still opens Pin detail.
- API `routes/contribute-pin-image.ts`: preview cleans via Pixian and also stores the photo as taken in the private `pin-contributed-raw` bucket at the same draft path; submit moves both. Raw storage is best-effort (works before 079 is applied, just no raw).
- Everyone is reviewed, admins too. Only `{ publishNow: true }` from an admin (checked server-side) publishes directly. This reversed the earlier auto-publish for admins (Nov 2026).
- `services/contributed-images.ts` `publishContributedImage`: fixed public path `{pinUuid}/contributed-{id}.jpg` (upsert), re-run safe; replace rule shared with `bulkImages/publish.ts` (`PublishBlockedError('has_image')` → admin route 409 unless `replaceExisting` or a replacement proposal).
- Raw bucket: no uploader/collector policy at all, only `pcr_storage_admin_select` (`is_admin()`); included in account deletion. Static guard: `services/contributed-raw-access.test.ts`; live check: `supabase/verify/079_verify.sql`.
- Pin & Pop images: displayed to admins only, never sent to any AI service (rights question open with Pin & Pop).
