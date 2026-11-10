-- ============================================================
-- Migration 072: moderators review and remove a reported message
-- (LP-4 #504, LP-6 #524)
--
-- DRAFT, L3. Never applied by an agent. STAGING FIRST: apply in the Supabase
-- SQL editor, run supabase/verify/072_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. See supabase/verify/072_RUNBOOK.md.
-- Run AFTER 051 (050 user_reports, 051 nullable senders). Does not depend
-- on 062-071.
--
-- The guard at the top stops the script unless it is running on staging.
-- For the production run, use the production guard in 072_RUNBOOK.md.
--
-- What it adds:
--
--   • message_moderation_events   one row each time a moderator views or
--       removes a reported message: who, when, which report, and for a
--       removal the reason (1-500 characters) and the photo files to delete.
--       Admins can read it. Nobody writes it directly: only the two
--       functions below do.
--   • conversation_messages.removed_at   set when moderators remove the
--       message, so the chat can show the placeholder. New messages always
--       start with it empty, and a removed message can't be edited again.
--   • get_reported_message(report_id)   admins only, signed in. For a report
--       that is still open, returns that one message (not the conversation)
--       and records the view.
--   • remove_reported_message(admin_id, message_id, reason)   service role
--       only, called by POST /api/admin/messages/:id/remove after it has
--       checked the caller is an admin. Needs an open report on the message.
--       Replaces the text with "Removed by PinHunt moderators", clears the
--       photos and pin shares, records the removal and returns the photo
--       files for the API to delete from storage. The row stays, so the
--       report and the rest of the conversation are unchanged.
--
-- An open report is a user_reports row for the message: dismissing a report
-- deletes it (050).
--
-- Unchanged: who can read, send or report messages; user_reports and its
-- policies; the message validation triggers from 032 and 033. A removed
-- message is a 'text' message with no attachments, which both triggers
-- already accept.
--
-- Account deletion: messages are kept with no sender (051), so their events
-- stay; admin_id is set to NULL if the moderator's account is deleted, and
-- report_id when the report goes. Nothing here can block a deletion. The
-- guard trigger ignores the sender being cleared.
--
-- Rollback at the bottom.
-- ============================================================

begin;

-- ── 0. Guard: staging only, and the tables this needs ───────────────────────
-- Staging is told apart by trade_for_participant (057), which production
-- does not have yet. Production uses the guard in 072_RUNBOOK.md instead.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'trade_for_participant'
  ) then
    raise exception '072 guard: this does not look like staging (trade_for_participant is missing). Nothing was changed. For production, use the production guard in supabase/verify/072_RUNBOOK.md.';
  end if;
  if to_regclass('public.user_reports') is null then
    raise exception '072 guard: user_reports is missing. Apply 050 first. Nothing was changed.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'conversation_messages' and column_name = 'message_type'
  ) then
    raise exception '072 guard: conversation_messages.message_type is missing. Apply 031 first. Nothing was changed.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception '072 guard: is_admin() is missing. Nothing was changed.';
  end if;
end $$;


-- ── 1. Removed marker on messages ───────────────────────────────────────────

alter table public.conversation_messages
  add column if not exists removed_at timestamptz;

-- New messages never start removed, and a removed message stays as it is.
create or replace function public.guard_conversation_message_removed()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.removed_at := null;
    return new;
  end if;
  if old.removed_at is not null and (
       new.removed_at        is distinct from old.removed_at
    or new.body              is distinct from old.body
    or new.message_type      is distinct from old.message_type
    or new.pin_ids           is distinct from old.pin_ids
    or new.for_trade_pin_ids is distinct from old.for_trade_pin_ids
    or new.photo_urls        is distinct from old.photo_urls
  ) then
    raise exception 'This message was removed by moderators and can''t be changed.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_conversation_message_removed() from public, anon, authenticated;

