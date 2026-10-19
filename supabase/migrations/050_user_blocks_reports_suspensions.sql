-- ============================================================
-- Migration 050: user blocks, user/message reports, account suspension
-- (B-P0-05a, #16)
--
-- STAGING FIRST. Apply in the Supabase SQL editor on staging, run
-- supabase/verify/050_verify.sql there, and only then (separately approved)
-- on production, followed by:  notify pgrst, 'reload schema';
-- Never applied by an agent.
--
-- Additive. Three new tables, four helper functions, and new RESTRICTIVE
-- policies on existing content tables. No existing table, column, row or
-- policy is changed or dropped.
--
--   • user_blocks       one row per (blocker, blocked). Each user reads, adds
--                       and removes only their own rows.
--   • user_reports      reports about a profile, or about one message in a
--                       conversation the reporter takes part in. Mirrors
--                       post_reports (013): visible to the reporter and to
--                       admins; admins dismiss by deleting.
--   • user_suspensions  one row per suspended account. Admins only. A
--                       separate table rather than a profiles column, so the
--                       flag is never part of a profile read and the
--                       privilege trigger from 039/040 is left untouched.
--
-- Existing permissive policies keep deciding who may write. The RESTRICTIVE
-- policies added here are AND-ed with them, so they can only narrow access:
--
--   community_posts        INSERT, UPDATE   not suspended
--   post_comments          INSERT           not suspended
--   conversations          INSERT           not suspended, no block either way
--   conversation_messages  INSERT           not suspended, no block either way
--   trade_messages         INSERT           not suspended, no block either way
--   trades                 INSERT           not suspended, no block either way
--
-- A block works in both directions for new contact: neither user can start a
-- conversation or trade with the other, or send a message in an existing
-- one. Reading existing conversations is unchanged. Hiding blocked users from
-- feeds, matches and lists is done in the app (#17, #364).
--
-- Account deletion (#13): every new foreign key to profiles cascades, except
-- user_suspensions.suspended_by (SET NULL), so no row here can stop a profile
-- from being deleted. Reports are removed when either the reporter or the
-- reported account is deleted, and message reports are removed with the
-- message (conversations cascade from both participants). Keeping moderation
-- evidence after an account is deleted would need a separate retention
-- decision; message_id cannot be SET NULL because that could collide with
-- the one-profile-report-per-reporter index and block the deletion.
--
-- Reuses is_admin() (002) and is_app_creator() (040). Run AFTER 049.
-- Rollback at the bottom.
-- ============================================================


-- ── 1. user_blocks ───────────────────────────────────────────────────────────
-- References profiles(id) (community-feature convention) so the app can embed
-- the blocked user's public profile fields.

create table if not exists user_blocks (
  blocker_id  uuid        not null references profiles(id) on delete cascade,
  blocked_id  uuid        not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on user_blocks (blocked_id);

alter table user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on user_blocks;
create policy "user_blocks_select_own" on user_blocks
  for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "user_blocks_insert_own" on user_blocks;
create policy "user_blocks_insert_own" on user_blocks
  for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "user_blocks_delete_own" on user_blocks;
create policy "user_blocks_delete_own" on user_blocks
  for delete to authenticated
  using (blocker_id = auth.uid());

-- No UPDATE policy: a block is added or removed, never edited.
revoke all on user_blocks from anon;
revoke update on user_blocks from authenticated;
grant select, insert, delete on user_blocks to authenticated;


-- ── 2. user_reports ──────────────────────────────────────────────────────────
-- message_id NULL  → a report about the profile.
-- message_id set   → a report about that message; reported_user_id must be
--                    its sender and the reporter a participant (see policy).

create table if not exists user_reports (
  id                uuid        primary key default gen_random_uuid(),
  reporter_id       uuid        not null references profiles(id) on delete cascade,
  reported_user_id  uuid        not null references profiles(id) on delete cascade,
  message_id        uuid        references conversation_messages(id) on delete cascade,
  reason            text        check (reason is null or char_length(reason) <= 500),
  created_at        timestamptz not null default now(),
  constraint user_reports_not_self check (reporter_id <> reported_user_id)
);

-- One profile report per (reporter, reported user), one report per
-- (reporter, message).
create unique index if not exists user_reports_profile_once
  on user_reports (reporter_id, reported_user_id) where message_id is null;
create unique index if not exists user_reports_message_once
  on user_reports (reporter_id, message_id) where message_id is not null;
create index if not exists user_reports_reported_idx on user_reports (reported_user_id);
create index if not exists user_reports_message_idx on user_reports (message_id) where message_id is not null;
create index if not exists user_reports_created_idx on user_reports (created_at desc);

alter table user_reports enable row level security;

drop policy if exists "user_reports_insert_own" on user_reports;
create policy "user_reports_insert_own" on user_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and (
      message_id is null
      or exists (
        select 1
        from conversation_messages m
        join conversations c on c.id = m.conversation_id
        where m.id = user_reports.message_id
          and m.sender_id = user_reports.reported_user_id
          and (c.participant_a_id = auth.uid() or c.participant_b_id = auth.uid())
      )
    )
  );

-- Reporters see their own reports (lets the app show "already reported").
drop policy if exists "user_reports_select_own" on user_reports;
create policy "user_reports_select_own" on user_reports
  for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "user_reports_select_admin" on user_reports;
create policy "user_reports_select_admin" on user_reports
  for select to authenticated
  using (is_admin());

-- Admins dismiss reports by deleting them (same as post_reports).
drop policy if exists "user_reports_delete_admin" on user_reports;
create policy "user_reports_delete_admin" on user_reports
  for delete to authenticated
  using (is_admin());

revoke all on user_reports from anon;
revoke update on user_reports from authenticated;
grant select, insert, delete on user_reports to authenticated;


-- ── 3. user_suspensions ──────────────────────────────────────────────────────

create table if not exists user_suspensions (
  user_id       uuid        primary key references profiles(id) on delete cascade,
  suspended_by  uuid        references profiles(id) on delete set null,
  reason        text        check (reason is null or char_length(reason) <= 500),
  created_at    timestamptz not null default now()
);

alter table user_suspensions enable row level security;

drop policy if exists "user_suspensions_select_admin" on user_suspensions;
create policy "user_suspensions_select_admin" on user_suspensions
  for select to authenticated
  using (is_admin());

-- Admins suspend other accounts. Suspending an admin needs the App Creator;
-- the App Creator account itself can only be suspended from the SQL editor.
drop policy if exists "user_suspensions_insert_admin" on user_suspensions;
create policy "user_suspensions_insert_admin" on user_suspensions
  for insert to authenticated
  with check (
    is_admin()
    and suspended_by = auth.uid()
    and user_id <> auth.uid()
    and not exists (
      select 1 from profiles p
      where p.id = user_suspensions.user_id
        and (p.is_app_creator or (p.is_admin and not is_app_creator()))
    )
  );

-- Lifting a suspension: any admin, except their own (App Creator excepted).
drop policy if exists "user_suspensions_delete_admin" on user_suspensions;
create policy "user_suspensions_delete_admin" on user_suspensions
  for delete to authenticated
  using (is_admin() and (user_id <> auth.uid() or is_app_creator()));

revoke all on user_suspensions from anon;
revoke update on user_suspensions from authenticated;
grant select, insert, delete on user_suspensions to authenticated;


-- ── 4. Helper functions ──────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can see blocks and suspensions that the caller
-- cannot read directly. Each one only answers about the caller (auth.uid()).

-- Whether the signed-in user is suspended. The app may call it to explain why
-- posting is unavailable.
create or replace function is_current_user_suspended()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from user_suspensions where user_id = auth.uid());
$$;

-- Whether a block exists in either direction between the signed-in user and
-- p_other. Does not say which side created it.
create or replace function is_blocked_with(p_other uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = auth.uid() and blocked_id = p_other)
       or (blocker_id = p_other and blocked_id = auth.uid())
  );
$$;

-- Whether the conversation's two participants have a block between them.
-- False when the caller is not a participant (the permissive policy already
-- refuses that case).
create or replace function conversation_has_block(p_conversation_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from conversations c
    join user_blocks b
      on (b.blocker_id = c.participant_a_id and b.blocked_id = c.participant_b_id)
      or (b.blocker_id = c.participant_b_id and b.blocked_id = c.participant_a_id)
    where c.id = p_conversation_id
      and auth.uid() in (c.participant_a_id, c.participant_b_id)
  );
$$;

-- Same for a trade's two parties.
create or replace function trade_has_block(p_trade_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from trades t
    join user_blocks b
      on (b.blocker_id = t.initiator_id and b.blocked_id = t.recipient_id)
      or (b.blocker_id = t.recipient_id and b.blocked_id = t.initiator_id)
    where t.id = p_trade_id
      and auth.uid() in (t.initiator_id, t.recipient_id)
  );
$$;

revoke all on function is_current_user_suspended() from public, anon;
revoke all on function is_blocked_with(uuid) from public, anon;
revoke all on function conversation_has_block(uuid) from public, anon;
revoke all on function trade_has_block(uuid) from public, anon;
grant execute on function is_current_user_suspended() to authenticated;
grant execute on function is_blocked_with(uuid) to authenticated;
grant execute on function conversation_has_block(uuid) to authenticated;
grant execute on function trade_has_block(uuid) to authenticated;


-- ── 5. Restrictive write policies on existing content tables ─────────────────

drop policy if exists "community_posts_insert_not_suspended" on community_posts;
create policy "community_posts_insert_not_suspended" on community_posts
  as restrictive for insert to authenticated
  with check (not is_current_user_suspended());

drop policy if exists "community_posts_update_not_suspended" on community_posts;
create policy "community_posts_update_not_suspended" on community_posts
  as restrictive for update to authenticated
  using (not is_current_user_suspended())
  with check (not is_current_user_suspended());

drop policy if exists "post_comments_insert_not_suspended" on post_comments;
create policy "post_comments_insert_not_suspended" on post_comments
  as restrictive for insert to authenticated
  with check (not is_current_user_suspended());

drop policy if exists "conversations_insert_not_blocked" on conversations;
create policy "conversations_insert_not_blocked" on conversations
  as restrictive for insert to authenticated
  with check (
    not is_current_user_suspended()
    and not is_blocked_with(
      case when participant_a_id = auth.uid() then participant_b_id else participant_a_id end
    )
  );

drop policy if exists "conv_messages_insert_not_blocked" on conversation_messages;
create policy "conv_messages_insert_not_blocked" on conversation_messages
  as restrictive for insert to authenticated
  with check (
    not is_current_user_suspended()
    and not conversation_has_block(conversation_id)
  );

drop policy if exists "trade_messages_insert_not_blocked" on trade_messages;
create policy "trade_messages_insert_not_blocked" on trade_messages
  as restrictive for insert to authenticated
  with check (
    not is_current_user_suspended()
    and not trade_has_block(trade_id)
  );

drop policy if exists "trades_insert_not_blocked" on trades;
create policy "trades_insert_not_blocked" on trades
  as restrictive for insert to authenticated
  with check (
    not is_current_user_suspended()
    and not is_blocked_with(recipient_id)
  );


-- ============================================================
-- Verification: supabase/verify/050_verify.sql (rolls itself back).
--
-- ── Rollback (run in this order; drops only what this file created) ─────────
-- drop policy if exists "trades_insert_not_blocked" on trades;
-- drop policy if exists "trade_messages_insert_not_blocked" on trade_messages;
-- drop policy if exists "conv_messages_insert_not_blocked" on conversation_messages;
-- drop policy if exists "conversations_insert_not_blocked" on conversations;
-- drop policy if exists "post_comments_insert_not_suspended" on post_comments;
-- drop policy if exists "community_posts_update_not_suspended" on community_posts;
-- drop policy if exists "community_posts_insert_not_suspended" on community_posts;
-- drop function if exists trade_has_block(uuid);
-- drop function if exists conversation_has_block(uuid);
-- drop function if exists is_blocked_with(uuid);
-- drop function if exists is_current_user_suspended();
-- drop table if exists user_suspensions;
-- drop table if exists user_reports;
-- drop table if exists user_blocks;
-- notify pgrst, 'reload schema';
--
-- Dropping the tables deletes every block, report and suspension. Export them
-- first if they are needed.
-- ============================================================
-- End of migration 050.
-- ============================================================
