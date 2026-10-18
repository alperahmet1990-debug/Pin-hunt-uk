# Routine definitions

These prompts are pasted into the routines at claude.ai/code/routines. The repository copy is the source of truth: when a prompt changes here, update the routine to match.

| Routine | ID | Trigger | State | Model | Environment | Connectors |
|---|---|---|---|---|---|---|
| `pinhunt-dev` | `trig_01HFXvehd85HE75ysA9cV8at` | Schedule `7 * * * *` UTC (hourly at :07, every day) | **Enabled** | Sonnet | `pinhunt-agents` | none |
| `pinhunt-review` | `trig_0162foJJn4YqGbqroWkXXHfz` | GitHub `pull_request.opened` only, no schedule. Filters: head branch starts with `claude/`, is draft = false, base = `main`. | **Enabled** | Sonnet | `pinhunt-agents` | none |
| `pinhunt-pm-weekly` | `trig_01RAMYULMrJefdbw7wBBYVNM` | Schedule `17 6 * * 1` UTC (Mondays 07:17 BST / 06:17 GMT) | **Disabled** | Sonnet | `pinhunt-agents` | none |

Models follow `docs/agents/MODEL-ROUTING.md`; re-checked against the live routines on 2026-10-18. The separate historical catalogue backfill routine (`trig_017mtnSxDpVuuBk3AdKk2H4b`, research only) should launch its research agents on Haiku, retrying a failed cell once on Sonnet; that prompt change is still pending (MODEL-ROUTING.md, "Pending maintainer step").

_State checked against the live routines on 2026-10-12. All three were created disabled; `pinhunt-dev` was then switched from the original daily `17 1 * * *` schedule to hourly (see OPERATING-MODEL §4)._

**Re-reviews.** `pinhunt-review` fires only when a PR is *opened*. Pushing fixes or editing a PR after a `qa:fail` does not re-run it. To get a fresh review, run the routine by hand from claude.ai/code/routines and name the PR in the run message (agents cannot fire routines they did not create). Until the PR passes QA or is closed, it keeps counting towards the dev routine's WIP limit of 2 open `claude/*` PRs, so the hourly dev run stops with "WIP limit: waiting for review".

**Reviews and merging.** The verdict of record now comes from the `Agent review` GitHub workflow, which re-reviews automatically on every new commit (OPERATING-MODEL §5). Once that workflow is configured, `pinhunt-review` is optional: disable it to avoid paying for two reviews. Once `AUTO_MERGE_ENABLED` is on, low-risk agent PRs merge automatically, which frees WIP slots for the hourly dev run without a human in the loop. Medium and high-risk PRs still hold a WIP slot until the maintainer approves or merges them (OPERATING-MODEL §6).

Tools: the dev routine has Bash, Read, Write, Edit, Glob and Grep. The review and PM routines are read-only plus Bash (no Write/Edit).

## Cloud environment `pinhunt-agents`

- **Network:** Trusted (the default allowlist, which already includes npm and `storage.googleapis.com`). Add no Supabase or third-party API domains.
- **Network secrets:** none.
- **Environment variables** (exactly these, nothing else):
  ```
  PINHUNT_AGENT=1
  NODE_OPTIONS=--experimental-strip-types
  ```
  `NODE_OPTIONS` lets the `node --test` sync suites import `.ts` files on the VM's Node 22. If sessions fail with "bad option", remove it.
- **Setup script.** It runs before the repository is cloned, so it only installs tools. Each run does `pnpm install` itself.
  ```bash
  #!/bin/bash
  corepack enable || true
  corepack prepare pnpm@9.15.9 --activate || true
  if ! command -v google-chrome >/dev/null; then
    npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path /root/.cache/puppeteer || true
  fi
  ```
