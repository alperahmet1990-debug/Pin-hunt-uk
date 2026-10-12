// Independent QA and security review of a pull request (OPERATING-MODEL §5).
//
// Runs in GitHub Actions on pull_request_target from the default branch, so a
// PR can never change its own reviewer. It never checks out or executes PR
// code: it reads the diff, the linked issue and the screenshots through the
// API and asks Claude for a verdict with no tools, in one call per review.
// Verdicts are published as the "QA review" and "Security review" check runs,
// which only GitHub Actions can create; development agents cannot forge them.
//
// Every new commit (and every edit of the PR text) triggers a fresh review of
// the new head. Any error or refusal fails closed.

import { readFileSync } from 'node:fs';
import { REPO, addLabels, gh, ghAll, issueRefs, labelNames, loadAgentPaths, removeLabel } from './lib.mjs';
import { securityRequired } from './risk.mjs';

const MODEL = process.env.REVIEW_MODEL || 'claude-opus-5-5';
const MAX_DIFF_CHARS = 350_000;
const MAX_IMAGES = 16;
const MAX_IMAGE_BYTES = 4_000_000;

export const QA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'criteria', 'screenshots', 'scope', 'required_fixes', 'notes'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    criteria: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['criterion', 'status', 'evidence'],
        properties: { criterion: { type: 'string' }, status: { type: 'string', enum: ['met', 'not_met', 'not_verifiable'] }, evidence: { type: 'string' } },
      },
    },
    screenshots: { type: 'string' },
    scope: { type: 'string' },
    required_fixes: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
  },
};

export const SECURITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'changes'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['severity', 'file', 'issue', 'fix'],
        properties: { severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }, file: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } },
      },
    },
  },
};

/** A QA pass must be internally consistent; the model's word alone is not enough. */
export function qaPasses(r) {
  return r.verdict === 'pass' && r.required_fixes.length === 0 && r.criteria.length > 0 && !r.criteria.some(c => c.status === 'not_met');
}

/** Security passes only with no finding above low. */
export function securityPasses(r) {
  return r.verdict === 'pass' && !r.findings.some(f => f.severity !== 'low');
}

/** Screenshot URLs in the PR body that point at this repository's agent-artifacts. */
export function screenshotUrls(body, repo) {
  const prefix = `https://raw.githubusercontent.com/${repo}/`.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`${prefix}[0-9a-f]{7,40}/(?:issue|pr)-\\d+/(?:before|after)/[\\w.-]+\\.png`, 'gi');
  const urls = [...new Set(String(body ?? '').match(re) ?? [])];
  // Prefer the 390-pt captures when there are too many.
  return urls.sort((a, b) => Number(!/390x/.test(a)) - Number(!/390x/.test(b))).slice(0, MAX_IMAGES);
}

/** Untrusted text wrapped so the reviewer treats it as data. */
const data = (tag, text) => `<${tag}>\n${String(text ?? '').replaceAll(`</${tag}>`, `</ ${tag}>`)}\n</${tag}>`;

export function buildContext({ pr, issues, maintainerComments, files, ciSummary }) {
  let diff = '';
  for (const f of files) {
    diff += `\n### ${f.status} ${f.filename}${f.previous_filename ? ` (from ${f.previous_filename})` : ''} (+${f.additions}/-${f.deletions})\n`;
    diff += f.patch ? `${f.patch}\n` : '(no textual diff: binary or too large)\n';
  }
  return {
    tooLarge: diff.length > MAX_DIFF_CHARS,
    text: [
      `Repository: ${REPO}. Pull request #${pr.number}, head ${pr.head.sha}, branch ${pr.head.ref}.`,
      data('pr_title', pr.title),
      data('pr_body', pr.body),
      ...issues.map(i => data(`linked_issue_${i.number}`, `${i.title}\nLabels: ${labelNames(i).join(', ')}\n\n${i.body ?? ''}`)),
      data('maintainer_comments_on_linked_issue', maintainerComments.join('\n---\n') || '(none)'),
      data('ci_status_at_review_time', ciSummary || '(no checks yet; CI is enforced separately)'),
      data('diff', diff.slice(0, MAX_DIFF_CHARS)),
    ].join('\n\n'),
  };
}

