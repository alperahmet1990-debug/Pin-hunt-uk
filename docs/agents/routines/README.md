# Routine definitions

These prompts are pasted into the routines at claude.ai/code/routines. The repository copy is the source of truth: when a prompt changes here, update the routine to match.

| Routine | ID | Trigger | Model | Environment | Connectors |
|---|---|---|---|---|---|
| `pinhunt-dev` | `trig_01HFXvehd85HE75ysA9cV8at` | Schedule `17 1 * * *` UTC (02:17 BST / 01:17 GMT). Created **disabled**. | Sonnet | `pinhunt-agents` | none |
| `pinhunt-review` | `trig_0162foJJn4YqGbqroWkXXHfz` | GitHub `pull_request.opened`. Filters to add in the web UI: head branch starts with `claude/`, is draft = false, base = `main`. It also has a placeholder yearly schedule (`0 6 1 1 *`) because the API requires one; remove that schedule in the web UI. Created **disabled**. | Sonnet | `pinhunt-agents` | none |
| `pinhunt-pm-weekly` | `trig_01RAMYULMrJefdbw7wBBYVNM` | Schedule `17 6 * * 1` UTC (Mondays 07:17 BST / 06:17 GMT). Created **disabled**. | Sonnet | `pinhunt-agents` | none |

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
