#!/usr/bin/env node
// TestFlight feedback → GitHub issues. Reads screenshot feedback and crash
// submissions for one app from the App Store Connect API and files each new
// one as a GitHub issue. Read-only towards Apple; idempotent (issues carry a
// marker with Apple's feedback ID).
//
// Env:
//   ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY   App Store Connect API key (.p8 contents)
//   ASC_APP_ID                                   App Store Connect app ID
//   GITHUB_TOKEN, GITHUB_REPOSITORY              issues: write
//   DRY_RUN=1                                    print instead of creating issues
//   MAX_NEW (default 10)                         cap on issues created per run
//   ASC_API_URL, GITHUB_API_URL                  API base overrides (tests)
//
// See docs/release/TESTFLIGHT-FEEDBACK.md.

import {
  ISSUE_LABELS, KINDS, buildIssue, buildVersion, filedKeys, listUrl, makeAscToken, summariseCrashLog, ASC_API,
} from './lib.mjs';

const env = process.env;
const DRY_RUN = env.DRY_RUN === '1' || env.DRY_RUN === 'true';
const MAX_NEW = Number(env.MAX_NEW ?? 10);
const MAX_PAGES = 3;
const GH_API = env.GITHUB_API_URL ?? 'https://api.github.com';
const ASC_BASE = env.ASC_API_URL ?? ASC_API;
const REPO = env.GITHUB_REPOSITORY;
const APP_ID = env.ASC_APP_ID;

if (!APP_ID || !REPO || !env.GITHUB_TOKEN) {
  console.error('ASC_APP_ID, GITHUB_REPOSITORY and GITHUB_TOKEN are required.');
  process.exit(1);
}

let ascToken;
try {
  ascToken = makeAscToken({ keyId: env.ASC_KEY_ID, issuerId: env.ASC_ISSUER_ID, privateKey: env.ASC_PRIVATE_KEY });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

async function asc(url) {
  const res = await fetch(url.startsWith('http') ? url : `${ASC_BASE}${url}`, {
    headers: { Authorization: `Bearer ${ascToken}`, Accept: 'application/json' },
  });
  if (res.status === 403) {
    throw new Error('App Store Connect returned 403: the API key\'s role cannot read TestFlight feedback. See docs/release/TESTFLIGHT-FEEDBACK.md.');
  }
  if (!res.ok) throw new Error(`App Store Connect ${res.status} for ${new URL(url, ASC_BASE).pathname}`);
  return res.json();
}

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${GH_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${path} → ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function existingIssues() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await gh(`/repos/${REPO}/issues?labels=${ISSUE_LABELS[0]}&state=all&per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function ensureLabel() {
  try {
    await gh(`/repos/${REPO}/labels`, {
      method: 'POST',
      body: { name: ISSUE_LABELS[0], color: '1d76db', description: 'Filed from TestFlight beta feedback' },
    });
  } catch (err) {
    if (err.status !== 422) throw err; // 422 = already exists
  }
}

/** Newest-first submissions of one kind, up to MAX_PAGES pages. */
async function submissions(kind) {
  const items = [];
  let url = listUrl(APP_ID, kind, { base: ASC_BASE });
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await asc(url);
    for (const item of res.data ?? []) items.push({ item, build: buildVersion(item, res.included) });
    url = res.links?.next ?? null;
  }
  return items;
}

const filed = filedKeys(await existingIssues());
let created = 0;
let skipped = 0;

for (const kind of Object.keys(KINDS)) {
  // Oldest first, so issues are numbered in the order testers sent them.
  const pending = (await submissions(kind)).reverse().filter(({ item }) => !filed.has(`${kind}:${item.id}`));
  for (const { item, build } of pending) {
    if (created >= MAX_NEW) { skipped++; continue; }
    let crashSummary = null;
    if (kind === 'crash') {
      const log = await asc(`/v1/betaFeedbackCrashSubmissions/${encodeURIComponent(item.id)}/crashLog?fields[betaCrashLogs]=logText`).catch(() => null);
      crashSummary = summariseCrashLog(log?.data?.attributes?.logText);
    }
    const issue = buildIssue({ kind, item, build, crashSummary, appId: APP_ID });
    if (DRY_RUN) {
      console.log(`--- would create: ${issue.title}\n${issue.body}\n`);
    } else {
      if (created === 0) await ensureLabel();
      const res = await gh(`/repos/${REPO}/issues`, { method: 'POST', body: issue });
      console.log(`created #${res.number}: ${issue.title}`);
    }
    filed.add(`${kind}:${item.id}`);
    created++;
  }
}

console.log(`${DRY_RUN ? 'dry run: ' : ''}${created} new, ${skipped} deferred to the next run (cap ${MAX_NEW}).`);
