-- ============================================================
-- Migration 085: Picture index for board-scan matching (staging first)
--
-- Board scanning finds catalogue candidates for each cropped pin by text
-- (titles, characters, sets). That fails when many pins share a title
-- ("Meeko") and nothing in the text says how they look. This index lets
-- the API server also ask "which catalogue pins look most like this crop?".
--
-- Each row is an image embedding (a list of 256 numbers describing what a
-- picture looks like; the picture can't be rebuilt from it) of one Pin & Pop
-- reference image (pin_images, migration 042). The image itself is never
-- stored here or in our storage. Used only inside admin matching on the API
-- server: never shown, never returned to the app. Maintainer decision (approved on #659), 20 Nov
-- 2026 (docs/catalogue-sync/PIN-AND-POP-QUESTIONS.md, question 8).
--
-- Purely additive: the pgvector extension, one table, three functions. No
-- existing table, column or policy changes. Only the API server's
-- service-role key can read or write it (RLS on, no policies, functions
-- granted to service_role only).
--
-- Apply in the STAGING Supabase SQL editor first. Run AFTER 084.
--
-- Rollback (safe — nothing else references these):
--   drop function if exists picture_index_nearest(text, extensions.vector, int);
--   drop function if exists picture_index_pending(text, int, boolean);
--   drop function if exists picture_index_status(text);
--   drop table if exists pin_picture_index;
--   -- leave the vector extension installed unless nothing else uses it.
-- ============================================================

create extension if not exists vector with schema extensions;

create table if not exists pin_picture_index (
  -- The reference image this describes; re-made when its URL changes.
  pin_image_id   uuid        not null references pin_images(id) on delete cascade,
  pin_id         uuid        not null references pins(id) on delete cascade,
  -- Which embedding model and size made it (e.g. vertex-multimodalembedding@001-256):
  -- different models' numbers can't be compared, so searches use one model.
  model          text        not null,
  -- md5 of the image URL it was made from, to notice a changed image.
  image_url_md5  text        not null,
  -- Null when the image couldn't be downloaded or described (see error).
  embedding      extensions.vector(256),
  error          text,
  created_at     timestamptz not null default now(),
  primary key (pin_image_id, model)
);

create index if not exists pin_picture_index_pin_idx on pin_picture_index (pin_id);

-- Nearest-neighbour search by cosine distance.
create index if not exists pin_picture_index_embedding_idx
  on pin_picture_index using hnsw (embedding extensions.vector_cosine_ops);

alter table pin_picture_index enable row level security;
revoke all on pin_picture_index from anon, authenticated;

-- Reference images still to describe for a model: never described, or their
-- URL changed since. Ones that failed are retried only when asked.
create or replace function picture_index_pending(p_model text, p_limit int, p_retry_failed boolean default false)
returns table (pin_image_id uuid, pin_id uuid, image_url text)
language sql
stable
set search_path = public, extensions
as $$
  select i.id, i.pin_id, i.image_url
  from pin_images i
  join pins p on p.id = i.pin_id
  left join pin_picture_index x on x.pin_image_id = i.id and x.model = p_model
  where i.source = 'pin_and_pop'
    and i.image_type = 'reference'
    and i.image_url like 'https://%'
    and p.archived_at is null
    and (
      x.pin_image_id is null
      or x.image_url_md5 <> md5(i.image_url)
      or (p_retry_failed and x.embedding is null)
    )
  order by i.id
  limit least(greatest(p_limit, 1), 500);
$$;

-- Progress for the admin screen.
create or replace function picture_index_status(p_model text)
returns table (references_total bigint, indexed bigint, failed bigint)
language sql
stable
set search_path = public, extensions
as $$
  select
    (select count(*) from pin_images i join pins p on p.id = i.pin_id
      where i.source = 'pin_and_pop' and i.image_type = 'reference'
        and i.image_url like 'https://%' and p.archived_at is null),
    (select count(*) from pin_picture_index where model = p_model and embedding is not null),
    (select count(*) from pin_picture_index where model = p_model and embedding is null);
$$;

-- The catalogue pins whose reference pictures look most like a crop.
create or replace function picture_index_nearest(p_model text, p_embedding extensions.vector(256), p_count int)
returns table (pinhunt_id text, distance real)
language sql
stable
set search_path = public, extensions
as $$
  select p.pinhunt_id, (x.embedding <=> p_embedding)::real
  from pin_picture_index x
  join pins p on p.id = x.pin_id
  where x.model = p_model
    and x.embedding is not null
    and p.archived_at is null
  order by x.embedding <=> p_embedding
  limit least(greatest(p_count, 1), 100);
$$;

revoke execute on function picture_index_pending(text, int, boolean) from public, anon, authenticated;
revoke execute on function picture_index_status(text) from public, anon, authenticated;
revoke execute on function picture_index_nearest(text, extensions.vector, int) from public, anon, authenticated;
grant execute on function picture_index_pending(text, int, boolean) to service_role;
grant execute on function picture_index_status(text) to service_role;
grant execute on function picture_index_nearest(text, extensions.vector, int) to service_role;
