-- ============================================================
-- Verification for migration 070 (run on STAGING after applying 070, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It creates throwaway auth users,
-- pins and collection rows, so it leaves nothing behind. Expected final
-- output: a single row 'ALL 070 CHECKS PASSED'. Any failed check aborts with
-- an error naming it.
--
--   A …a1 proposes   B …b2 in A's chat   C …c3 stranger   E …e5 admin
-- Works whether or not 066 is applied (everyone accepts trade requests).
-- ============================================================
begin;

create or replace function pg_temp.v070_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create or replace function pg_temp.v070_refused(p_uid uuid, p_sql text, p_like text default null)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  perform pg_temp.v070_as(p_uid);
  begin
    set local role authenticated;
    execute p_sql;
    reset role;
    return false;
  exception when others then
    v_msg := sqlerrm;
    reset role;
    return p_like is null or v_msg ilike '%' || p_like || '%';
  end;
end $$;

create or replace function pg_temp.v070_ok(p_uid uuid, p_sql text) returns void language plpgsql as $$
begin
  perform pg_temp.v070_as(p_uid);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

create or replace function pg_temp.v070_count(p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare v_n bigint;
begin
  perform pg_temp.v070_as(p_uid);
  set local role authenticated;
  execute p_sql into v_n;
  reset role;
  return v_n;
end $$;

-- 1. Functions, grants and policies
do $$
begin
  assert has_function_privilege('authenticated', 'public.trade_propose_in_chat(uuid,text,jsonb)', 'execute'), '1a cannot propose in chat';
  assert not has_function_privilege('anon', 'public.trade_propose_in_chat(uuid,text,jsonb)', 'execute'), '1b anon can propose';
  assert has_function_privilege('authenticated', 'public.trade_set_items(uuid,jsonb)', 'execute'), '1c cannot set items';
  assert not has_function_privilege('anon', 'public.trade_set_items(uuid,jsonb)', 'execute'), '1d anon can set items';
  assert has_function_privilege('authenticated', 'public.trade_accept(uuid,integer)', 'execute'), '1e cannot accept';
  assert not has_function_privilege('anon', 'public.trade_accept(uuid,integer)', 'execute'), '1f anon can accept';
  assert not has_function_privilege('authenticated', 'public.trade_write_items(trades,jsonb)', 'execute'), '1g helper exposed';
  assert not has_function_privilege('authenticated', 'public.trade_items_guard()', 'execute'), '1h guard exposed';
  assert to_regprocedure('public.trade_propose_in_chat(uuid,text)') is null, '1i old propose_in_chat left behind';
  assert to_regprocedure('public.trade_accept(uuid)') is null, '1j old accept left behind';
  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_items' and policyname = 'trade_items_select_admin'), '1k admin policy missing';
  assert not has_table_privilege('authenticated', 'public.trade_items', 'insert'), '1l clients can insert items';
  assert not has_table_privilege('authenticated', 'public.trade_items', 'delete'), '1m clients can delete items';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'trades' and column_name = 'items_version'), '1n items_version missing';
  assert (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'trade_items' and column_name = 'user_pin_id') = 'YES', '1o user_pin_id still required';
  assert (select confdeltype from pg_constraint where conname = 'trade_items_user_pin_id_fkey') = 'n', '1p user_pin_id not ON DELETE SET NULL';
end $$;

-- 2. Test data (rolled back)
insert into auth.users (id) values
  ('07000000-0000-4000-8000-0000000000a1'), ('07000000-0000-4000-8000-0000000000b2'),
  ('07000000-0000-4000-8000-0000000000c3'), ('07000000-0000-4000-8000-0000000000e5');
insert into profiles (id) values
  ('07000000-0000-4000-8000-0000000000a1'), ('07000000-0000-4000-8000-0000000000b2'),
  ('07000000-0000-4000-8000-0000000000c3'), ('07000000-0000-4000-8000-0000000000e5')
  on conflict (id) do nothing;
update profiles set allow_trade_requests = true, allow_messages = true
 where id::text like '07000000-0000-4000-8000-%';
update profiles set is_admin = true where id = '07000000-0000-4000-8000-0000000000e5';
insert into pins (pinhunt_id, title, brand, collection, verification_status) values
  ('PHUK-VERIFY70A', 'Verify 070 pin A', 'Disney', '', 'verified'),
  ('PHUK-VERIFY70B', 'Verify 070 pin B', 'Disney', '', 'verified');
insert into user_pins (user_id, pin_id, status) values
  ('07000000-0000-4000-8000-0000000000a1', (select id from pins where pinhunt_id = 'PHUK-VERIFY70A'), 'for_trade'),
  ('07000000-0000-4000-8000-0000000000b2', (select id from pins where pinhunt_id = 'PHUK-VERIFY70B'), 'owned');
insert into conversations (id, participant_a_id, participant_b_id) values
  ('07000000-0000-4000-8000-00000000c0c0', '07000000-0000-4000-8000-0000000000a1', '07000000-0000-4000-8000-0000000000b2');

do $$
declare
  a uuid := '07000000-0000-4000-8000-0000000000a1';
  b uuid := '07000000-0000-4000-8000-0000000000b2';
  c uuid := '07000000-0000-4000-8000-0000000000c3';
  e uuid := '07000000-0000-4000-8000-0000000000e5';
  conv uuid := '07000000-0000-4000-8000-00000000c0c0';
  good text := '[{"pinhunt_id":"PHUK-VERIFY70A","direction":"offered"},{"pinhunt_id":"PHUK-VERIFY70B","direction":"requested","quantity":2}]';
  t uuid;
  t2 uuid;
  v integer;
  many text;
begin
  -- 3. A proposal needs valid pins
  assert pg_temp.v070_refused(a, format('select trade_propose_in_chat(%L)', conv), 'Choose at least one pin'), '3a proposed with no pins';
  assert pg_temp.v070_refused(a, format('select trade_propose_in_chat(%L, null, %L)', conv, '[]'), 'Choose at least one pin'), '3b proposed with empty pins';
  assert pg_temp.v070_refused(a, format('select trade_propose_in_chat(%L, null, %L)', conv,
    '[{"pinhunt_id":"PHUK-VERIFY70A","direction":"sideways"}]'), 'aren''t valid'), '3c bad direction accepted';
  assert pg_temp.v070_refused(a, format('select trade_propose_in_chat(%L, null, %L)', conv,
    '[{"pinhunt_id":"PHUK-VERIFY70A","direction":"offered","quantity":11}]'), 'aren''t valid'), '3d quantity 11 accepted';
  assert pg_temp.v070_refused(a, format('select trade_propose_in_chat(%L, null, %L)', conv,
    '[{"pinhunt_id":"PHUK-NOT-A-PIN","direction":"offered"}]'), 'isn''t in the catalogue'), '3e unknown pin accepted';
  assert pg_temp.v070_refused(a, format('select trade_propose_in_chat(%L, null, %L)', conv,
    '[{"pinhunt_id":"PHUK-VERIFY70A","direction":"offered"},{"pinhunt_id":"PHUK-VERIFY70A","direction":"offered"}]'), 'once each way'), '3f duplicate accepted';
  select jsonb_agg(jsonb_build_object('pinhunt_id', 'PHUK-VERIFY70A' || g, 'direction', 'offered'))::text
    into many from generate_series(1, 13) g;
  assert pg_temp.v070_refused(a, format('select trade_propose_in_chat(%L, null, %L)', conv, many), 'up to 12'), '3g 13 pins one way accepted';
  assert not exists (select 1 from trades where initiator_id = a), '3h a refused proposal left a trade';

  -- 4. A valid proposal records the pins
  perform pg_temp.v070_ok(a, format('select trade_propose_in_chat(%L, %L, %L)', conv, 'Swap?', good));
  select id, items_version into t, v from trades where initiator_id = a and recipient_id = b;
  assert t is not null and v = 1, '4a trade or version wrong';
  assert (select trade_id from conversations where id = conv) = t, '4b chat not linked';
  assert (select count(*) from trade_items where trade_id = t) = 2, '4c items not written';
  assert exists (select 1 from trade_items ti join user_pins up on up.id = ti.user_pin_id
                  where ti.trade_id = t and ti.direction = 'offered' and up.user_id = a), '4d offered pin not linked to A';
  assert exists (select 1 from trade_items ti join user_pins up on up.id = ti.user_pin_id
                  where ti.trade_id = t and ti.direction = 'requested' and up.user_id = b and ti.quantity = 2), '4e requested pin not linked to B';
  assert (select title from trade_items where trade_id = t and direction = 'offered') = 'Verify 070 pin A', '4f title not copied';

  -- 5. Who can see and change the pins
  assert pg_temp.v070_count(a, format('select count(*) from trade_items where trade_id = %L', t)) = 2, '5a A cannot read items';
  assert pg_temp.v070_count(b, format('select count(*) from trade_items where trade_id = %L', t)) = 2, '5b B cannot read items';
  assert pg_temp.v070_count(c, format('select count(*) from trade_items where trade_id = %L', t)) = 0, '5c stranger reads items';
  assert pg_temp.v070_count(e, format('select count(*) from trade_items where trade_id = %L', t)) = 2, '5d admin cannot read items';
  assert pg_temp.v070_refused(c, format('select trade_set_items(%L, %L)', t, good), 'not found'), '5e stranger changed items';
  assert pg_temp.v070_refused(a, format('insert into trade_items (trade_id, direction, pinhunt_id) values (%L, %L, %L)',
    t, 'offered', 'PHUK-VERIFY70B')), '5f client wrote an item directly';

  -- 6. Either side may change the pins while waiting
  perform pg_temp.v070_ok(b, format('select trade_set_items(%L, %L)', t,
    '[{"pinhunt_id":"PHUK-VERIFY70A","direction":"offered"},{"pinhunt_id":"PHUK-VERIFY70B","direction":"requested"}]'));
  assert (select items_version from trades where id = t) = 2, '6a version not bumped';
  assert (select quantity from trade_items where trade_id = t and direction = 'requested') = 1, '6b B''s change not saved';

  -- 7. Accepting checks the pins shown
  assert pg_temp.v070_refused(a, format('select trade_accept(%L, 2)', t), 'Only the other collector'), '7a proposer accepted';
  assert pg_temp.v070_refused(b, format('select trade_accept(%L, 1)', t), 'have changed'), '7b stale version accepted';
  perform pg_temp.v070_ok(b, format('select trade_accept(%L, 2)', t));
  assert (select status from trades where id = t) = 'accepted', '7c not accepted';

  -- 8. Accepted pins are frozen, for every writer
  assert pg_temp.v070_refused(a, format('select trade_set_items(%L, %L)', t, good), 'agreed'), '8a items changed after accept';
  begin
    delete from trade_items where trade_id = t;
    raise exception '8b owner deleted frozen items';
  exception when sqlstate '22023' then null;
  end;
  begin
    update trade_items set quantity = 3 where trade_id = t;
    raise exception '8c owner changed frozen items';
  exception when sqlstate '22023' then null;
  end;
  assert (select count(*) from trade_items where trade_id = t) = 2, '8d items lost';

  -- 9. A traded pin can still leave the collection; the item keeps its copy
  delete from user_pins where user_id = a and pin_id = (select id from pins where pinhunt_id = 'PHUK-VERIFY70A');
  assert exists (select 1 from trade_items where trade_id = t and direction = 'offered'
                  and user_pin_id is null and pinhunt_id = 'PHUK-VERIFY70A'), '9a item lost its copy';

  -- 10. A trade with no pins can't be accepted (proposed outside chat)
  perform pg_temp.v070_ok(a, format('select trade_propose(%L)', c));
  select id into t2 from trades where initiator_id = a and recipient_id = c;
  assert pg_temp.v070_refused(c, format('select trade_accept(%L)', t2), 'Add the pins'), '10a accepted with no pins';
  perform pg_temp.v070_ok(c, format('select trade_set_items(%L, %L)', t2,
    '[{"pinhunt_id":"PHUK-VERIFY70B","direction":"offered"}]'));
  perform pg_temp.v070_ok(c, format('select trade_accept(%L)', t2));
  assert (select status from trades where id = t2) = 'accepted', '10b not accepted after adding pins';
end $$;

select 'ALL 070 CHECKS PASSED' as result;

rollback;
