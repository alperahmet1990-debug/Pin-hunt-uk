// Controlled merging of agent PRs (docs/agents/OPERATING-MODEL.md §6).
//
// Runs from the default branch only (workflow_run, schedule, labeled via
// pull_request_target). For each open claude/* PR it decides, from GitHub
// data alone:
//   merge          low risk, or medium risk with the maintainer's approval
//   update         eligible, but behind main: merge main in first so CI and the
//                  review re-run on the combined code (no untested combinations)
//   await-approval medium risk without a current `merge-approved`
//   manual         high risk: the maintainer approves and merges by hand
//   wait / block   checks pending, failed, conflicts or hold labels
// and merges with the dedicated PinHunt merge GitHub App (never GITHUB_TOKEN,
// never a development agent's identity). QA and security verdicts count only
// when the PinHunt review app published them for the exact head commit.
// Branch protection still applies to every merge; this script cannot bypass it.
// At most one PR is updated or merged per run, so merges never race.
//
// Inactive unless the repository variable AUTO_MERGE_ENABLED is "true" and
// `.agents/PAUSE` is absent: otherwise it only reports.

import { existsSync } from 'node:fs';
import { ghAs, installationToken } from './github-app.mjs';
import { REPO, gh, ghAll, issueRefs, labelNames, loadAgentPaths } from './lib.mjs';
import { classifyRisk } from './risk.mjs';

export const REQUIRED_CHECKS = ['Typecheck and tests', 'Agent rules', 'QA review', 'Security review'];
// Verdict checks only count when the PinHunt review app created them. Any
// workflow's GITHUB_TOKEN can create a check run as "github-actions", so that
// identity is not trusted for verdicts.
export const VERDICT_CHECKS = ['QA review', 'Security review'];
export const APPROVAL_LABEL = 'merge-approved';
const HOLD_LABELS = ['on-hold', 'status:needs-human', 'status:needs-decision', 'status:blocked', 'do-not-merge', 'qa:fail', 'security:changes'];

/**
 * Latest check run per name, ordered the way branch protection orders them:
 * by check suite (one per workflow run) first, then by run. When two runs of a
 * workflow start together and the newer one is cancelled, GitHub judges the
 * required check by that newer, cancelled run, so the gate must as well.
 */
export function latestRuns(checkRuns) {
  const latest = new Map();
  const key = r => [r.check_suite?.id ?? 0, r.id];
  const newer = (a, b) => key(a)[0] !== key(b)[0] ? key(a)[0] > key(b)[0] : key(a)[1] > key(b)[1];
  for (const run of checkRuns) {
    const prev = latest.get(run.name);
    if (!prev || newer(run, prev)) latest.set(run.name, run);
  }
  return latest;
}

/** Problems with the head's checks, or [] when every required check passed. */
export function checkProblems(checkRuns, reviewAppId) {
  const latest = latestRuns(checkRuns);
  const problems = [];
  for (const name of REQUIRED_CHECKS) {
    const run = latest.get(name);
    if (!run) problems.push(`${name}: not reported`);
    else if (run.status !== 'completed') problems.push(`${name}: running`);
    else if (VERDICT_CHECKS.includes(name) && (!reviewAppId || run.app?.id !== Number(reviewAppId))) problems.push(`${name}: posted by ${run.app?.slug ?? 'unknown'}, not the PinHunt review app`);
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
export function decide({ pr, risk, checkRuns, approved, enabled, behindBy = 0, reviewAppId }) {
  const labels = labelNames(pr);
  if (pr.draft) return { action: 'block', why: ['draft'] };
  if (pr.base.ref !== 'main') return { action: 'block', why: [`base is ${pr.base.ref}`] };
  const holds = labels.filter(l => HOLD_LABELS.includes(l));
  if (holds.length) return { action: 'block', why: [`hold labels: ${holds.join(', ')}`] };
  if (risk.tier === 'high') return { action: 'manual', why: risk.reasons };
  if (pr.mergeable_state === 'dirty') return { action: 'block', why: ['merge conflict'] };
  const problems = checkProblems(checkRuns, reviewAppId);
  if (problems.length) {
    const pending = problems.every(p => /running|not reported/.test(p));
    return { action: pending ? 'wait' : 'block', why: problems };
  }
  if (risk.tier === 'medium' && !approved) return { action: 'await-approval', why: risk.reasons };
  // Tested code must be exactly what lands: bring main in, then CI and the review re-run.
  if (behindBy > 0) {
    const why = [`${behindBy} commit(s) behind main: merge main in, re-test and re-review first${risk.tier === 'medium' ? ' (the maintainer re-approves the updated head)' : ''}`];
    return { action: enabled ? 'update' : 'dry-run', why };
  }
  if (pr.mergeable_state !== 'clean') return { action: 'wait', why: [`mergeable state ${pr.mergeable_state}`] };
  if (!enabled) return { action: 'dry-run', why: [`would merge (${risk.tier} risk)`] };
  return { action: 'merge', why: [`${risk.tier} risk${risk.tier === 'medium' ? ', approved by the maintainer' : ''}`] };
}

/** Short-lived merge-app token: this repository, contents + pull requests only. */
const mergeToken = () => installationToken({
  appId: process.env.MERGE_APP_ID, privateKey: process.env.MERGE_APP_PRIVATE_KEY, repo: REPO,
  permissions: { contents: 'write', pull_requests: 'write' },
});

// ── Main ─────────────────────────────────────────────────────────────────
async function headPushedAt(sha) {
  // The head's first check suite is created when the commit is pushed.
  const { check_suites: suites } = await gh(`/repos/${REPO}/commits/${sha}/check-suites?per_page=100`);
  const times = suites.map(s => new Date(s.created_at).getTime()).filter(Boolean);
  return new Date(times.length ? Math.min(...times) : Date.now()).toISOString();
}

async function reportCheck(sha, decision, risk, checkRuns) {
  const conclusion = { merge: 'success', update: 'neutral', 'dry-run': 'neutral', manual: 'neutral', 'await-approval': 'neutral', wait: 'neutral', block: 'neutral' }[decision.action];
  const title = {
    merge: 'Merging', update: 'Updating from main before merge', 'dry-run': 'Eligible (auto-merge is off)', manual: 'High risk: manual approval and merge',
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
  const reviewAppId = process.env.REVIEW_APP_ID;
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
    const { behind_by: behindBy } = await gh(`/repos/${REPO}/compare/${encodeURIComponent(pr.base.ref)}...${pr.head.sha}`);
    const decision = decide({ pr, risk, checkRuns, approved, enabled, behindBy, reviewAppId });
    console.log(`#${pr.number} [${risk.tier}] ${decision.action}: ${decision.why.join('; ')}`);
    await reportCheck(pr.head.sha, decision, risk, checkRuns);
    if (decision.action !== 'merge' && decision.action !== 'update') continue;
    const token = await mergeToken();
    // expected_head_sha / sha make GitHub refuse if the head moved after this evaluation.
    const call = decision.action === 'update'
      ? ghAs(token, `/repos/${REPO}/pulls/${pr.number}/update-branch`, { method: 'PUT', body: { expected_head_sha: pr.head.sha } })
      : ghAs(token, `/repos/${REPO}/pulls/${pr.number}/merge`, { method: 'PUT', body: { sha: pr.head.sha, merge_method: 'merge' } });
    await call.then(() => console.log(`#${pr.number}: ${decision.action === 'update' ? 'updated from main' : 'merged'} by the merge app`))
      .catch(err => console.error(`#${pr.number}: ${decision.action} refused: ${err.message}`));
    // One change to main (or one update) per run; the next run re-evaluates everything.
    break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
