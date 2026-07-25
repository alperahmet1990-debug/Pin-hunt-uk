---
name: Community feature implementation
description: Key decisions for community posts, comments, and DM conversations — particularly the FK and embedding strategy.
---

# Community Feature — Durable Decisions

## FK targets must be `profiles(id)`, not `auth.users(id)`
All `author_id`, `participant_*_id`, `sender_id` FKs in migration 007 reference `profiles(id)`.

**Why:** PostgREST can only auto-embed a related table through a declared FK. If the FK points to `auth.users`, PostgREST can't traverse to `profiles` — the select query silently returns no joined data. Since `profiles.id = auth.uid()` (1:1, enforced by trigger), RLS policies using `auth.uid()` still work correctly. This pattern applies to any new table that needs inline profile data.

**How to apply:** Always reference `profiles(id)` (not `auth.users(id)`) when you need `profiles(...)` embedding in select queries. For tables where you don't need profile embedding, referencing `auth.users(id)` is fine (as trades and trade_ratings do).

## Conversation profile fetching strategy
Conversations do not embed profiles inline because the join is across two participant columns. Instead, profile IDs are collected after the initial conversations query and fetched in a single second query.

**Why:** PostgREST single-FK embedding can't disambiguate which participant column to use for the profile join. Separate fetch is the established project pattern (mirrors how trader profiles are loaded in `getUsersWithPinForTrade`).

## Community migration must be applied before the feature is usable
Migration `supabase/migrations/007_community.sql` must be run against Supabase before any community tab data loads. It is tracked as follow-up task #9.

## Photos deferred
`community_posts.photos` column (JSONB array) exists in the schema; image picker upload UI was not built in V1. Tracked as follow-up task #10. Requires a `community-photos` Supabase Storage bucket.
