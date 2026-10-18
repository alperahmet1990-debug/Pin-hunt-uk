# Model routing

Which Claude model each PinHunt agent, routine and ad-hoc task uses. Applies to every session, interactive or autonomous. `CLAUDE.md` points here.

**Rule: use the cheapest tier that will reliably finish the task. Escalate one tier after a failed or low-quality attempt, never pre-emptively.**

| Tier | Use for |
|---|---|
| **Opus** | Architecture, complex or cross-cutting debugging, security review, auth/RLS/migrations, critical infrastructure, L3 work, difficult product or technical decisions, any high-risk change (`.github/agent-paths.json` `highRisk` / `highRiskLabels`) |
| **Sonnet** | Standard feature development (L1/L2 `agent:ui` / `agent:backend`), UX implementation, API integrations, code and QA review, backlog grooming, moderately complex tasks. **Default when unsure.** |
| **Haiku** | Catalogue research and evidence gathering, data validation, straightforward one-file fixes, documentation, running routine tests, repetitive or mechanical tasks, codebase lookups |

## Assignments

| Agent / job | Model | Where it is set | Enforced? |
|---|---|---|---|
| 👓 Edna Mode — `ui-developer` | Sonnet | `.claude/agents/ui-developer.md` `model:` | Yes, when launched as a subagent (pending patch, below) |
| 🛠️ Fix-It Felix — `backend-developer` | Sonnet | `.claude/agents/backend-developer.md` | Same |
| 🔍 Roz — `qa-reviewer` | Sonnet | `.claude/agents/qa-reviewer.md` | Same |
| 🛡️ Baymax — `security-reviewer` | **Opus** | `.claude/agents/security-reviewer.md` | Same |
| 🐭 Remy — `product-manager` | Sonnet | `.claude/agents/product-manager.md` | Same |
| 🔎 Basil — `catalogue-researcher` (inactive) | Haiku | `docs/agents/proposed/catalogue-researcher.md` | On activation |
| 🧞 Genie — Agent ops | none | deterministic GitHub Action | n/a |
| `Agent review` workflow — QA verdict | Sonnet (`claude-sonnet-5-5`) | `QA_REVIEW_MODEL` repo variable, else the default in `.github/scripts/agent-review.mjs` | Yes, after the patch merges |
| `Agent review` workflow — security verdict | Opus (`claude-opus-5-5`) | `SECURITY_REVIEW_MODEL`, else `REVIEW_MODEL`, else the default | Yes, after the patch merges |
| `pinhunt-dev` routine | Sonnet | routine model setting | Yes (live) |
| `pinhunt-review` routine | Sonnet | routine model setting | Yes (live) |
| `pinhunt-pm-weekly` routine (disabled) | Sonnet | routine model setting | Yes (live) |
| Historical backfill routine — research agents | Haiku, Sonnet on retry | `model` on each `Agent` call, stated in the routine prompt | **Not yet**: the prompt can only be changed from the routine's own conversation (see below) |
| Historical backfill routine — orchestrator | its persistent session's model | that session | Not changeable from a routine (see below) |
| Any other subagent launched without a `model` | Sonnet | `CLAUDE_CODE_SUBAGENT_MODEL` in `.claude/settings.json` | Yes, after the patch merges |

Precedence for a subagent: the `model` passed on the `Agent` call → the role file's `model:` → `CLAUDE_CODE_SUBAGENT_MODEL` → the parent session's model. The env default stops parallel agents silently inheriting Opus from an Opus parent.

## Escalation

- **Haiku → Sonnet:** output fails validation (schema, tests, audit), the agent reports it could not finish, or the task turns out to need multi-file changes or judgement.
- **Sonnet → Opus:** a second failed attempt, a root cause that spans several subsystems, or the work touches a high-risk path or label. L3 issues and anything `security:required` start on Opus.
- Escalate one tier at a time and say so in the run report ("escalated to Opus: …").
- Never downgrade below what this table assigns for security, auth, RLS, migrations or merge gates.

## Launching agents by hand

Always pass `model` explicitly on `Agent` calls (`haiku`, `sonnet` or `opus`), picking from the tiers above. Parallel research or validation fans out on Haiku. Role agents (`subagent_type: ui-developer` etc.) pick up their role file's model, so no override is needed.

## Limits

- The main thread of an interactive session uses whatever model the person picked when starting it; nothing in the repository can change that. Start architecture or security sessions on Opus and routine ones on Sonnet or Haiku (`/model`).
- A routine bound to a persistent session keeps that session's model; only routines that start a fresh session take a model setting.
- Role-file `model:` applies only when the role is launched as a subagent. The `pinhunt-dev` and `pinhunt-review` routines read the role files inline, so they run on the routine's model (Sonnet). The security verdict of record comes from the `Agent review` workflow, which uses Opus.

## Pending maintainer step

The guard hook blocks agents from editing `.claude/**`, `.github/**` and `CLAUDE.md`, so those parts are in `docs/agents/proposed/model-routing.patch`:

- `model:` in the five `.claude/agents/*.md` role files
- `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` in `.claude/settings.json`
- a "Model routing" section in `CLAUDE.md`
- separate QA (Sonnet) and security (Opus) models in `.github/scripts/agent-review.mjs` and `.github/workflows/agent-review.yml`

To apply it, from a local checkout of this branch: `git apply docs/agents/proposed/model-routing.patch && git rm docs/agents/proposed/model-routing.patch`, then commit, push and add `human-approved-config` to the PR. If the repository variable `REVIEW_MODEL` is set, it now affects the security review only.

For the historical backfill routine, say this in its own conversation (routine prompts can't be edited from any other session): *"Update this routine's prompt per docs/agents/MODEL-ROUTING.md: in step 3 always pass model "haiku" on each research Agent call (model "sonnet" for cells marked "retry: sonnet"); in step 4a, when a Haiku packet fails validation, reset the cell to todo marked "retry: sonnet", and block it only if the Sonnet retry also fails; in step 5 report the models used."* Until then its research agents inherit that session's model.
