-- Explicit set tracking is separate from owning pins in a set.
create table if not exists user_tracked_sets (
  user_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid not null references pin_sets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, set_id)
);

alter table user_tracked_sets enable row level security;

create policy user_tracked_sets_select_own
  on user_tracked_sets for select
  using (auth.uid() = user_id);

create policy user_tracked_sets_insert_own
  on user_tracked_sets for insert
  with check (auth.uid() = user_id);

create policy user_tracked_sets_delete_own
  on user_tracked_sets for delete
  using (auth.uid() = user_id);