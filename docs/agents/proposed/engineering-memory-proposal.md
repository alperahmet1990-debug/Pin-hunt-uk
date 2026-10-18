# Engineering memory proposal (draft)

Status: **proposal for maintainer review. Nothing implemented.** Builds on `bassclef-lite-evaluation.md` §7 and the drafted `/retro` skill.

## The problem

PinHunt's knowledge sits in three places, none with a lifecycle:

- **Product decisions** are scattered across `CLAUDE.md`, memory notes (e.g. "D-01" exists only inside `pinhunt-visual-direction.md`) and Roz's prompt (`.github/agent-review/qa.md` step 5 hard-codes ISO/For Trade, repository access, no escrow). OPERATING-MODEL §2a treats "changing a product decision recorded in CLAUDE.md or .agents/memory" as material, but nothing says which statements are decisions.
- **Memory notes** (21 files, 39 KB) have no `last_verified` date and no record of the code they describe. Nothing tells anyone when a note has drifted from the code.
- **Lessons from autonomous runs** are lost. Agents rightly cannot write memory, and there is no way for them to hand a lesson to the maintainer.

## The system: three parts, one lifecycle

| Part | Holds | Authority | Written by | Read by |
|---|---|---|---|---|
| **Decision records** `docs/decisions/` | *What is binding*: product and architecture choices | Accepted records bind every agent | Maintainer only (protected path) | Agents on demand, Remy, Roz (phase 2) |
| **Memory notes** `.agents/memory/` (existing) | *How things work*: patterns and pitfalls | Guidance; must not contradict an accepted decision | Maintainer only (already protected) | Agents on demand (unchanged) |
| **Knowledge proposals** (PR body section) | *Candidate* decisions or notes | None until the maintainer applies them | Any agent, and `/retro` | Maintainer, via the status report |

Plus one **advisory freshness signal** in the existing `📊 Development status` issue, covering notes and decision links.

New knowledge flows one way: agent observes → proposal in PR body → maintainer applies to a note or decision (or rejects) → freshness metadata records when it was last checked → the status report flags it when the covered code changes.

There is no new agent, hook, label or always-on rule, and the dev and review routines don't change.

---

## 1. Decision records with supersession

**Format.** One decision per file, `docs/decisions/D-NN-<slug>.md`, kept to about one screen:

```markdown
---
id: D-05
title: ISO (wanted) and For Trade (for_trade) are distinct collection states
status: accepted            # accepted | superseded | retired
date: 2026-10-20
supersedes: []              # e.g. [D-02]
superseded_by:              # set only when superseded
covers: [artifacts/pinhunt/context/CollectionContext.tsx, artifacts/pinhunt/app/(tabs)/collection.tsx]
memory: [final-v1-collection.md]
---
**Decision.** 1–3 sentences.
**Why.** The reason, so it can be challenged on its merits later.
**Agents must not.** The concrete prohibited moves (feeds §2a and Roz).
```

