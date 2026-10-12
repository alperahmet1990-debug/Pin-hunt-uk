# Routine definitions

These prompts are pasted into the routines at claude.ai/code/routines. The repository copy is the source of truth: when a prompt changes here, update the routine to match.

| Routine | Trigger | Model | Environment | Connectors |
|---|---|---|---|---|
| `pinhunt-dev` | Schedule: daily 02:17 Europe/London (created **paused**) | Sonnet | `pinhunt-agents` | none |
| `pinhunt-review` | GitHub: `pull_request.opened`. Filters: head branch starts with `claude/`, is draft = false, base = `main`. | Sonnet | `pinhunt-agents` | none |
| `pinhunt-pm-weekly` | Schedule: Mondays 07:17 Europe/London | Sonnet | `pinhunt-agents` | none |

## Cloud environment `pinhunt-agents`

- **Network:** Trusted (the default package-registry allowlist). Add no Supabase or third-party API domains.
- **Environment variables:** `PINHUNT_AGENT=1` and `NODE_OPTIONS=--experimental-strip-types` (the VM ships Node 22; the `node --test` sync suites import `.ts` files), and nothing else. **No secrets**: no Supabase, OpenAI, Google, eBay, Pixian, EAS, Replit or host credentials.
- **Setup script:**
  ```bash
  corepack enable && corepack prepare pnpm@9.15.9 --activate
  pnpm install --frozen-lockfile
  pnpm --filter @workspace/pin-repository run build
  # Headless Chrome for the screenshot harness (skipped if Chrome is already installed)
  command -v google-chrome >/dev/null || npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path "$HOME/.cache/puppeteer"
  ```
  If the Chrome download is blocked by the Trusted network allowlist, add `storage.googleapis.com` to the environment's allowed domains. This is verified during the pilot (AGT-06).
