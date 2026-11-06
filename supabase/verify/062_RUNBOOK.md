# Migration 062: apply runbook (staging first; production needs separate approval)

Migration: `supabase/migrations/062_profile_column_access.sql` (#10, B-P0-01). Never applied by an agent. Details of the original finding are held off-repo.

## What it changes

- Signed-out clients have no access to `profiles` or `public_profiles`.
- Signed-in clients read `profiles` from a column list. New columns stay private until granted.
- `get_my_postcode()` returns a collector's own postcode.

`is_admin`, `is_contributor` and `is_app_creator` stay readable to signed-in users, because older row rules read them. Moving those rules to `is_admin()` is follow-up work.

## Release order

The app update goes first. It works before and after this migration, and older builds don't work after it.

1. Merge, then publish the OTA update. Open the app so it updates.
2. Staging SQL editor (check the project URL): apply 062.
3. Run `supabase/verify/062_verify.sql`. Expect `ALL 062 CHECKS PASSED`. It rolls itself back.
4. Run `notify pgrst, 'reload schema';`
5. Re-run the role probe, then the device check: sign in, Edit Profile shows and saves the postcode, Collectors Nearby, a collector's profile, Find Trades, community posts.
6. Production: separate approval. The same steps with a production guard. 062 doesn't need 057 to 061.

## Rollback

See the bottom of the migration. It restores wider access, so use it only to recover the app.
