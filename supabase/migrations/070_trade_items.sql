-- ============================================================
-- Migration 070: a trade records the pins being swapped (#32)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/070_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. See supabase/verify/070_RUNBOOK.md.
-- Run AFTER 061. It does not depend on 062-069.
--
-- RELEASE ORDER: proposing in chat now needs the pins, and accepting needs a
-- trade that has pins. Older app builds can't send pins, so their proposals
-- are refused with a clear message. Apply this, then publish the matching app
-- update straight away.
--
-- Since 058, trade_items has had no writer, so no trade records what is being
-- swapped. This migration:
--
--   1. Gives each item the catalogue pin, a frozen copy of its PinHunt ID and
--      title, and a quantity. "offered" pins come from the collector who
--      proposed; "requested" pins come from the other collector.
--      user_pin_id (the giver's collection row, when they have one) becomes
--      optional and is cleared, not blocked, when that row is removed, so a
--      collector can take a traded pin out of their collection afterwards.
--      Existing items keep their collection row and gain the new fields.
--   2. trade_propose_in_chat(conversation, notes, items) writes the items in
--      the same transaction as the proposal. A proposal needs at least one pin.
--   3. trade_set_items(trade, items) lets either collector change the pins
--      while the trade is waiting. Each change bumps trades.items_version.
--   4. trade_accept(trade, items_version) refuses a trade with no pins, and,
--      when the app sends the version it showed, refuses if the pins changed
--      since.
--   5. Once a trade is accepted (or ends any other way), its items can't
--      change. A trigger enforces this for every writer, not just these
--      functions.
--   6. Admins can read items, so problem reviews show what was agreed.
--
-- Items payload (jsonb array, 1 to 24 entries, at most 12 per side):
--   [{ "pinhunt_id": "PHUK-00000001", "direction": "offered", "quantity": 1 }, ...]
-- quantity is optional (default 1, at most 10). Each pin appears once per side.
-- ============================================================

begin;

-- ── 1. Shape ────────────────────────────────────────────────

alter table trade_items
  add column if not exists pin_id     uuid references pins(id) on delete set null,
  add column if not exists pinhunt_id text,
  add column if not exists title      text,
  add column if not exists quantity   smallint not null default 1;

alter table trade_items drop constraint if exists trade_items_quantity_check;
alter table trade_items add constraint trade_items_quantity_check
  check (quantity between 1 and 10);

-- Existing items: fill in the pin from their collection row.
update trade_items ti
   set pin_id = p.id, pinhunt_id = p.pinhunt_id, title = p.title
  from user_pins up
  join pins p on p.id = up.pin_id
 where up.id = ti.user_pin_id
   and ti.pinhunt_id is null;

alter table trade_items alter column user_pin_id drop not null;
alter table trade_items drop constraint if exists trade_items_user_pin_id_fkey;
alter table trade_items add constraint trade_items_user_pin_id_fkey
  foreign key (user_pin_id) references user_pins(id) on delete set null;

create index if not exists trade_items_user_pin_idx on trade_items (user_pin_id)
  where user_pin_id is not null;

alter table trades add column if not exists items_version integer not null default 0;


-- ── 5. Items are frozen once a trade leaves 'pending' ───────

-- Clearing user_pin_id or pin_id (their rows were removed) is always allowed.
-- So is anything on a trade that no longer exists (cascading deletes).
create or replace function trade_items_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE'
     and new.id = old.id
     and new.trade_id = old.trade_id
     and new.direction = old.direction
     and new.quantity = old.quantity
     and new.pinhunt_id is not distinct from old.pinhunt_id
     and new.title is not distinct from old.title
     and new.created_at = old.created_at
     and (new.user_pin_id is null or new.user_pin_id is not distinct from old.user_pin_id)
     and (new.pin_id is null or new.pin_id is not distinct from old.pin_id) then
    return new;
  end if;
  select status into v_status from trades
   where id = case when tg_op = 'DELETE' then old.trade_id else new.trade_id end;
  if found and v_status <> 'pending' then
    raise exception 'The pins in this trade are agreed and can''t change.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.trade_id <> old.trade_id then
    raise exception 'Trade items can''t move between trades.' using errcode = '22023';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

revoke all on function trade_items_guard() from public, anon, authenticated;

drop trigger if exists trade_items_guard on trade_items;
create trigger trade_items_guard
  before insert or update or delete on trade_items
  for each row execute function trade_items_guard();


-- ── Internal helper: replace a waiting trade's items ────────

-- Not callable by clients. The caller has already locked the trade row and
-- checked who may change it.
create or replace function trade_write_items(p_trade trades, p_items jsonb)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades;
begin
  if p_trade.status <> 'pending' then
    raise exception 'The pins in this trade are agreed and can''t change.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one pin for this trade.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 24 then
    raise exception 'A trade can have up to 12 pins each way.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'pinhunt_id') is distinct from 'string'
        or (e ->> 'direction') is null
        or (e ->> 'direction') not in ('offered', 'requested')
        or (e ? 'quantity' and (
              jsonb_typeof(e -> 'quantity') <> 'number'
              or (e ->> 'quantity') !~ '^[0-9]{1,2}$'
              or (e ->> 'quantity')::int not between 1 and 10))
  ) then
    raise exception 'Those pins aren''t valid.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
     group by e ->> 'direction', e ->> 'pinhunt_id' having count(*) > 1
  ) then
    raise exception 'Each pin can only be in a trade once each way.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     group by e ->> 'direction' having count(*) > 12
  ) then
    raise exception 'A trade can have up to 12 pins each way.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
      left join pins p on p.pinhunt_id = e ->> 'pinhunt_id'
     where p.id is null
  ) then
    raise exception 'One of those pins isn''t in the catalogue.' using errcode = '22023';
  end if;

  delete from trade_items where trade_id = p_trade.id;
  insert into trade_items (trade_id, user_pin_id, direction, pin_id, pinhunt_id, title, quantity)
  select p_trade.id, up.id, e ->> 'direction', p.id, p.pinhunt_id, p.title,
         coalesce((e ->> 'quantity')::smallint, 1)
    from jsonb_array_elements(p_items) with ordinality as x(e, n)
    join pins p on p.pinhunt_id = e ->> 'pinhunt_id'
    left join lateral (
      select u.id from user_pins u
       where u.pin_id = p.id
         and u.user_id = case when e ->> 'direction' = 'offered'
                              then p_trade.initiator_id else p_trade.recipient_id end
         and u.status in ('owned', 'for_trade')
       order by (u.status = 'for_trade') desc, u.created_at
       limit 1
    ) up on true
   order by n;

  update trades set items_version = items_version + 1, updated_at = now()
   where id = p_trade.id returning * into v_trade;
  return v_trade;
