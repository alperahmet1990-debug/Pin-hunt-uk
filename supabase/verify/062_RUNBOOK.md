# Migrations 062 and 063: apply runbook (staging first; production needs separate approval)

Migrations: `062_profile_column_access.sql` and `063_profile_column_lists.sql` (#10, B-P0-01). Always apply both, in order, in one sitting. Never applied by an agent. Details are held off-repo.

## What it changes

- `profiles` and `public_profiles` are for signed-in clients only.
- Signed-in clients read and write `profiles` through explicit column lists.
- `get_my_postcode()` returns a collector's own postcode.

`is_admin` and `is_app_creator` stay readable to signed-in users, because older row rules read them. Moving those rules to functions is follow-up work.

## Release order

Older app code can't load profiles once this is applied, so every client must be updated first. The new code works before and after the migration.

1. Merge, then publish the OTA update.
2. Confirm the update reaches the current TestFlight build: force-quit and open the app twice, then check the update is running.
3. Rebuild the contributor website on `preview`, and on `production` if that site is live. It doesn't get OTA updates. See `docs/release/CONTRIBUTOR-WEB.md`.
4. Staging SQL editor, with a guard that stops on any other project: apply 062, then 063.
5. Run `supabase/verify/063_verify.sql`. Expect `ALL 063 CHECKS PASSED`. It rolls itself back. `062_verify.sql` is for 062 alone and doesn't apply after 063.
6. Run `notify pgrst, 'reload schema';`
7. Re-run the staging role check, which tries every profile column as a signed-out and a signed-in user. Then the device check: sign in, Edit Profile shows the postcode and saves a new one, Collectors Nearby, a collector's profile, Find Trades, community posts.
8. Production: separate approval. Use a guard that stops on staging, then steps 5 to 7 with a signed-out role check.

## Recovery

If an older build can't load profiles, use the short recovery at the bottom of 063 first. The full rollback restores the earlier access, so it's a last resort.
