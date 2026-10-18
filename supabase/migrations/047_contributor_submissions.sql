-- ============================================================
-- Migration 047: Early Contributor Programme — photo-only submissions
--
-- Lets a collector suggest a missing pin with just a photo. Everything
-- else (name, brand, year, set, characters…) becomes optional, and the
-- submission keeps what the AI suggested, when the contributor confirmed
-- the image rights, and an untouchable copy of what they originally sent.
--
--   • pin_submissions.proposed_name / brand: NOT NULL dropped. NULL means
--     "the contributor didn't know" — an unidentified submission. The admin
--     names the pin when approving or merging it.
--   • pin_submissions.rights_confirmed_at: when the contributor ticked "I
--     took this photo and PinHunt may use it". NULL on rows from older app
--     builds (pre-dates the checkbox). Can be set once, never changed.
--   • pin_submissions.ai_identification: what the AI scan suggested at
--     submission time (top catalogue matches + guessed fields). Hints for
--     the admin's duplicate check only — never trusted, never written to
--     the catalogue automatically. Write-once.
--   • pin_submissions.original_metadata: snapshot of the submitted fields,
--     taken by a trigger on INSERT and immutable afterwards, so admin or
--     contributor edits never lose the original submission (provenance).
--     NULL on rows that pre-date this migration.
--   • contributor_ai_usage: one row per paid AI / photo clean-up call made
--     for a user, so the API server can apply daily caps and reuse the
--     result of an identical repeat request. Service role only (RLS on,
--     no policies). Rows cascade-delete with the user's profile.
--
-- Number: 046 is reserved for RR-DB1 (#320, on hold). 047 does not depend
-- on 046 or 045 and can be applied without them.
--
-- Apply order: this migration FIRST, then deploy the API server that uses
-- it, then ship the app. The API keeps working before this is applied for
-- submissions that include a name (older app builds), but photo-only
-- submissions need it.
--
-- Purely additive except the two DROP NOT NULLs. No row is changed. No
-- policy is changed: the existing pin_submissions policies (005) cover the
-- new columns, and the trigger below stops users rewriting the provenance
-- columns through ps_update_own_draft.
--
-- Run AFTER 001–045, in the Supabase SQL editor. Staging first, then run
-- supabase/verify/047_verify.sql. Rollback at the bottom.
-- ============================================================

-- ── 1. Optional name and brand ───────────────────────────────────────────────
alter table public.pin_submissions alter column proposed_name drop not null;
alter table public.pin_submissions alter column brand         drop not null;

-- ── 2. Provenance columns ────────────────────────────────────────────────────
alter table public.pin_submissions
  add column if not exists rights_confirmed_at timestamptz,
  add column if not exists ai_identification   jsonb,
  add column if not exists original_metadata   jsonb;

-- Bounded hints, not a blob store. (Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS, hence the guard.)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ps_ai_identification_shape') then
    alter table public.pin_submissions add constraint ps_ai_identification_shape
      check (ai_identification is null
             or (jsonb_typeof(ai_identification) = 'object'
                 and pg_column_size(ai_identification) <= 16384));
  end if;
end $$;

-- ── 3. Keep the original submission, write-once provenance ───────────────────
create or replace function public.keep_pin_submission_provenance()
returns trigger language plpgsql
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Always taken from the row itself; a client-supplied value is ignored.
    new.original_metadata := jsonb_build_object(
      'proposed_name',    new.proposed_name,
      'brand',            new.brand,
      'series_name',      new.series_name,
      'release_location', new.release_location,
      'release_year',     new.release_year,
      'edition_type',     new.edition_type,
      'edition_size',     new.edition_size,
      'fac_number',       new.fac_number,
      'sku',              new.sku,
      'character_names',  to_jsonb(new.character_names),
      'notes',            new.notes,
      'front_image_path', new.front_image_path,
      'back_image_path',  new.back_image_path,
      'submitted_at',     now()
    );
    return new;
  end if;

  new.original_metadata  := old.original_metadata;
  new.ai_identification  := old.ai_identification;
  -- Rights can be confirmed later (e.g. while fixing a needs_changes
  -- submission) but never changed or withdrawn by an edit.
  new.rights_confirmed_at := coalesce(old.rights_confirmed_at, new.rights_confirmed_at);
  return new;
end;
$$;

drop trigger if exists pin_submissions_provenance on public.pin_submissions;
create trigger pin_submissions_provenance
  before insert or update on public.pin_submissions
  for each row execute function public.keep_pin_submission_provenance();

-- Daily submission cap lookups (API server).
create index if not exists ps_submitted_by_created_idx
  on public.pin_submissions (submitted_by, created_at desc);

-- ── 4. AI / clean-up usage log ───────────────────────────────────────────────
create table if not exists public.contributor_ai_usage (
  id            bigint      generated always as identity primary key,
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  kind          text        not null check (kind in ('scan', 'photo_cleanup')),
  image_sha256  text        check (image_sha256 is null or image_sha256 ~ '^[0-9a-f]{64}$'),
  result        jsonb       check (result is null or pg_column_size(result) <= 65536),
  created_at    timestamptz not null default now()
);

create index if not exists contributor_ai_usage_user_kind_time_idx
  on public.contributor_ai_usage (user_id, kind, created_at desc);
create index if not exists contributor_ai_usage_user_kind_hash_idx
  on public.contributor_ai_usage (user_id, kind, image_sha256)
  where image_sha256 is not null;

alter table public.contributor_ai_usage enable row level security;
-- No policies: only the service role (API server) reads or writes.
revoke all on public.contributor_ai_usage from anon, authenticated;

-- ── Housekeeping (optional, any time) ────────────────────────────────────────
--   Usage rows are only needed for the last day (caps) and week (repeat
--   reuse). To trim:
--     delete from contributor_ai_usage where created_at < now() - interval '30 days';
--
-- ── Rollback (run in this order) ─────────────────────────────────────────────
-- Unidentified submissions must be given placeholder values before NOT NULL
-- can come back. This is lossy: afterwards they can't be told apart from a
-- pin genuinely named 'Unidentified pin' except via original_metadata,
-- which the next lines drop — export it first if it matters.
--
-- drop table if exists public.contributor_ai_usage;
-- drop index if exists public.ps_submitted_by_created_idx;
-- drop trigger if exists pin_submissions_provenance on public.pin_submissions;
-- drop function if exists public.keep_pin_submission_provenance();
-- alter table public.pin_submissions drop constraint if exists ps_ai_identification_shape;
-- alter table public.pin_submissions
--   drop column if exists original_metadata,
--   drop column if exists ai_identification,
--   drop column if exists rights_confirmed_at;
-- update public.pin_submissions
--    set proposed_name = coalesce(proposed_name, 'Unidentified pin'),
--        brand         = coalesce(brand, 'Unknown')
--  where proposed_name is null or brand is null;
-- alter table public.pin_submissions alter column proposed_name set not null;
-- alter table public.pin_submissions alter column brand         set not null;
-- ============================================================
-- End of migration 047.
-- ============================================================
