# bassclef Lite: coexistence evaluation (proposal, nothing installed)

Status: **awaiting maintainer decision.** Nothing has been installed, no labels or settings changed.
Evaluated: `@thebassclef/lite@1.9.19` (npm, published 2026-10-18), read from the published tarball without executing it.
`docs.bassclef.dev` and `bassclef.dev` were unreachable from the agent environment (egress policy), so this is based on the package itself: README, `dist/cli.js`, and the bundled `dist/lite/**` substrate.

## 1. What the official install does

```bash
npm install -g @thebassclef/lite
bassclef init          # writes the substrate into the current repo + ~/.claude
bassclef sync          # later upgrades
```

CLI commands: `init`, `sync`, `migrate`. **There is no uninstall command.** `init` flags: `--dir`, `--force`, `--dry-run`, `--json`, `--yes`, `--skip-statusline`, `--allow-root`, `--allow-any-dir`, `--verbose`. The package has no install-time scripts and no runtime dependencies. The CLI itself makes no network calls; the behaviour below comes from the hooks and skills it copies in.

`init` copies the whole bundle, **484 files (~4.5 MB)**. The README says writes stay inside `.claude/`, `docs/whereami.md` and a manifest. That is not what the code does. It writes:

| Target | Contents |
|---|---|
| repo `.claude/` | `settings.json`, 4 agents, 73 skills, 79 rules, 43 "luminaries", ~100 hook files |
| repo root | `CLAUDE.md`, `CLAUDE-lite.md`, `AGENTS.md`, `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.gitignore` (ignores `.claude/`), `.bassclef-source.json`, `bassclef-version.json`, `substrate.config.md` |
| repo dirs | `lib/` (34 shell files), `scripts/`, `standards/`, `templates/`, `architecture/decisions/`, `presence/`, `docs/whereami.md`, `state/`, `.bassclef/init.manifest.json` |
| **user-global `~/.claude/`** | ~70 hook scripts in `~/.claude/hooks/`, statusline scripts |

Existing files are **refused** (left untouched) unless you pass `--force`, which deletes and rewrites them. `bassclef migrate` with no manifest runs `init --force`.

## 2. Conflicts with the PinHunt system