**Rules:**
- **Only accepted records bind.** Records are never edited after acceptance except to set `status: superseded` and `superseded_by`. A change of mind is a **new** record with `supersedes: [D-NN]`. History stays in place and `git log` shows why it changed.
- **One decision per record.** That keeps supersession whole-record (simpler than bassclef's per-clause supersession).
- **Maintainer-only.** `docs/decisions/**` is added to the protected paths. Agents propose decisions only through a knowledge proposal (§3).
- **Public repository.** Security-sensitive decisions are never recorded here (OPERATING-MODEL §3).
- **No index file.** Filenames carry id and title, and the validator checks consistency.

**Seed set** (maintainer confirms each; all drawn from existing text, nothing new decided):

| Id | Decision | Current source |
|---|---|---|
| D-01 | Storybook palette is the app-wide visual direction | `pinhunt-visual-direction.md` (keeps its existing id) |
| D-02 | Supabase is the canonical backend; no alternative data path | `CLAUDE.md` Architecture |
| D-03 | The Master Catalogue is the canonical source of catalogue truth | `CLAUDE.md` Product context |
| D-04 | Sets are first-class catalogue objects | `CLAUDE.md` |
| D-05 | ISO (`wanted`) and For Trade (`for_trade`) are distinct states | `CLAUDE.md`, `qa.md` step 5 |
| D-06 | No marketplace payments or escrow; each collector buys their own shipping | `CLAUDE.md`, `qa.md` step 5 |
| D-07 | The app reaches OpenAI, Vision, eBay and Pixian only through `api-server` | `CLAUDE.md`, backend role |
| D-08 | Screens access data through `lib/pin-repository` only | `CLAUDE.md`, `qa.md` step 5 |
| D-09 | `pins.pinhunt_id` is the stable public identifier | `CLAUDE.md` |
| D-10 | Collection V1 is Boards-first; Sets derive automatically | `final-v1-collection.md` |

**Integration (one line each, no new always-loaded content):**
- OPERATING-MODEL §2a material list becomes "changing a product decision recorded in `CLAUDE.md`, `.agents/memory/` **or an accepted record in `docs/decisions/`**".
- `CLAUDE.md` gets a one-line pointer under Development guardrails. Product context lines can cite D-ids later, with no rewrite now.
- Role files (`ui-developer`, `backend-developer`, `product-manager`) get one line: "Before scoping, check `docs/decisions/` for accepted records whose `covers` match the files you will touch."
- **Phase 2 (optional):** `agent-review.mjs` passes Roz the accepted decisions whose `covers` match the diff (capped at about 2 KB), and `qa.md` step 5's hard-coded rules become "the accepted decisions provided". That moves the rules from a prompt into a maintained record.

**Benefit.** One authoritative place for binding choices. §2a becomes checkable ("does this contradict D-05?" instead of interpreting prose). Changes of mind leave a trail. Phase 2 removes the duplicated product rules from Roz's prompt.

**Files affected.**
- New: `docs/decisions/D-01…D-10`.
- Modified: `.github/agent-paths.json` (protected), `.claude/hooks/agent-guard.mjs` (`PROTECTED_PATHS`), OPERATING-MODEL §2a, `CLAUDE.md` (one line), three role files (one line each).
- Phase 2: `.github/scripts/agent-review.mjs`, `.github/agent-review/qa.md`.

**Effort.** About 3–4 h to draft the records and validator, plus about 1 h of maintainer review of the seed set. Phase 2 is about 2 h.

**Verification.**
- `node --test` cases for the validator: frontmatter shape; `superseded` ⇔ `superseded_by` set; `supersedes` targets exist and point back; no cycles; ids unique and matching filenames; `memory:` links resolve. All of this is deterministic.
- A **protected-path parity test** asserting that `agent-guard.mjs` `PROTECTED_PATHS` and `agent-paths.json` `protected` cover the same paths. Adding `docs/decisions/**` touches both, which is exactly where the two lists can drift today.
- Guard tests: an agent `Write` to `docs/decisions/D-11-x.md` is blocked in a remote session.
- Phase 2: a unit test of the pure prompt builder, where a diff touching `CollectionContext.tsx` includes D-05 and an unrelated diff includes nothing.

---

## 2. Memory freshness metadata and advisory staleness checks

**Metadata.** Three optional keys added to the existing note frontmatter (`name` and `description` stay):

```yaml
last_verified: 2026-10-20         # date the maintainer last confirmed the note against the code
covers: [artifacts/pinhunt/context/CollectionContext.tsx, artifacts/pinhunt/context/PinCatalogueContext.tsx]
decisions: [D-05, D-10]           # optional: decisions this note elaborates
```

`covers` lists repo-relative files or directories, not globs, so the check is a plain `git log -- <path>`. Process notes with no code anchor (e.g. `supabase-db-access.md`) omit `covers` and are reported as "unscoped".

**Signal.** This follows bassclef's lesson that **calendar age alone is noise**: an idle area is not stale. The primary signal is *commits that touched covered paths since `last_verified`*.

| State | Condition | Shown as |
|---|---|---|
| Fresh | No commits to covered paths since `last_verified` | count only |
| Review | ≥1 commit to covered paths since `last_verified` | listed, with commit count and days |
| Broken | A `covers` path no longer exists; or `last_verified` missing or invalid; or a `decisions:` entry points at a superseded or retired record (a contradiction signal) | listed first |
| Unscoped | No `covers` | count only |

**Where it runs.** A new `## 🧠 Memory freshness` section in the status issue that Agent ops already rewrites hourly. It shows at most 10 lines, most-changed first, and links the notes.
- Agent ops gets the history from a **blobless full-history checkout** (`fetch-depth: 0`, `filter: blob:none`, sparse paths `.github .agents/memory docs/decisions`) and runs `git log` locally. That means no extra API calls and no Claude usage.
- **Advisory only.** It never blocks, labels, comments or touches the queue.

**What's deliberately not blocking.** The CI test validates only the *format* of notes and decisions, which only the maintainer edits. Whether a `covers` path still exists is reported, not tested. Otherwise an agent PR that renames a covered file would fail CI over a protected file it cannot fix.

**Benefit.** The maintainer sees which notes the code has moved past, and verifies them when convenient. Agents can treat a "Review" note with appropriate caution. Contradictions between a note and a superseded decision surface automatically. `covers` also makes it possible later to point agents at only the notes for the files they touch.

**Files affected.**
- Modified: 21 `.agents/memory/*.md` (frontmatter only), `.github/scripts/agent-ops.mjs` (report section), `.github/workflows/agent-ops.yml` (checkout options), `package.json` `test:agents` (add the test file).
- New: `.github/scripts/engineering-memory.mjs` (pure functions shared with §1 and §3), `.github/scripts/engineering-memory.test.mjs`.

**Effort.** About 3 h for the script, tests and report section. Back-filling metadata is the real cost: `covers` can be drafted mechanically, but `last_verified` should only be set when the maintainer has actually checked a note (about 2–3 h, can be done gradually; unverified notes simply show as Broken until then).

**Verification.**
- Fixture tests with a temporary git repo: commit a note with `last_verified` X and `covers: [a.ts]`, then commit to `a.ts` after X → Review (1); commit only to `b.ts` → Fresh; delete `a.ts` → Broken; `decisions: [D-02]` with D-02 superseded → Broken.
- `workflow_dispatch` with `dry_run: true` on the branch to inspect the rendered section before merge.
- Rate and cost check: the run log shows zero additional REST calls for this section.

---

## 3. Approval-gated knowledge proposals from autonomous runs

**Format.** One **optional** section added to `.github/pull_request_template.md`. It is not added to `REQUIRED_SECTIONS`, so existing and open PRs are unaffected.

```markdown
## Knowledge proposal
<!-- Optional, at most one. A lesson future agents need, or a decision worth recording. Write "None" otherwise. Never describe an exploitable security weakness. -->
Type: memory | decision
Target: .agents/memory/<existing note>.md | new note | new decision
Change: <the exact text to add, ≤10 lines>
Evidence: <file:line, test, CI log or issue comment from this PR>
```

**Rules for agents** (one line in the two developer role files): "If this run taught something future agents need, fill *Knowledge proposal* (at most one, with evidence). Never edit `.agents/memory/` or `docs/decisions/`." The guard already enforces the second half.

**Maintainer loop:**
- Agent ops lists `## 📝 Knowledge proposals awaiting decision`: merged PRs from the last 30 days whose section is not empty or "None" and that have no maintainer resolution. At most 10 lines, oldest first.
- **Resolution is a maintainer comment on the PR:** `/knowledge applied` or `/knowledge rejected`. Agent ops accepts it only when the comment author is the repository owner and the comment wasn't posted through an app. That is stricter than the gate-label backstop, which only rejects bots and apps. A comment is used rather than a checkbox because editing the PR body would re-trigger Agent review.
- "Applied" means the maintainer committed the change to the note or decision, in their own commit or PR, with `last_verified` set (§2). An agent's PR never touches the protected paths, so its risk tier is unchanged.
- **Same format everywhere:** the drafted `/retro` skill's step 3 would use the same fields, so interactive and autonomous lessons arrive identically. That is a small edit to the draft at implementation time.

**Benefit.** Lessons from hourly runs stop evaporating. The maintainer stays the sole writer of binding knowledge, with an audit trail (the PR with its evidence, and the resolution comment). The process has a hard cap, so it can't produce volumes of noise.

**Files affected.**
- Modified: `.github/pull_request_template.md`, `.claude/agents/ui-developer.md`, `.claude/agents/backend-developer.md`, `.github/scripts/agent-ops.mjs` (report section; reuses `engineering-memory.mjs`).
- Later: `docs/agents/proposed/skills/retro/SKILL.md` (format alignment).

**Effort.** About 2–3 h, including tests.

**Verification.**
- Unit tests of the pure parser: section missing → none; "None" → none; filled → proposal; two proposals → only the first is counted, with a warning in the report.
- Unit tests of the resolution filter: an owner `/knowledge applied` → resolved; the same text from a bot or another user → still pending.
- Dry-run Agent ops against a test PR to view the section.
- After a month: count proposals, the applied:rejected ratio, and notes changed. If proposals are mostly rejected, tighten the role-file line; if there are none, the loop isn't adding value and can be dropped.

---

## Context and cost budget

| Addition | Always loaded | Loaded when |
|---|---|---|
| `CLAUDE.md` pointer | about 40 tokens | every session |
| Role-file lines (2 lines × 3 roles) | — | when that role runs |
| Decision records (~10 × 1 KB) | — | when an agent reads them; Roz phase 2 gets at most ~2 KB of matching records |
| Freshness and proposal report sections | — | never in model context (GitHub issue body) |
| PR template section | — | when an agent writes a PR |

Agent ops stays at zero Claude usage, and the dev and review routines don't change.

## Safeguards preserved

- `docs/decisions/**` joins the protected paths; `.agents/memory/**` is already protected. Agents can only *propose*.
- No new hooks, labels, gate types, workflows or queue behaviour; one existing workflow gets checkout options and two report sections.
- Nothing blocks on freshness. CI blocks only on the format of maintainer-edited files.
- Implementation touches protected paths, so it needs a maintainer-authored PR (the guard blocks cloud agents from `.claude/` and `.github/`), `human-approved-config`, and a manual merge as high-risk tier.

**Suggested rollout.**
1. PR A: §1 records, validator, parity test, §2a and pointer lines.
2. PR B: §2 metadata, freshness section, and §3 proposals.
3. Optional PR C, after about two weeks: Roz phase 2.

Each PR is reverted independently; reverting removes only report sections and docs.

## Bassclef principles adopted, and how we differ

| Bassclef principle (evidence) | Adopted as | Difference and why |
|---|---|---|
| ADRs with `status`, `supersedes` / `superseded_by`; records stay in place (`standards/adr-template.md`, `rules/adr-discipline.md`) | §1 decision records | One decision per record (bassclef supersedes individual clauses); maintainer-only acceptance instead of an Architect agent; no `state/markers` ADR gate hook, because our agent-paths, risk tiers and Agent review already gate risky paths. |
| "Records are never edited; a new record supersedes" (`state-spine-contract.md`) | §1 immutability | Same principle, enforced by protected paths plus validator, not a JSON state spine with ajv schemas (which Lite doesn't even ship). |
| Freshness = age **and** commits since update; calendar age alone fires false positives (`rules/whereami-load-bearing.md`) | §2 signal | Commits to the *specific covered paths* rather than the whole repo, so an unrelated commit doesn't make a note stale; advisory report instead of a session-blocking banner. |
| "Derive, don't cache" (`state-spine-contract.md`) | §2 and §3 report sections | Computed fresh by Agent ops each run from git and GitHub; nothing hand-maintained like `docs/whereami.md`, which bassclef's own docs disagree on. |
| Memory proposals from sessions that can't write memory; index line ≤150 chars (`templates/memory-proposal-template.md`, `standards/deferred-actions-schema.md`) | §3 knowledge proposals | Lives in the PR body, not `docs/deferred-actions/*.md` files, so no repo clutter and no scope noise for Roz; resolved by an owner comment instead of `git mv` to `completed/`; capped at one per PR. |
| One shared list read by every enforcer, so they can't drift (`standards/bassclef-internal-jargon.md`); mechanism-fidelity checks (`rules/substrate-as-system.md`) | Protected-path parity test; Roz phase 2 reading decisions instead of a hard-coded prompt | Implemented as a unit test in `test:agents`, not hooks. |
| Retirement and supersession instead of deletion | `status: retired` for decisions | No dated alias windows; not needed at our scale. |

**Not adopted:** session chronicles, `whereami`, session-start reflection fragments, persona and role markers, the rules corpus, auto-commit. Each either duplicates what Agent ops and GitHub already provide or costs always-loaded context.

## Open questions for the maintainer

1. Confirm, edit or trim the D-01…D-10 seed set.
2. Should Remy's weekly routine (currently paused) summarise the two new report sections, or is the status issue enough?
3. 30-day window for pending proposals: keep, or longer?
