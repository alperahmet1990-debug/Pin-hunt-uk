-- ============================================================
-- Migration 051: self-service account deletion (B-P0-03a, #13)
--
-- STAGING FIRST. Apply in the Supabase SQL editor on staging, run
-- supabase/verify/051_verify.sql there, and only then (separately approved)
-- on production, followed by:  notify pgrst, 'reload schema';
-- Never applied by an agent.
--
-- Supports DELETE /api/account (artifacts/api-server/src/routes/account.ts).
-- The API server deletes the caller's auth user with the service role; the
-- existing ON DELETE CASCADE chain removes the profile, collection
-- (user_pins), boards, tracked sets, submissions, listings, reports, usage
-- rows and access_changes about the user. This file adds what that chain
-- does not already do:
--
--   1. Community posts, comments, DM conversations and DM messages are KEPT
--      for the other people in them, with the author/participant/sender
--      column set to NULL (clients render a placeholder when the profile
--      is missing). These columns become nullable and their foreign keys
--      move from ON DELETE CASCADE to ON DELETE SET NULL.
--   2. Catalogue-review columns that pointed at profiles with no ON DELETE
--      action (021) move to ON DELETE SET NULL, so an admin's account can be
--      deleted without losing the review history.
--   3. The two conversation_messages validation triggers (032, 033) no
--      longer re-validate a row whose sender has just been set to NULL by
--      the foreign key. INSERT validation is unchanged.
--   4. account_deletions: one audit row per deletion request (no email, no
--      name; counts only). Service role only.
--   5. prepare_account_deletion(uuid): detaches the user's attachments and
--      trades and writes the audit row, before the auth user is deleted;
--      finish_account_deletion(uuid, text, jsonb) closes the audit row.
--   6. list_account_storage_objects(uuid): the user's own storage objects
--      (first folder = user id) in the user-content buckets, so the API can
--      remove them through the Storage API.
--
-- No row is deleted by this migration itself. Run AFTER 049. Rollback at
-- the bottom.
-- ============================================================


-- ── 1. Keep community content; detach it from the deleted profile ────────────
-- Replaces the inline FK (whatever its name) on each column with a named
-- ON DELETE SET NULL constraint. Safe to re-run.
do $$
declare
  t record;
  c record;
begin
  for t in
    select * from (values
      ('community_posts',       'author_id',        'community_posts_author_id_fkey'),
      ('post_comments',         'author_id',        'post_comments_author_id_fkey'),
      ('conversations',         'participant_a_id', 'conversations_participant_a_id_fkey'),
      ('conversations',         'participant_b_id', 'conversations_participant_b_id_fkey'),
      ('conversation_messages', 'sender_id',        'conversation_messages_sender_id_fkey')
    ) as v(tbl, col, fk)
  loop
    for c in
      select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      where con.conrelid = ('public.' || t.tbl)::regclass
        and con.contype = 'f'
        and array_length(con.conkey, 1) = 1
        and a.attname = t.col
    loop
      execute format('alter table public.%I drop constraint %I', t.tbl, c.conname);
    end loop;

    execute format('alter table public.%I alter column %I drop not null', t.tbl, t.col);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      t.tbl, t.fk, t.col);
  end loop;
end $$;


-- ── 2. Review-history columns that blocked deleting a reviewer ───────────────
do $$
declare
  t record;
  c record;
begin
  for t in
    select * from (values
      ('ebay_validation_runs',  'started_by',  'ebay_validation_runs_started_by_fkey'),
      ('pin_ebay_validations',  'reviewed_by', 'pin_ebay_validations_reviewed_by_fkey'),
      ('pin_change_audit',      'changed_by',  'pin_change_audit_changed_by_fkey')
    ) as v(tbl, col, fk)
  loop
    if to_regclass('public.' || t.tbl) is null then
      continue;
    end if;
    for c in
      select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      where con.conrelid = ('public.' || t.tbl)::regclass
        and con.contype = 'f'
        and array_length(con.conkey, 1) = 1
        and a.attname = t.col
    loop
      execute format('alter table public.%I drop constraint %I', t.tbl, c.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      t.tbl, t.fk, t.col);
  end loop;
