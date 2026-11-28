import assert from 'node:assert/strict';
import test from 'node:test';
import { ciSummary, formSection, globToRegExp, issueRefs, loadAgentPaths } from './lib.mjs';
import { templateProblems } from './agent-pr-checks.mjs';
import { readFileSync } from 'node:fs';

test('globs match the agent path config', () => {
  const { sensitive, protected: prot } = loadAgentPaths();
  const isSensitive = f => sensitive.some(re => re.test(f));
  const isProtected = f => prot.some(re => re.test(f));
  assert.ok(isSensitive('supabase/migrations/060_x.sql'));
  assert.ok(isSensitive('artifacts/pinhunt/package.json'));
  assert.ok(isSensitive('package.json'));
  assert.ok(isSensitive('lib/pin-repository/src/supabase-user-repository.ts'));
  assert.ok(!isSensitive('artifacts/pinhunt/app/(tabs)/collection.tsx'));
  assert.ok(isProtected('.github/workflows/ci.yml'));
  assert.ok(isProtected('artifacts/api-server/.replit-artifact/artifact.toml'));
  assert.ok(isProtected('CLAUDE.md'));
  assert.ok(!isProtected('docs/agents/OPERATING-MODEL.md'));
  assert.ok(globToRegExp('a/*/c').test('a/b/c'));
  assert.ok(!globToRegExp('a/*/c').test('a/b/x/c'));
});

test('issue-form sections and references', () => {
  const body = '### Touches\n\ncollection.tsx\n\n### Blocked by\n\n#12, #15\n\n### Human steps\n\n_No response_';
  assert.deepEqual(issueRefs(formSection(body, 'Blocked by')), [12, 15]);
  assert.equal(formSection(body, 'Human steps'), '');
  assert.equal(formSection(body, 'Missing'), '');
});

test('the untouched PR template fails, a filled one passes', () => {
  const template = readFileSync('.github/pull_request_template.md', 'utf8');
  const problems = templateProblems(template);
  assert.ok(problems.some(p => p.includes('Closes')));
  assert.ok(problems.some(p => p.includes('Summary of changes')));

  const filled = template
    .replace('Closes #', 'Closes #42')
    .replace('## Summary of changes\n', '## Summary of changes\nHid the Share button.\n')
    .replace('- [ ]\n', '- [x] Share hidden (SetProgressBar.test.tsx)\n')
    .replace('## Tests\n', '## Tests\njest 7/7\n')
    .replace('## Regression checks\n', '## Regression checks\ntypecheck ok\n')
    .replace('## Screenshots\n', '## Screenshots\nN/A\n')
    .replace('## Limitations\n', '## Limitations\nNone\n')
    .replace('## Risk and rollback\n', '## Risk and rollback\nLow: revert PR\n')
    .replace('## Human steps required\n', '## Human steps required\nNone\n');
  assert.deepEqual(templateProblems(filled), []);
});

test('gate labels added via an app or bot are flagged; human additions are not', async () => {
  const { illegitimateGates } = await import('./agent-ops.mjs');
  const human = { event: 'labeled', label: { name: 'approved' }, actor: { login: 'maintainer', type: 'User' }, performed_via_github_app: null };
  const viaClaude = { event: 'labeled', label: { name: 'approved' }, actor: { login: 'maintainer', type: 'User' }, performed_via_github_app: { slug: 'claude' } };
  const bot = { event: 'labeled', label: { name: 'l3-go' }, actor: { login: 'github-actions[bot]', type: 'Bot' } };
  assert.deepEqual(illegitimateGates([human], ['approved']), []);
  assert.deepEqual(illegitimateGates([viaClaude], ['approved']), [{ gate: 'approved', via: 'claude' }]);
  assert.deepEqual(illegitimateGates([viaClaude, human], ['approved']), [], 'a later human re-add wins');
  assert.deepEqual(illegitimateGates([bot], ['l3-go']), [{ gate: 'l3-go', via: 'github-actions[bot]' }]);
  assert.deepEqual(illegitimateGates([viaClaude], ['P1']), [], 'only labels still present');
});

