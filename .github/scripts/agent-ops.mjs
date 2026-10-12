// Daily mechanical PM work for the agent workflow (docs/agents/OPERATING-MODEL.md).
// Uses only GITHUB_TOKEN and the REST API, so it costs no Claude usage.
//
//  1. Groom: approved issues whose "Blocked by" issues are all closed get
//     `status:ready`; ready issues with an open blocker lose it.
//  2. Release stale claims: `status:claimed` for STALE_CLAIM_HOURS (2) h+ with
//     no open PR.
//  3. Flag in-review issues whose PR closed without merging, and clear
//     status:* labels from issues closed in the last 7 days.
//  4. Flag claude/* PRs with merge conflicts (once per head commit).
//  5. Rewrite the body of the open issue labelled `status-report`. If no such
//     issue exists, the report goes to the job summary only; this script never
//     creates issues.
//  0. Gate-label backstop: if `approved`, `l3-go` or `human-approved-config` was
//     last added by an app or bot (agents act through the "claude" GitHub app),
//     remove it, comment, and flag the item status:needs-human. Runs on every
//     `issues`/`pull_request` labeled event as well as daily.

import { appendFileSync, readFileSync } from 'node:fs';
import {
  REPO, addLabels, comment, formSection, gh, ghAll, issueRefs, labelNames, removeLabel,
} from './lib.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';
const now = Date.now();
const HOUR = 3_600_000;
const STATE_LABELS = ['status:ready', 'status:claimed', 'status:in-review', 'status:blocked', 'status:needs-human', 'status:needs-decision'];

const GATE_LABELS = ['approved', 'l3-go', 'human-approved-config'];
// Dev runs take ~5–15 min; with an hourly schedule a claim older than this is dead.
const STALE_CLAIM_HOURS = Number(process.env.STALE_CLAIM_HOURS ?? 2);

/** 'add' / 'remove' status:ready, or null. Exported for tests. */
export function readyDecision(labels, openBlockers) {
  // Held work never enters the queue, even when approved.
  if (labels.includes('on-hold')) return labels.includes('status:ready') ? 'remove' : null;
  if (!labels.includes('approved') || labels.includes('human-only')) return null;
  const hasState = labels.some(l => STATE_LABELS.includes(l));
  if (!openBlockers.length && !hasState) return 'add';
  if (openBlockers.length && labels.includes('status:ready')) return 'remove';
  return null;
}
const log = msg => console.log(DRY_RUN ? `[dry-run] ${msg}` : msg);
const act = async (msg, fn) => { log(msg); if (!DRY_RUN) await fn(); };