| # | Conflict | Impact |
|---|---|---|
| C1 | **`.claude/settings.json`.** Ours wires `agent-guard.mjs`, the enforcement layer for autonomous runs. bassclef does not merge. Without `--force` its hooks are silently never wired. With `--force` our guard wiring is deleted. | **Critical.** `--force` removes every production protection from the hourly dev routine. |
| C2 | **`Stop` hook → `session-end.sh` → `save-state.sh`** runs `git add -u` plus docs, state and memory, then `git commit "chore: auto-save checkpoint"` and `git push origin <branch>` on **every turn end**, on any branch except main/master. Hooks run outside PreToolUse, so `agent-guard` never sees this commit or push (the script's own comment says it bypasses PreToolUse). | **Critical.** Partial work lands on `claude/*` branches. Each push re-triggers `Agent review` (paid API call per commit) and CI. That breaks the OPERATING-MODEL §4.5 rule to verify before pushing, and races the merge gate once `AUTO_MERGE_ENABLED` is on. |
| C3 | **`SessionStart` → `bassclef-sync.sh`** edits `CLAUDE.md` on every session: it inserts `@.claude/bassclef-orientation.md` and writes `CLAUDE.md.bak.<ts>`. Combined with C2, that edit is auto-committed. | `CLAUDE.md` is a protected path, so every agent PR becomes high-risk and fails Agent review without `human-approved-config`. The dev routine stalls. |
| C4 | `bassclef-sync.sh` has a remote-code path: with `auto_sync: true` it downloads a tarball from GitHub and runs it, and a curl-to-`bash` migrate path whose checksum comes from the same host. Shipped `false`. | Must never be enabled. Supply-chain exposure bypasses our pnpm `minimumReleaseAge`. |
| C5 | `/onboard-repo` skill: creates 11 labels with `gh label create --force` (`bug`, `security`, `priority-high/medium`, `review-required`, `bassclef-*`, …), and **PUTs branch protection** with `required_status_checks: null, required_pull_request_reviews: null` on public repos. | **Critical.** Overwrites the branch protection that gates merges (OPERATING-MODEL §6). The labels duplicate and confuse our `P0–P3` / `security:*` / `status:*` scheme and Project sync. |
| C6 | `permissions.allow` includes **`Bash(gh api:*)`**, which covers write calls too. | In local interactive sessions `agent-guard` is inert, so this auto-approves `gh api` merges, label and settings writes with no prompt. |
| C7 | Agents `Architect`, `Builder`, `Designer`, `Reviewer`, pinned to older models (`claude-sonnet-4-6`, `claude-haiku-4-5-…`). No name collisions, but roles overlap with Remy, Edna/Felix and Roz/Baymax. | Two review authorities. Only the `Agent review` workflow is the verdict of record; a second "Reviewer" invites confusion. |
| C8 | Skills `/deploy-prod`, `/provision-deploy-host`, `/secrets-bootstrap`, `/promote` (files issues/labels), `/build` (opens PRs), `/autonomous`, `/longrun`. | Conflict with human-only scope (deploys, credentials) and the `agent-proposed` issue rule. `agent-guard` blocks most of it in cloud runs, but not locally. |
| C9 | `PreToolUse Edit|Write` gates such as `pre-build-gate.sh` (blocks edits without a feature-branch marker), `temperance-gate`, `testing-tier-enforce`, vocabulary/persona scrubs. | Unknown false-positive rate against our branch naming. Could block dev-routine edits mid-run; per §4.8 a block means `status:needs-human`, so the queue stalls. |
| C10 | Root-file and dir collisions: `README.md`, `.gitignore`, `lib/`, **`scripts/`** (a pnpm workspace package, `sensitive` + `highRisk` in `.github/agent-paths.json`). | Files added under `scripts/` / `lib/` alter workspace packages and push any PR into the high-risk tier. The shipped `.gitignore` would hide `.claude/`. |
| C11 | Writes to `~/.claude/hooks` and statusline; `/onboard-repo` offers to edit `~/.claude/settings.json` and install a crontab. | Affects every project on the maintainer's machine, not just PinHunt. |
| C12 | Hooks depend on `jq`, `gh`, `python3`, bash; Linux is "supported, not first-class" (the cloud routines run Linux). `env.BASSCLEF_ROOT` points at `$HOME/src/sunj-labs/bassclef`, which doesn't exist here. | Hook failures in the `pinhunt-agents` environment. |

## 3. Duplicated functionality

| PinHunt (existing) | bassclef Lite |
|---|---|
| `agent-guard.mjs` (destructive commands, pushes, `.env`, protected paths, gate labels) | `destructive-command-guard.sh`, `git-stash-u-guard.sh`, `deny` list (narrower) |
| Roz / Baymax + `Agent review` workflow (verdict of record) | `Reviewer` agent, `reviewer-dispatch-check.sh`, `/verify`, `/architect-review` |
| Edna / Felix role files | `Builder` / `Designer` agents, `/build`, `/quick-fix` |
| Remy + Genie (`queue.mjs`, `agent-ops`) ticket orchestration via labels | `/sprint`, `/roadmap-reconcile`, `/eisenhower`, `/whats-the-plan`, `bassclef-*` labels |
| `.agents/memory/` notes, `CLAUDE.md` | `.claude/rules/` (79), `bassclef-orientation.md`, chronicle, `state/` |
| PR template + `Agent PR checks` | `pr-body-scrub-check`, `atomic-pr-check`, `pre-gh-pr-*-scrub` |
| `.agents/PAUSE`, claim lock | `SESSION_LOCK` |

Genuinely additive, with no PinHunt equivalent: thinking and product skills such as `/state-a-problem`, `/pre-mortem`, `/kiss`, `/diagnose`, `/feynman`, `/jtbd-tasks`, `/user-stories`, `/rfc`, `/retro`. We have no `.claude/skills/` today, so these do not collide.

## 4. Token / usage implications

| Source | Size | Loaded |
|---|---|---|
| PinHunt today: `CLAUDE.md` + 5 role files | ~25 KB ≈ 6k tokens | `CLAUDE.md` every session; roles on demand |
| bassclef `.claude/rules/*.md`: 79 files, **none** scoped with `paths:` | **481 KB ≈ 120k tokens** | every session (Claude Code auto-loads `.claude/rules/`) |
| `bassclef-orientation.md` (via CLAUDE.md import) | 12 KB ≈ 3k | every session |
| 73 skill descriptions | ~17 KB ≈ 4k | every session |
| `UserPromptSubmit` injections | ~1.4 KB ≈ 350 | **every prompt** |
| `SessionStart` reflection (`git fetch`, `gh issue/pr/run list`, banners) | variable, several KB | every session; up to 2 × 30 s timeouts |
| `Stop` hooks (7 scripts) | small output | every turn |

That works out to roughly **20× today's baseline context per session**. Across the hourly `pinhunt-dev` routine (24 runs a day), plus the review and PM routines, this is a large, recurring cost increase, and it eats a large share of the context window before any work starts. Caching softens the price but not the context pressure. Indirect cost: the C2 auto-push re-runs the paid `Agent review` on every turn-end commit.

## 5. Disruption to active agents

- `pinhunt-dev` (hourly :07) clones `main`. **Anything merged into `main` under `.claude/` or `CLAUDE.md` changes the next run.** A worktree or branch that is never merged does not affect it.
- `pinhunt-review` and the `Agent review` workflow read `.github/` from `main` only. They are unaffected unless C2 creates extra pushes.
- `Agent ops`, `Project status sync` and the merge gate are label-driven. C5 labels and branch-protection changes would disrupt them.
- A pilot branch named `claude/*` with an open PR would take one of the 2 WIP slots and stop the dev routine. Keep the pilot branch out of `claude/*`, or don't open a PR.
- `agent-guard` blocks cloud agents from writing `.claude/**`. **Any adoption has to be authored by the maintainer, not by an agent.**

## 6. Recommendation

Do **not** run the stock `bassclef init` in the real repository, and never run `init --force`, `migrate`, `/onboard-repo`, or enable `auto_sync`. The full substrate is a competing operating model rather than an add-on: it overlaps our guard, review, ticket and memory systems, and C1, C2, C3 and C5 each break a production protection.

A two-phase pilot:

### Phase 1: sandboxed evaluation (zero blast radius)

Run this on the maintainer's machine, not as root. It uses a throwaway clone (not a worktree, which shares `.git` and remotes with the real checkout), a disabled push URL, and a sandbox `HOME` so `~/.claude` writes are contained. The CLI refuses targets outside `$HOME`, so the clone lives inside the sandbox `HOME`.

```bash
# 0. Sandbox
export PILOT_HOME="$HOME/bassclef-pilot"
mkdir -p "$PILOT_HOME"

# 1. Throwaway clone with pushes disabled
git clone https://github.com/alperahmet1990-debug/pin-hunt-uk.git "$PILOT_HOME/pinhunt"
cd "$PILOT_HOME/pinhunt"
git switch -c pilot/bassclef-lite            # not claude/*: invisible to routines and WIP limit
git remote set-url --push origin no-push://disabled   # any push (incl. hook auto-push) fails

# 2. Pinned, local install (not -g). Use a version at least 1 day old to match pnpm minimumReleaseAge.
npm install --prefix "$PILOT_HOME/tools" --ignore-scripts @thebassclef/lite@1.9.19
BASSCLEF="$PILOT_HOME/tools/node_modules/.bin/bassclef"

# 3. Dry run first: review the planned writes
HOME="$PILOT_HOME" "$BASSCLEF" init --dir "$PILOT_HOME/pinhunt" --dry-run --json > "$PILOT_HOME/dryrun.json"

# 4. Real init into the clone only (existing files are refused, so ours stay intact)
HOME="$PILOT_HOME" "$BASSCLEF" init --dir "$PILOT_HOME/pinhunt" --skip-statusline --yes
```

Because our `.claude/settings.json` exists, step 4 copies files but wires **no** bassclef hooks. To evaluate hooks, hand-merge into the clone's `.claude/settings.json`: keep our `PreToolUse` `agent-guard` entry, add the bassclef `UserPromptSubmit` and `PreToolUse` gates, and **omit** the `SessionStart` `bassclef-sync.sh` entry and the `Stop` `session-end.sh` entry (C2, C3, C4). Drop `Bash(gh api:*)` from `allow`.

Then run `HOME="$PILOT_HOME" claude` in the clone (this needs a separate login) and do 2–3 representative tasks, e.g. one small UI issue and one backend issue, replayed locally. Record:

- `/context` token usage at session start vs. a control session in the real checkout
- hook false positives (especially `pre-build-gate`, `temperance-gate`)
- which skills were useful

**Phase 1 rollback:** `rm -rf "$PILOT_HOME"`. Then verify:

```bash
git -C ~/path/to/real/Pin-hunt-uk status        # unchanged
ls ~/.claude/hooks 2>/dev/null | grep -Ei 'bassclef|session-reflection|save-state'   # expect nothing
git ls-remote origin 'refs/heads/pilot/*'       # expect nothing
```

### Phase 2: curated adoption (only if Phase 1 is positive)

A maintainer-authored PR from a non-`claude/*` branch, e.g. `chore/bassclef-skills`, containing **only**:

- `.claude/skills/<name>/SKILL.md` for a hand-picked handful (candidates: `state-a-problem`, `pre-mortem`, `kiss`, `diagnose`, `retro`), edited to remove references to bassclef hooks, `state/`, chronicle, `gh label`/PR automation and the rules corpus
- a short pointer in `CLAUDE.md` and in `docs/agents/OPERATING-MODEL.md` noting the skills exist and that the role files and `Agent review` remain authoritative

**Explicitly excluded:** bassclef `settings.json` and hooks, `.claude/rules/`, agents, luminaries, root files, `lib/`, `scripts/`, labels, branch protection, `~/.claude` changes, statusline, cron.

Process: the maintainer adds `human-approved-config` (protected paths). This is the high-risk tier, so the merge is manual. Optionally drop `.agents/PAUSE` on `main` for the merge window and remove it after the first green dev run.

**Phase 2 rollback:** `git revert -m 1 <merge-sha>` on a branch, then a PR with `human-approved-config` and a manual merge. Skills are inert files, so reverting fully restores the prior state. There are no global or GitHub-side changes to undo.
