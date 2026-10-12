// Controlled merging of agent PRs (docs/agents/OPERATING-MODEL.md §6).
//
// Runs from the default branch only (workflow_run, schedule, labeled via
// pull_request_target). For each open claude/* PR it decides, from GitHub
// data alone:
//   merge          low risk, or medium risk with the maintainer's approval
//   await-approval medium risk without a current `merge-approved`
//   manual         high risk: the maintainer approves and merges by hand
//   wait / block   checks pending, failed, conflicts or hold labels
// and merges with the dedicated PinHunt merge GitHub App (never GITHUB_TOKEN,
// never a development agent's identity). Branch protection still applies to
// every merge; this script cannot bypass it.
//
// Inactive unless the repository variable AUTO_MERGE_ENABLED is "true" and
// `.agents/PAUSE` is absent: otherwise it only reports.

import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { REPO, gh, ghAll, issueRefs, labelNames, loadAgentPaths } from './lib.mjs';
import { classifyRisk } from './risk.mjs';

export const REQUIRED_CHECKS = ['Typecheck and tests', 'Agent rules', 'QA review', 'Security review'];
// Verdict checks only count when GitHub Actions created them (agents cannot).
export const VERDICT_CHECKS = ['QA review', 'Security review'];
export const TRUSTED_CHECK_APP = 'github-actions';
export const APPROVAL_LABEL = 'merge-approved';
const HOLD_LABELS = ['on-hold', 'status:needs-human', 'status:needs-decision', 'status:blocked', 'do-not-merge', 'qa:fail', 'security:changes'];

/** Latest check run per name (reruns and cancelled duplicates replaced). */
export function latestRuns(checkRuns) {
  const latest = new Map();
  for (const run of checkRuns) {
    const prev = latest.get(run.name);
    if (!prev || run.id > prev.id) latest.set(run.name, run);
  }
  return latest;
}

/** Problems with the head's checks, or [] when every required check passed. */
export function checkProblems(checkRuns) {
  const latest = latestRuns(checkRuns);
  const problems = [];
  for (const name of REQUIRED_CHECKS) {
    const run = latest.get(name);
    if (!run) problems.push(`${name}: not reported`);
    else if (run.status !== 'completed') problems.push(`${name}: running`);
    else if (VERDICT_CHECKS.includes(name) && run.app?.slug !== TRUSTED_CHECK_APP) problems.push(`${name}: posted by ${run.app?.slug ?? 'unknown'}, not GitHub Actions`);
    else if (run.conclusion !== 'success') problems.push(`${name}: ${run.conclusion}`);
  }
  for (const [name, run] of latest) {
    if (!REQUIRED_CHECKS.includes(name) && ['failure', 'timed_out', 'cancelled', 'action_required'].includes(run.conclusion)) {
      problems.push(`${name}: ${run.conclusion}`);
    }
  }
  return problems;
}

/**
 * True when `merge-approved` is on the PR, was last added by a human (not an
 * app or bot) and after the head commit was pushed.
 */
export function humanApproval({ labels, events, headPushedAt }) {
  if (!labels.includes(APPROVAL_LABEL)) return false;
  const last = events.filter(e => e.event === 'labeled' && e.label?.name === APPROVAL_LABEL).at(-1);
  if (!last || last.performed_via_github_app || last.actor?.type === 'Bot') return false;
  return new Date(last.created_at) > new Date(headPushedAt);
}

/** Pure decision for one PR. */
export function decide({ pr, risk, checkRuns, approved, enabled }) {
  const labels = labelNames(pr);
  if (pr.draft) return { action: 'block', why: ['draft'] };
  if (pr.base.ref !== 'main') return { action: 'block', why: [`base is ${pr.base.ref}`] };
  const holds = labels.filter(l => HOLD_LABELS.includes(l));
  if (holds.length) return { action: 'block', why: [`hold labels: ${holds.join(', ')}`] };
  if (risk.tier === 'high') return { action: 'manual', why: risk.reasons };
  if (pr.mergeable_state === 'dirty') return { action: 'block', why: ['merge conflict'] };
  const problems = checkProblems(checkRuns);
  if (problems.length) {
    const pending = problems.every(p => /running|not reported/.test(p));
    return { action: pending ? 'wait' : 'block', why: problems };
  }
  if (pr.mergeable_state !== 'clean') return { action: 'wait', why: [`mergeable state ${pr.mergeable_state}`] };
  if (risk.tier === 'medium' && !approved) return { action: 'await-approval', why: risk.reasons };
  if (!enabled) return { action: 'dry-run', why: [`would merge (${risk.tier} risk)`] };
  return { action: 'merge', why: [`${risk.tier} risk${risk.tier === 'medium' ? ', approved by the maintainer' : ''}`] };
}

// ── Merge identity: installation token for the PinHunt merge GitHub App ──
const b64url = buf => Buffer.from(buf).toString('base64url');

