-- ============================================================
-- Migration 059: open trades hold account deletion; admins review problem
-- reports
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/059_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. Rollback at the bottom.
-- Run AFTER 058.
--
-- RELEASE ORDER: this replaces trade_report_problem(uuid) with a version that
-- needs a reason. Apply it, then publish the matching app update straight away.
--
--   1. A problem report needs a reason, which both collectors can read.
--   2. Admins see open problem reports through admin_list_problem_trades(),
--      and close them with admin_resolve_trade_problem() as completed or
--      cancelled. An admin can't close a report on their own trade.
--   3. prepare_account_deletion() refuses while the user has an accepted or
--      problem trade. Pending trades are removed as before.
-- ============================================================

begin;

-- ── 1. Shape ────────────────────────────────────────────────

alter table trades
  add column if not exists problem_reason          text check (char_length(problem_reason) <= 500),
  add column if not exists problem_resolved_at     timestamptz,
  add column if not exists problem_resolved_by     uuid references auth.users(id) on delete set null,
  add column if not exists problem_resolution_note text check (char_length(problem_resolution_note) <= 500);


-- ── 2. Reporting needs a reason ─────────────────────────────

drop function if exists trade_report_problem(uuid);

create or replace function trade_report_problem(p_trade_id uuid, p_reason text)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades := trade_for_participant(p_trade_id);
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_reason is null then
    raise exception 'Tell us what went wrong.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Please keep this to 500 characters or fewer.' using errcode = '22023';
  end if;
  if v_trade.status <> 'accepted'
     or (v_trade.initiator_posted_at is null and v_trade.recipient_posted_at is null) then
    raise exception 'A problem can be reported once pins have been posted.' using errcode = '22023';
  end if;
  update trades set
    status = 'problem', problem_reported_by = auth.uid(), problem_reported_at = now(),
    problem_reason = v_reason, updated_at = now()
  where id = p_trade_id returning * into v_trade;
  return v_trade;
end $$;

revoke all on function trade_report_problem(uuid, text) from public, anon;
grant execute on function trade_report_problem(uuid, text) to authenticated;


-- ── 3. Admin review ─────────────────────────────────────────

-- Open reports only, oldest first. Admins get no wider read access to trades.
create or replace function admin_list_problem_trades()
returns table (
  id uuid,
  initiator_id uuid,
  recipient_id uuid,
  initiator_username text,
  recipient_username text,
  initiator_posted_at timestamptz,
  recipient_posted_at timestamptz,
  initiator_carrier text,
  recipient_carrier text,
  initiator_tracking text,
  recipient_tracking text,
  initiator_received_at timestamptz,
  recipient_received_at timestamptz,
  problem_reported_by uuid,
  problem_reported_at timestamptz,
  problem_reason text
)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select t.id, t.initiator_id, t.recipient_id, pi.username::text, pr.username::text,
           t.initiator_posted_at, t.recipient_posted_at,
           t.initiator_carrier, t.recipient_carrier,
           t.initiator_tracking, t.recipient_tracking,
           t.initiator_received_at, t.recipient_received_at,
           t.problem_reported_by, t.problem_reported_at, t.problem_reason
    from trades t
    left join profiles pi on pi.id = t.initiator_id
    left join profiles pr on pr.id = t.recipient_id
    where t.status = 'problem'
    order by t.problem_reported_at asc nulls first
    limit 200;
end $$;

