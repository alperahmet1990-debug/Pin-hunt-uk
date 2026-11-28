-- ============================================================
-- Migration 086: Bulk Image Matcher — per-batch stats (staging first)
--
-- One jsonb column on bulk_image_batches for what the API server keeps per
-- batch, the same way board scans keep board_scans.stats (migration 083):
--   setHints   sets searched first for every photo in the batch (typed by
--              the reviewer, or learned once two confirmed photos share one)
--   setVotes   which confirmed items voted for each set
--   accuracy   the last accuracy check (right first / top 5 / misses)
--
-- Purely additive: one not-null column with an empty default. No
-- existing column, row, policy or function changes. RLS is unchanged (076's
-- admin read policy; writes are service-role only). Verify: supabase/verify/086_verify.sql.
--
-- Apply in the STAGING Supabase SQL editor first, then production. Run AFTER
-- 076 (and after 085, which it doesn't depend on).
--
-- Rollback (safe — only the API server reads it, and treats a missing value
-- as empty):
--   alter table bulk_image_batches drop column if exists stats;
-- ============================================================

alter table bulk_image_batches
  add column if not exists stats jsonb not null default '{}'::jsonb;
