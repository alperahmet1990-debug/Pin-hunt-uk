-- Set (or clear) the calling user's status for a catalogue pin, addressed by pinhunt_id.
-- Used by the app's collection sync so clients never need the internal pins.id UUID.
create or replace function public.set_user_pin_status(
  p_pinhunt_id text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if p_status not in ('owned', 'wanted', 'for_trade', 'none') then
    raise exception 'invalid status %', p_status;
  end if;

  select id into v_pin_id from public.pins where pinhunt_id = p_pinhunt_id;
  if v_pin_id is null then
    raise exception 'unknown pin %', p_pinhunt_id;
  end if;

  if p_status = 'none' then
    delete from public.user_pins where user_id = v_user and pin_id = v_pin_id;
  else
    insert into public.user_pins (user_id, pin_id, status)
    values (v_user, v_pin_id, p_status)
    on conflict (user_id, pin_id)
    do update set status = excluded.status, updated_at = now();
  end if;
end;
$$;

revoke all on function public.set_user_pin_status(text, text) from public;
grant execute on function public.set_user_pin_status(text, text) to authenticated;
