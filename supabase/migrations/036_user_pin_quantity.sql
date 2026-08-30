-- Store duplicate-copy counts on the existing per-user, per-pin ownership row.
-- Existing rows receive quantity 1, preserving unique-pin progress semantics.
alter table public.user_pins
  add column if not exists quantity integer not null default 1;

alter table public.user_pins
  drop constraint if exists user_pins_quantity_check;

alter table public.user_pins
  add constraint user_pins_quantity_check check (quantity >= 1);

drop function if exists public.set_user_pin_status(text, text);

create function public.set_user_pin_status(
  p_pinhunt_id text,
  p_status text,
  p_quantity integer default 1
)
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
  v_quantity integer;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if p_status not in ('owned', 'wanted', 'for_trade', 'none') then
    raise exception 'invalid status %', p_status;
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  v_quantity := case when p_status in ('owned', 'for_trade') then p_quantity else 1 end;

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

  if not v_already_owned and not coalesce(v_searchable, false) then
    raise exception 'unknown pin %', p_pinhunt_id;
  end if;

  insert into public.user_pins (user_id, pin_id, status, quantity)
  values (v_user, v_pin_id, p_status, v_quantity)
  on conflict (user_id, pin_id)
  do update set
    status = excluded.status,
    quantity = excluded.quantity,
    updated_at = now();
end;
$function$;

revoke all on function public.set_user_pin_status(text, text, integer) from public;
grant execute on function public.set_user_pin_status(text, text, integer) to authenticated;