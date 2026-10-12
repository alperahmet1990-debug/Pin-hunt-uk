// Permission matrix for autonomous agents (docs/agents/OPERATING-MODEL.md §2a, §4).
// Every row is a concrete tool call an agent could make; `allowed` is the
// required outcome. Covers both built-in GitHub tools and `gh api` via Bash.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './agent-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const O = { owner: 'alperahmet1990-debug', repo: 'Pin-hunt-uk' };
const REPO = 'repos/alperahmet1990-debug/Pin-hunt-uk';
// The maintainer's labels on the issue before the agent acts.
const ISSUE_LABELS = ['P1', 'size:S', 'autonomy:L1', 'agent:ui', 'approved', 'status:ready', 'area:design-system'];
const keep = ISSUE_LABELS.filter(l => !l.startsWith('status:'));

const gh = (name, input) => check({ tool_name: `mcp__github__${name}`, tool_input: input, cwd: root }, { currentLabels: () => ISSUE_LABELS });
const bash = command => check({ tool_name: 'Bash', tool_input: { command }, cwd: root });

const PERMITTED = [
  // Claim an approved issue
  ['claim: swap status:ready → status:claimed (full label list)', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, labels: [...keep, 'status:claimed'] })],
  ['claim: add status:claimed (gh api)', () => bash(`gh api ${REPO}/issues/44/labels -f "labels[]=status:claimed"`)],
  ['claim: remove status:ready (gh api DELETE)', () => bash(`gh api -X DELETE ${REPO}/issues/44/labels/status:ready`)],
  ['claim: remove status:ready (tool)', () => gh('remove_issue_label', { ...O, issue_number: 44, label: 'status:ready' })],
  ['claim: agent-claim comment', () => gh('add_issue_comment', { ...O, issue_number: 44, body: 'agent-claim https://claude.ai/code/session_x 2026-10-12T08:57:03Z' })],
  // Progress and QA labels
  ['progress: status:in-review', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, labels: [...keep, 'status:in-review'] })],
  ['QA: qa:pass on a PR', () => bash(`gh api ${REPO}/issues/97/labels -f "labels[]=qa:pass"`)],
  ['QA: security:changes on a PR', () => gh('issue_write', { ...O, method: 'update', issue_number: 97, labels: [...keep, 'security:changes'] })],
  ['QA: flag needs-device-check', () => bash(`gh api ${REPO}/issues/97/labels -f "labels[]=needs-device-check"`)],
  // Comments with updates, test results and PR links
  ['comment: implementation update with PR link (tool)', () => gh('add_issue_comment', { ...O, issue_number: 44, body: 'Opened PR #97. Tests: jest 11/11, sync 12/12 + 8/8. Kept the `approved` label.' })],
  ['comment: test results (gh api)', () => bash(`gh api ${REPO}/issues/44/comments -f body="typecheck ok; pnpm test 16/16 passed; see https://github.com/alperahmet1990-debug/Pin-hunt-uk/pull/97"`)],
  ['comment: QA review on a PR', () => gh('add_issue_comment', { ...O, issue_number: 97, body: 'QA review: PASS. Acceptance criteria met; priority P1 unchanged.' })],
  // Branches and pull requests
  ['branch: git checkout -b claude/*', () => bash('git checkout -b claude/44-iso-dark-contrast origin/main')],
  ['branch: git push claude/*', () => bash('git push -u origin claude/44-iso-dark-contrast')],
  ['branch: create_branch tool', () => gh('create_branch', { ...O, branch: 'claude/44-iso-dark-contrast', from_branch: 'main' })],
  ['PR: create_pull_request tool', () => gh('create_pull_request', { ...O, head: 'claude/44-iso-dark-contrast', base: 'main', title: '[B-P1-18] Fix contrast', body: 'Closes #44' })],
  ['PR: gh api POST pulls', () => bash(`gh api ${REPO}/pulls -f head=claude/44-x -f base=main -f title=x -f body="Closes #44"`)],
  ['PR: update own PR body', () => gh('update_pull_request', { ...O, pullNumber: 97, body: '## Screenshots\n…' })],
  ['PR: push files to claude/*', () => gh('push_files', { ...O, branch: 'claude/44-x', files: [] })],
  // Blocked / needs attention
  ['blocked: status:blocked (tool)', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, labels: [...keep, 'status:blocked'] })],
  ['blocked: status:needs-human (gh api)', () => bash(`gh api ${REPO}/issues/44/labels -f "labels[]=status:needs-human"`)],
  ['blocked: status:needs-decision (gh api)', () => bash(`gh api ${REPO}/issues/44/labels -f "labels[]=status:needs-decision"`)],
  ['blocked: release claim (remove status:claimed)', () => bash(`gh api --method DELETE ${REPO}/issues/44/labels/status%3Aclaimed`)],
  // Reading
  ['read: list approved + ready issues', () => gh('list_issues', { ...O, labels: ['approved', 'status:ready'] })],
  ['read: issue and comments', () => gh('issue_read', { ...O, issue_number: 44, method: 'get_comments' })],
];