drop trigger if exists guard_conversation_message_removed_trigger on public.conversation_messages;
create trigger guard_conversation_message_removed_trigger
  before insert or update on public.conversation_messages
  for each row execute function public.guard_conversation_message_removed();


-- ── 2. Moderation record ────────────────────────────────────────────────────

create table if not exists public.message_moderation_events (
  id                  uuid        primary key default gen_random_uuid(),
  message_id          uuid        not null references public.conversation_messages(id) on delete cascade,
  report_id           uuid        references public.user_reports(id) on delete set null,
  admin_id            uuid        references public.profiles(id) on delete set null,
  action              text        not null check (action in ('viewed', 'removed')),
  reason              text,
  removed_photo_paths jsonb       not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  constraint mme_reason_shape check (
       (action = 'viewed'  and reason is null)
    or (action = 'removed' and reason is not null and char_length(reason) between 1 and 500)
  ),
  constraint mme_photo_paths_array check (jsonb_typeof(removed_photo_paths) = 'array')
);

create index if not exists mme_message_idx on public.message_moderation_events (message_id, created_at desc);
create index if not exists mme_created_idx on public.message_moderation_events (created_at desc);

alter table public.message_moderation_events enable row level security;

drop policy if exists "mme_select_admin" on public.message_moderation_events;
create policy "mme_select_admin" on public.message_moderation_events
  for select to authenticated
  using (is_admin());

-- No insert, update or delete policies: rows come only from the functions
-- below (SECURITY DEFINER), and are never edited.
revoke all on public.message_moderation_events from anon, authenticated;
grant select on public.message_moderation_events to authenticated;


-- ── 3. View a reported message (admins, signed in) ──────────────────────────
-- Returns { status: 'ok' | 'removed' | 'gone', message?, removal? }.
-- 'gone': the report was dismissed, or the message no longer exists.

