---
name: pre-mortem
description: Risk check before building a PinHunt change. Assume it failed in production, list the specific ways it could, and plan mitigations and rollback. Depth scales with risk - L3, auth, migrations, external APIs, valuation and shipping get the full pass.
argument-hint: "[issue number, PR number or one-paragraph scope]"
disable-model-invocation: true
---
<!-- Adapted from the bassclef "pre-mortem" skill (sunj-labs, Apache-2.0; see docs/agents/proposed/skills/LICENSE-bassclef.txt), which follows Gary Klein's pre-mortem method (HBR, 2007). Modified for PinHunt: rewritten, risk tiers and PinHunt lenses replace the luminary files, ledger files, markers and auto-firing removed. -->

# /pre-mortem

Scope: $ARGUMENTS

Run this **before** implementation. It adds a method, not permissions. `CLAUDE.md`, `docs/agents/OPERATING-MODEL.md`, the issue's Scope and autonomy level, your role file and the guard hook all still apply and win on any conflict. A pre-mortem never widens scope or authorises anything.

## 1. Read, then tier

Read the issue body and **all** maintainer comments (the latest maintainer statement wins, §2a), the files likely to change, and the memory notes the issue names. Then pick the tier from the repository's own signals: the issue labels, and `.github/agent-paths.json` (`sensitive`, `highRisk`, `highRiskLabels`, `highRiskKeywords`).

| Tier | Trigger (any one) | Pass |
|---|---|---|
| **None** | `autonomy:L1`, presentation only, no sensitive path | Write "Pre-mortem: not needed (L1, no sensitive paths)" and stop. |
| **Light** | `autonomy:L2`; a `sensitive` path; `security:required` | The 2–3 most relevant lenses; top 3 risks. |
| **Full** | `autonomy:L3`; a `highRisk` path, label or keyword; any **priority domain**: auth, database migration/RLS, external API, valuation, trading/shipping, release/production config | Every relevant lens; top 5–8 risks. |

## 2. Assume it failed

Write one sentence: "It is two weeks after merge and this change has caused a production incident." Then, lens by lens, list the specific ways that happened. "The migration could fail" doesn't count; "the backfill on `pins` locked reads during peak and the app showed an empty catalogue" does. Don't rank while listing.

## 3. Lenses (PinHunt failure classes)

1. **Auth and access.** RLS, grants and storage policies; `AuthGuard` and provider order; admin routes; service-role key reaching a client; per-route auth checks in `api-server/src/routes`.
2. **Data and migrations.** Existing migrations are immutable. New SQL follows the L3 deliverables in `.claude/agents/backend-developer.md` and is never applied by an agent. Watch for backfills and locks, the stability of `pins.id` vs `pinhunt_id`, `verification_status = 'verified'` gating, and data loss on rollback.
3. **External APIs and cost.** eBay (keyset and 401 quirks, deletion-webhook compliance), OpenAI/Vision, geocoding. Check timeouts, rate limits, `usage-caps.ts`, and cost abuse from unauthenticated or repeated calls. The app must only reach these through the API server.
4. **Valuation.** A wrong or stale price shown as authoritative; outliers and thin sold data; GBP vs EUR (UK/Paris); unclear sourcing; drift from the Master Catalogue as the source of truth.
5. **Trading and shipping.** ISO (`wanted`) conflated with For Trade (`for_trade`); any drift toward payments or escrow (not allowed); each collector buys their own shipping; addresses and other personal data exposed between collectors.
6. **Catalogue integrity.** The Master Catalogue stays canonical; sets stay first-class; no side tables or one-off fixes; imports and IDs.
7. **Production safety and release.** `app.json`, `eas.json`, CI and deploy config, Replit config, demo or mock mode leaking into production (`lib/demoMode.ts`), iOS-first regressions, and whether the change can be rolled back without a data fix.

## 4. Converge

For the top risks (3 for Light, 5–8 for Full), fill in:

| # | Failure scenario | Lens | Likelihood | Impact | Early signal | Mitigation (in this change) | Rollback |
|---|---|---|---|---|---|---|---|

A mitigation must fit inside the issue's Scope. If the only real mitigation needs material scope (OPERATING-MODEL §2a), don't add it. Record it as **needs decision**.

Then give a verdict:

- **Go**
- **Go with mitigations** (list them)
- **Stop, needs decision.** In an autonomous run, follow §2a: comment the finding, set `status:needs-decision`, release the claim. In an interactive session, ask the maintainer.

## 5. Output

Return the table and verdict in the session, and use them to fill the PR template's **Risk and rollback** section. For L3 draft PRs, it also informs the rollback SQL and apply runbook. Don't create files, issues or labels.

**Public repository:** never write an exploitable security weakness into a PR, issue, commit or comment. Give the maintainer those risks in the session and write "security risk noted, details held off-repo".
