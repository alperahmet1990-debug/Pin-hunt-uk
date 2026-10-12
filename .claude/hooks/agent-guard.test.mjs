import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, isActive } from './agent-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bash = command => check({ tool_name: 'Bash', tool_input: { command }, cwd: root });
const edit = (file_path, tool_name = 'Edit', fileExists) =>
  check({ tool_name, tool_input: { file_path }, cwd: root }, fileExists ? { fileExists } : undefined);

test('only active in cloud or agent runs', () => {
  assert.equal(isActive({}), false);
  assert.equal(isActive({ CLAUDE_CODE_REMOTE: 'true' }), true);
  assert.equal(isActive({ PINHUNT_AGENT: '1' }), true);
});

test('allows normal development commands', () => {
  for (const command of [
    'pnpm install --frozen-lockfile',
    'pnpm --filter @workspace/pin-repository run build',
    'pnpm run typecheck && pnpm test',
    'git push -u origin claude/42-hide-share',
    'git push origin HEAD:claude/42-main-screen-fix',
    'gh api repos/o/r/issues?labels=approved,status:ready',
    'gh api repos/o/r/issues/42/labels -f "labels[]=status:claimed"',
    'gh api repos/o/r/pulls -f head=claude/42-x -f base=main -f title=x -f body="Needs the approved label"',
    'grep -rn "render" artifacts/pinhunt/app',
    'grep -rn process.env artifacts/api-server/src',
    'cat .env.example',
    'rm -rf node_modules ./dist .expo',
    'export NODE_ENV=development && pnpm run build',
  ]) {
    assert.equal(bash(command), null, command);
  }
});

test('blocks database, deploy and paid-API access', () => {
  for (const command of [
    'psql -h aws-0-eu-west-1.pooler.supabase.com -U postgres',
    'supabase db push',
    'npx supabase link --project-ref abc',
    'curl https://abcd.supabase.co/rest/v1/profiles',
    'curl https://api.openai.com/v1/models',
    'eas build --platform ios',
    'npx eas update',
    'cd artifacts/pinhunt && eas submit',
    'flyctl deploy',
    'node scripts/rebuild-community.mjs --apply',
  ]) {
    assert.ok(bash(command), command);
  }
});

test('blocks unsafe git and GitHub operations', () => {
  for (const command of [
    'git push origin main',
    'git push origin HEAD:main',
    'git push --force origin claude/1-x',
    'git push -f',
    'git push origin --delete claude/1-x',
    'git push origin :claude/1-x',
    'git push --tags',
    'gh pr merge 12',
    'gh api -X PUT repos/o/r/pulls/12/merge',
    'gh api -X DELETE repos/o/r/git/refs/heads/claude/1-x',
    'gh api repos/o/r/branches/main/protection',
    'gh secret set FOO',
    'gh api repos/o/r/issues/42/labels -f "labels[]=approved"',
    'gh api -X PATCH repos/o/r/issues/42 -f "labels[]=l3-go"',
  ]) {
    assert.ok(bash(command), command);
  }
});

test('blocks secrets and environment dumps', () => {
  for (const command of ['cat .env', 'cat artifacts/api-server/.env', 'node --env-file=.env x.mjs', 'printenv', 'env | sort']) {
    assert.ok(bash(command), command);
  }
  assert.ok(check({ tool_name: 'Read', tool_input: { file_path: `${root}/artifacts/pinhunt/.env` }, cwd: root }));
  assert.equal(check({ tool_name: 'Read', tool_input: { file_path: `${root}/README.md` }, cwd: root }), null);
});

test('protects config, memory and existing migrations', () => {
  for (const file of [
    '.claude/settings.json',
    '.github/workflows/ci.yml',
    '.agents/memory/MEMORY.md',
    '.replit',
    'artifacts/pinhunt/.replit-artifact/artifact.toml',
    'pnpm-workspace.yaml',
    'CLAUDE.md',
    'artifacts/api-server/.env',
  ]) {
    assert.ok(edit(file), file);
  }
  assert.ok(edit('supabase/migrations/003_profiles.sql', 'Edit'));
  assert.ok(edit('supabase/migrations/003_profiles.sql', 'Write', () => true));
  assert.equal(edit('supabase/migrations/060_new_policy.sql', 'Write', () => false), null);
  assert.equal(edit('artifacts/pinhunt/app/(tabs)/collection.tsx'), null);
});