end $$;


-- ── 3. Message validation: skip rows whose sender was just detached ──────────
-- Same functions as before; the UPDATE half of each trigger now has a WHEN
-- clause, so the ON DELETE SET NULL above can update the sender of a
-- photo or pin-share message. There is no client UPDATE policy on
-- conversation_messages, and INSERT validation is unchanged.
drop trigger if exists validate_conversation_message_payload_trigger on conversation_messages;
drop trigger if exists validate_conversation_message_payload_update_trigger on conversation_messages;
create trigger validate_conversation_message_payload_trigger
  before insert on conversation_messages
  for each row execute function validate_conversation_message_payload();
create trigger validate_conversation_message_payload_update_trigger
  before update on conversation_messages
  for each row when (new.sender_id is not null)
  execute function validate_conversation_message_payload();

drop trigger if exists validate_conversation_photo_origins_trigger on conversation_messages;
drop trigger if exists validate_conversation_photo_origins_update_trigger on conversation_messages;
create trigger validate_conversation_photo_origins_trigger
  before insert on conversation_messages
  for each row execute function validate_conversation_photo_origins();
create trigger validate_conversation_photo_origins_update_trigger
  before update on conversation_messages
  for each row when (new.sender_id is not null)
  execute function validate_conversation_photo_origins();


-- ── 4. Audit log ─────────────────────────────────────────────────────────────
-- user_id has no foreign key on purpose: the row must outlive the user.
-- details holds counts only (never message text, email or location).
create table if not exists public.account_deletions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  status        text        not null default 'started'
                  check (status in ('started', 'completed', 'failed')),
  details       jsonb       not null default '{}'::jsonb
                  check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192),
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists account_deletions_user_idx
  on public.account_deletions (user_id, requested_at desc);

alter table public.account_deletions enable row level security;
-- No policies: only the service role (API server) reads or writes.
revoke all on public.account_deletions from anon, authenticated;


-- ── 5. prepare_account_deletion ──────────────────────────────────────────────
-- Called by the API server (service role) before it deletes the auth user.
-- Idempotent: running it twice, or for a user that no longer exists, is safe.
--
-- Returns jsonb:
--   { "status": "not_found" }                     no such user; nothing done
--   { "status": "refused", "reason": "app_creator" }  nothing done
--   { "status": "ready", "audit_id": "...", "posts": n, "comments": n,
--     "messages": n, "conversations": n, "trades": n }
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


