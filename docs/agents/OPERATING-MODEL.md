# PinHunt agent operating model

Rules for every Claude agent that works on this repository without a human in the loop: cloud routines and cloud sessions. Humans working interactively are not bound by this file. `CLAUDE.md` still applies to everyone, and wins where the two disagree.

## 1. Roles

| Role | Definition | Runs as |
|---|---|---|
| Product Manager | `.claude/agents/product-manager.md` | Weekly routine. Daily mechanics are done by the `agent-ops` GitHub Action. |
| UI/UX Developer | `.claude/agents/ui-developer.md` | Dev routine, for `agent:ui` issues |
| Backend Developer | `.claude/agents/backend-developer.md` | Dev routine, for `agent:backend` issues |
| QA | `.claude/agents/qa-reviewer.md` | Review routine, on every non-draft `claude/*` PR |
| Security Review | `.claude/agents/security-reviewer.md` | Review routine, when the PR has `security:required` |

Routine prompts live in `docs/agents/routines/`.

## 2. Labels

Labels are the source of truth for agent state. Agents cannot write to the GitHub Project.

| Group | Labels | Who sets them |
|---|---|---|
| Gate | `approved`, `l3-go`, `human-approved-config` | **Humans only.** The guard hook blocks agents from adding them. |
| Priority | `P0` `P1` `P2` `P3` | Humans |
| Autonomy | `autonomy:L1` `autonomy:L2` `autonomy:L3` `human-only` | Humans |
| Agent | `agent:ui` `agent:backend` | Humans / PM proposal |
| Size | `size:S` `size:M` `size:L` | Humans |
| Area | `area:*` | Humans / PM |
| State | `status:ready` `status:claimed` `status:in-review` `status:blocked` `status:needs-human` `status:needs-decision` | Agents and the `agent-ops` Action |
| Review | `qa:pass` `qa:fail` `security:required` `security:pass` `security:changes` `needs-device-check` | Review agent, path labeler |

## 3. Autonomy levels

| Level | Scope | Gate to start | Output |
|---|---|---|---|
| **L1: UI** | Presentation only in `artifacts/pinhunt`: layout, tokens, copy (not legal copy), hit areas, hiding dead UI. No data-layer, dependency or auth changes. | `approved` | Ready-for-review PR with screenshots |
| **L2: functionality and backend** | Client logic, repository/search, API routes that do not touch auth middleware, migrations, RLS or secrets. A new dependency only if the issue names it. | `approved` | Ready-for-review PR. QA + security review. |
| **L3: security, database, infrastructure** | Migrations, RLS/grants, storage policies, auth, account deletion, rate limiting, release/deploy config, CI, dependencies | `approved` **and** `l3-go` | **Draft PR only.** Includes SQL, rollback SQL and a human apply runbook. Never applied or deployed by an agent. |
| **human-only** | Creating projects or accounts, production data changes, credentials, MFA, legal documents, rights evidence, store submission, deploys | Not agent work | — |

**Public repository rule.** While this repository is public, agents must not describe an exploitable security weakness in an issue, PR, commit message, comment or code comment. Do not work on issues whose body says "Details held off-repo". Those are done interactively with the maintainer.

## 4. Developer run: one issue per run

### 0. Pause check
If `.agents/PAUSE` exists on `main`, stop immediately and do nothing.

### 1. Select
List open issues with `approved` + `status:ready` + your `agent:` label. Use `gh api` (REST). `gh issue` and `gh pr` use GraphQL, which is blocked in cloud sessions.

```bash
gh api "repos/{owner}/{repo}/issues?state=open&labels=approved,status:ready,agent:ui&per_page=100"
```

Discard any issue that:
- is L3 without `l3-go`, `human-only`, or not `size:S` (until the maintainer widens the size limit here);
- lists a `Blocked by` issue that is still open;
- already has an open PR that references it;
- lists a `Touches:` path that an open `claude/*` PR also changes;
- would take the open `claude/*` PRs past **2** in total (WIP limit).

Pick the first remaining issue by priority (P0 → P3), then critical path, then the oldest.

If nothing is eligible, stop. Do not invent work.

### 2. Claim
1. Add the `status:claimed` label and remove `status:ready`.
2. Comment `agent-claim <session URL> <UTC timestamp>`.
3. Re-read the comments. If another `agent-claim` from a different session within the last 24 h is earlier than yours, remove your label change, comment `agent-release`, and go back to step 1.

