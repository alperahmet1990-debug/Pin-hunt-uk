-- ============================================================
-- Migration 069: what the collector picked after a scan (#113, UX-006)
--
-- Records the outcome of each AI scan on the scan's existing usage row in
-- contributor_ai_usage (047): "That's it" on the best match, an alternative,
-- or "None of these". This is what top-1 / top-3 scan accuracy is measured
-- from (#263).
--
--   • outcome        'confirmed' (rank 1), 'picked_alternative' (rank 2–3)
--                    or 'none'. NULL: no choice recorded (abandoned scan,
--                    older app build, or a scan from before this migration).
--   • chosen_pin_id  the pin id the collector picked, exactly as the scan
--                    returned it in result.matches. NULL for 'none'.
--   • chosen_rank    1–3, worked out by the API from result.matches, never
--                    taken from the app. NULL for 'none'.
--   • outcome_at     when the choice was recorded (the latest one wins).
--
-- How rows are linked: the API puts a random UUID (`scanId`) in each new
-- scan's `result` jsonb and returns it to the app. The app posts it back
-- with the choice to POST /api/scan/outcome (signed in, own scans only,
-- rate-limited). The index below serves that lookup. No schema change is
-- needed for the link itself, so the identify route works the same before
-- and after this migration.
--
-- Privacy: no photo, no location, nothing new about the collector. The row
-- already holds the user id, the photo's sha256 and the scan's matches.
--
-- Access is unchanged: RLS stays on with no policies, and anon/authenticated
-- keep no grants. Only the API server (service role) reads or writes.
--
-- Purely additive: four nullable columns, two CHECK constraints, one
-- partial index. No existing row changes.
--
-- Apply order: this migration FIRST (staging, then
-- supabase/verify/069_verify.sql), then deploy the API, then ship the app.
-- Until it's applied, POST /api/scan/outcome answers 202 and stores nothing.
--
-- Housekeeping: 047 suggests deleting usage rows older than 30 days. Keep
-- that in mind when reading accuracy: anything trimmed is gone.
--
-- Run AFTER 001–068, in the Supabase SQL editor. Rollback at the bottom.
-- ============================================================

alter table public.contributor_ai_usage
  add column if not exists outcome       text,
  add column if not exists chosen_pin_id text,
  add column if not exists chosen_rank   smallint,
  add column if not exists outcome_at    timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cau_outcome_shape') then
    alter table public.contributor_ai_usage add constraint cau_outcome_shape check (
      outcome is null
      or (kind = 'scan' and outcome_at is not null and (
            (outcome = 'none' and chosen_pin_id is null and chosen_rank is null)
         or (outcome = 'confirmed' and chosen_pin_id is not null and chosen_rank = 1)
         or (outcome = 'picked_alternative' and chosen_pin_id is not null and chosen_rank between 2 and 3)
      ))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cau_chosen_pin_id_length') then
    alter table public.contributor_ai_usage add constraint cau_chosen_pin_id_length
      check (chosen_pin_id is null or char_length(chosen_pin_id) between 1 and 64);
  end if;
end $$;

-- POST /api/scan/outcome looks a scan up by (user, scanId).
create index if not exists contributor_ai_usage_scan_id_idx
  on public.contributor_ai_usage (user_id, (result->>'scanId'))
  where kind = 'scan' and result ? 'scanId';

-- ── Accuracy (read-only, run any time) ───────────────────────────────────────
--   select count(*) filter (where outcome is not null)                    as answered,
--          round(100.0 * count(*) filter (where chosen_rank = 1)
--                / nullif(count(*) filter (where outcome is not null), 0), 1) as top1_pct,
--          round(100.0 * count(*) filter (where chosen_rank between 1 and 3)
--                / nullif(count(*) filter (where outcome is not null), 0), 1) as top3_pct,
--          count(*) filter (where outcome = 'none')                       as none_count,
--          count(*) filter (where outcome is null and result ? 'scanId')  as no_choice
--     from contributor_ai_usage
--    where kind = 'scan' and created_at >= now() - interval '30 days';
--
-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Drops the recorded outcomes. The scanId values stay inside `result` and
-- are harmless.
--
-- drop index if exists public.contributor_ai_usage_scan_id_idx;
-- alter table public.contributor_ai_usage drop constraint if exists cau_chosen_pin_id_length;
-- alter table public.contributor_ai_usage drop constraint if exists cau_outcome_shape;
-- alter table public.contributor_ai_usage
--   drop column if exists outcome_at,
--   drop column if exists chosen_rank,
--   drop column if exists chosen_pin_id,
--   drop column if exists outcome;
-- ============================================================
-- End of migration 069.
-- ============================================================
