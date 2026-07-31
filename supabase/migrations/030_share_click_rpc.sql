-- 030 — Atomic share-click tracking for public community posts.
create or replace function record_post_share_click(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update community_posts
  set share_count = share_count + 1,
      facebook_share_clicked_at = now()
  where public_slug = p_slug;
$$;

-- Callable by the API server (service role) only; not exposed to clients.
revoke execute on function record_post_share_click(text) from public, anon, authenticated;
