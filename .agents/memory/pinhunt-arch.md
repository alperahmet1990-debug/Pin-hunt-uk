---
name: PinHunt architecture
description: Repository pattern, mock fallback, provider hierarchy, lib build requirements, and key decisions
---

## Repository pattern

- All Supabase access from the Expo app goes through repository interfaces in `lib/pin-repository`.
- `createSupabasePinRepository(supabase as any)` — the `as any` cast is required because the Supabase client's `SupabaseClient<Database>` type doesn't structurally match the factory's parameter type; this is a Supabase TypeScript quirk, not a real type error.
- Same cast required in `ProfileContext.tsx`: `createSupabaseUserRepository(supabase as any)`.

## Provider hierarchy (artifacts/pinhunt/app/_layout.tsx)

```
SafeAreaProvider
└── ErrorBoundary
    └── QueryClientProvider
        └── AuthProvider          ← session, signIn, signUp, signOut
            └── ProfileProvider   ← profile, needsUsername, profile ops
                └── PinCatalogueProvider
                    └── CollectionProvider
                        └── BoardsProvider
                            └── GestureHandlerRootView
                                └── KeyboardProvider
                                    └── AuthGuard  ← redirects based on session + needsUsername
                                        └── RootLayoutNav
```

**Why this order:** ProfileProvider needs to be inside AuthProvider (it calls useAuth internally) and outside AuthGuard (AuthGuard reads needsUsername from ProfileProvider).

## AuthGuard redirect logic

1. No session → `/(auth)/login`
2. Session + in auth group + needsUsername → `/complete-profile`
3. Session + in auth group + has username → `/(tabs)`
4. Session + needsUsername + not in complete-profile → `/complete-profile`
5. Session + has username + in complete-profile → `/(tabs)`

The guard blocks on `authLoading || profileLoading` before acting.

## Lib build requirement

Run `pnpm --filter @workspace/pin-repository run build` after any change to `lib/pin-repository/src/`. The Expo app imports from the compiled output.

**Why:** Metro bundler cannot resolve TypeScript source from workspace libs; the lib must be compiled to JS first.

## Database Views and the Database type

Do NOT add typed Views to `lib/pin-repository/src/database.types.ts` using the Supabase generic approach. Changing `Views: Record<string, never>` to a specific view type breaks the table type resolution in the Supabase TS client (all table operations get `never` type).

**Fix pattern:** Keep `Views: Record<string, never>` in `database.types.ts`. For view queries, use `as unknown as Record<string, unknown>[]` casts in the repository implementation.

## Username storage

Usernames are always lowercased before saving (in `updateProfile`). The DB has a `UNIQUE INDEX` on `lower(username)`. Client-side validation regex: `/^[a-zA-Z0-9_.]{3,20}$/`.

## Profile upsert

`updateProfile` uses `.upsert({ id: userId, ...fields }, { onConflict: 'id' })` — not `.update()`. This ensures the profile row is created even if the `handle_new_user` trigger hasn't fired yet (e.g. for users who existed before migration 003 was applied).

## Navigation routes

- `/complete-profile` — first-time profile setup, Stack screen, `headerShown: false`
- `/edit-profile` — edit all profile fields, Stack screen with header
- `/find-collectors` — search public collectors, Stack screen
- `/collector/[username]` — public collector profile, dynamic Stack screen

## Mock data to remove

`artifacts/pinhunt/mock-data/user.ts` (MOCK_USER) is no longer used by profile.tsx — it was replaced with real ProfileContext data. The file can be deleted when other references are cleaned up.
