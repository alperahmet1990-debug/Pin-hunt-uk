import assert from 'node:assert/strict';
import test from 'node:test';
import { duplicateClaims, isSatisfied, phaseOf, rankQueue, readyPlan } from './queue.mjs';
import { columnFor } from './project-sync.mjs';

// Minimal REST-shaped issue builder.
const issue = (number, labels, { state = 'open', state_reason = null, phase = null, blockedBy = [], title = `Issue ${number}` } = {}) => ({
  number, title, state, state_reason,
  labels: labels.map(name => ({ name })),
  body: [
    `**Autonomy:** x · **Phase:** ${phase ?? '—'} (Report 9)`, '',
    '### Blocked by', '', blockedBy.length ? blockedBy.map(n => `#${n}`).join(', ') : '_No response_', '',
  ].join('\n'),
});
const eligible = (n, prio, extra = {}, more = []) => issue(n, [prio, 'size:S', 'autonomy:L1', 'agent:ui', 'approved', ...more], extra);

// The live situation on 12 Oct 2026 that the first scheduled run got wrong.
const live = () => [
  issue(42, ['P1', 'approved'], { state: 'closed', state_reason: 'completed' }), // merged in PR #99
  issue(20, ['P0', 'size:M', 'autonomy:L3'], { blockedBy: [19] }),               // release config
  issue(25, ['P1', 'size:M', 'autonomy:L2'], { blockedBy: [24] }),
  issue(49, ['P1', 'size:S', 'autonomy:L2'], { blockedBy: [48] }),
  issue(84, ['P1', 'human-only'], { blockedBy: [49, 9] }),                       // R9-QA-02, via #49
  issue(52, ['P1', 'size:M', 'autonomy:L1'], { blockedBy: [41, 28] }),
  issue(53, ['P1', 'size:M', 'autonomy:L1'], { blockedBy: [43, 26] }),
  eligible(19, 'P2', { phase: 6 }),
  eligible(24, 'P1', { phase: 3 }),
  eligible(41, 'P1', { phase: 3 }),
  eligible(43, 'P1', { phase: 4, blockedBy: [42] }),
  issue(48, ['P1', 'size:S', 'autonomy:L2', 'agent:backend', 'approved'], { phase: 6 }),
];

test('#19 ranks above #48: unblocking a P0 raises its effective priority', () => {
  const { ranked } = rankQueue(live());
  const order = ranked.map(r => r.number);
  assert.equal(order[0], 19);
  assert.ok(order.indexOf(19) < order.indexOf(48));
  assert.equal(ranked[0].effectivePriority, 0);
  assert.deepEqual(ranked[0].raisedBy, [20]);
});

test('#43 is eligible once #42 has been merged and closed', () => {
  const { ranked, excluded } = rankQueue(live());
  assert.ok(ranked.some(r => r.number === 43));
  assert.ok(!excluded.some(e => e.number === 43));
});

test('full live order: effective priority, then downstream, then phase, then number', () => {
  const { ranked } = rankQueue(live());
  // P1s: #48 has 2 downstream (#49, #84); #24/#41/#43 have 1 each; #24/#41 phase 3 before #43 phase 4.
  assert.deepEqual(ranked.map(r => r.number), [19, 48, 24, 41, 43]);
});

