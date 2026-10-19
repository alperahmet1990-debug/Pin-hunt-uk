-- ============================================================
-- Migration 054: region provenance on market listing evidence (SG-13, #450)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/054_verify.sql there, and only then
-- (separately approved) on production, followed by:
--   notify pgrst, 'reload schema';
--
-- Purely additive: five nullable columns (with CHECKs) on market_listings,
-- plus column comments. No existing column, constraint, policy, grant,
-- trigger or row is changed or removed. Existing rows keep NULL in every new
-- column, which the API server reads as "region unverified": they stay as
-- raw evidence until they expire, but no longer count towards a regional
-- valuation.
--
--   site                eBay website searched (Soldgraph `country`): uk | fr | us
--   location_filter     Soldgraph `item_location` sent: domestic | worldwide;
--                       NULL = no filter was sent
--   item_country        ISO 3166-1 alpha-2 country derived by the API server
--                       from the listing's location text. Country only: the
--                       location text, town and any seller detail are never
--                       stored. NULL = not known
--   displayed_currency  ISO 4217 currency the provider displayed the price in
--   price_is_converted  true only if the provider says the displayed price is
--                       a currency conversion; NULL = not reported
--
-- Soldgraph has no original price or original currency field, so there are
-- no columns for them.
--
-- market_listings stays service role only (049): no grant or policy for anon
-- or authenticated is added here. Reuses market_listings (049). Run AFTER
-- 049 (050–053 are not required). Safe to run more than once. Rollback at
-- the bottom.
-- ============================================================

alter table market_listings
  add column if not exists site text
    constraint market_listing_site_check check (site in ('uk', 'fr', 'us')),
  add column if not exists location_filter text
    constraint market_listing_location_filter_check check (location_filter in ('domestic', 'worldwide')),
  add column if not exists item_country text
    constraint market_listing_item_country_check check (item_country ~ '^[A-Z]{2}$'),
  add column if not exists displayed_currency text
    constraint market_listing_displayed_currency_check check (displayed_currency ~ '^[A-Z]{3}$'),
  add column if not exists price_is_converted boolean;

comment on column market_listings.site is
  'Marketplace website searched (Soldgraph country): uk, fr or us. NULL = not recorded (before 054).';
comment on column market_listings.location_filter is
  'Soldgraph item_location sent with the search: domestic or worldwide. NULL = none sent; such rows are not regional evidence.';
comment on column market_listings.item_country is
  'ISO-2 country derived from the listing location text. Country only; the text itself is never stored. NULL = not known.';
comment on column market_listings.displayed_currency is
  'Currency the provider displayed the price in.';
comment on column market_listings.price_is_converted is
  'True only when the provider reports the displayed price as a currency conversion. NULL = not reported.';

-- Unchanged access model (049), restated so a re-run cannot widen it:
-- service role only, no client grants.
revoke all on market_listings from public, anon, authenticated;
grant all on market_listings to service_role;

-- ── Rollback (drops only what this file created; the rows stay) ──────────────
-- alter table market_listings
--   drop column if exists price_is_converted,
--   drop column if exists displayed_currency,
--   drop column if exists item_country,
--   drop column if exists location_filter,
--   drop column if exists site;
-- notify pgrst, 'reload schema';