end $$;

revoke all on function trade_write_items(trades, jsonb) from public, anon, authenticated;


-- ── 2. Propose in chat, with the pins ───────────────────────

-- The old two-argument version is replaced, not overloaded: with a default on
-- p_items, keeping both would make a two-argument call ambiguous. Older app
-- builds call by name without p_items, reach this function, and are told to
-- choose pins.
drop function if exists trade_propose_in_chat(uuid, text);

create or replace function trade_propose_in_chat(
  p_conversation_id uuid, p_notes text default null, p_items jsonb default null
)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_conversation conversations%rowtype;
  v_trade trades;
begin
  if v_uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select * into v_conversation from conversations
    where id = p_conversation_id for update;
  if not found
     or v_conversation.participant_a_id is null
     or v_conversation.participant_b_id is null
     or v_uid not in (v_conversation.participant_a_id, v_conversation.participant_b_id) then
    raise exception 'Conversation not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from trades
    where id = v_conversation.trade_id and status in ('pending', 'accepted', 'problem')
  ) then
    raise exception 'This chat already has a trade in progress.' using errcode = '22023';
  end if;
  -- trade_propose's own refusals (suspended, blocked, not taking requests,
  -- one waiting proposal) come first; trade_write_items then refuses a
  -- proposal with no pins, which rolls the new trade back.
  v_trade := trade_propose(
    case when v_conversation.participant_a_id = v_uid
         then v_conversation.participant_b_id else v_conversation.participant_a_id end,
    p_notes
  );
  v_trade := trade_write_items(v_trade, p_items);
  update conversations set trade_id = v_trade.id where id = p_conversation_id;
  return v_trade;
