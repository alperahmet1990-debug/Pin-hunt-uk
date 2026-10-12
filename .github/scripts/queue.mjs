// Deterministic task selection for the autonomous queue (docs/agents/OPERATING-MODEL.md §4).
// Agent ops owns ranking: only the top-ranked eligible issue gets `status:ready`,
// so development agents never interpret ordering rules themselves.

import { formSection, issueRefs, labelNames } from './lib.mjs';

export const HOLD_LABELS = ['on-hold', 'ux-review-pending'];
const BUSY_LABELS = ['status:claimed', 'status:in-review', 'status:blocked', 'status:needs-human', 'status:needs-decision'];
const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };
const NO_PHASE = 99;

const priorityOf = labels => Math.min(4, ...labels.map(l => PRIORITY[l] ?? 4));
export function phaseOf(body) {
  const m = String(body ?? '').match(/\*\*Phase:\*\*\s*(\d+)/);
  return m ? Number(m[1]) : NO_PHASE;
}
const blockersOf = issue => [...new Set(issueRefs(formSection(issue.body, 'Blocked by')))];

/**
 * A prerequisite is satisfied only when its issue is closed as completed.
 * An open PR does not count; an issue closed as "not planned", or a reference
 * we can't find, keeps blocking (fail safe, so a human looks at it).
 */
export function isSatisfied(issue) {
  return Boolean(issue) && issue.state === 'closed' && issue.state_reason !== 'not_planned';
}

/** Why an issue is not eligible, or null when it is. */
export function ineligibleReason(issue, { byNumber, prLinkedIssues }) {
  const labels = labelNames(issue);
  const has = l => labels.includes(l);
  if (issue.pull_request) return 'pull request';
  if (issue.state !== 'open') return 'closed';
  if (!has('approved')) return 'not approved';
  if (has('human-only') || has('interactive')) return 'human-only/interactive';
  if (labels.some(l => HOLD_LABELS.includes(l))) return 'on hold';
  if (!has('autonomy:L1') && !has('autonomy:L2')) return 'not L1/L2';
  if (!has('size:S')) return 'not size S';
  if (!has('agent:ui') && !has('agent:backend')) return 'no agent queue';
  const busy = labels.find(l => BUSY_LABELS.includes(l));
  if (busy) return busy;
  if (prLinkedIssues.has(issue.number)) return 'open PR';
  const open = blockersOf(issue).filter(n => !isSatisfied(byNumber.get(n)));
  if (open.length) return `blocked by ${open.map(n => `#${n}`).join(', ')}`;
  return null;
}

/** Open issues that (transitively) list `number` in their Blocked by. */
function dependentsOf(number, openIssues) {
  const direct = new Map();
  for (const i of openIssues) for (const b of blockersOf(i)) {
    if (!direct.has(b)) direct.set(b, []);
    direct.get(b).push(i);
  }
  const seen = new Map();
  const stack = [...(direct.get(number) ?? [])];
  while (stack.length) {
    const i = stack.pop();
    if (seen.has(i.number) || i.number === number) continue;
    seen.set(i.number, i);
    stack.push(...(direct.get(i.number) ?? []));
  }
  return [...seen.values()];
}

/**
 * Rank all eligible issues.
 * @param issues every issue in the repo (open and closed), REST shape
 * @param prs    open pull requests, REST shape
 * Keys: effective priority (own P-label raised to the highest priority of any
 * open issue that transitively depends on it) → number of open downstream
 * dependents (more first) → launch phase (lower first) → issue number.
 */
export function rankQueue(issues, prs = []) {
  const real = issues.filter(i => !i.pull_request);
  const byNumber = new Map(real.map(i => [i.number, i]));
  const openIssues = real.filter(i => i.state === 'open');
  const prLinkedIssues = new Set(prs.flatMap(pr =>
    (String(pr.body ?? '').match(/\b(?:closes|fixes|resolves)\s+#\d+/gi) ?? []).map(r => Number(r.split('#')[1]))));

  const ranked = [];
  const excluded = [];
  for (const issue of openIssues) {
    const reason = ineligibleReason(issue, { byNumber, prLinkedIssues });
    if (reason) { excluded.push({ number: issue.number, reason }); continue; }
    const labels = labelNames(issue);
    const deps = dependentsOf(issue.number, openIssues);
    const own = priorityOf(labels);
    const effective = Math.min(own, ...deps.map(d => priorityOf(labelNames(d))));
    ranked.push({
      number: issue.number,
      title: issue.title,
      ownPriority: own,
      effectivePriority: effective,
      downstream: deps.length,
      raisedBy: deps.filter(d => priorityOf(labelNames(d)) === effective && effective < own).map(d => d.number),
      phase: phaseOf(issue.body),
    });
  }
  ranked.sort((a, b) =>
    a.effectivePriority - b.effectivePriority ||
    b.downstream - a.downstream ||
    a.phase - b.phase ||
    a.number - b.number);
  return { ranked, excluded };
}

/**
 * Labels to change so that exactly one open issue (the top-ranked) has
 * status:ready. Ready only marks "next"; the dev routine's single-runner lock
 * still stops a second agent while one is working.
 */
export function readyPlan(ranked, openIssues) {
  const top = ranked[0]?.number ?? null;
  const currentlyReady = openIssues.filter(i => !i.pull_request && labelNames(i).includes('status:ready')).map(i => i.number);
  return {
    top,
    add: top !== null && !currentlyReady.includes(top) ? [top] : [],
    remove: currentlyReady.filter(n => n !== top),
  };
}

/** Issues claimed by more than one agent session (should never happen). */
export function duplicateClaims(claimedIssues, commentsByIssue, now = Date.now(), windowHours = 24) {
  const problems = [];
  const sessions = new Map();
  for (const issue of claimedIssues) {
    const claims = (commentsByIssue.get(issue.number) ?? [])
      .filter(c => c.body.startsWith('agent-claim') && now - Date.parse(c.created_at) < windowHours * 3_600_000);
    const ids = [...new Set(claims.map(c => (c.body.match(/session_[A-Za-z0-9]+/) ?? [c.id])[0]))];
    if (ids.length > 1) problems.push({ number: issue.number, reason: `claimed by ${ids.length} sessions` });
    for (const id of ids) {
      if (sessions.has(id) && sessions.get(id) !== issue.number) {
        problems.push({ number: issue.number, reason: `session also claimed #${sessions.get(id)}` });
      }
      sessions.set(id, issue.number);
    }
  }
  if (claimedIssues.length > 1) {
    for (const issue of claimedIssues.slice(1)) problems.push({ number: issue.number, reason: `more than one issue claimed (#${claimedIssues.map(i => i.number).join(', #')})` });
  }
  return problems;
}
