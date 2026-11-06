-- ============================================================
-- Migration 064: profile save (B-P0-01, #10)
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor straight after 063, run supabase/verify/063_verify.sql, then:
--   notify pgrst, 'reload schema';
-- Production is a separate approval. Rollback at the bottom.
--
-- The API's upsert also sets id, so it needs update access to that column. The
-- existing row rules keep id equal to the signed-in user.
-- ============================================================

grant update (id) on public.profiles to authenticated;

-- ============================================================
-- ROLLBACK
-- revoke update (id) on public.profiles from authenticated;
-- notify pgrst, 'reload schema';
-- ============================================================