create or replace function public.get_reported_message(p_report_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  v_admin   uuid := auth.uid();
  v_report  user_reports%rowtype;
  v_msg     conversation_messages%rowtype;
  v_removal jsonb;
begin
  if v_admin is null or not is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_report from user_reports where id = p_report_id;
  if not found then
    return jsonb_build_object('status', 'gone');
  end if;
  if v_report.message_id is null then
    raise exception 'This report is about a profile, not a message' using errcode = '22023';
  end if;

  select * into v_msg from conversation_messages where id = v_report.message_id;
  if not found then
    return jsonb_build_object('status', 'gone');
  end if;

  insert into message_moderation_events (message_id, report_id, admin_id, action)
  values (v_msg.id, v_report.id, v_admin, 'viewed');

  if v_msg.removed_at is not null then
    select jsonb_build_object('admin_id', e.admin_id, 'reason', e.reason, 'created_at', e.created_at)
      into v_removal
      from message_moderation_events e
     where e.message_id = v_msg.id and e.action = 'removed'
     order by e.created_at desc
     limit 1;
  end if;

  return jsonb_build_object(
    'status', case when v_msg.removed_at is null then 'ok' else 'removed' end,
    'message', jsonb_build_object(
      'id',                v_msg.id,
      'sender_id',         v_msg.sender_id,
      'body',              v_msg.body,
      'message_type',      v_msg.message_type,
      'pin_ids',           v_msg.pin_ids,
      'for_trade_pin_ids', v_msg.for_trade_pin_ids,
      'photo_urls',        v_msg.photo_urls,
      'created_at',        v_msg.created_at,
      'removed_at',        v_msg.removed_at
    ),
    'removal', v_removal
  );
end;
$$;

revoke all on function public.get_reported_message(uuid) from public, anon;
grant execute on function public.get_reported_message(uuid) to authenticated;


-- ── 4. Remove a reported message (service role, via the API) ────────────────
-- Returns { status, photo_paths }. status is one of:
--   'removed'          done now; delete photo_paths from community-photos
--   'already_removed'  done before; photo_paths repeats that removal's files
--                      so a failed storage clean-up can be retried
--   'not_admin' | 'not_found' | 'no_open_report' | 'invalid_reason'
-- Only files in the sender's own folder that no other message or post uses
-- are returned for deletion.

create or replace function public.remove_reported_message(
  p_admin_id   uuid,
  p_message_id uuid,
  p_reason     text
)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare
  c_marker  constant text := '/storage/v1/object/public/community-photos/';
  c_body    constant text := 'Removed by PinHunt moderators';
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_msg     conversation_messages%rowtype;
  v_report  uuid;
  v_paths   jsonb;
begin
  if p_admin_id is null
     or not exists (select 1 from profiles where id = p_admin_id and is_admin) then
    return jsonb_build_object('status', 'not_admin', 'photo_paths', '[]'::jsonb);
  end if;
  if char_length(v_reason) not between 1 and 500 then
    return jsonb_build_object('status', 'invalid_reason', 'photo_paths', '[]'::jsonb);
  end if;

  select * into v_msg from conversation_messages where id = p_message_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found', 'photo_paths', '[]'::jsonb);
  end if;

  select id into v_report from user_reports
   where message_id = v_msg.id
   order by created_at desc
   limit 1;
  if v_report is null then
    return jsonb_build_object('status', 'no_open_report', 'photo_paths', '[]'::jsonb);
  end if;

  if v_msg.removed_at is not null then
    select e.removed_photo_paths into v_paths
      from message_moderation_events e
     where e.message_id = v_msg.id and e.action = 'removed'
     order by e.created_at desc
     limit 1;
    return jsonb_build_object('status', 'already_removed', 'photo_paths', coalesce(v_paths, '[]'::jsonb));
  end if;

  select coalesce(jsonb_agg(x.path order by x.path), '[]'::jsonb) into v_paths
    from (
      select distinct substring(u.url from position(c_marker in u.url) + char_length(c_marker)) as path, u.url
        from jsonb_array_elements_text(v_msg.photo_urls) as u(url)
       where position(c_marker in u.url) > 0
    ) x
   where x.path like v_msg.sender_id::text || '/%'
     and x.path !~ '[?#]'
     and position('..' in x.path) = 0
     and not exists (
       select 1 from conversation_messages o
        where o.id <> v_msg.id and o.photo_urls @> jsonb_build_array(x.url)
     )
     and not exists (
       select 1 from community_posts cp
        where cp.photos @> jsonb_build_array(x.url)
     );

  update conversation_messages
     set body              = c_body,
         message_type      = 'text',
         pin_ids           = '[]'::jsonb,
         for_trade_pin_ids = '[]'::jsonb,
         photo_urls        = '[]'::jsonb,
         removed_at        = now()
   where id = v_msg.id;

  insert into message_moderation_events (message_id, report_id, admin_id, action, reason, removed_photo_paths)
  values (v_msg.id, v_report, p_admin_id, 'removed', v_reason, v_paths);

  return jsonb_build_object('status', 'removed', 'photo_paths', v_paths);
end;
$$;

revoke all on function public.remove_reported_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.remove_reported_message(uuid, uuid, text) to service_role;

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- Verification: supabase/verify/072_verify.sql (rolls itself back).
--
-- ── Rollback (run in this order; drops only what this file created) ─────────
-- Removed messages keep their placeholder text; their photos are already
-- deleted from storage and can't be restored. Dropping the table deletes the
-- view and removal record; export it first if it is needed.
--
-- begin;
-- drop function if exists public.remove_reported_message(uuid, uuid, text);
-- drop function if exists public.get_reported_message(uuid);
-- drop table if exists public.message_moderation_events;
-- drop trigger if exists guard_conversation_message_removed_trigger on public.conversation_messages;
-- drop function if exists public.guard_conversation_message_removed();
-- alter table public.conversation_messages drop column if exists removed_at;
-- commit;
-- notify pgrst, 'reload schema';
-- ============================================================
-- End of migration 072.
-- ============================================================
