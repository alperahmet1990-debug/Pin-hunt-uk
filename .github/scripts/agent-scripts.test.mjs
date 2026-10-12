import assert from 'node:assert/strict';
import test from 'node:test';
import { formSection, globToRegExp, issueRefs, loadAgentPaths } from './lib.mjs';
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
