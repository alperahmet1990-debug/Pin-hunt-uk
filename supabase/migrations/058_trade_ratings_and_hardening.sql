-- ============================================================
-- Migration 058: ratings belong to completed trades (#33), and trade checks
-- tightened after migration 057
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/058_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. Rollback at the bottom.
-- Run AFTER 057.
--
-- RELEASE ORDER: older app builds add ratings directly, which this file
-- refuses. Apply it, then publish the matching app update straight away.
--
--   1. trade_rate() is the only way to add a rating. The trade must be
--      completed and the caller a participant. The rated person is the other
--      participant. Existing ratings are not changed.
--   2. Trade commitments also check that the other collector isn't suspended.
--   3. Adding tracking to pins already posted is not a new commitment, so a
--      block or suspension no longer stops it.
--   4. trade_items has no app writer, so clients can no longer write it.
--      Reading is unchanged.
--   5. trades, trade_items and trade_ratings keep SELECT only for clients.
--   6. One rating per rater per trade now ignores ratings whose trade was
--      removed. Otherwise removing two trades one person rated would collide.
-- ============================================================

begin;

-- ── 1. Ratings ──────────────────────────────────────────────

alter table trade_ratings drop constraint if exists trade_ratings_trade_id_rater_id_key;
alter table trade_ratings add constraint trade_ratings_trade_id_rater_id_key
  unique (trade_id, rater_id);

-- NOT VALID: applies to new ratings without rewriting old ones.
alter table trade_ratings add constraint trade_ratings_comment_length
  check (char_length(comment) <= 500) not valid;

create or replace function trade_rate(
  p_trade_id uuid, p_is_positive boolean, p_comment text default null
)
returns trade_ratings language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades := trade_for_participant(p_trade_id);
  v_uid uuid := auth.uid();
  v_comment text := nullif(btrim(p_comment), '');
  v_rating trade_ratings;
begin
  if is_current_user_suspended() then
    raise exception 'Your account can''t do this right now.' using errcode = '42501';
  end if;
  if p_is_positive is null then
    raise exception 'Choose a rating.' using errcode = '22023';
  end if;
  if v_trade.status <> 'completed' then
    raise exception 'You can rate a trade once it is completed.' using errcode = '22023';
  end if;
  if char_length(v_comment) > 500 then
    raise exception 'Comments must be 500 characters or fewer.' using errcode = '22023';
  end if;
  insert into trade_ratings (trade_id, rater_id, ratee_id, is_positive, comment)
    values (
      p_trade_id, v_uid,
      case when v_trade.initiator_id = v_uid then v_trade.recipient_id else v_trade.initiator_id end,
      p_is_positive, v_comment
    )
    returning * into v_rating;
  return v_rating;
exception when unique_violation then
  raise exception 'You have already rated this trade.' using errcode = '23505';
end $$;

revoke all on function trade_rate(uuid, boolean, text) from public, anon;
grant execute on function trade_rate(uuid, boolean, text) to authenticated;

drop policy if exists "ratings_insert_own" on trade_ratings;


-- ── 2 and 3. Commitments and tracking ───────────────────────

create or replace function trade_assert_may_commit(p_other uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if is_current_user_suspended() then
    raise exception 'Your account can''t do this right now.' using errcode = '42501';
  end if;
  if is_blocked_with(p_other)
     or exists (select 1 from user_suspensions where user_id = p_other) then
    raise exception 'This trade isn''t available.' using errcode = '42501';
  end if;
end $$;

create or replace function trade_mark_posted(
  p_trade_id uuid, p_carrier text default null, p_tracking text default null
)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades := trade_for_participant(p_trade_id);
  v_is_initiator boolean := v_trade.initiator_id = auth.uid();
  v_carrier text := nullif(btrim(p_carrier), '');
  v_tracking text := nullif(btrim(p_tracking), '');
begin
  if v_trade.status <> 'accepted' then
    raise exception 'Only an accepted trade can be marked as posted.' using errcode = '22023';
  end if;
  if char_length(v_carrier) > 80 or char_length(v_tracking) > 80 then
    raise exception 'Carrier and tracking number must be 80 characters or fewer.' using errcode = '22023';
  end if;
  -- Only the first mark is a new commitment. A later call just adds tracking.
  if v_is_initiator and v_trade.initiator_posted_at is null then
    perform trade_assert_may_commit(v_trade.recipient_id);
  elsif not v_is_initiator and v_trade.recipient_posted_at is null then
    perform trade_assert_may_commit(v_trade.initiator_id);
  end if;
  if v_is_initiator then
    update trades set
      initiator_posted_at = coalesce(initiator_posted_at, now()),
      initiator_carrier = coalesce(v_carrier, initiator_carrier),
      initiator_tracking = coalesce(v_tracking, initiator_tracking),
      updated_at = now()
    where id = p_trade_id returning * into v_trade;
  else
    update trades set
      recipient_posted_at = coalesce(recipient_posted_at, now()),
      recipient_carrier = coalesce(v_carrier, recipient_carrier),
      recipient_tracking = coalesce(v_tracking, recipient_tracking),
      updated_at = now()
    where id = p_trade_id returning * into v_trade;
  end if;
  return v_trade;
end $$;


-- ── 4 and 5. Client access ──────────────────────────────────

drop policy if exists "trade_items_insert_participant" on trade_items;
drop policy if exists "trade_items_delete_initiator" on trade_items;

revoke all on trades, trade_items, trade_ratings from anon, authenticated;
grant select on trades, trade_items, trade_ratings to authenticated;

commit;

-- ============================================================
-- Verification: supabase/verify/058_verify.sql (rolls itself back).
--
-- ROLLBACK (run as one block; older app builds can rate again afterwards).
-- Ratings added since 058 stay. A comment over 500 characters can't exist yet.
-- If two ratings by one person lost their trade, the old constraint won't
-- return until one of them is removed.
-- begin;
-- drop function if exists trade_rate(uuid, boolean, text);
-- alter table trade_ratings drop constraint if exists trade_ratings_comment_length;
-- alter table trade_ratings drop constraint if exists trade_ratings_trade_id_rater_id_key;
-- alter table trade_ratings add constraint trade_ratings_trade_id_rater_id_key
--   unique nulls not distinct (trade_id, rater_id);
-- grant insert on trade_ratings to authenticated;
-- create policy "ratings_insert_own" on trade_ratings
--   for insert to authenticated
--   with check (rater_id = auth.uid() and ratee_id <> auth.uid());
-- grant insert, delete on trade_items to authenticated;
-- create policy "trade_items_insert_participant" on trade_items
--   for insert with check (exists (select 1 from trades t where t.id = trade_items.trade_id
--     and t.initiator_id = auth.uid() and t.status = 'pending'));
-- create policy "trade_items_delete_initiator" on trade_items
--   for delete using (exists (select 1 from trades t where t.id = trade_items.trade_id
--     and t.initiator_id = auth.uid() and t.status = 'pending'));
-- Then re-run sections "2. Internal helper" (trade_assert_may_commit) and the
-- trade_mark_posted function from migration 057 to restore their 057 versions.
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