test('an open PR does not satisfy a dependency', () => {
  const issues = [issue(60, ['P1']), eligible(61, 'P1', { blockedBy: [60] })];
  const prs = [{ number: 200, body: 'Closes #60', labels: [] }];
  const { ranked, excluded } = rankQueue(issues, prs);
  assert.equal(ranked.length, 0);
  assert.match(excluded.find(e => e.number === 61).reason, /blocked by #60/);
});

test('closed as not planned, or unknown, prerequisites keep blocking', () => {
  assert.equal(isSatisfied({ state: 'closed', state_reason: 'completed' }), true);
  assert.equal(isSatisfied({ state: 'closed', state_reason: 'not_planned' }), false);
  assert.equal(isSatisfied({ state: 'open' }), false);
  assert.equal(isSatisfied(undefined), false);
  const { ranked } = rankQueue([eligible(70, 'P1', { blockedBy: [999] })]);
  assert.equal(ranked.length, 0, 'unknown blocker blocks');
});

test('held, busy, L3, human-only, unapproved, wrong size and linked-PR issues are excluded', () => {
  const issues = [
    eligible(1, 'P1', {}, ['on-hold']),
    eligible(2, 'P1', {}, ['ux-review-pending']),
    eligible(3, 'P1', {}, ['status:claimed']),
    eligible(4, 'P1', {}, ['status:in-review']),
    eligible(5, 'P1', {}, ['status:blocked']),
    eligible(6, 'P1', {}, ['status:needs-decision']),
    eligible(7, 'P1', {}, ['human-only']),
    issue(8, ['P1', 'size:S', 'autonomy:L3', 'agent:backend', 'approved', 'l3-go']),
    issue(9, ['P1', 'size:S', 'autonomy:L1', 'agent:ui']),
    issue(10, ['P1', 'size:M', 'autonomy:L1', 'agent:ui', 'approved']),
    eligible(11, 'P1'),
    eligible(12, 'P1'),
  ];
  const { ranked, excluded } = rankQueue(issues, [{ number: 300, body: 'Fixes #12' }]);
  assert.deepEqual(ranked.map(r => r.number), [11]);
  const reason = n => excluded.find(e => e.number === n).reason;
  assert.equal(reason(1), 'on hold');
  assert.equal(reason(2), 'on hold');
  assert.equal(reason(3), 'status:claimed');
  assert.equal(reason(4), 'status:in-review');
  assert.equal(reason(7), 'human-only/interactive');
  assert.equal(reason(8), 'not L1/L2');
  assert.equal(reason(9), 'not approved');
  assert.equal(reason(10), 'not size S');
  assert.equal(reason(12), 'open PR');
});

test('only the top-ranked issue is status:ready; every other ready label is removed', () => {
  const issues = live();
  issues.find(i => i.number === 48).labels.push({ name: 'status:ready' });
  issues.find(i => i.number === 24).labels.push({ name: 'status:ready' });
  const { ranked } = rankQueue(issues);
  const plan = readyPlan(ranked, issues);
  assert.equal(plan.top, 19);
  assert.deepEqual(plan.add, [19]);
  assert.deepEqual(plan.remove.sort(), [24, 48]);
  // Idempotent once applied.
  const applied = issues.map(i => ({ ...i, labels: labelsAfter(i, plan) }));
  assert.deepEqual(readyPlan(rankQueue(applied).ranked, applied), { top: 19, add: [], remove: [] });
});
function labelsAfter(i, plan) {
  let l = i.labels.map(x => x.name).filter(n => !(n === 'status:ready' && plan.remove.includes(i.number)));
  if (plan.add.includes(i.number)) l.push('status:ready');
  return l.map(name => ({ name }));
}

test('recalculation: after the top issue is claimed, the next one becomes ready', () => {
  const issues = live();
  const nineteen = issues.find(i => i.number === 19);
  nineteen.labels.push({ name: 'status:claimed' });
  const { ranked } = rankQueue(issues);
  assert.equal(ranked[0].number, 48);
  assert.ok(!ranked.some(r => r.number === 19), 'a claimed issue can never be handed out again');
});

test('recalculation: closing a blocker makes its dependent eligible', () => {
  const issues = [issue(80, ['P1']), eligible(81, 'P1', { blockedBy: [80] })];
  assert.equal(rankQueue(issues).ranked.length, 0);
  issues[0].state = 'closed'; issues[0].state_reason = 'completed';
  assert.deepEqual(rankQueue(issues).ranked.map(r => r.number), [81]);
});

test('approval changes: removing approved drops the issue from the queue', () => {
  const issues = [eligible(90, 'P1'), eligible(91, 'P2')];
  assert.equal(rankQueue(issues).ranked[0].number, 90);
  issues[0].labels = issues[0].labels.filter(l => l.name !== 'approved');
  assert.deepEqual(rankQueue(issues).ranked.map(r => r.number), [91]);
});

test('duplicate claims are detected', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  const c = (session, at = '2026-10-12T11:00:00Z') => ({ id: 1, body: `agent-claim https://claude.ai/code/${session} ${at}`, created_at: at });
  const one = [{ number: 19 }];
  assert.deepEqual(duplicateClaims(one, new Map([[19, [c('session_A')]]]), now), []);
  assert.equal(duplicateClaims(one, new Map([[19, [c('session_A'), c('session_B')]]]), now).length, 1);
  const two = [{ number: 19 }, { number: 48 }];
  const problems = duplicateClaims(two, new Map([[19, [c('session_A')]], [48, [c('session_A')]]]), now);
  assert.ok(problems.some(p => /also claimed/.test(p.reason)));
  assert.ok(problems.some(p => /more than one issue claimed/.test(p.reason)));
});

test('phase parsing and hold column', () => {
  assert.equal(phaseOf('**Autonomy:** L1 · **Phase:** 4 (Report 9)'), 4);
  assert.equal(phaseOf('**Phase:** — (Report 9)'), 99);
  assert.equal(columnFor({ state: 'open', labels: ['approved', 'on-hold'] }), 'Backlog');
  assert.equal(columnFor({ state: 'open', labels: ['approved', 'ux-review-pending'] }), 'Backlog');
});
