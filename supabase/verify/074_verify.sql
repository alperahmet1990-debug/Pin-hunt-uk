-- ============================================================
-- Verification for migration 074 (run on STAGING after applying 074, in the
-- Supabase SQL editor, as the default postgres user).
--
-- One transaction, ROLLED BACK at the end. It reads only; it creates nothing.
-- Expected final output: a single row 'ALL 074 CHECKS PASSED'. Any failed
-- check aborts with an error naming it.
--
-- This file is plain ASCII too: every special character below is written as
-- an E'\uXXXX' escape, so pasting it can't change what it tests.
-- ============================================================
begin;

do $$
declare
  fn oid := 'public.trade_clean_text(text)'::regprocedure;
  ch text;
begin
  -- 1. Shape and grants (unchanged from 061)
  assert (select provolatile from pg_proc where oid = fn) = 'i', '1a not immutable';
  assert (select proconfig from pg_proc where oid = fn) @> array['search_path=public, pg_temp'], '1b search_path not pinned';
  assert not has_function_privilege('anon', fn, 'execute'), '1c anon can execute';
  assert not has_function_privilege('authenticated', fn, 'execute'), '1d authenticated can execute';
  assert not exists (select 1 from pg_proc, aclexplode(proacl) a
                      where oid = fn and a.grantee = 0 and a.privilege_type = 'EXECUTE'), '1e public can execute';

  -- 2. The stored source is plain ASCII
  assert pg_get_functiondef(fn) !~ '[^\x01-\x7F]', '2a function source has non-ASCII characters';

  -- 3. Output
  assert public.trade_clean_text(E'Swap?\nPinHunt:\u200B  ok') = 'Swap? PinHunt: ok', '3a 061 check 4a case';
  assert public.trade_clean_text(null) is null, '3b null';
  assert public.trade_clean_text('') is null, '3c empty';
  assert public.trade_clean_text(E' \t\r\n ') is null, '3d only whitespace';
  assert public.trade_clean_text(E'a\u00A0b\u2028c\u2029d\u3000e') = 'a b c d e', '3e wide spaces';
  assert public.trade_clean_text(E'\uFEFFa\u00ADb\u200Dc\u202Ed\u2066e') = 'abcde', '3f format characters';
  assert public.trade_clean_text(E'caf\u00E9 \u2014 pin') = E'caf\u00E9 \u2014 pin', '3g ordinary text kept';

  -- Every character in the first class is removed
  foreach ch in array array[E'\u00AD', E'\u200B', E'\u200C', E'\u200D', E'\u200E', E'\u200F',
                             E'\u202A', E'\u202B', E'\u202C', E'\u202D', E'\u202E',
                             E'\u2060', E'\u2061', E'\u2062', E'\u2063', E'\u2064', E'\u2065',
                             E'\u2066', E'\u2067', E'\u2068', E'\u2069', E'\uFEFF'] loop
    assert public.trade_clean_text('x' || ch || 'y') = 'xy',
      format('3h U+%s not removed', upper(to_hex(ascii(ch))));
  end loop;

  -- Every character in the second class becomes one space
  foreach ch in array array[E'\u0001', E'\t', E'\n', E'\r', E'\u001F', ' ', E'\u007F', E'\u0085',
                             E'\u009F', E'\u00A0', E'\u1680', E'\u2000', E'\u2005', E'\u200A',
                             E'\u2028', E'\u2029', E'\u202F', E'\u205F', E'\u3000'] loop
    assert public.trade_clean_text('x' || ch || ch || 'y') = 'x y',
      format('3i U+%s not turned into a space', upper(to_hex(ascii(ch))));
  end loop;
end $$;

select 'ALL 074 CHECKS PASSED' as result;
rollback;