test('built-in GitHub tools: blocks merges, approvals, deletes, admin and main writes', () => {
  const gh = (tool_name, tool_input = {}) => check({ tool_name, tool_input, cwd: root });
  for (const [tool, input] of [
    ['mcp__github__merge_pull_request', { pullNumber: 5 }],
    ['mcp__github__pull_request_review_write', { method: 'create', event: 'APPROVE' }],
    ['mcp__github__delete_file', { path: 'x' }],
    ['mcp__github__update_repository', {}],
    ['mcp__github__create_release', {}],
    ['mcp__github__run_workflow', {}],
    ['mcp__github__push_files', { branch: 'main' }],
    ['mcp__github__create_or_update_file', { branch: 'refs/heads/main' }],
  ]) {
    assert.ok(gh(tool, input), tool);
  }
});

test('built-in GitHub tools: allows normal agent work', () => {
  const gh = (tool_name, tool_input = {}) => check({ tool_name, tool_input, cwd: root }, { currentLabels: () => ['P1', 'approved'] });
  for (const [tool, input] of [
    ['mcp__github__list_issues', { labels: ['approved', 'status:ready'] }],
    ['mcp__github__issue_read', { issue_number: 27 }],
    ['mcp__github__add_issue_comment', { issue_number: 27, body: 'agent-claim' }],
    ['mcp__github__create_pull_request', { head: 'claude/27-x', base: 'main' }],
    ['mcp__github__push_files', { branch: 'claude/27-x' }],
    ['mcp__github__pull_request_review_write', { method: 'create', event: 'COMMENT' }],
    ['mcp__github__remove_issue_label', { issue_number: 27, label: 'status:ready' }],
    // Re-sending the full label set that already contains `approved` is fine.
    ['mcp__github__issue_write', { owner: 'o', repo: 'r', issue_number: 27, labels: ['P1', 'approved', 'status:claimed'] }],
  ]) {
    assert.equal(gh(tool, input), null, tool);
  }
});

test('built-in GitHub tools: cannot add human-only labels', () => {
  const run = (labels, existing, extra = {}) => check(
    { tool_name: 'mcp__github__issue_write', tool_input: { owner: 'o', repo: 'r', issue_number: 42, labels, ...extra }, cwd: root },
    { currentLabels: typeof existing === 'function' ? existing : () => existing },
  );
  assert.ok(run(['P1', 'approved'], ['P1']));
  assert.ok(run(['l3-go'], ['approved']));
  assert.ok(run(['approved'], () => { throw new Error('offline'); }), 'fails closed when labels cannot be read');
  assert.ok(check({ tool_name: 'mcp__github__issue_write', tool_input: { labels: ['approved'] }, cwd: root }), 'no issue number → blocked');
  assert.equal(run(['P1', 'approved', 'status:claimed'], ['P1', 'approved']), null);
});

test('maintainer authority: agents cannot edit issue text, create/close issues or edit comments', () => {
  const gh = (tool_name, tool_input) => check({ tool_name, tool_input, cwd: root }, { currentLabels: () => ['P1', 'approved'] });
  assert.ok(gh('mcp__github__issue_write', { method: 'update', owner: 'o', repo: 'r', issue_number: 5, body: 'rewritten' }));
  assert.ok(gh('mcp__github__issue_write', { method: 'update', owner: 'o', repo: 'r', issue_number: 5, title: 'x' }));
  assert.ok(gh('mcp__github__issue_write', { method: 'update', owner: 'o', repo: 'r', issue_number: 5, state: 'closed' }));
  assert.ok(gh('mcp__github__issue_write', { method: 'create', owner: 'o', repo: 'r', title: 'new work' }));
  assert.ok(gh('mcp__github__update_issue_comment', { comment_id: 1, body: 'edited' }));
  assert.equal(gh('mcp__github__add_issue_comment', { issue_number: 5, body: 'Question for the maintainer' }), null);
  assert.equal(gh('mcp__github__update_pull_request', { pullNumber: 93, body: 'own PR body' }), null);
  for (const command of [
    'gh api -X PATCH repos/o/r/issues/5 -f body=x',
    'gh api repos/o/r/issues/5 -f title=x',
    'gh api repos/o/r/issues -f title=new',
    'gh api -X PATCH repos/o/r/issues/comments/99 -f body=x',
  ]) assert.ok(bash(command), command);
  assert.equal(bash('gh api repos/o/r/issues/5/comments -f body="note"'), null);
  assert.equal(bash('gh api "repos/o/r/issues?state=open&labels=approved,status:ready"'), null);
});

