---
name: retro
description: Interactive end-of-session retrospective with the maintainer. Summarises what worked and what didn't, and proposes improvements (memory notes, docs, role or routine prompts) that apply only after the maintainer approves each one.
argument-hint: "[optional: branch, PR or issue the session covered]"
disable-model-invocation: true
---
<!-- Adapted from the bassclef "retro" skill (sunj-labs, Apache-2.0; see docs/agents/proposed/skills/LICENSE-bassclef.txt). Modified for PinHunt: rewritten, interactive-only, issue filing, marker and session-log writes removed, maintainer approval gate added. -->

# /retro

Session: $ARGUMENTS

**Interactive only.** If no human is answering in this conversation (a routine or other autonomous run), reply "retro is interactive only" and stop.

## 1. Gather (read-only)

- What the session set out to do, from the conversation.
- `git log --oneline origin/main..HEAD` on the session's branch, plus `git status`.
- PRs and issues the session touched (read only), CI results and review verdicts.

## 2. Reflect

Keep it short and specific, and give evidence for each point:

```
Went well:        (what to keep doing)
Harder than expected: (and why)
Change next time:
Open threads:     (unfinished work, with branch/PR/issue refs)
```

## 3. Propose improvements

List at most 5 numbered proposals, highest value first. Only propose what the session actually showed. For each:

```
N. Target:  .agents/memory/<note>.md | CLAUDE.md | docs/… | .claude/agents/<role>.md | docs/agents/routines/<routine>.md | backlog proposal
   Why:     evidence from this session
   Change:  the exact text or diff to add
```

Prefer updating an existing memory note over creating a new one, and check `.agents/memory/MEMORY.md` first to avoid duplicates.

## 4. Wait for approval

Stop and ask the maintainer to approve, edit or reject each proposal. Silence is not approval. Then, for each **approved** item only:

- **Protected paths** (`.claude/**`, `.github/**`, `.agents/memory/**`, `CLAUDE.md`, Replit config, `pnpm-workspace.yaml`; see `.github/agent-paths.json`): don't edit them. Hand over the final text or diff for the maintainer to apply, or to go in a PR the maintainer labels `human-approved-config`.
- **Other docs:** edit on the session's working branch, never on `main`, and say what changed.
- **Backlog proposals:** never create issues. Give the maintainer ready-to-paste issue text, using the backlog template headings.

Rejected or unanswered proposals are dropped. Don't save them anywhere.