-- ── 5b. finish_account_deletion ──────────────────────────────────────────────
-- Called by the API server after the auth user is deleted, or when a later
-- step failed. Merges counts (never content) into details and closes the row.
create or replace function public.finish_account_deletion(
  p_audit_id uuid,
  p_status   text,
  p_details  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('completed', 'failed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update account_deletions
     set status = p_status,
         details = details || coalesce(p_details, '{}'::jsonb),
         completed_at = case when p_status = 'completed' then now() else completed_at end
   where id = p_audit_id
     and status <> 'completed';
end;
$$;


-- ── 6. list_account_storage_objects ──────────────────────────────────────────
-- Only the user-content buckets, and only objects whose first folder is the
-- user's id (the path convention every one of these buckets' RLS enforces).
-- pin-catalogue is deliberately excluded: catalogue images are not personal
-- content even when an admin uploaded them.
create or replace function public.list_account_storage_objects(p_user uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select o.bucket_id::text, o.name::text
  from storage.objects o
  where p_user is not null
    and o.bucket_id in (
      'avatars', 'community-photos', 'pin-submissions',
      'pin-contributed-images', 'user-pin-images', 'scan-images')
    and split_part(o.name, '/', 1) = p_user::text
  order by o.bucket_id, o.name
  limit 10000;
$$;


revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.finish_account_deletion(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.list_account_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.finish_account_deletion(uuid, text, jsonb) to service_role;
grant execute on function public.list_account_storage_objects(uuid) to service_role;


-- ── Rollback (run in this order) ─────────────────────────────────────────────
-- Content already detached by a deletion (NULL author/sender/participant)
-- cannot be re-attached. The NOT NULL constraints are only restored when no
-- such rows exist; otherwise the columns stay nullable (harmless).
--
-- drop function if exists public.list_account_storage_objects(uuid);
-- drop function if exists public.finish_account_deletion(uuid, text, jsonb);
-- drop function if exists public.prepare_account_deletion(uuid);
-- drop table if exists public.account_deletions;
--
-- drop trigger if exists validate_conversation_message_payload_update_trigger on conversation_messages;
-- drop trigger if exists validate_conversation_message_payload_trigger on conversation_messages;
-- create trigger validate_conversation_message_payload_trigger
--   before insert or update on conversation_messages
--   for each row execute function validate_conversation_message_payload();
-- drop trigger if exists validate_conversation_photo_origins_update_trigger on conversation_messages;
-- drop trigger if exists validate_conversation_photo_origins_trigger on conversation_messages;
-- create trigger validate_conversation_photo_origins_trigger
--   before insert or update on conversation_messages
--   for each row execute function validate_conversation_photo_origins();
--
-- alter table ebay_validation_runs drop constraint if exists ebay_validation_runs_started_by_fkey;
-- alter table ebay_validation_runs add constraint ebay_validation_runs_started_by_fkey
--   foreign key (started_by) references profiles(id);
-- alter table pin_ebay_validations drop constraint if exists pin_ebay_validations_reviewed_by_fkey;
-- alter table pin_ebay_validations add constraint pin_ebay_validations_reviewed_by_fkey
--   foreign key (reviewed_by) references profiles(id);
-- alter table pin_change_audit drop constraint if exists pin_change_audit_changed_by_fkey;
-- alter table pin_change_audit add constraint pin_change_audit_changed_by_fkey
--   foreign key (changed_by) references profiles(id);
--
-- alter table community_posts drop constraint if exists community_posts_author_id_fkey;
-- alter table community_posts add constraint community_posts_author_id_fkey
--   foreign key (author_id) references profiles(id) on delete cascade;
-- alter table post_comments drop constraint if exists post_comments_author_id_fkey;
-- alter table post_comments add constraint post_comments_author_id_fkey
--   foreign key (author_id) references profiles(id) on delete cascade;
-- alter table conversations drop constraint if exists conversations_participant_a_id_fkey;
-- alter table conversations add constraint conversations_participant_a_id_fkey
--   foreign key (participant_a_id) references profiles(id) on delete cascade;
-- alter table conversations drop constraint if exists conversations_participant_b_id_fkey;
-- alter table conversations add constraint conversations_participant_b_id_fkey
--   foreign key (participant_b_id) references profiles(id) on delete cascade;
-- alter table conversation_messages drop constraint if exists conversation_messages_sender_id_fkey;
-- alter table conversation_messages add constraint conversation_messages_sender_id_fkey
--   foreign key (sender_id) references profiles(id) on delete cascade;
--
-- do $$ begin
--   if not exists (select 1 from community_posts where author_id is null) then
--     alter table community_posts alter column author_id set not null; end if;
--   if not exists (select 1 from post_comments where author_id is null) then
--     alter table post_comments alter column author_id set not null; end if;
--   if not exists (select 1 from conversations where participant_a_id is null or participant_b_id is null) then
--     alter table conversations alter column participant_a_id set not null;
--     alter table conversations alter column participant_b_id set not null; end if;
--   if not exists (select 1 from conversation_messages where sender_id is null) then
--     alter table conversation_messages alter column sender_id set not null; end if;
-- end $$;
-- notify pgrst, 'reload schema';