test('screenshot publish keys', async () => {
  const { publishKey } = await import('../../artifacts/pinhunt/scripts/screenshots.mjs');
  assert.equal(publishKey('93'), 'pr-93');
  assert.equal(publishKey('issue-27'), 'issue-27');
  assert.equal(publishKey('PR-5'), 'pr-5');
  assert.throws(() => publishKey('../main'));
  assert.throws(() => publishKey('issue-'));
});

test('Kanban column follows labels, never the other way round', async () => {
  const { columnFor, COLUMNS } = await import('./project-sync.mjs');
  assert.deepEqual(COLUMNS, ['Backlog', 'Approved', 'In Progress', 'Testing', 'Awaiting Review', 'Done']);
  const col = (labels, extra = {}) => columnFor({ state: 'open', labels, ...extra });
  assert.equal(col(['P1', 'agent:ui']), 'Backlog');
  assert.equal(col(['P1', 'status:ready']), 'Backlog', 'status:ready without approved is still backlog');
  assert.equal(col(['P1', 'approved']), 'Approved');
  assert.equal(col(['approved', 'status:ready']), 'Approved');
  assert.equal(col(['approved', 'status:claimed']), 'In Progress');
  assert.equal(col(['approved', 'status:in-review']), 'Testing');
  assert.equal(col(['approved', 'status:in-review'], { prLabels: ['qa:pass'] }), 'Awaiting Review');
  assert.equal(col(['approved', 'status:in-review'], { prLabels: ['security:changes'] }), 'Awaiting Review');
  assert.equal(col(['approved', 'status:needs-decision']), 'Awaiting Review');
  assert.equal(col(['approved', 'status:blocked']), 'Awaiting Review');
  assert.equal(col(['status:needs-human']), 'Awaiting Review');
  assert.equal(columnFor({ state: 'closed', labels: ['approved'] }), 'Done');
  assert.equal(columnFor({ state: 'CLOSED', labels: [] }), 'Done');
});

test('CI summary counts only the latest run of each check', () => {
  const run = (id, name, conclusion, status = 'completed') => ({ id, name, status, conclusion });
  // #168: cancelled runs superseded by successful reruns of the same check.
  assert.deepEqual(ciSummary([
    run(1, 'sync', 'cancelled'), run(2, 'Agent rules', 'cancelled'), run(3, 'Typecheck and tests', 'success'),
    run(4, 'Agent rules', 'success'), run(5, 'sync', 'success'), run(6, 'ops', 'skipped'),
  ]), { failed: [], pending: false, none: false });
  // A real failure on the latest run is still reported, and a rerun in progress is pending.
  assert.deepEqual(ciSummary([run(1, 'sync', 'success'), run(2, 'sync', 'failure'), run(3, 'Agent rules', null, 'in_progress')]),
    { failed: ['sync'], pending: true, none: false });
  // A check whose only run was cancelled still counts as failed.
  assert.deepEqual(ciSummary([run(1, 'CI', 'cancelled')]).failed, ['CI']);
  assert.deepEqual(ciSummary([]), { failed: [], pending: false, none: true });
});

test('project sync GraphQL retries HTML error pages and 5xx, then fails clearly', async () => {
  process.env.GITHUB_REPOSITORY ??= 'o/r';
  const { graphql } = await import('./project-sync.mjs');
  const reply = (status, body, type) => ({ ok: status < 400, status, headers: { get: () => type }, text: async () => body, json: async () => JSON.parse(body) });
  const html = () => reply(200, '<!DOCTYPE html><html>Unicorn</html>', 'text/html');
  const replies = [html(), reply(502, 'Bad gateway', 'text/plain'), reply(200, '{"data":{"ok":1}}', 'application/json')];
  const fetchImpl = async () => replies.shift();
  assert.deepEqual(await graphql('q', {}, { fetchImpl, delayMs: 0 }), { ok: 1 });
  await assert.rejects(graphql('q', {}, { fetchImpl: async () => html(), delayMs: 0, attempts: 2 }), /GraphQL → 200 <!DOCTYPE/);
  await assert.rejects(graphql('q', {}, { fetchImpl: async () => reply(401, 'Bad credentials', 'application/json'), delayMs: 0 }), /GraphQL → 401/);
});