end $$;

revoke all on function trade_propose_in_chat(uuid, text, jsonb) from public, anon;
grant execute on function trade_propose_in_chat(uuid, text, jsonb) to authenticated;


-- ── 3. Change the pins while the trade is waiting ───────────

create or replace function trade_set_items(p_trade_id uuid, p_items jsonb)
returns trades language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_trade trades := trade_for_participant(p_trade_id);
begin
  if v_trade.status <> 'pending' then
    raise exception 'The pins in this trade are agreed and can''t change.' using errcode = '22023';
  end if;
  perform trade_assert_may_commit(
    case when v_trade.initiator_id = auth.uid() then v_trade.recipient_id else v_trade.initiator_id end);
  return trade_write_items(v_trade, p_items);
end $$;

revoke all on function trade_set_items(uuid, jsonb) from public, anon;
grant execute on function trade_set_items(uuid, jsonb) to authenticated;


-- ── 4. Accept only a trade with pins, as shown ──────────────

drop function if exists trade_accept(uuid);

create or replace function trade_accept(p_trade_id uuid, p_items_version integer default null)
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
  if not exists (select 1 from trade_items where trade_id = p_trade_id) then
    raise exception 'Add the pins for this trade before accepting.' using errcode = '22023';
  end if;
  if p_items_version is not null and p_items_version <> v_trade.items_version then
    raise exception 'The pins in this trade have changed. Check them again.' using errcode = '40001';
  end if;
  update trades set status = 'accepted', updated_at = now()
    where id = p_trade_id returning * into v_trade;
  return v_trade;
end $$;

revoke all on function trade_accept(uuid, integer) from public, anon;
grant execute on function trade_accept(uuid, integer) to authenticated;


-- ── 6. Admins can read items for problem reviews ────────────

drop policy if exists "trade_items_select_admin" on trade_items;
create policy "trade_items_select_admin" on trade_items
  for select to authenticated
  using (is_admin());

commit;

-- ============================================================
-- Verification: supabase/verify/070_verify.sql (rolls itself back).
--
-- ROLLBACK (run as one block). Items written since 070 stay, with their new
-- columns dropped. Any item whose collection row was removed since 070 has no
-- user_pin_id, so those items are deleted first: the old NOT NULL needs it.
-- begin;
-- drop policy if exists "trade_items_select_admin" on trade_items;
-- drop trigger if exists trade_items_guard on trade_items;
-- drop function if exists trade_items_guard();
-- drop function if exists trade_set_items(uuid, jsonb);
-- drop function if exists trade_propose_in_chat(uuid, text, jsonb);
-- drop function if exists trade_accept(uuid, integer);
-- drop function if exists trade_write_items(trades, jsonb);
-- delete from trade_items where user_pin_id is null;
-- alter table trade_items drop constraint if exists trade_items_user_pin_id_fkey;
-- alter table trade_items add constraint trade_items_user_pin_id_fkey
--   foreign key (user_pin_id) references user_pins(id) on delete restrict;
-- alter table trade_items alter column user_pin_id set not null;
-- drop index if exists trade_items_user_pin_idx;
-- alter table trade_items drop constraint if exists trade_items_quantity_check;
-- alter table trade_items
--   drop column if exists pin_id, drop column if exists pinhunt_id,
--   drop column if exists title, drop column if exists quantity;
-- alter table trades drop column if exists items_version;
-- commit;
-- Then re-run trade_propose_in_chat (with its revoke/grant) from migration 061
-- and trade_accept (with its revoke/grant) from migration 057, then:
-- notify pgrst, 'reload schema';
-- ============================================================
