-- ============================================================
-- Migration 044: set_user_pin_statuses — bulk collection writes
-- ============================================================
-- The app saves collection changes one pin at a time via
-- set_user_pin_status (036). Multi-pin actions (Browse Entire Catalogue
-- "Select all", adding to a board, retrying a backlog after being offline)
-- therefore sent one request per pin — hundreds for a large set.
--
-- set_user_pin_statuses takes a list of changes and applies each one by
-- calling set_user_pin_status, so every existing rule (auth, valid status,
-- quantity ≥ 1, no claiming unsearchable/archived pins) applies unchanged.
--
-- Items are independent: one bad item (e.g. an unknown pin) doesn't undo
-- the others. The function returns the items that failed as
--   [{ "pinhunt_id": "...", "error": "..." }, ...]  ([] when all succeed),
-- so the app keeps only those pending for retry.
--
-- p_items: [{ "pinhunt_id": "PHUK-…", "status": "owned", "quantity": 1 }, …]
-- At most 500 items per call (the app sends larger lists in chunks).
--
-- Purely additive: set_user_pin_status is not changed.
-- Run AFTER 001–043, in the Supabase SQL editor.
-- ============================================================

create or replace function public.set_user_pin_statuses(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_failed jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  if jsonb_array_length(p_items) > 500 then
    raise exception 'at most 500 items per call';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      perform public.set_user_pin_status(
        v_item->>'pinhunt_id',
        v_item->>'status',
        coalesce((v_item->>'quantity')::integer, 1)
      );
    exception when others then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object(
        'pinhunt_id', v_item->>'pinhunt_id',
        'error', sqlerrm
      ));
    end;
  end loop;

  return v_failed;
end;
$function$;

revoke all on function public.set_user_pin_statuses(jsonb) from public;
grant execute on function public.set_user_pin_statuses(jsonb) to authenticated;

-- Refresh the API's schema cache so the new function is callable at once.
notify pgrst, 'reload schema';


-- ── Verification ──────────────────────────────────────────────────────────────
--   select proname from pg_proc where proname = 'set_user_pin_statuses';
--   -- From the app (signed in), an unknown pin is reported, not raised:
--   --   rpc('set_user_pin_statuses', { p_items: [{ pinhunt_id: 'PHUK-NOPE', status: 'owned' }] })
--   --   → [{ "pinhunt_id": "PHUK-NOPE", "error": "unknown pin PHUK-NOPE" }]
-- ============================================================
-- End of migration 044.
-- ============================================================
