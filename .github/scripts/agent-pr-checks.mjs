// Pull request guard for the agent workflow (see docs/agents/OPERATING-MODEL.md).
//
// All PRs:
//   - add `security:required` when sensitive paths change, or when the linked
//     issue is autonomy:L2/L3
//   - on new commits, remove `merge-approved`: an approval covers one head only
// claude/* PRs (agent work) additionally fail when:
//   - protected paths change without the human-only `human-approved-config` label
//   - an existing migration is modified, renamed or deleted
//   - a required PR-template section is missing or empty, or there is no "Closes #N"

import { readFileSync } from 'node:fs';
import { REPO, addLabels, comment, gh, ghAll, issueRefs, labelNames, loadAgentPaths, removeLabel } from './lib.mjs';

const REQUIRED_SECTIONS = [
  'Linked issue',
  'Summary of changes',
  'Acceptance criteria',
  'Tests',
  'Regression checks',
  'Screenshots',
  'Limitations',
  'Risk and rollback',
  'Human steps required',
];

/** Section text under "## Heading", with HTML comments removed. */
export function prSection(body, heading) {
  const clean = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const match = clean.split(/^## /m).find(part => part.startsWith(`${heading}\n`) || part.trim() === heading);
  if (match === undefined) return null;
  return match.slice(heading.length).trim();
}

export function templateProblems(body) {
  const problems = [];
  for (const heading of REQUIRED_SECTIONS) {
    const text = prSection(body, heading);
    if (text === null) problems.push(`Missing section "## ${heading}".`);
    else if (!text.replace(/^-\s*\[\s?\]\s*$/gm, '').replace(/Closes #\s*$/m, '').trim()) {
      problems.push(`Section "## ${heading}" is empty.`);
    }
  }
  if (!/\b(closes|fixes|resolves)\s+#\d+/i.test(String(body))) problems.push('No "Closes #<issue>" reference.');
  return problems;
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  const isAgent = pr.head.ref.startsWith('claude/');
  const labels = labelNames(pr);
  const paths = loadAgentPaths();
  const files = await ghAll(`/repos/${REPO}/pulls/${pr.number}/files`);
  const failures = [];

  const touched = files.flatMap(f => [f.filename, f.previous_filename].filter(Boolean));
  const sensitive = touched.filter(f => paths.sensitive.some(re => re.test(f)));

  const linked = issueRefs((String(pr.body).match(/\b(?:closes|fixes|resolves)\s+#\d+/gi) ?? []).join(' '));
  let linkedAutonomy = [];
  for (const number of linked) {
    try {
      const issue = await gh(`/repos/${REPO}/issues/${number}`);
      linkedAutonomy.push(...labelNames(issue).filter(l => /^autonomy:L[23]$/.test(l)));
    } catch { /* missing issue is reported by the template check */ }
  }

  if (event.action === 'synchronize' && labels.includes('merge-approved')) {
    await removeLabel(pr.number, 'merge-approved');
    await comment(pr.number, `New commits were pushed, so \`merge-approved\` was removed. Re-add it after the fresh review of \`${pr.head.sha.slice(0, 7)}\` if you still approve the merge.`);
    console.log('Removed merge-approved after new commits.');
  }

  if ((sensitive.length || linkedAutonomy.length) && !labels.includes('security:required')) {
    await addLabels(pr.number, ['security:required']);
    console.log(`Added security:required (${[...sensitive, ...linkedAutonomy].join(', ')})`);
  }

  if (isAgent) {
    const protectedHits = touched.filter(f => paths.protected.some(re => re.test(f)));
    if (protectedHits.length && !labels.includes('human-approved-config')) {
      failures.push(`Protected paths changed without the human-approved-config label: ${protectedHits.join(', ')}`);
    }
    const migrationEdits = files.filter(f =>
      (f.filename.startsWith('supabase/migrations/') || f.previous_filename?.startsWith('supabase/migrations/')) &&
      f.status !== 'added');
    if (migrationEdits.length) {
      failures.push(`Existing migrations are immutable; add a new file instead: ${migrationEdits.map(f => f.filename).join(', ')}`);
    }
    failures.push(...templateProblems(pr.body));
  }

  if (failures.length) {
    console.error(failures.map(f => `- ${f}`).join('\n'));
    process.exit(1);
  }
  console.log('Agent PR checks passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
