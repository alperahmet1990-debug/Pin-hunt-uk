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
//  - built-in GitHub tools (mcp__github__*) that merge, approve, delete, change
//    repository settings, run workflows, write to main, or add human-only labels
//
// See docs/agents/OPERATING-MODEL.md. Changes to this file need the
// `human-approved-config` label on the PR.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function isActive(env = process.env) {
  return env.CLAUDE_CODE_REMOTE === 'true' || env.PINHUNT_AGENT === '1';
}

const HUMAN_ONLY_LABELS = ['approved', 'l3-go', 'human-approved-config', 'merge-approved'];
// The only labels agents may add or remove (docs/agents/OPERATING-MODEL.md §2a).
export const isAgentManagedLabel = l => /^(status|qa|security):/.test(l) || l === 'needs-device-check';

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
  // DELETE is blocked except removing an agent-managed label from an issue/PR.
  [/\bgh\s+api\b(?![^;&|]*\/issues\/\d+\/labels\/(status|qa|security)(:|%3A)|[^;&|]*\/issues\/\d+\/labels\/needs-device-check)[^;&|]*(-X|--method)\s*['"]?DELETE/i,
    'DELETE calls to the GitHub API are not allowed (except removing status:*, qa:*, security:* or needs-device-check labels).'],
  // A segment ends at /, ?, #, whitespace, a quote or the end, so label names such as merge-approved don't match.
  [/\bgh\s+api\b[^;&|]*\/(merge|merges|protection|rulesets|hooks|secrets|variables|collaborators|keys|environments|actions\/permissions|deployments)(?=[\/?#\s'"]|$)/,
    'Merging and repository administration through the GitHub API are not allowed.'],
  [/\bgh\s+pr\s+merge\b/, 'Agents never merge pull requests.'],
  // GraphQL and raw HTTP reach the same operations as the REST rules above.
  [/\b(mergePullRequest|enablePullRequestAutoMerge|disablePullRequestAutoMerge|enqueuePullRequest|dequeuePullRequest|mergeBranch|updatePullRequestBranch)\b/,
    'Agents never merge pull requests or change auto-merge (including through GraphQL).'],
  [/\/pulls\/\d+\/(merge|update-branch)(?=[\/?#\s'"]|$)|\/repos\/[^\s/]+\/[^\s/]+\/merges(?=[\/?#\s'"]|$)/, 'Agents never merge pull requests.'],
  // The Claude Code session proxy exposes its own PR-state routes under /pulls/<n>/ccr/ (auto-merge, draft state).
  [/\/pulls\/\d+\/ccr\/(auto_merge|ready_for_review|convert_to_draft)(?=[\/?#\s'"]|$)/,
    'Agents never arm auto-merge or change a PR\'s draft state through the session proxy.'],
  // Writes to check runs or statuses: the path plus a write method or body fields, unless it is an explicit GET.
  [/^(?![\s\S]*(?:-X|--method)\s*['"]?GET\b)(?=[\s\S]*\/(?:check-runs|check-suites|statuses)\b)(?=[\s\S]*(?:(?:-X|--method|--request)\s*['"]?(?:POST|PATCH|PUT)\b|\s(?:-f|-F|--field|--raw-field|--input|-d|--data|--data-raw)\s))/i,
    'Agents may not create or change check runs or commit statuses; review verdicts come only from GitHub Actions.'],
  [new RegExp(`^(?![^;&|]*(?:-X|--method)\\s*['"]?GET\\b)(?=[^;&|]*(?:(?:-X|--method)\\s*['"]?(?:POST|PUT|PATCH)\\b|\\s(?:-f|-F|--field|--raw-field|--input)\\s))[\\s\\S]*\\bgh\\s+api\\b[^;&|]*(\\/labels\\b[^;&|]*|labels\\[\\]=\\s*['"]?)\\b(${HUMAN_ONLY_LABELS.join('|')})\\b(?![:-])`),
    'Only a human can add the approved, l3-go, human-approved-config or merge-approved labels.'],
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

// Built-in GitHub tools in cloud sessions bypass the Bash rules above, so they
// are checked by name and arguments.
const GITHUB_TOOL_RULES = [
  [/merge/i, 'Agents never merge pull requests.'],
  [/delete(?!.*label)|remove_(?!sub_issue|.*label)/i, 'Deleting GitHub content is not allowed for agents.'],
  [/(update|create|fork)_repository|fork_/i, 'Repository creation and settings changes are not allowed.'],
  [/(create|update|rerequest)_(check_run|check_suite|commit_status)|create_status/i, 'Agents may not create or change check runs or commit statuses.'],
  [/secret|variable|ruleset|branch_protection|collaborator|deploy_key|webhook|hook/i, 'Repository administration is not allowed.'],
  [/(create|update|publish|edit)_(release|tag)/i, 'Releases and tags are not allowed for agents.'],
  [/(run|rerun|cancel|dispatch|enable|disable)_?(workflow|job|run)|workflow_dispatch/i, 'Running or controlling workflows is not allowed.'],
  [/dismiss|security_alert|code_scanning|dependabot.*(update|dismiss)/i, 'Changing security alerts is not allowed.'],
];

/** Maintainer authority for `gh api` issue calls made through Bash. */
function checkBashIssueEdits(command) {
  for (const call of command.split(/[;&|]+/).filter(c => /\bgh\s+api\b/.test(c))) {
    const writes = /(-X|--method)\s*['"]?(POST|PATCH|PUT)|\s(-f|-F|--field|--raw-field|--input)\s/i.test(call);
    if (!writes) continue;
    if (/\/issues\/comments\/\d+/.test(call)) return 'Agents never edit comments.';
    if (/\/issues\/\d+['"]?(\s|$)/.test(call)) return 'Agents never edit issue titles, bodies, state or metadata. Comment instead.';
    if (/repos\/[^/\s]+\/[^/\s]+\/issues['"]?(\s|$)/.test(call)) return 'Agents never create issues in autonomous runs. Propose work in a comment.';
    const labels = [...call.matchAll(/labels(?:\[\])?=\s*['"]?([^'"\s,]+)/g)].map(m => m[1]);
    const foreign = labels.filter(l => !isAgentManagedLabel(l));
    if (foreign.length) return `Agents may only change status:*, qa:*, security:* and needs-device-check labels (not ${foreign.join(', ')}).`;
  }
  return null;
}

function issueNumberOf(args) {
  return args.issue_number ?? args.issueNumber ?? args.pull_number ?? args.pullNumber ?? args.number;
}

function fetchLabels(owner, repo, number) {
  const out = execFileSync('gh', ['api', `repos/${owner}/${repo}/issues/${number}`, '--jq', '[.labels[].name]'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 });
  return JSON.parse(out);
}

function checkGithubTool(tool, args, { currentLabels = fetchLabels } = {}) {
  const name = tool.replace(/^mcp__github__/, '');
  // Agents may approve nothing: block approving reviews.
  if (/review/i.test(name) && /approve/i.test(String(args.event ?? args.state ?? ''))) {
    return 'Agents never approve pull requests.';
  }
  for (const [pattern, reason] of GITHUB_TOOL_RULES) {
    if (pattern.test(name)) return `${reason} (${name})`;
  }
  const branch = String(args.branch ?? args.ref ?? args.base ?? '');
  if (/push_files|create_or_update_file|commit/i.test(name) && /^(refs\/heads\/)?(main|master)$/.test(branch)) {
    return 'Writing to main is not allowed. Use a claude/* branch and a PR.';
  }
  // Reads (list/get/search) may filter by label; only writes are checked.
  const isRead = /^(list|get|search)_|_read$/i.test(name);
  if (isRead) return null;

  // Maintainer authority (OPERATING-MODEL §2a).
  if (/comment/i.test(name) && /update|edit/i.test(name)) return 'Agents never edit comments.';
  const isIssueWrite = /issue/i.test(name) && !/comment|sub_issue/i.test(name);
  if (isIssueWrite && (String(args.method ?? '').toLowerCase() === 'create' || /create_issue/i.test(name))) {
    return 'Agents never create issues in autonomous runs. Propose work in a comment.';
  }
  if (isIssueWrite && ['title', 'body', 'milestone', 'assignees', 'state', 'state_reason', 'type'].some(k => args[k] !== undefined)) {
    return 'Agents never edit issue titles, bodies, state or metadata. Comment instead.';
  }

  const listed = [args.labels, args.label, args.add_labels].flat().filter(Boolean).map(l => (typeof l === 'string' ? l : l?.name));
  if (/remove.*label/i.test(name)) {
    const foreign = listed.filter(l => !isAgentManagedLabel(l));
    return foreign.length ? `Agents may only remove status:*, qa:*, security:* and needs-device-check labels (not ${foreign.join(', ')}).` : null;
  }
  if (!listed.length) return null;
  const replacesAll = isIssueWrite && Array.isArray(args.labels);
  const number = issueNumberOf(args);
  if (!args.owner || !args.repo || !number) {
    const foreign = listed.filter(l => !isAgentManagedLabel(l));
    return foreign.length ? 'Cannot verify label changes without owner, repo and issue number.' : null;
  }
  let existing;
  try {
    existing = currentLabels(args.owner, args.repo, number);
  } catch {
    return 'Could not verify existing labels; label change blocked.';
  }
  const added = listed.filter(l => !existing.includes(l) && !isAgentManagedLabel(l));
  const removed = replacesAll ? existing.filter(l => !listed.includes(l) && !isAgentManagedLabel(l)) : [];
  if (added.length) {
    const gates = added.filter(l => HUMAN_ONLY_LABELS.includes(l));
    return gates.length ? `Only a human can add ${gates.join(', ')}.` : `Agents may not add maintainer labels (${added.join(', ')}).`;
  }
  if (removed.length) return `Agents may not remove maintainer labels (${removed.join(', ')}). Send the full existing label list.`;
  return null;
}

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
export function check(input, { fileExists = existsSync, currentLabels } = {}) {
  const tool = input.tool_name;
  const args = input.tool_input ?? {};
  const cwd = input.cwd;

  if (typeof tool === 'string' && tool.startsWith('mcp__github__')) {
    return checkGithubTool(tool, args, currentLabels ? { currentLabels } : undefined);
  }

  if (tool === 'Bash') {
    const command = String(args.command ?? '');
    for (const [pattern, reason] of BASH_RULES) {
      if (pattern.test(command)) return reason;
    }
    return checkBashIssueEdits(command);
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
