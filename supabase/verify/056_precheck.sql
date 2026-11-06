-- ============================================================
-- Pre-check for migration 056. Read-only: run on staging and on production
-- BEFORE applying, in the Supabase SQL editor, as the default postgres user.
--
-- Returns counts only, never a name or an address.
--   total_profiles       every profile row
--   will_be_cleared      rows migration 056 sets to NULL
--   of_which_own_email   ...where the value is the account's current email
--   has_at_not_cleared   other values containing '@' ("Pins @ Paris"): kept,
--                        and the app already hides them
--   equals_email_prefix  values equal to the part of the email before the @:
--                        kept, because they can't be told apart from a name
--                        the collector chose. Maintainer's call if not zero.
-- ============================================================
with classified as (
  select
    p.display_name is not null
      and lower(btrim(p.display_name)) = lower(u.email) as own_email,
    p.display_name ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+' as email_shaped,
    position('@' in p.display_name) > 0 as has_at,
    lower(btrim(p.display_name)) = lower(split_part(u.email, '@', 1)) as email_prefix
  from public.profiles p
  left join auth.users u on u.id = p.id
)
select
  count(*) as total_profiles,
  count(*) filter (where own_email or email_shaped) as will_be_cleared,
  count(*) filter (where own_email) as of_which_own_email,
  count(*) filter (where has_at and not (own_email or email_shaped)) as has_at_not_cleared,
  count(*) filter (where email_prefix) as equals_email_prefix
from classified;
