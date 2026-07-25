-- 013: Enable Supabase Realtime for pin_submissions so collectors see
-- submission status changes (approved / rejected / needs_changes) live.

-- Add table to the realtime publication (idempotent guard)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pin_submissions'
  ) then
    alter publication supabase_realtime add table public.pin_submissions;
  end if;
end $$;

-- Ensure UPDATE events carry full row data for RLS-filtered delivery
alter table public.pin_submissions replica identity full;
