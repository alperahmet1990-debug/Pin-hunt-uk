-- 028 — Harden set_user_pin_status against archived-pin probing
--
-- 027 made archived pins readable by their owners. Because this function is
-- SECURITY DEFINER and inserted user_pins for ANY pinhunt_id, a user could
-- "claim" an archived (non-searchable) pin just to gain read access to it.
-- Now: new collection entries are only allowed for searchable pins; updating
-- or removing an entry the user already has (e.g. a remapped/archived pin)
-- still works.

create or replace function public.set_user_pin_status(p_pinhunt_id text, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pin_id uuid;
  v_searchable boolean;
  v_user uuid := auth.uid();
  v_already_owned boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if p_status not in ('owned', 'wanted', 'for_trade', 'none') then
    raise exception 'invalid status %', p_status;
  end if;

  select id, is_searchable into v_pin_id, v_searchable
  from public.pins where pinhunt_id = p_pinhunt_id;
  if v_pin_id is null then
    raise exception 'unknown pin %', p_pinhunt_id;
  end if;

  if p_status = 'none' then
    delete from public.user_pins where user_id = v_user and pin_id = v_pin_id;
    return;
  end if;

  select exists (
    select 1 from public.user_pins where user_id = v_user and pin_id = v_pin_id
  ) into v_already_owned;

  -- Only searchable pins can be newly added; existing entries (including
  -- archived pins the user already holds) can still change status.
  if not v_already_owned and not coalesce(v_searchable, false) then
    raise exception 'unknown pin %', p_pinhunt_id;
  end if;

  insert into public.user_pins (user_id, pin_id, status)
  values (v_user, v_pin_id, p_status)
  on conflict (user_id, pin_id)
  do update set status = excluded.status, updated_at = now();
end;
$function$;
