-- ============================================================
-- LOCAL PGlite REPLAY ONLY (local-replay.mjs). Do not run on a hosted database.
--
-- Gives the stub service_role what Supabase already gives it (RLS bypass and
-- table grants in public), so 052_verify.sql section 7 tests the append-only
-- trigger rather than a missing grant. On Supabase this is already true and
-- the script would change nothing.
-- ============================================================
alter role service_role bypassrls;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
