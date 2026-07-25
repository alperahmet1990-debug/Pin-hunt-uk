---
name: Admin RLS patterns
description: Required DB policies for admin catalogue writes and storage access — what's missing by default and why.
---

# Admin RLS Patterns

## Catalogue writes require explicit admin INSERT/UPDATE policies

The `pins` table (and its junction tables: `characters`, `categories`, `pin_characters`, `pin_categories`) only had public SELECT and admin SELECT by default. `createPin`/`updatePin` from the client app (anon key) will be denied by RLS unless explicit admin INSERT/UPDATE policies exist.

**Why:** The original comment "Writes are service-role only" in 002_rls.sql was written for the import pipeline — but the admin pin editor uses the anon key with the authenticated session. Service-role bypass is only available server-side.

**How to apply:** Migration 009 adds `is_admin()` INSERT/UPDATE policies on pins, characters, categories, pin_characters, pin_categories, and DELETE on the junction tables.

## Storage admin access needs its own SELECT policy

`pin-submissions` storage objects have a SELECT policy checking `auth.uid()` matches the folder prefix. Admins reviewing other users' submissions can't generate signed URLs without an additional `is_admin()` policy.

**Why:** Storage RLS is independent of table RLS. Each bucket policy must explicitly handle the admin case.

**How to apply:** Migration 009 adds `ps_storage_select_admin` on `storage.objects` for the `pin-submissions` bucket.

## New admin-writable buckets need full CRUD policies

The `pin-catalogue` bucket (for admin-uploaded catalogue pin images) needs separate public-read + admin-write storage policies. Created in migration 009.