test('approve with one label: suggested labels are applied from the allow-list only', async () => {
  const { suggestedLabels } = await import('./agent-ops.mjs');
  const existing = new Set(['P1', 'P2', 'size:S', 'size:L', 'autonomy:L2', 'agent:ui', 'area:trading', 'interactive',
    'approved', 'l3-go', 'human-approved-config', 'merge-approved', 'on-hold', 'status:ready', 'qa:pass', 'security:required']);
  const body = '**Suggested labels:** `agent:ui` `autonomy:L2` `size:S` `P1` `area:trading` · Touches the trade screen.\n\n### Problem\n\n`size:L` here is not on the line.';
  assert.deepEqual(suggestedLabels(body, ['approved', 'agent-proposed'], existing),
    ['agent:ui', 'autonomy:L2', 'size:S', 'P1', 'area:trading']);

  // Gate, hold, status, qa and security labels are never applied.
  const risky = '**Suggested labels:** `approved` `l3-go` `human-approved-config` `merge-approved` `on-hold` `status:ready` `qa:pass` `security:required` `size:S`';
  assert.deepEqual(suggestedLabels(risky, ['approved'], existing), ['size:S']);

  // The maintainer's choice in a group wins.
  assert.deepEqual(suggestedLabels(body, ['approved', 'P2', 'size:L'], existing), ['agent:ui', 'autonomy:L2', 'area:trading']);

  // Labels that don't exist in the repo, duplicates and labels already present are skipped.
  assert.deepEqual(suggestedLabels('**Suggested labels:** `area:nope` `interactive` `interactive` `P1`', ['approved', 'P1'], existing), ['interactive']);

  // No suggested-labels line: nothing.
  assert.deepEqual(suggestedLabels('### Problem\n\n`P1` `size:S`', ['approved'], existing), []);
  assert.deepEqual(suggestedLabels(null, ['approved'], existing), []);
});

test('approve with one label: only the owner adding approved to an agent-proposed issue triggers it', async () => {
  const { isOwnerApproval } = await import('./agent-ops.mjs');
  const base = {
    action: 'labeled', label: { name: 'approved' }, issue: { number: 1 },
    sender: { login: 'owner', type: 'User' }, repository: { owner: { login: 'owner' } },
  };
  const proposed = ['agent-proposed', 'approved'];
  assert.equal(isOwnerApproval(base, [], proposed), true);
  assert.equal(isOwnerApproval(base, [{ gate: 'approved', via: 'claude' }], proposed), false, 'added via an app');
  assert.equal(isOwnerApproval({ ...base, sender: { login: 'github-actions[bot]', type: 'Bot' } }, [], proposed), false, 'bot');
  assert.equal(isOwnerApproval({ ...base, sender: { login: 'someone', type: 'User' } }, [], proposed), false, 'not the owner');
  assert.equal(isOwnerApproval({ ...base, label: { name: 'P1' } }, [], proposed), false, 'other label');
  assert.equal(isOwnerApproval({ ...base, action: 'unlabeled' }, [], proposed), false, 'removal');
  assert.equal(isOwnerApproval({ ...base, issue: { number: 1, pull_request: {} } }, [], proposed), false, 'pull request');
  assert.equal(isOwnerApproval(base, [], ['approved', 'P1']), false, 'approved issue without agent-proposed');
  assert.equal(isOwnerApproval(base), false, 'no labels known');
});