export async function askClaude(client, system, content, schema) {
  const message = await client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  }).finalMessage();
  if (message.stop_reason === 'refusal') throw new Error(`the model declined (${message.stop_details?.category ?? 'no category'})`);
  if (message.stop_reason === 'max_tokens') throw new Error('the review was cut off (max_tokens)');
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

async function fetchImages(urls) {
  const blocks = [];
  for (const url of urls) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) { blocks.push({ type: 'text', text: `Screenshot missing (HTTP ${res?.status ?? 'error'}): ${url}` }); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) { blocks.push({ type: 'text', text: `Screenshot too large to review: ${url}` }); continue; }
    blocks.push({ type: 'text', text: `Screenshot: ${url.split('/').slice(-3).join('/')}` });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: buf.toString('base64') } });
  }
  return blocks;
}

function qaComment(r, pass, sha, advisory) {
  const rows = r.criteria.map(c => `| ${c.criterion.replaceAll('|', '\\|')} | ${{ met: 'Met', not_met: '**Not met**', not_verifiable: 'Not verifiable' }[c.status]} | ${c.evidence.replaceAll('|', '\\|')} |`);
  return [
    `<!-- agent-review:qa:${sha} -->`,
    '## QA review — 🔍 Roz (automated)',
    `**Verdict: ${pass ? 'PASS' : 'FAIL'}**${advisory ? ' (advisory: not an agent branch)' : ''} · head \`${sha.slice(0, 7)}\``,
    '', r.summary, '',
    '| Acceptance criterion | Status | Evidence |', '|---|---|---|', ...rows, '',
    `**Screenshots:** ${r.screenshots}`, '', `**Scope:** ${r.scope}`, '',
    r.required_fixes.length ? `**Required fixes**\n${r.required_fixes.map(f => `1. ${f}`).join('\n')}` : '**Required fixes:** none',
    r.notes.length ? `\n**Notes**\n${r.notes.map(n => `- ${n}`).join('\n')}` : '',
    '', `_Independent review by the Agent review workflow (${MODEL}). CI results are enforced separately by branch protection._`,
  ].join('\n');
}

function securityComment(r, pass, sha) {
  const findings = r.findings.length
    ? r.findings.map(f => `- **${f.severity}** \`${f.file}\`: ${f.issue} **Fix:** ${f.fix}`).join('\n')
    : 'No findings.';
  return [
    `<!-- agent-review:security:${sha} -->`,
    '## Security review — 🛡️ Baymax (automated)',
    `**Verdict: ${pass ? 'PASS' : 'CHANGES REQUIRED'}** · head \`${sha.slice(0, 7)}\``,
    '', r.summary, '', findings,
    '', `_Independent review by the Agent review workflow (${MODEL})._`,
  ].join('\n');
}

