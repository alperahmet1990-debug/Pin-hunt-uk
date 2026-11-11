-- ============================================================
-- Migration 074: trade_clean_text written in plain ASCII
--
-- DRAFT, L3. Never applied by an agent. Staging first: apply in the Supabase
-- SQL editor, run supabase/verify/074_verify.sql there, then:
--   notify pgrst, 'reload schema';
-- Production is a separate, later approval. Rollback at the bottom.
-- Run AFTER 061. Older app builds keep working.
--
-- 061 wrote the two character classes in trade_clean_text with the invisible
-- characters typed in literally. Copying the file from a browser into the SQL
-- editor can drop or change some of them, and the function then fails with
-- "invalid regular expression: invalid character range", which stops every
-- trade proposal. This version names every character with a \uXXXX escape
-- (handled by the Postgres regex engine), so the file is plain ASCII and
-- survives copy and paste. Same characters, same output.
--
--   First class, removed:     U+00AD, U+200B-U+200F, U+202A-U+202E,
--                             U+2060-U+2069, U+FEFF
--   Second class, one space:  U+0001-U+0020, U+007F-U+00A0, U+1680,
--                             U+2000-U+200A, U+2028, U+2029, U+202F,
--                             U+205F, U+3000
--
-- Only the function body changes. Callers, grants and signature are the same.
-- ============================================================

begin;

create or replace function public.trade_clean_text(p_text text)
returns text language sql immutable
set search_path = public, pg_temp as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(
      coalesce(p_text, ''),
      '[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]', '', 'g'
    ),
    '[\u0001-\u0020\u007F-\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+', ' ', 'g'
  )), '');
$$;

revoke all on function public.trade_clean_text(text) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- -- Rollback ------------------------------------------------
-- Re-run section 1 of 061_trade_followups.sql (the create or replace of
-- trade_clean_text and its revoke). Output is identical, so nothing else needs
-- undoing. Note that the 061 text is the version that breaks when pasted:
-- copy it from the raw file, not from a rendered web page.