### 3. Branch
Create `claude/<issue-number>-<short-slug>` from the latest `main`.

### 4. Implement
- Stay inside the issue's Scope. Respect Out of scope.
- Read the `.agents/memory/*.md` notes the issue names, plus any that cover the files you touch.
- Make no unrelated clean-ups and no new architectural patterns. Reuse existing components.
- If the issue conflicts with a memory note or `CLAUDE.md`, stop. Comment the conflict, set `status:needs-decision`, and release the claim.

### 5. Verify
All of these must pass before opening a ready PR:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm -r --filter @workspace/pinhunt --filter @workspace/api-server --filter ./scripts --if-present run typecheck
pnpm test
```

- Add tests for the change: `vitest` + `supertest` in `api-server` (`src/**/*.test.ts`), `jest-expo` in the app (`**/__tests__/*.test.ts(x)`).
- After touching `lib/pin-repository/src`, run `pnpm --filter @workspace/pin-repository run build`.
- **UI changes:** capture before/after screenshots with the harness. Run it after opening the PR, so you have the number:
  ```bash
  pnpm --filter @workspace/pinhunt run screenshots -- --base origin/main --routes <names> --publish <PR number>
  ```
  - Route names are in `artifacts/pinhunt/scripts/screenshot-routes.json`. Add a one-off route with `--route name=/path`.
  - The harness builds the Expo web export in demo mock mode (no Supabase, no `.env`, external requests blocked) at 390×844 and 320×568, light and dark.
  - It pushes the images to the `agent-artifacts` branch and prints a Markdown table. Update the PR body's Screenshots section with it (`gh api -X PATCH repos/{owner}/{repo}/pulls/<n> -f body=…`).
  - Mock data has no pin photos on web; tiles show "Image needed". Judge layout, not imagery.
  - If capture fails, say why under Limitations.

### 6. Open the PR (REST only)

```bash
gh api repos/{owner}/{repo}/pulls -f head=claude/42-slug -f base=main \
  -f title="[B-P1-05] Hide Collection Share until real sharing exists" \
  -F draft=false -f body="$(cat /tmp/pr-body.md)"
```

- Fill every heading of `.github/pull_request_template.md` and include `Closes #<issue>`.
- L3 PRs use `-F draft=true`.
- Add `security:required` to the PR if the issue is L2/L3 or you changed a `sensitive` path in `.github/agent-paths.json`. The `Agent PR checks` workflow also adds it as a backstop.
- On the issue, set `status:in-review` and remove `status:claimed`.

### 7. If you fail
- Make at most 3 attempts to make the checks pass.
- If you still have something useful, open a **draft** PR with the failure output, and set `status:needs-human` on the issue.
- If you have nothing useful, comment on the issue with what blocked you, set `status:blocked`, and remove `status:claimed`.
- Then stop.

### 8. Never
- Merge, approve, or push to `main`.
- Add gate labels.
- Touch `.claude/`, `.github/`, Replit config, `CLAUDE.md`, `.agents/memory/`, or existing migrations.
- Contact Supabase or paid APIs.
- Deploy, or handle credentials.

The guard hook (`.claude/hooks/agent-guard.mjs`) enforces most of this list. Treat a block as a signal to stop and set `status:needs-human`, not as something to work around.

## 5. Review run

The Review routine runs on `pull_request.opened` for non-draft `claude/*` PRs.

1. **QA** (`qa-reviewer.md`):
   - Run the verification commands.
   - Check each acceptance criterion against the diff and the evidence.
   - Check that tests exist for the change and that the PR template is complete.
   - For UI PRs, check that the screenshots are present.
   - Post one review comment, then add `qa:pass` or `qa:fail`.
2. **Security** (`security-reviewer.md`), only when the PR has `security:required`:
   - Run the PinHunt security checklist.
   - Post one comment, then add `security:pass` or `security:changes`.
3. Reviewers comment and label only. They never push, approve or merge.

## 6. Human merge checklist

- CI is green.
- `qa:pass`, plus `security:pass` where it was required.
- Screenshots look right, or a device check is done for `needs-device-check`.
- L3 only: SQL applied to staging, verified there, then applied to production. Only then merge.

## 7. Stopping agents

- Commit an empty `.agents/PAUSE` file to `main` to stop all Dev runs at their next start.
- Turn routines off at claude.ai/code/routines.