async function setVerdictLabels(number, prefix, value, labels) {
  for (const l of labels.filter(l => l.startsWith(`${prefix}:`) && l !== `${prefix}:${value}` && l !== 'security:required')) await removeLabel(number, l);
  await addLabels(number, [`${prefix}:${value}`]);
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = await gh(`/repos/${REPO}/pulls/${event.pull_request.number}`);
  if (pr.draft || pr.state !== 'open') return console.log('Draft or closed; nothing to review.');
  if (!process.env.ANTHROPIC_API_KEY) {
    // No check runs: required checks stay "not reported", so nothing can merge.
    return console.log('ANTHROPIC_API_KEY is not configured for the agent-review environment; skipping.');
  }
  const sha = pr.head.sha;
  const advisory = !pr.head.ref.startsWith('claude/');
  const start = name => gh(`/repos/${REPO}/check-runs`, { method: 'POST', body: { name, head_sha: sha, status: 'in_progress' } });
  const [qaRun, secRun] = await Promise.all([start('QA review'), start('Security review')]);
  const finish = (run, conclusion, title, summary) => gh(`/repos/${REPO}/check-runs/${run.id}`, {
    method: 'PATCH', body: { status: 'completed', conclusion, output: { title, summary: summary.slice(0, 60000) } },
  });
  // A failing verdict on a non-agent PR is advisory: those PRs are merged by hand.
  const failConclusion = advisory ? 'neutral' : 'failure';

  try {
    const paths = loadAgentPaths();
    const files = await ghAll(`/repos/${REPO}/pulls/${pr.number}/files`);
    const linked = [...new Set(issueRefs((String(pr.body).match(/\b(?:closes|fixes|resolves)\s+#\d+/gi) ?? []).join(' ')))];
    const issues = (await Promise.all(linked.map(n => gh(`/repos/${REPO}/issues/${n}`).catch(() => null)))).filter(Boolean);
    const maintainerComments = [];
    for (const issue of issues) {
      for (const c of await ghAll(`/repos/${REPO}/issues/${issue.number}/comments`)) {
        if (!c.performed_via_github_app && c.user?.type !== 'Bot' && c.author_association === 'OWNER') maintainerComments.push(`#${issue.number} ${c.created_at}: ${c.body}`);
      }
    }
    const { check_runs: runs } = await gh(`/repos/${REPO}/commits/${sha}/check-runs?per_page=100`);
    const ciSummary = runs.filter(r => !['QA review', 'Security review', 'Merge gate'].includes(r.name)).map(r => `${r.name}: ${r.conclusion ?? r.status}`).join('\n');
    const changed = files.flatMap(f => [f.filename, f.previous_filename].filter(Boolean));
    const needsSecurity = securityRequired({ files: changed, issueLabels: issues.flatMap(labelNames), prLabels: labelNames(pr), paths });
    const { text, tooLarge } = buildContext({ pr, issues, maintainerComments: maintainerComments.slice(-10), files, ciSummary });

    for (const prefix of ['qa', 'security']) for (const l of labelNames(pr).filter(l => l.startsWith(`${prefix}:`) && l !== 'security:required')) await removeLabel(pr.number, l);

    if (tooLarge) {
      const why = 'The diff is too large for automated review. The maintainer must review and merge this PR by hand.';
      await finish(qaRun, failConclusion, 'Too large for automated review', why);
      await finish(secRun, needsSecurity ? failConclusion : 'success', needsSecurity ? 'Too large for automated review' : 'Not required', why);
      return;
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic();
    const qaSystem = readFileSync('.github/agent-review/qa.md', 'utf8');
    const secSystem = readFileSync('.github/agent-review/security.md', 'utf8');
    const images = await fetchImages(screenshotUrls(pr.body, REPO));

    const [qa, sec] = await Promise.all([
      askClaude(client, qaSystem, [{ type: 'text', text }, ...images], QA_SCHEMA),
      needsSecurity ? askClaude(client, secSystem, [{ type: 'text', text }], SECURITY_SCHEMA) : null,
    ]);

    const qaOk = qaPasses(qa);
    await gh(`/repos/${REPO}/issues/${pr.number}/comments`, { method: 'POST', body: { body: qaComment(qa, qaOk, sha, advisory) } });
    await finish(qaRun, qaOk ? 'success' : failConclusion, qaOk ? 'QA passed' : 'QA failed', qaComment(qa, qaOk, sha, advisory));
    await setVerdictLabels(pr.number, 'qa', qaOk ? 'pass' : 'fail', labelNames(pr));

    if (!sec) {
      await finish(secRun, 'success', 'Not required', 'No sensitive or protected paths and the linked issue is L1, so no security review is required.');
    } else {
      const secOk = securityPasses(sec);
      await gh(`/repos/${REPO}/issues/${pr.number}/comments`, { method: 'POST', body: { body: securityComment(sec, secOk, sha) } });
      await finish(secRun, secOk ? 'success' : failConclusion, secOk ? 'Security passed' : 'Security changes required', securityComment(sec, secOk, sha));
      await setVerdictLabels(pr.number, 'security', secOk ? 'pass' : 'changes', labelNames(pr));
    }
  } catch (err) {
    // Fail closed: an incomplete review never lets a PR through.
    const why = `The automated review could not complete: ${String(err.message ?? err).slice(0, 500)}. Re-run the workflow, or review by hand.`;
    console.error(err);
    await finish(qaRun, failConclusion, 'Review error', why).catch(() => {});
    await finish(secRun, failConclusion, 'Review error', why).catch(() => {});
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