create or replace function admin_resolve_trade_problem(
  p_trade_id uuid, p_outcome text, p_note text default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades;
  v_note text := nullif(btrim(p_note), '');
begin
  if not is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('completed', 'cancelled') then
    raise exception 'Choose completed or cancelled.' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Please keep the note to 500 characters or fewer.' using errcode = '22023';
  end if;
  select * into v_trade from trades where id = p_trade_id for update;
  if not found then
    raise exception 'Trade not found.' using errcode = 'P0002';
  end if;
  if v_trade.status <> 'problem' then
    raise exception 'This report is already closed.' using errcode = '22023';
  end if;
  if auth.uid() in (v_trade.initiator_id, v_trade.recipient_id) then
    raise exception 'Another admin needs to review your own trade.' using errcode = '42501';
  end if;
  update trades set
    status = p_outcome, problem_resolved_at = now(), problem_resolved_by = auth.uid(),
    problem_resolution_note = v_note, updated_at = now()
  where id = p_trade_id;
end $$;

revoke all on function admin_list_problem_trades() from public, anon;
revoke all on function admin_resolve_trade_problem(uuid, text, text) from public, anon;
grant execute on function admin_list_problem_trades() to authenticated;
grant execute on function admin_resolve_trade_problem(uuid, text, text) to authenticated;


-- ── 4. Account deletion waits for open trades ───────────────
-- Same function as 051, plus the open-trade check.

create or replace function public.prepare_account_deletion(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit_id      uuid;
  v_posts         integer;
  v_comments      integer;
  v_messages      integer;
  v_conversations integer;
  v_trades        integer;
begin
  if p_user is null then
    raise exception 'user id required' using errcode = '22004';
  end if;

  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- The App Creator role can only be changed in the database console (040);
  -- deleting that account from the app would leave nobody able to manage
  -- access. Clear is_app_creator in the console first.
  if exists (select 1 from profiles where id = p_user and is_app_creator) then
    return jsonb_build_object('status', 'refused', 'reason', 'app_creator');
  end if;

  -- Pins may be in the post, so the other collector still needs this record.
  -- Both states have a way out: cancel before posting, report a problem after
  -- it, and an admin closes the report.
  if exists (
    select 1 from trades
    where (initiator_id = p_user or recipient_id = p_user)
      and status in ('accepted', 'problem')
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'open_trade');
  end if;

  -- Photo messages point at the user's community-photos folder, which the
  -- API removes. Keep the message text, drop the attachments.
  update conversation_messages
     set message_type = 'text',
         pin_ids = '[]'::jsonb,
         for_trade_pin_ids = '[]'::jsonb,
         photo_urls = '[]'::jsonb
   where sender_id = p_user
     and message_type = 'photo';

  -- Same for post photos (validate_community_post_photos accepts []).
  update community_posts
     set photos = '[]'::jsonb
   where author_id = p_user
     and photos <> '[]'::jsonb;

  -- Contributed photos still waiting for review lose their stored object;
  -- approved ones live on in the public catalogue bucket and stay
  -- (uploaded_by is set to NULL by the existing foreign key).
  delete from pin_images
   where uploaded_by = p_user
     and status <> 'approved';

  -- Trades the user is part of are removed explicitly (trade_items and
  -- trade_messages cascade). trade_items -> user_pins is ON DELETE RESTRICT,
  -- so this must happen before user_pins is cascaded from auth.users.
  delete from trades
   where initiator_id = p_user or recipient_id = p_user;
  get diagnostics v_trades = row_count;
  delete from trade_items
   where user_pin_id in (select id from user_pins where user_id = p_user);

  select count(*) into v_posts from community_posts where author_id = p_user;
  select count(*) into v_comments from post_comments where author_id = p_user;
  select count(*) into v_messages from conversation_messages where sender_id = p_user;
  select count(*) into v_conversations from conversations
   where participant_a_id = p_user or participant_b_id = p_user;

  -- A retry after a failed attempt reuses that attempt's audit row.
  select id into v_audit_id
    from account_deletions
   where user_id = p_user and status in ('started', 'failed')
   order by requested_at desc
   limit 1;

  if v_audit_id is null then
    insert into account_deletions (user_id) values (p_user)
    returning id into v_audit_id;
  end if;

  update account_deletions
     set status = 'started',
         details = details || jsonb_build_object(
           'posts', v_posts,
           'comments', v_comments,
           'messages', v_messages,
           'conversations', v_conversations,
           'trades', v_trades + coalesce((details ->> 'trades')::integer, 0))
   where id = v_audit_id;

  return jsonb_build_object(
    'status', 'ready',
    'audit_id', v_audit_id,
    'posts', v_posts,
    'comments', v_comments,
    'messages', v_messages,
    'conversations', v_conversations,
    'trades', v_trades);
end;
$$;

commit;

-- ============================================================
-- Verification: supabase/verify/059_verify.sql (rolls itself back).
--
-- ROLLBACK (run as one block). This loses problem reasons and resolution notes.
-- begin;
-- drop function if exists admin_resolve_trade_problem(uuid, text, text);
-- drop function if exists admin_list_problem_trades();
-- drop function if exists trade_report_problem(uuid, text);
-- Then re-run from migration 051: prepare_account_deletion
-- and from migration 057: trade_report_problem, with its revoke and grant.
-- alter table trades
--   drop column if exists problem_reason, drop column if exists problem_resolved_at,
--   drop column if exists problem_resolved_by, drop column if exists problem_resolution_note;
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