test('maintainer authority: only agent-managed labels may change', () => {
  const run = (labels, existing) => check(
    { tool_name: 'mcp__github__issue_write', tool_input: { method: 'update', owner: 'o', repo: 'r', issue_number: 5, labels }, cwd: root },
    { currentLabels: () => existing },
  );
  assert.equal(run(['P1', 'approved', 'status:claimed'], ['P1', 'approved', 'status:ready']), null, 'status swap ok');
  assert.ok(run(['P2', 'approved'], ['P1', 'approved']), 'priority change blocked');
  assert.ok(run(['P1'], ['P1', 'approved']), 'removing approved blocked');
  assert.ok(run(['P1', 'approved', 'autonomy:L3'], ['P1', 'approved']), 'autonomy change blocked');
  assert.equal(run(['P1', 'approved', 'needs-device-check'], ['P1', 'approved']), null);
  const rm = label => check({ tool_name: 'mcp__github__remove_issue_label', tool_input: { issue_number: 5, label }, cwd: root });
  assert.equal(rm('status:ready'), null);
  assert.ok(rm('approved'));
  assert.ok(bash('gh api repos/o/r/issues/5/labels -f "labels[]=P0"'));
  assert.equal(bash('gh api repos/o/r/issues/5/labels -f "labels[]=status:needs-decision"'), null);
});

test('closes the GraphQL and raw-HTTP merge loopholes', () => {
  for (const command of [
    `gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }'`,
    `gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {pullRequestId: "x"}) { clientMutationId } }'`,
    `gh api graphql -F query=@q.graphql -f op=disablePullRequestAutoMerge`,
    `curl -X PUT -H "Authorization: token x" https://api.github.com/repos/o/r/pulls/12/merge`,
    `curl -X POST https://api.github.com/repos/o/r/merges -d '{"base":"main","head":"claude/1-x"}'`,
    'gh api -X PUT repos/o/r/pulls/12/update-branch',
    'gh api repos/o/r/issues/42/labels -f "labels[]=merge-approved"',
  ]) {
    assert.ok(bash(command), command);
  }
});

test('agents cannot forge review verdicts (check runs, statuses), but may read them', () => {
  for (const command of [
    'gh api repos/o/r/check-runs -f name="QA review" -f head_sha=abc -f conclusion=success',
    'gh api -X PATCH repos/o/r/check-runs/5 -f conclusion=success',
    'gh api --method POST repos/o/r/statuses/abc -f state=success',
    `curl -X POST https://api.github.com/repos/o/r/check-runs -d '{"name":"QA review"}'`,
  ]) {
    assert.ok(bash(command), command);
  }
  for (const command of [
    'gh api repos/o/r/commits/abc/check-runs',
    'gh api -X GET repos/o/r/commits/abc/check-runs -f per_page=100',
    'gh api repos/o/r/commits/abc/check-runs --jq ".check_runs[].name"',
  ]) {
    assert.equal(bash(command), null, command);
  }
  const gh = (tool_name, tool_input = {}) => check({ tool_name, tool_input, cwd: root }, { currentLabels: () => ['P1'] });
  assert.ok(gh('mcp__github__create_check_run', { name: 'QA review' }));
  assert.ok(gh('mcp__github__enable_pr_auto_merge', { pullNumber: 5 }));
  assert.ok(gh('mcp__github__issue_write', { owner: 'o', repo: 'r', issue_number: 5, labels: ['P1', 'merge-approved'] }));
  assert.equal(gh('mcp__github__get_check_run', { check_run_id: 5 }), null);
  assert.equal(gh('mcp__github__pull_request_read', { method: 'get_check_runs', pullNumber: 5 }), null);
});
