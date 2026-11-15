-- ============================================================
-- Migration 078: safe PinHunt ID minting, on its own
--
-- next_pinhunt_id() came with 045, which also adds staging-only research
-- tables, so production never got it. This adds just the sequence and the
-- function, and fixes two things for the Pin & Pop catalogue:
--
--   * Pin & Pop pins use PinHunt IDs from PHUK-10000001 up (10,000,000 +
--     their Pin & Pop id; scripts/PINANDPOP.md). PinHunt's own new pins must
--     stay below that, so the sequence starts above the highest existing ID
--     BELOW 10,000,000, ignoring Pin & Pop pins and the odd random ID the old
--     admin screen created (PHUK-68048143 in production).
--   * The function refuses to hand out an ID in the Pin & Pop range.
--
-- Safe on staging and production, and safe to run again: the sequence never
-- moves backwards. Purely additive apart from replacing next_pinhunt_id()
-- (same name, same result type) where 045 already created it.
--
-- Board scanning's migration (075_board_scans on its branch) needs a number
-- after this one (079 or later).
--
-- Rollback:
--   drop function if exists next_pinhunt_id();
--   drop sequence if exists pinhunt_id_seq;      -- only where 045 isn't applied
-- ============================================================

create sequence if not exists pinhunt_id_seq;

select setval('pinhunt_id_seq', greatest(
  (select last_value from pinhunt_id_seq),
  (select coalesce(max(substring(pinhunt_id from 6)::bigint), 0)
     from pins
    where pinhunt_id ~ '^PHUK-[0-9]+$'
      and substring(pinhunt_id from 6)::bigint < 10000000),
  1));

create or replace function next_pinhunt_id() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v bigint := nextval('pinhunt_id_seq');
begin
  if v >= 10000000 then
    raise exception 'PinHunt IDs have reached the Pin & Pop range (PHUK-10000000 and up). Nothing was created.';
  end if;
  return 'PHUK-' || lpad(v::text, 8, '0');
end;
$$;

revoke all on function next_pinhunt_id() from public, anon, authenticated;
grant execute on function next_pinhunt_id() to service_role;
revoke all on sequence pinhunt_id_seq from public, anon, authenticated;
