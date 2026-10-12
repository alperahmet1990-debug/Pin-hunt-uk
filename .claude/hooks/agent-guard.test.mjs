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
