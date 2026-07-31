-- 029 — Public shareable community posts (Facebook share flow)
--
-- Adds an unguessable public slug plus share-tracking and optional
-- trade/sale detail fields. Public access is served by the API server
-- (service role) which exposes only safe fields — no public RLS added.

create extension if not exists pgcrypto;

alter table community_posts
  add column if not exists public_slug text unique
    default encode(gen_random_bytes(9), 'hex'),
  add column if not exists share_image_url text,
  add column if not exists facebook_share_clicked_at timestamptz,
  add column if not exists share_count integer not null default 0,
  add column if not exists price_text text check (char_length(price_text) <= 80),
  add column if not exists looking_for text check (char_length(looking_for) <= 300),
  add column if not exists location_text text check (char_length(location_text) <= 120);

-- Backfill slugs for existing posts
update community_posts set public_slug = encode(gen_random_bytes(9), 'hex')
where public_slug is null;

alter table community_posts alter column public_slug set not null;

create index if not exists community_posts_public_slug_idx on community_posts (public_slug);
