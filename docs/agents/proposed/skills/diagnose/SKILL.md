---
name: diagnose
description: Diagnose a PinHunt bug before fixing it. Reproduce, find the root cause at the right depth, then fix with a regression test. Proportionate - small bugs get a two-line check, not a full investigation.
argument-hint: "[issue number, failing test, error text or symptom]"
disable-model-invocation: true
---
<!-- Adapted from the bassclef "diagnose" skill (sunj-labs, Apache-2.0; see docs/agents/proposed/skills/LICENSE-bassclef.txt). Modified for PinHunt: rewritten, depth tiers and PinHunt layer maps added, markers, issue filing and bassclef hooks removed. -->

# /diagnose

Find the cause before writing the fix: $ARGUMENTS

This skill adds a method, not permissions. `CLAUDE.md`, `docs/agents/OPERATING-MODEL.md`, the issue's Scope, your role file and the guard hook all still apply and win on any conflict.

## 1. Pick the depth

Pick the lowest tier that fits. State it in one line.

| Tier | When | Do |
|---|---|---|
| **Quick** | Cause is visible and local: typo, wrong copy, missing import, a type error or failing test that names the line. | One-line repro + one-line cause, then fix. |
| **Standard** (default) | Most bugs. | Steps 2–4, then fix. |
| **Deep** | Intermittent; crosses layers (UI ↔ context ↔ repository ↔ API ↔ Supabase); touches auth, RLS, collection sync or valuation; a regression of an earlier fix; or **two fix attempts have already failed**. | Steps 2–5, then fix. |

Escalate one tier when a fix attempt fails. The OPERATING-MODEL §4.7 limit of 3 attempts still applies.

## 2. Reproduce

```
Repro:      exact command, test, route or tap sequence
Observed:   exact error / behaviour
Expected:
Mode:       Supabase-configured | mock/demo (isSupabaseConfigured, lib/demoMode.ts) | CI
Platform:   iOS | Android | web
Reproduces: always | N of M | not yet
```

Prefer a failing test as the repro, because it becomes the regression test. If it does not reproduce, stop and report what you tried. Do not fix on a guess. Native-only behaviour (keyboard, safe areas, Liquid Glass, camera) cannot be reproduced in the cloud; follow your role file (`needs-device-check`, Limitations). A bug that only appears in demo or mock mode is not a production bug; say so.

**Evidence stays local:** code, `git log` / `git blame`, tests, CI logs, screenshots and the issue thread. Never hosted Supabase, production logs, paid APIs (eBay, OpenAI, Google Vision, Pixian) or `.env` files.

## 3. Is / Is not

```
Is:      what fails (screen, route, platform, user state, data)
Is not:  the nearest thing that still works
Changed: recent commits, dependency bumps, migrations, config
```

## 4. Hypothesis, checked read-only

```
Cause:  one sentence, naming file:line
Check:  read-only command, test or log line that would prove it wrong
Result: confirmed | rejected (then return to step 3)
```

## 5. Deep tier only: walk the layers, then ask why

Find the layer that *produces* the behaviour and the layer that *should* control it. Read the matching memory note first.

- **Collection / catalogue data:** Supabase row → `lib/pin-repository` (Metro uses the *compiled* output, so rebuild after editing `src/`) → `PinCatalogueContext` / `CollectionContext` / `BoardsContext` (optimistic updates) → hook → screen. Notes: `collection-sync.md`, `collection-mutation-ordering.md`.
- **Auth / access:** session → `AuthContext` → `AuthGuard` in `app/_layout.tsx` (provider order matters) → per-route auth checks in `api-server/src/routes` → RLS. RLS hides rows silently: an empty result, not an error. Notes: `pinhunt-schema-auth.md`, `admin-rls-patterns.md`, `supabase-db-access.md`.
- **Platform:** native `NativeTabs` vs web `Tabs` and `react-native-web`. Notes: `expo-router-tab-context.md`, `expo-web-*.md`, `expo-native-picker-presentation.md`.
- **Server and external APIs:** app → API route → `services/` (`valuation.ts`, `ebay.ts`, `market/`, `google-vision.ts`, `usage-caps.ts`) → provider. Reproduce with tests and fixtures only. Notes: `ebay-integration.md`, `ai-model-quirks.md`.

Then trace the causes back, stopping at the first cause you can fix inside the issue's scope:

```
1. Why [symptom]? because …
2. Why …?         because …
…                 Root cause: …
```

## 6. Scope gate, before writing the fix

The root cause must be fixable inside the issue's Scope, its autonomy level and your role file's *Work in* paths. Reading other layers is fine; fixing them is not. If the fix would need anything OPERATING-MODEL §2a counts as material, **stop**. That includes a new screen, a schema/RLS/API change, a new dependency, more than size S, a higher autonomy level, or touching protected paths.
- **Autonomous run:** follow §2a: comment the finding, set `status:needs-decision`, release the claim.
- **Interactive:** report to the maintainer and wait.

Never create an issue. If more work is needed, propose it in your report or a comment.

**Public repository:** if the root cause is an exploitable security weakness, don't describe it in a commit, PR, issue or comment. Tell the maintainer in the session, write "security finding, details held off-repo", and stop.

## 7. Fix and report

Fix the root cause, not the symptom. Standard and Deep tiers add a regression test that fails before the fix and passes after (vitest in `api-server`, jest-expo in the app). Then put this in the PR template's sections, not in new files:

- **Summary of changes:** tier, root cause (file:line), why the fix addresses it
- **Tests:** the regression test and its before/after result, from real output
- **Limitations:** anything not reproduced, platforms not checked, and follow-ups proposed
