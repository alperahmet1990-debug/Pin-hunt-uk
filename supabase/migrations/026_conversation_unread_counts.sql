-- Lightweight per-conversation unread counts for badge polling.
-- Avoids fetching every message client-side just to derive counts.
create or replace function public.get_conversation_unread_counts()
returns table(conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, count(m.id)
  from conversations c
  join conversation_messages m on m.conversation_id = c.id
  where (c.participant_a_id = auth.uid() or c.participant_b_id = auth.uid())
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(
      case when c.participant_a_id = auth.uid() then c.a_last_read_at else c.b_last_read_at end,
      'epoch'::timestamptz
    )
  group by c.id;
$$;

revoke all on function public.get_conversation_unread_counts() from public;
grant execute on function public.get_conversation_unread_counts() to authenticated;