function linkedIssueNumbers(pr) {
  const refs = String(pr.body ?? '').match(/\b(?:closes|fixes|resolves)\s+#\d+/gi) ?? [];
  return issueRefs(refs.join(' '));
}

/** Labels on `item` that were last added by an app or bot. Exported for tests. */
export function illegitimateGates(events, labels) {
  const out = [];
  for (const gate of GATE_LABELS.filter(g => labels.includes(g))) {
    const last = events.filter(e => e.event === 'labeled' && e.label?.name === gate).at(-1);
    if (last && (last.performed_via_github_app || last.actor?.type === 'Bot')) {
      out.push({ gate, via: last.performed_via_github_app?.slug ?? last.actor?.login });
    }
  }
  return out;
}

async function auditGates(item) {
  const labels = labelNames(item);
  if (!labels.some(l => GATE_LABELS.includes(l))) return [];
  const events = await ghAll(`/repos/${REPO}/issues/${item.number}/events`);
  const bad = illegitimateGates(events, labels);
  for (const { gate, via } of bad) {
    await act(`#${item.number}: ${gate} was added via ${via} → removing`, async () => {
      await removeLabel(item.number, gate);
      await addLabels(item.number, ['status:needs-human']);
      await comment(item.number, `⚠️ Removed \`${gate}\`: it was added via **${via}**, not by the maintainer. Only a human may add gate labels (docs/agents/OPERATING-MODEL.md §2). Re-add it yourself if it is intended.`);
    });
  }
  return bad.map(b => ({ number: item.number, title: item.title, ...b }));
}

async function main() {
  // Event-driven run: audit only the item that was just labelled.
  if (process.env.GITHUB_EVENT_NAME === 'issues' || process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const item = event.issue ?? event.pull_request;
    // A closed issue may unblock others: fall through to the full run.
    if (!(process.env.GITHUB_EVENT_NAME === 'issues' && event.action === 'closed')) {
      if (GATE_LABELS.includes(event.label?.name)) {
        const fresh = await gh(`/repos/${REPO}/issues/${item.number}`);
        const alerts = await auditGates(fresh);
        log(alerts.length ? `Gate alerts: ${JSON.stringify(alerts)}` : `#${item.number}: ${event.label.name} added by a human, OK`);
        // A human approval makes the issue ready straight away when nothing blocks it.
        if (!alerts.length && event.label.name === 'approved' && !fresh.pull_request) {
          const blockers = [];
          for (const n of issueRefs(formSection(fresh.body, 'Blocked by'))) {
            const b = await gh(`/repos/${REPO}/issues/${n}`).catch(() => null);
            if (b?.state === 'open') blockers.push(n);
          }
          if (readyDecision(labelNames(fresh), blockers) === 'add') {
            await act(`#${fresh.number}: approved and unblocked → status:ready`, () => addLabels(fresh.number, ['status:ready']));
          }
        }
      }
      return;
    }
  }

  const [openIssuesAndPrs, closedRecent, openPrs] = await Promise.all([
    ghAll(`/repos/${REPO}/issues?state=open`),
    ghAll(`/repos/${REPO}/issues?state=closed&since=${new Date(now - 7 * 24 * HOUR).toISOString()}`),
    ghAll(`/repos/${REPO}/pulls?state=open`),
  ]);
  const openIssues = openIssuesAndPrs.filter(i => !i.pull_request);
  const openByNumber = new Map(openIssues.map(i => [i.number, i]));
  const agentPrs = openPrs.filter(p => p.head.ref.startsWith('claude/'));
  const prsByIssue = new Map();
  for (const pr of openPrs) for (const n of linkedIssueNumbers(pr)) prsByIssue.set(n, pr);

  const gateAlerts = [];
  for (const item of openIssuesAndPrs) gateAlerts.push(...await auditGates(item));

  let paused = false;
  try { await gh(`/repos/${REPO}/contents/.agents/PAUSE`); paused = true; } catch { /* not paused */ }

  // 1. Groom readiness
  for (const issue of openIssues) {
    const labels = labelNames(issue);
    if ((!labels.includes('approved') && !labels.includes('on-hold')) || labels.includes('human-only')) continue;
    const blockers = issueRefs(formSection(issue.body, 'Blocked by')).filter(n => openByNumber.has(n));
    const decision = readyDecision(labels, blockers);
    if (decision === 'add') {
      await act(`#${issue.number}: blockers clear → status:ready`, () => addLabels(issue.number, ['status:ready']));
    } else if (decision === 'remove') {
      await act(`#${issue.number}: ${labels.includes('on-hold') ? 'on hold' : `blocked by ${blockers.map(n => `#${n}`).join(', ')}`} → remove status:ready`,
        () => removeLabel(issue.number, 'status:ready'));
    }
  }

  // 2. Stale claims, 3. orphaned in-review issues
  for (const issue of openIssues) {
    const labels = labelNames(issue);
    if (labels.includes('status:claimed') && !prsByIssue.has(issue.number)) {
      const comments = await ghAll(`/repos/${REPO}/issues/${issue.number}/comments`);
      const lastClaim = comments.filter(c => c.body.startsWith('agent-claim')).at(-1);
      const claimedAt = lastClaim ? Date.parse(lastClaim.created_at) : Date.parse(issue.updated_at);
      if (now - claimedAt > STALE_CLAIM_HOURS * HOUR) {
        await act(`#${issue.number}: stale claim → status:ready`, async () => {
          await removeLabel(issue.number, 'status:claimed');
          await addLabels(issue.number, ['status:ready']);
          await comment(issue.number, `agent-release (stale: claimed over ${STALE_CLAIM_HOURS} h ago with no open PR)`);
        });
      }
    }
    if (labels.includes('status:in-review') && !prsByIssue.has(issue.number)) {
      await act(`#${issue.number}: in review but no open PR → status:needs-human`, async () => {
        await removeLabel(issue.number, 'status:in-review');
        await addLabels(issue.number, ['status:needs-human']);
        await comment(issue.number, 'The linked PR was closed without merging. Needs a human decision: re-queue (`status:ready`) or close.');
      });
    }
  }

  // 3b. Closed issues keep no workflow state.
  for (const issue of closedRecent.filter(i => !i.pull_request)) {
    for (const label of labelNames(issue).filter(l => STATE_LABELS.includes(l))) {
      await act(`#${issue.number} (closed): remove ${label}`, () => removeLabel(issue.number, label));
    }
  }

  // 4. Merge conflicts on agent PRs, and CI state for the report
  const prDetails = [];
  for (const pr of openPrs) {
    const full = await gh(`/repos/${REPO}/pulls/${pr.number}`);
    const runs = await gh(`/repos/${REPO}/commits/${pr.head.sha}/check-runs?per_page=100`);
    const failed = runs.check_runs.filter(r => ['failure', 'timed_out', 'cancelled'].includes(r.conclusion)).map(r => r.name);
    const pending = runs.check_runs.some(r => r.status !== 'completed');
    prDetails.push({ pr: full, failed, pending, none: runs.check_runs.length === 0 });
    if (pr.head.ref.startsWith('claude/') && full.mergeable_state === 'dirty') {
      const marker = `<!-- agent-ops:conflict:${pr.head.sha} -->`;
      const comments = await ghAll(`/repos/${REPO}/issues/${pr.number}/comments`);
      if (!comments.some(c => c.body.includes(marker))) {
        await act(`PR #${pr.number}: merge conflict → comment`,
          () => comment(pr.number, `${marker}\nThis PR conflicts with \`main\`. Rebase it (ask the session, or turn on Auto-fix and request a rebase) before review.`));
      }
    }
  }

  // 5. Report
  const readiness = {};
  for (const p of ['P0', 'P1']) {
    const all = (await ghAll(`/repos/${REPO}/issues?state=all&labels=${p}`)).filter(i => !i.pull_request);
    readiness[p] = { closed: all.filter(i => i.state === 'closed').length, total: all.length };
  }
  const report = buildReport({ openIssues, closedRecent, prDetails, agentPrs, paused, readiness, gateAlerts });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  const target = openIssues.find(i => labelNames(i).includes('status-report'));
  if (target) {
    await act(`Updating status report #${target.number}`,
      () => gh(`/repos/${REPO}/issues/${target.number}`, { method: 'PATCH', body: { body: report } }));
  } else {
    log('No open issue labelled status-report; report written to the job summary only.');
  }
}

function buildReport({ openIssues, closedRecent, prDetails, agentPrs, paused, readiness, gateAlerts = [] }) {
  const has = (i, l) => labelNames(i).includes(l);
  const line = i => `- #${i.number} ${i.title}`;
  const list = (items, empty = '_None_') => (items.length ? items.join('\n') : empty);
  const closedIssues = closedRecent.filter(i => !i.pull_request && i.state_reason !== 'not_planned');
  const last24 = closedIssues.filter(i => now - Date.parse(i.closed_at) < 24 * HOUR);

  const pct = ({ closed, total }) => (total ? Math.round((closed / total) * 100) : 0);
  const { P0: p0, P1: p1 } = readiness;
  // P0 weighted 3, P1 weighted 1.
  const weighted = p0.total + p1.total
    ? Math.round(((3 * p0.closed + p1.closed) / (3 * p0.total + p1.total)) * 100)
    : 0;

  const awaiting = prDetails.filter(d => !d.pr.draft).map(({ pr, failed, pending, none }) => {
    const verdicts = labelNames(pr).filter(l => /^(qa|security):/.test(l)).join(' ') || 'not reviewed';
    const ci = none ? 'no CI runs' : failed.length ? `CI failed (${failed.join(', ')})` : pending ? 'CI running' : 'CI green';
    const age = Math.floor((now - Date.parse(pr.created_at)) / (24 * HOUR));
    return `- #${pr.number} ${pr.title} · ${ci} · ${verdicts} · ${age}d old`;
  });
  const drafts = prDetails.filter(d => d.pr.draft).map(({ pr }) => `- #${pr.number} ${pr.title} (draft)`);
  const failedCi = prDetails.filter(d => d.failed.length).map(({ pr, failed }) => `- #${pr.number}: ${failed.join(', ')}`);

  return [
    '<!-- Maintained by .github/workflows/agent-ops.yml. Manual edits are overwritten daily. -->',
    `# 📊 Development status`,
    `_Updated ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC_${paused ? ' · **Agents paused** (`.agents/PAUSE`)' : ''}`,
    '',
    ...(gateAlerts.length ? ['## ⚠️ Gate label alerts', ...gateAlerts.map(a => `- #${a.number} ${a.title}: \`${a.gate}\` added via ${a.via}; removed`), ''] : []),
    '## Launch readiness',
    `- **${weighted}%** weighted (P0 ×3, P1 ×1)`,
    `- P0 closed: **${p0.closed}/${p0.total}** (${pct(p0)}%) · P1 closed: **${p1.closed}/${p1.total}** (${pct(p1)}%)`,
    `- Agent PRs open: ${agentPrs.length} / 2 (WIP limit)`,
    `- Critical path: see the "Critical path" view in the project board`,
    '',
    '## Completed (last 24 h)',
    list(last24.map(line)),
    '',
    `<details><summary>Completed in the last 7 days (${closedIssues.length})</summary>\n\n${list(closedIssues.map(line))}\n</details>`,
    '',
    '## In progress',
    list(openIssues.filter(i => has(i, 'status:claimed')).map(line)),
    '',
    '## Pull requests awaiting review',
    list(awaiting),
    drafts.length ? `\n**Drafts (L3 or failed runs):**\n${drafts.join('\n')}` : '',
    '',
    '## Failed checks',
    list(failedCi),
    '',
    '## Blocked',
    list(openIssues.filter(i => has(i, 'status:blocked')).map(line)),
    '',
    '## Needs you',
    list([
      ...openIssues.filter(i => has(i, 'status:needs-human')).map(i => `${line(i)} (needs human)`),
      ...openIssues.filter(i => has(i, 'status:needs-decision')).map(i => `${line(i)} (needs decision)`),
      ...openIssues.filter(i => has(i, 'human-only') && (has(i, 'P0') || has(i, 'P1'))).map(i => `${line(i)} (human-only)`),
    ]),
    '',
    '## Ready for agents',
    list(openIssues.filter(i => has(i, 'status:ready')).map(line)),
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