export function appJwt(appId, privateKey, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}

async function appRequest(path, token, { method = 'GET', body, scheme = 'Bearer' } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `${scheme} ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

/** Short-lived token limited to this repository, contents + pull requests. */
async function mergeToken() {
  const { MERGE_APP_ID: id, MERGE_APP_PRIVATE_KEY: key } = process.env;
  if (!id || !key) throw new Error('MERGE_APP_ID / MERGE_APP_PRIVATE_KEY are not configured.');
  const jwt = appJwt(id, key);
  const installation = await appRequest(`/repos/${REPO}/installation`, jwt);
  const { token } = await appRequest(`/app/installations/${installation.id}/access_tokens`, jwt, {
    method: 'POST',
    body: { repositories: [REPO.split('/')[1]], permissions: { contents: 'write', pull_requests: 'write' } },
  });
  return token;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function headPushedAt(sha) {
  // The head's first check suite is created when the commit is pushed.
  const { check_suites: suites } = await gh(`/repos/${REPO}/commits/${sha}/check-suites?per_page=100`);
  const times = suites.map(s => new Date(s.created_at).getTime()).filter(Boolean);
  return new Date(times.length ? Math.min(...times) : Date.now()).toISOString();
}

async function reportCheck(sha, decision, risk, checkRuns) {
  const conclusion = { merge: 'success', 'dry-run': 'neutral', manual: 'neutral', 'await-approval': 'neutral', wait: 'neutral', block: 'neutral' }[decision.action];
  const title = {
    merge: 'Merging', 'dry-run': 'Eligible (auto-merge is off)', manual: 'High risk: manual approval and merge',
    'await-approval': 'Medium risk: waiting for merge-approved', wait: 'Waiting for checks', block: 'Blocked',
  }[decision.action];
  const summary = `**Risk:** ${risk.tier}\n\n${risk.reasons.map(r => `- ${r}`).join('\n')}\n\n**Decision:** ${decision.action}\n\n${decision.why.map(r => `- ${r}`).join('\n')}`;
  // Hourly sweeps re-evaluate every PR; only post when the decision changed.
  const previous = latestRuns(checkRuns).get('Merge gate');
  if (previous?.output?.title === title && previous?.output?.summary === summary) return;
  await gh(`/repos/${REPO}/check-runs`, {
    method: 'POST',
    body: { name: 'Merge gate', head_sha: sha, status: 'completed', conclusion, output: { title, summary } },
  });
}

async function main() {
  const enabled = process.env.AUTO_MERGE_ENABLED === 'true' && !existsSync('.agents/PAUSE');
  const paths = loadAgentPaths();
  const prs = (await ghAll(`/repos/${REPO}/pulls?state=open`)).filter(p => p.head.ref.startsWith('claude/'));
  for (const listed of prs) {
    const pr = await gh(`/repos/${REPO}/pulls/${listed.number}`);
    const files = (await ghAll(`/repos/${REPO}/pulls/${pr.number}/files`)).flatMap(f => [f.filename, f.previous_filename].filter(Boolean));
    const linked = [...new Set(issueRefs((String(pr.body).match(/\b(?:closes|fixes|resolves)\s+#\d+/gi) ?? []).join(' ')))];
    const issues = [];
    for (const n of linked) issues.push(await gh(`/repos/${REPO}/issues/${n}`).catch(() => null));
    const linkedIssue = issues.length === 1 && issues[0]?.state === 'open' && labelNames(issues[0]).includes('approved');
    const risk = classifyRisk({ branch: pr.head.ref, files, prLabels: labelNames(pr), issueLabels: issues.flatMap(i => (i ? labelNames(i) : [])), linkedIssue, paths });
    const { check_runs: checkRuns } = await gh(`/repos/${REPO}/commits/${pr.head.sha}/check-runs?per_page=100`);
    const approved = risk.tier === 'medium' && humanApproval({
      labels: labelNames(pr), events: await ghAll(`/repos/${REPO}/issues/${pr.number}/events`), headPushedAt: await headPushedAt(pr.head.sha),
    });
    const decision = decide({ pr, risk, checkRuns, approved, enabled });
    console.log(`#${pr.number} [${risk.tier}] ${decision.action}: ${decision.why.join('; ')}`);
    await reportCheck(pr.head.sha, decision, risk, checkRuns);
    if (decision.action !== 'merge') continue;
    const token = await mergeToken();
    // `sha` makes GitHub refuse the merge if the head moved after this evaluation.
    await appRequest(`/repos/${REPO}/pulls/${pr.number}/merge`, token, {
      method: 'PUT', body: { sha: pr.head.sha, merge_method: 'merge' },
    }).then(() => console.log(`#${pr.number}: merged by the merge app`))
      .catch(err => console.error(`#${pr.number}: merge refused: ${err.message}`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
