-- ============================================================
-- Migration 087: Bulk Image Matcher — daily AI-call budget and atomic
-- batch-stats merge (staging first)
--
-- Security review of #762 (follow-up): the bulk matcher's daily limit counted
-- photos matched in the last 24 h (bulk_image_items.matched_at), so a photo
-- re-matched the same day (a set changed or was learned) and the accuracy
-- check (which writes no matched_at) cost AI calls that no limit counted.
-- The API server now reserves its OpenAI calls here before each match:
--
--   bulk_ai_usage            one row per UTC day: AI calls reserved so far
--   bulk_reserve_ai_calls()  add calls only if the day stays within the
--                            limit, in one statement (the row lock makes two
--                            callers queue, so they can't both take the last
--                            calls); returns whether it was allowed
--   bulk_merge_batch_stats() merge keys into bulk_image_batches.stats in one
--                            statement (stats || patch), so two saves at the
--                            same moment don't wipe each other's keys
--
-- Purely additive: one table, two functions. No existing table, column or
-- policy changes. Service role only: RLS on the table with no policies, and
-- the functions are executable by service_role only.
--
-- Apply in the STAGING Supabase SQL editor first, then production. Run AFTER
-- 086. Verify: supabase/verify/087_verify.sql.
--
-- Rollback (safe — the API server stops matching with a clear message until
-- the budget function is back, and falls back to a plain write for stats):
--   drop function if exists bulk_merge_batch_stats(uuid, jsonb);
--   drop function if exists bulk_reserve_ai_calls(integer, integer);
--   drop table if exists bulk_ai_usage;
-- ============================================================

create table if not exists bulk_ai_usage (
  usage_day   date        primary key,
  calls       integer     not null default 0 check (calls >= 0),
  updated_at  timestamptz not null default now()
);

alter table bulk_ai_usage enable row level security;
-- No policies: only the API server's service role reads or writes it.

create or replace function bulk_reserve_ai_calls(p_calls integer, p_limit integer)
returns table (allowed boolean, used integer, limit_calls integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_day  date := (now() at time zone 'utc')::date;
  v_used integer;
begin
  if p_calls is null or p_calls < 0 or p_limit is null or p_limit < 0 then
    raise exception 'bulk_reserve_ai_calls: invalid arguments' using errcode = 'invalid_parameter_value';
  end if;
  insert into bulk_ai_usage (usage_day, calls) values (v_day, 0) on conflict (usage_day) do nothing;
  update bulk_ai_usage
     set calls = calls + p_calls, updated_at = now()
   where usage_day = v_day and calls + p_calls <= p_limit
  returning calls into v_used;
  if found then
    return query select true, v_used, p_limit;
    return;
  end if;
  select calls into v_used from bulk_ai_usage where usage_day = v_day;
  return query select false, coalesce(v_used, 0), p_limit;
end $$;

create or replace function bulk_merge_batch_stats(p_batch uuid, p_patch jsonb)
returns jsonb
language sql
set search_path = public, pg_temp
as $$
  update bulk_image_batches
     set stats = coalesce(stats, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where id = p_batch
  returning stats;
$$;

revoke all on function bulk_reserve_ai_calls(integer, integer) from public, anon, authenticated;
revoke all on function bulk_merge_batch_stats(uuid, jsonb) from public, anon, authenticated;
grant execute on function bulk_reserve_ai_calls(integer, integer) to service_role;
grant execute on function bulk_merge_batch_stats(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
