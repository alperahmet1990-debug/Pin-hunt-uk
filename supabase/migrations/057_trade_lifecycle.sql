-- ============================================================
-- Migration 057: server-enforced trade lifecycle (#31, B-P1-07a)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/057_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. Rollback at the bottom.
-- Run AFTER 050 (it uses is_blocked_with and is_current_user_suspended).
--
-- RELEASE ORDER: older app builds change trades directly, which this file
-- refuses. Apply it, then publish the matching app update straight away.
--
-- Status names stay as they are ('pending' is proposed, 'rejected' is
-- declined), so existing rows need no change. 'problem' is new.
--
--   pending  -> accepted   recipient only
--   pending  -> rejected   recipient only
--   pending  -> cancelled  initiator only
--   accepted -> cancelled  either side, only before anyone has posted
--   accepted -> problem    either side, only after someone has posted
--   accepted -> completed  automatic, when both sides have marked received
--
-- Each side marks its own posted and received. A pin can only be marked
-- received once the other side has posted it. 'problem' is final for
-- collectors; resolving one is an admin job outside this migration.
--
-- Blocks and suspensions stop anyone taking on a new obligation (propose,
-- accept, post). They do not stop anyone leaving or finishing a trade already
-- under way (decline, cancel, received, problem), so a block can't trap pins
-- that are already in the post.
-- ============================================================

begin;

-- ── 1. Shape ────────────────────────────────────────────────

alter table trades drop constraint if exists trades_status_check;
alter table trades add constraint trades_status_check
  check (status in ('pending', 'accepted', 'rejected', 'completed', 'cancelled', 'problem'));

alter table trades
  add column if not exists initiator_posted_at   timestamptz,
  add column if not exists recipient_posted_at   timestamptz,
  add column if not exists initiator_carrier     text check (char_length(initiator_carrier) <= 80),
  add column if not exists recipient_carrier     text check (char_length(recipient_carrier) <= 80),
  add column if not exists initiator_tracking    text check (char_length(initiator_tracking) <= 80),
  add column if not exists recipient_tracking    text check (char_length(recipient_tracking) <= 80),
  add column if not exists initiator_received_at timestamptz,
  add column if not exists recipient_received_at timestamptz,
  add column if not exists problem_reported_by   uuid references auth.users(id) on delete set null,
  add column if not exists problem_reported_at   timestamptz;


-- ── 2. Internal helper (not callable by clients) ────────────

-- Locks the trade row and returns it. A trade the caller isn't part of gets
-- the same answer as one that doesn't exist.
create or replace function trade_for_participant(p_trade_id uuid)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_trade trades;
begin
  if v_uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select * into v_trade from trades
    where id = p_trade_id and (initiator_id = v_uid or recipient_id = v_uid)
    for update;
  if not found then
    raise exception 'Trade not found.' using errcode = 'P0002';
  end if;
  return v_trade;
end $$;

-- Refuses a new obligation between two blocked users, or from a suspended one.
create or replace function trade_assert_may_commit(p_other uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if is_current_user_suspended() then
    raise exception 'Your account can''t do this right now.' using errcode = '42501';
  end if;
  if is_blocked_with(p_other) then
    raise exception 'This trade isn''t available.' using errcode = '42501';
  end if;
end $$;


-- ── 3. Lifecycle functions ──────────────────────────────────

create or replace function trade_propose(p_recipient_id uuid, p_notes text default null)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_notes text := nullif(btrim(p_notes), '');
  v_trade trades;
begin
  if v_uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  if p_recipient_id is null or p_recipient_id = v_uid then
    raise exception 'Choose another collector to trade with.' using errcode = '22023';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'Trade notes are too long.' using errcode = '22023';
  end if;
  perform trade_assert_may_commit(p_recipient_id);
  insert into trades (initiator_id, recipient_id, notes)
    values (v_uid, p_recipient_id, v_notes)
    returning * into v_trade;
  return v_trade;
end $$;

create or replace function trade_accept(p_trade_id uuid)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_trade trades := trade_for_participant(p_trade_id);
begin
  if v_trade.recipient_id <> auth.uid() then
    raise exception 'Only the other collector can accept this trade.' using errcode = '42501';
  end if;
  if v_trade.status <> 'pending' then
    raise exception 'This trade can no longer be accepted.' using errcode = '22023';
  end if;
  perform trade_assert_may_commit(v_trade.initiator_id);
  update trades set status = 'accepted', updated_at = now()
    where id = p_trade_id returning * into v_trade;
  return v_trade;
end $$;

create or replace function trade_decline(p_trade_id uuid)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_trade trades := trade_for_participant(p_trade_id);
begin
  if v_trade.recipient_id <> auth.uid() then
    raise exception 'Only the other collector can decline this trade.' using errcode = '42501';
  end if;
  if v_trade.status <> 'pending' then
    raise exception 'This trade can no longer be declined.' using errcode = '22023';
  end if;
  update trades set status = 'rejected', updated_at = now()
    where id = p_trade_id returning * into v_trade;
  return v_trade;
end $$;

create or replace function trade_cancel(p_trade_id uuid)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_trade trades := trade_for_participant(p_trade_id);
begin
  if v_trade.status = 'pending' then
    if v_trade.initiator_id <> auth.uid() then
      raise exception 'Decline this trade instead.' using errcode = '42501';
    end if;
  elsif v_trade.status = 'accepted' then
    if v_trade.initiator_posted_at is not null or v_trade.recipient_posted_at is not null then
      raise exception 'Pins are already in the post. Report a problem instead.' using errcode = '22023';
    end if;
  else
    raise exception 'This trade can no longer be cancelled.' using errcode = '22023';
  end if;
  update trades set status = 'cancelled', updated_at = now()
    where id = p_trade_id returning * into v_trade;
  return v_trade;
end $$;

-- Calling this again only updates the carrier and tracking number, so a
-- number added later doesn't move the posted date.
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
  perform trade_assert_may_commit(
    case when v_is_initiator then v_trade.recipient_id else v_trade.initiator_id end);
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

-- Records that the caller received the other side's pins, and completes the
-- trade once both sides have. The row lock in trade_for_participant means two
-- simultaneous calls can't both miss the other's mark.
create or replace function trade_mark_received(p_trade_id uuid)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades := trade_for_participant(p_trade_id);
  v_is_initiator boolean := v_trade.initiator_id = auth.uid();
begin
  if v_trade.status <> 'accepted' then
    raise exception 'Only an accepted trade can be marked as received.' using errcode = '22023';
  end if;
  if (v_is_initiator and v_trade.recipient_posted_at is null)
     or (not v_is_initiator and v_trade.initiator_posted_at is null) then
    raise exception 'The other collector hasn''t marked their pins as posted yet.' using errcode = '22023';
  end if;
  if v_is_initiator then
    update trades set initiator_received_at = coalesce(initiator_received_at, now()), updated_at = now()
      where id = p_trade_id returning * into v_trade;
  else
    update trades set recipient_received_at = coalesce(recipient_received_at, now()), updated_at = now()
      where id = p_trade_id returning * into v_trade;
  end if;
  if v_trade.initiator_received_at is not null and v_trade.recipient_received_at is not null then
    update trades set status = 'completed', updated_at = now()
      where id = p_trade_id returning * into v_trade;
  end if;
  return v_trade;
end $$;

create or replace function trade_report_problem(p_trade_id uuid)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_trade trades := trade_for_participant(p_trade_id);
begin
  if v_trade.status <> 'accepted'
     or (v_trade.initiator_posted_at is null and v_trade.recipient_posted_at is null) then
    raise exception 'A problem can be reported once pins have been posted.' using errcode = '22023';
  end if;
  update trades set
    status = 'problem', problem_reported_by = auth.uid(), problem_reported_at = now(), updated_at = now()
  where id = p_trade_id returning * into v_trade;
  return v_trade;
end $$;


-- ── 4. Access ───────────────────────────────────────────────

revoke all on function trade_for_participant(uuid) from public, anon, authenticated;
revoke all on function trade_assert_may_commit(uuid) from public, anon, authenticated;

revoke all on function trade_propose(uuid, text) from public, anon;
revoke all on function trade_accept(uuid) from public, anon;
revoke all on function trade_decline(uuid) from public, anon;
revoke all on function trade_cancel(uuid) from public, anon;
revoke all on function trade_mark_posted(uuid, text, text) from public, anon;
revoke all on function trade_mark_received(uuid) from public, anon;
revoke all on function trade_report_problem(uuid) from public, anon;
grant execute on function trade_propose(uuid, text) to authenticated;
grant execute on function trade_accept(uuid) to authenticated;
grant execute on function trade_decline(uuid) to authenticated;
grant execute on function trade_cancel(uuid) to authenticated;
grant execute on function trade_mark_posted(uuid, text, text) to authenticated;
grant execute on function trade_mark_received(uuid) to authenticated;
grant execute on function trade_report_problem(uuid) to authenticated;

-- Collectors can only change a trade through the functions above.
drop policy if exists "trades_insert_auth" on trades;
drop policy if exists "trades_update_participant" on trades;
revoke insert, update on trades from anon, authenticated;

commit;

-- ============================================================
-- Verification: supabase/verify/057_verify.sql (rolls itself back).
--
-- ROLLBACK (run as one block; older app builds work again afterwards).
-- Any 'problem' trade must be moved back first, or the constraint fails.
-- begin;
-- update trades set status = 'accepted' where status = 'problem';
-- grant insert, update on trades to authenticated;
-- create policy "trades_insert_auth" on trades
--   for insert with check (initiator_id = auth.uid());
-- create policy "trades_update_participant" on trades
--   for update
--   using (auth.uid() = initiator_id or auth.uid() = recipient_id)
--   with check (auth.uid() = initiator_id or auth.uid() = recipient_id);
-- drop function if exists trade_propose(uuid, text);
-- drop function if exists trade_accept(uuid);
-- drop function if exists trade_decline(uuid);
-- drop function if exists trade_cancel(uuid);
-- drop function if exists trade_mark_posted(uuid, text, text);
-- drop function if exists trade_mark_received(uuid);
-- drop function if exists trade_report_problem(uuid);
-- drop function if exists trade_assert_may_commit(uuid);
-- drop function if exists trade_for_participant(uuid);
-- alter table trades
--   drop column if exists initiator_posted_at, drop column if exists recipient_posted_at,
--   drop column if exists initiator_carrier, drop column if exists recipient_carrier,
--   drop column if exists initiator_tracking, drop column if exists recipient_tracking,
--   drop column if exists initiator_received_at, drop column if exists recipient_received_at,
--   drop column if exists problem_reported_by, drop column if exists problem_reported_at;
-- alter table trades drop constraint if exists trades_status_check;
-- alter table trades add constraint trades_status_check
--   check (status in ('pending', 'accepted', 'rejected', 'completed', 'cancelled'));
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
