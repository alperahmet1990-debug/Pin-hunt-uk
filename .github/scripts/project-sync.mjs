// One-way sync: issue labels → Project "Status" (Kanban column).
//
// Labels are the source of truth for the agent workflow; agents select work by
// labels only (approved + status:ready, and l3-go for L3). The board just
// reflects them. A card dragged to a column its labels don't justify is moved
// back on the next sync, so dragging can never approve work or bypass l3-go.
//
// Needs PROJECT_TOKEN (classic PAT with `project` scope): GITHUB_TOKEN cannot
// write to user-owned Projects. Without it the sync is skipped.

import { REPO, gh, ghAll, labelNames } from './lib.mjs';

export const COLUMNS = ['Backlog', 'Approved', 'In Progress', 'Testing', 'Awaiting Review', 'Done'];
const COLORS = { Backlog: 'GRAY', Approved: 'BLUE', 'In Progress': 'YELLOW', Testing: 'ORANGE', 'Awaiting Review': 'PURPLE', Done: 'GREEN' };
const DESCRIPTIONS = {
  Backlog: 'Not approved yet',
  Approved: 'Has `approved` (agent-eligible once `status:ready`)',
  'In Progress': 'An agent claimed it (`status:claimed`)',
  Testing: 'PR open; CI and the review agent are checking it',
  'Awaiting Review': 'Needs you: PR reviewed, or needs-human / needs-decision / blocked',
  Done: 'Closed',
};

/**
 * Column for an issue, from its state and labels plus the labels of its open
 * linked PR (if any). Pure function, unit-tested.
 */
export function columnFor({ state, labels, prLabels = null }) {
  if (state === 'closed' || state === 'CLOSED') return 'Done';
  const has = l => labels.includes(l);
  if (has('status:needs-human') || has('status:needs-decision') || has('status:blocked')) return 'Awaiting Review';
  if (has('status:in-review')) {
    const reviewed = (prLabels ?? []).some(l => /^(qa|security):(pass|fail|changes)$/.test(l));
    return reviewed ? 'Awaiting Review' : 'Testing';
  }
  if (has('status:claimed')) return 'In Progress';
  if (has('approved')) return 'Approved';
  return 'Backlog';
}

async function graphql(query, variables) {
  const res = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PROJECT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

/** Make sure the Status field has exactly the Kanban columns, in order. */
export async function ensureColumns(field) {
  const names = field.options.map(o => o.name);
  if (JSON.stringify(names) === JSON.stringify(COLUMNS)) return field;
  const data = await graphql(`mutation($f: ID!, $opts: [ProjectV2SingleSelectFieldOptionInput!]) {
    updateProjectV2Field(input: { fieldId: $f, singleSelectOptions: $opts }) {
      projectV2Field { ... on ProjectV2SingleSelectField { id options { id name } } } } }`,
  { f: field.id, opts: COLUMNS.map(name => ({ name, color: COLORS[name], description: DESCRIPTIONS[name] })) });
  return data.updateProjectV2Field.projectV2Field;
}

export async function syncProject({ dryRun = false, log = console.log } = {}) {
  if (!process.env.PROJECT_TOKEN) {
    log('PROJECT_TOKEN not set; skipping Project status sync.');
    return { skipped: true };
  }
  const owner = process.env.PROJECT_OWNER ?? REPO.split('/')[0];
  const number = Number(process.env.PROJECT_NUMBER ?? 1);

  const head = await graphql(`query($o: String!, $n: Int!) { user(login: $o) { projectV2(number: $n) {
    id field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } } } } }`, { o: owner, n: number });
  const project = head.user.projectV2;
  const field = dryRun ? project.field : await ensureColumns(project.field);
  const optionId = Object.fromEntries(field.options.map(o => [o.name, o.id]));

  // All items currently in the Project.
  const items = [];
  let cursor = null;
  do {
    const page = await graphql(`query($id: ID!, $after: String) { node(id: $id) { ... on ProjectV2 {
      items(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id
        status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        content { __typename ... on Issue { number state repository { nameWithOwner } labels(first: 50) { nodes { name } } } } } } } } }`,
    { id: project.id, after: cursor });
    const conn = page.node.items;
    items.push(...conn.nodes);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);

  // Labels of open PRs, keyed by the issue they close.
  const prLabelsByIssue = new Map();
  for (const pr of await ghAll(`/repos/${REPO}/pulls?state=open`)) {
    const refs = (String(pr.body ?? '').match(/\b(?:closes|fixes|resolves)\s+#\d+/gi) ?? []).map(r => Number(r.split('#')[1]));
    for (const n of refs) prLabelsByIssue.set(n, labelNames(pr));
  }

  // Open repo issues missing from the Project get added (Backlog/Approved/...).
  const inProject = new Set(items.filter(i => i.content?.__typename === 'Issue').map(i => i.content.number));
  for (const issue of (await ghAll(`/repos/${REPO}/issues?state=open`)).filter(i => !i.pull_request && !inProject.has(i.number))) {
    if (labelNames(issue).includes('status-report')) continue;
    log(`add #${issue.number} to Project`);
    if (!dryRun) {
      const added = await graphql(`mutation($p: ID!, $c: ID!) { addProjectV2ItemById(input: { projectId: $p, contentId: $c }) { item { id } } }`,
        { p: project.id, c: issue.node_id });
      items.push({ id: added.addProjectV2ItemById.item.id, status: null,
        content: { __typename: 'Issue', number: issue.number, state: issue.state, repository: { nameWithOwner: REPO }, labels: { nodes: issue.labels } } });
    }
  }

  let changed = 0;
  for (const item of items) {
    const c = item.content;
    if (c?.__typename !== 'Issue' || c.repository.nameWithOwner.toLowerCase() !== REPO.toLowerCase()) continue;
    const labels = c.labels.nodes.map(l => l.name);
    if (labels.includes('status-report')) continue;
    const want = columnFor({ state: c.state, labels, prLabels: prLabelsByIssue.get(c.number) });
    if (item.status?.name === want) continue;
    changed++;
    log(`#${c.number}: ${item.status?.name ?? '(none)'} → ${want}`);
    if (!dryRun) {
      await graphql(`mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) { updateProjectV2ItemFieldValue(input: {
        projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { projectV2Item { id } } }`,
      { p: project.id, i: item.id, f: field.id, o: optionId[want] });
    }
  }
  log(`Project status sync: ${changed} change(s)${dryRun ? ' (dry run)' : ''}.`);
  return { changed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncProject({ dryRun: process.env.DRY_RUN === '1' }).catch(err => { console.error(err); process.exit(1); });
}
