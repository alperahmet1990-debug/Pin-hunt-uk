// Small GitHub REST helpers shared by the agent workflow scripts.
// Runs in GitHub Actions with GITHUB_TOKEN; no third-party actions or packages.

import { readFileSync } from 'node:fs';

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';
export const REPO = process.env.GITHUB_REPOSITORY;

export async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

/** GET every page of a list endpoint. */
export async function ghAll(path) {
  const out = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; page < 50; page++) {
    const batch = await gh(`${path}${sep}per_page=100&page=${page}`);
    const items = Array.isArray(batch) ? batch : (batch.items ?? batch.check_runs ?? []);
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

/**
 * CI state of a commit from its check runs. Only the latest run of each check
 * name counts: workflows with `concurrency: cancel-in-progress` leave cancelled
 * runs behind that a newer run of the same check has replaced. Pure, unit-tested.
 */
export function ciSummary(checkRuns) {
  const latest = new Map();
  for (const run of checkRuns) {
    const prev = latest.get(run.name);
    if (!prev || run.id > prev.id) latest.set(run.name, run);
  }
  const runs = [...latest.values()];
  return {
    failed: runs.filter(r => ['failure', 'timed_out', 'cancelled'].includes(r.conclusion)).map(r => r.name),
    pending: runs.some(r => r.status !== 'completed'),
    none: runs.length === 0,
  };
}

export const labelNames = item => (item.labels ?? []).map(l => (typeof l === 'string' ? l : l.name));

export async function addLabels(number, labels) {
  if (labels.length) await gh(`/repos/${REPO}/issues/${number}/labels`, { method: 'POST', body: { labels } });
}

export async function removeLabel(number, label) {
  try {
    await gh(`/repos/${REPO}/issues/${number}/labels/${encodeURIComponent(label)}`, { method: 'DELETE' });
  } catch (err) {
    if (!String(err.message).includes('404')) throw err;
  }
}

export async function comment(number, body) {
  await gh(`/repos/${REPO}/issues/${number}/comments`, { method: 'POST', body: { body } });
}

/** Minimal glob: ** = any depth, * = within one path segment. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') {
      re += '[^/]*';
    } else {
      re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function loadAgentPaths(file = '.github/agent-paths.json') {
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  return {
    sensitive: cfg.sensitive.map(globToRegExp),
    protected: cfg.protected.map(globToRegExp),
  };
}

/** Text under a "### Heading" in an issue-form body, or '' when absent/empty. */
export function formSection(body, heading) {
  const lines = String(body ?? '').split('\n');
  const start = lines.findIndex(l => l.trim().toLowerCase() === `### ${heading}`.toLowerCase());
  if (start === -1) return '';
  const rest = [];
  for (const line of lines.slice(start + 1)) {
    if (/^###\s/.test(line)) break;
    rest.push(line);
  }
  const text = rest.join('\n').trim();
  return text === '_No response_' ? '' : text;
}

/** Issue numbers referenced as #123 in a piece of text. */
export const issueRefs = text => [...String(text).matchAll(/#(\d+)/g)].map(m => Number(m[1]));
