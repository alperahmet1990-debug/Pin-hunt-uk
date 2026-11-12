-- Production readiness: who has admin powers in this project (READ-ONLY)
--
-- Run in EACH project's SQL editor. FOR YOUR EYES ONLY: the result shows
-- email addresses. Don't share or save it anywhere shared; tell Claude only
-- the counts and whether each account is expected.
--
-- Lists every account with is_admin or is_app_creator, whether it has a
-- verified sign-in second factor (Supabase Auth MFA), and when it last signed
-- in. Contributors are counted only. Changes nothing.
--
-- Note: this is in-app access. Dashboard access (who can open the Supabase,
-- Render, Expo and GitHub projects) is checked in each service's settings.

set default_transaction_read_only = on;

select
  u.email,
  p.is_admin,
  p.is_app_creator,
  exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified') as has_mfa,
  u.created_at::date as created,
  u.last_sign_in_at::date as last_sign_in,
  (select count(*) from public.profiles c where c.is_contributor) as contributors_in_project
from public.profiles p
join auth.users u on u.id = p.id
where p.is_admin or p.is_app_creator
order by p.is_app_creator desc, p.is_admin desc, u.email;
