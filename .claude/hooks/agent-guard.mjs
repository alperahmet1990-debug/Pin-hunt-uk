#!/usr/bin/env node
// PreToolUse guard for autonomous agent runs (Claude Code cloud sessions and
// routines). It is a no-op in local interactive sessions, which keep their
// normal permission prompts.
//
// Active when CLAUDE_CODE_REMOTE=true (set in cloud sessions) or
// PINHUNT_AGENT=1 (set on the agents' cloud environment as a second signal).
//
// Blocks (exit 2 with a reason on stderr):
//  - database, deploy and release CLIs; calls to Supabase or paid APIs
//  - git pushes to main, force pushes, deletes and tag pushes
//  - GitHub API calls that merge, change settings/secrets or add human-only labels
//  - reading or writing .env files
//  - edits to protected paths (agent/CI config, Replit config, CLAUDE.md,
//    existing migrations, agent memory notes)
//
// See docs/agents/OPERATING-MODEL.md. Changes to this file need the
// `human-approved-config` label on the PR.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function isActive(env = process.env) {
  return env.CLAUDE_CODE_REMOTE === 'true' || env.PINHUNT_AGENT === '1';
}

const HUMAN_ONLY_LABELS = ['approved', 'l3-go', 'human-approved-config'];

const BASH_RULES = [
  [/\b(psql|pg_dump|pg_restore|pg_dumpall)\b/, 'Direct database access is not allowed for agents.'],
  [/\bsupabase\s+(link|login|db\s+(push|pull|reset|dump|remote)|migration\s+(repair|up|fetch)|functions\s+deploy|secrets|projects|storage|orgs)\b/,
    'Supabase CLI commands that reach a hosted project are not allowed for agents.'],
  [/\b[a-z0-9-]+\.supabase\.(co|in)\b/i, 'Agents must not contact a hosted Supabase project.'],
  [/\b(api\.openai\.com|vision\.googleapis\.com|api\.pixian\.ai|api\.ebay\.com|api\.sandbox\.ebay\.com)\b/i,
    'Agents must not call paid or production third-party APIs.'],
  [/(^|[;&|(]\s*)(npx\s+|pnpm\s+(exec\s+|dlx\s+)?)?eas(-cli)?(\s|$)/, 'EAS builds, submits and updates are not allowed for agents.'],
  [/\bexpo\s+(publish|upload)\b/, 'Publishing is not allowed for agents.'],
  [/(^|[;&|(]\s*)(npx\s+|pnpm\s+(exec\s+|dlx\s+)?)?(vercel|netlify|flyctl|fly|railway|render|heroku|gcloud|aws|az|replit|wrangler|firebase)(\s|$)/,
    'Deploy and cloud CLIs are not allowed for agents.'],
  [/\bgit\s+push\b[^;&|]*(--force|--force-with-lease|\s-f\b|--mirror|--delete|\s-d\b|--tags|--all)/,
    'Force, delete, mirror and tag pushes are not allowed.'],
  [/\bgit\s+push\b[^;&|]*[\s:+](refs\/heads\/)?(main|master)\b/, 'Pushing to main is not allowed. Push a claude/* branch and open a PR.'],
  [/\bgit\s+push\b[^;&|]*\s:[^\s]/, 'Deleting remote branches is not allowed.'],
  [/\bgh\s+(repo\s+(delete|edit|archive|rename)|secret|variable|ruleset|release|workflow\s+(run|enable|disable))\b/,
    'Repository settings, secrets, releases and workflow control are not allowed.'],
  [/\bgh\s+api\b[^;&|]*(-X|--method)\s*['"]?DELETE/i, 'DELETE calls to the GitHub API are not allowed.'],
  [/\bgh\s+api\b[^;&|]*\/(merge|merges|protection|rulesets|hooks|secrets|variables|collaborators|keys|environments|actions\/permissions|deployments)\b/,
    'Merging and repository administration through the GitHub API are not allowed.'],
  [/\bgh\s+pr\s+merge\b/, 'Agents never merge pull requests.'],
  [new RegExp(`\\bgh\\s+api\\b[^;&|]*(\\/labels\\b[^;&|]*|labels\\[\\]=\\s*['"]?)\\b(${HUMAN_ONLY_LABELS.join('|')})\\b(?![:-])`),
    'Only a human can add the approved, l3-go or human-approved-config labels.'],
  [/(^|[\s'"=<>/])\.env(\.(local|development|production|staging|test))?($|[\s'";|&)])/, 'Reading or writing .env files is not allowed.'],
  [/--env-file\b/, 'Loading .env files is not allowed.'],
  [/(^|[;&|(]\s*)(printenv|env|export\s+-p|set)\s*($|[|;&>])/, 'Dumping environment variables is not allowed.'],
  [/\bnode\b[^;&|]*\bscripts\/[^\s]*\.(m?js|ts)\b[^;&|]*--apply\b/, 'Running data scripts with --apply is not allowed.'],
  [/\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+(\/|~|\$HOME|\.|\.\/|\*)(\s|$)/, 'Recursive deletion of the repository or system paths is not allowed.'],
];

const PROTECTED_PATHS = [
  [/^\.claude\//, 'Agent configuration is human-maintained.'],
  [/^\.github\//, 'CI and GitHub configuration is human-maintained.'],
  [/^\.agents\/memory\//, 'Agent memory notes are human-maintained.'],
  [/^\.replit$|^\.replitignore$|^artifacts\/[^/]+\/\.replit-artifact\//, 'Replit configuration must be preserved (CLAUDE.md).'],
  [/^scripts\/post-merge\.sh$/, 'Replit configuration must be preserved (CLAUDE.md).'],
  [/^pnpm-workspace\.yaml$/, 'Workspace and supply-chain settings are human-maintained.'],
  [/^CLAUDE\.md$/, 'CLAUDE.md is human-maintained.'],
  [/(^|\/)\.env(\.(local|development|production|staging|test))?$/, 'Reading or writing .env files is not allowed.'],
];

function repoRelative(filePath, cwd) {
  if (!filePath) return '';
  const abs = path.resolve(cwd || process.cwd(), filePath);
  const root = findRepoRoot(cwd || process.cwd());
  return path.relative(root, abs).split(path.sep).join('/');
}

function findRepoRoot(start) {
  let dir = path.resolve(start);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(start);
}

/** Returns a reason string when the call must be blocked, otherwise null. */
export function check(input, { fileExists = existsSync } = {}) {
  const tool = input.tool_name;
  const args = input.tool_input ?? {};
  const cwd = input.cwd;

  if (tool === 'Bash') {
    const command = String(args.command ?? '');
    for (const [pattern, reason] of BASH_RULES) {
      if (pattern.test(command)) return reason;
    }
    return null;
  }

  if (tool === 'Read') {
    const rel = repoRelative(args.file_path, cwd);
    if (/(^|\/)\.env(\.(local|development|production|staging|test))?$/.test(rel)) {
      return 'Reading .env files is not allowed.';
    }
    return null;
  }

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const target = args.file_path ?? args.notebook_path;
    const rel = repoRelative(target, cwd);
    for (const [pattern, reason] of PROTECTED_PATHS) {
      if (pattern.test(rel)) return `${reason} (${rel})`;
    }
    if (/^supabase\/migrations\//.test(rel)) {
      const abs = path.resolve(cwd || process.cwd(), target);
      if (tool !== 'Write' || fileExists(abs)) {
        return `Existing migrations are immutable; add a new migration file instead. (${rel})`;
      }
    }
    return null;
  }

  return null;
}

function main() {
  if (!isActive()) process.exit(0);
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    // Fail closed: an unreadable hook payload in an agent run is blocked.
    process.stderr.write('agent-guard: could not parse hook input; blocking.\n');
    process.exit(2);
  }
  const reason = check(input);
  if (reason) {
    process.stderr.write(`Blocked by PinHunt agent guard: ${reason}\nSee docs/agents/OPERATING-MODEL.md. If this step is genuinely required, stop and label the issue status:needs-human.\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