const PROHIBITED = [
  // Issue descriptions and acceptance criteria
  ['edit issue body / acceptance criteria (tool)', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, body: '### Acceptance criteria\n- [ ] something else' })],
  ['edit issue title (tool)', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, title: 'Renamed' })],
  ['edit issue body (gh api PATCH)', () => bash(`gh api -X PATCH ${REPO}/issues/44 -f body="new AC"`)],
  ['edit issue body (gh api implicit PATCH via fields)', () => bash(`gh api ${REPO}/issues/44 -f body="new AC"`)],
  ['edit a maintainer comment (tool)', () => gh('update_issue_comment', { ...O, comment_id: 1, body: 'changed' })],
  ['edit a maintainer comment (gh api)', () => bash(`gh api -X PATCH ${REPO}/issues/comments/6121007010 -f body=x`)],
  ['delete a comment', () => gh('delete_issue_comment', { ...O, comment_id: 1 })],
  ['close an issue', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, state: 'closed' })],
  ['change milestone', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, milestone: 3 })],
  ['create an issue (tool)', () => gh('issue_write', { ...O, method: 'create', title: 'New idea' })],
  ['create an issue (gh api)', () => bash(`gh api ${REPO}/issues -f title="New idea"`)],
  // Approval labels
  ['add approved to another issue (tool)', () => check({ tool_name: 'mcp__github__issue_write', tool_input: { ...O, method: 'update', issue_number: 50, labels: ['P1', 'approved'] }, cwd: root }, { currentLabels: () => ['P1'] })],
  ['add approved (gh api)', () => bash(`gh api ${REPO}/issues/50/labels -f "labels[]=approved"`)],
  ['add l3-go', () => bash(`gh api ${REPO}/issues/50/labels -f "labels[]=l3-go"`)],
  ['remove approved (tool)', () => gh('remove_issue_label', { ...O, issue_number: 44, label: 'approved' })],
  ['remove approved (gh api DELETE)', () => bash(`gh api -X DELETE ${REPO}/issues/44/labels/approved`)],
  ['remove approved by sending a label list without it', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, labels: ['P1', 'size:S', 'autonomy:L1', 'agent:ui', 'area:design-system', 'status:claimed'] })],
  // Priorities and other maintainer labels
  ['raise priority P1 → P0 (tool)', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, labels: [...keep.filter(l => l !== 'P1'), 'P0', 'status:claimed'] })],
  ['add P0 (gh api)', () => bash(`gh api ${REPO}/issues/44/labels -f "labels[]=P0"`)],
  ['remove P1 (gh api DELETE)', () => bash(`gh api -X DELETE ${REPO}/issues/44/labels/P1`)],
  ['raise autonomy to L3', () => gh('issue_write', { ...O, method: 'update', issue_number: 44, labels: [...keep, 'autonomy:L3'] })],
  ['change size', () => bash(`gh api ${REPO}/issues/44/labels -f "labels[]=size:M"`)],
  ['fail closed when current labels cannot be read', () => check({ tool_name: 'mcp__github__issue_write', tool_input: { ...O, method: 'update', issue_number: 44, labels: [...keep, 'status:claimed'] }, cwd: root }, { currentLabels: () => { throw new Error('offline'); } })],
  // Merge / main
  ['merge a PR', () => gh('merge_pull_request', { ...O, pullNumber: 97 })],
  ['approve a PR', () => gh('pull_request_review_write', { ...O, pullNumber: 97, method: 'create', event: 'APPROVE' })],
  ['push to main', () => bash('git push origin HEAD:main')],
];

for (const [name, run] of PERMITTED) {
  test(`permitted: ${name}`, () => assert.equal(run(), null));
}
for (const [name, run] of PROHIBITED) {
  test(`prohibited: ${name}`, () => assert.ok(run(), 'expected the guard to block this'));
}
