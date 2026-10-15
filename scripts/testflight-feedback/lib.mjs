// TestFlight feedback → GitHub issues: pure helpers (no network).
//
// The repository is public, so everything here errs on the side of leaving
// data in App Store Connect: tester identity is never requested, screenshots
// are counted but not linked, and crash logs are reduced to a few header
// fields. See docs/release/TESTFLIGHT-FEEDBACK.md.

import { createPrivateKey, sign } from 'node:crypto';

export const ASC_API = 'https://api.appstoreconnect.apple.com';
export const ISSUE_LABELS = ['testflight-feedback', 'agent-proposed'];

const MAX_COMMENT = 4000;

/** The two TestFlight feedback types, with the ASC resource each one maps to. */
export const KINDS = {
  screenshot: {
    resource: 'betaFeedbackScreenshotSubmissions',
    label: 'feedback',
    fields: 'createdDate,comment,deviceModel,osVersion,deviceFamily,screenshots,build',
  },
  crash: {
    resource: 'betaFeedbackCrashSubmissions',
    label: 'crash',
    fields: 'createdDate,comment,deviceModel,osVersion,deviceFamily,build',
  },
};

const b64url = (input) => Buffer.from(input).toString('base64url');

/**
 * The .p8 key as a KeyObject, tolerant of how it was pasted into a secret:
 * with or without the BEGIN/END lines, with real or literal \\n line breaks,
 * or squashed onto one line. Never echoes the key in errors.
 */
export function parseP8(privateKey) {
  const body = String(privateKey)
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END)[A-Z ]*-----/g, '')
    .replace(/\s+/g, '');
  const der = /^[A-Za-z0-9+/]+={0,2}$/.test(body) ? Buffer.from(body, 'base64') : null;
  try {
    if (!der?.length) throw new Error('not base64');
    return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } catch {
    throw new Error('ASC_PRIVATE_KEY is not a valid .p8 key. Paste the whole AuthKey_XXXX.p8 file into the secret (see docs/release/TESTFLIGHT-FEEDBACK.md).');
  }
}

/**
 * App Store Connect API token (ES256 JWT), valid for `ttlSeconds` (Apple's
 * maximum is 20 minutes).
 */
export function makeAscToken({ keyId, issuerId, privateKey, now = Date.now(), ttlSeconds = 15 * 60 }) {
  if (!keyId || !issuerId || !privateKey) throw new Error('ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY are required.');
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: issuerId, iat, exp: iat + ttlSeconds, aud: 'appstoreconnect-v1' }));
  const key = parseP8(privateKey);
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(signature)}`;
}

/** First-page URL for one feedback kind. Tester fields are deliberately not requested. */
export function listUrl(appId, kind, { limit = 50, base = ASC_API } = {}) {
  const k = KINDS[kind];
  const params = new URLSearchParams({
    sort: '-createdDate',
    limit: String(limit),
    include: 'build',
    'fields[builds]': 'version',
    [`fields[${k.resource}]`]: k.fields,
  });
  return `${base}/v1/apps/${encodeURIComponent(appId)}/${k.resource}?${params}`;
}

export const marker = (kind, id) => `<!-- testflight-feedback:${kind}:${id} -->`;

/** Every `kind:id` already filed, read from the markers in existing issue bodies. */
export function filedKeys(issues) {
  const keys = new Set();
  for (const issue of issues) {
    for (const m of String(issue.body ?? '').matchAll(/<!-- testflight-feedback:(screenshot|crash):([A-Za-z0-9_-]+) -->/g)) {
      keys.add(`${m[1]}:${m[2]}`);
    }
  }
  return keys;
}

/**
 * Tester text made safe for a public issue: emails and long digit runs
 * (phone numbers) removed, @mentions and HTML comments defused, length capped.
 */
export function redact(text) {
  let out = String(text ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, m => (m.replace(/\D/g, '').length >= 9 ? '[number removed]' : m))
    .replace(/@(?=\w)/g, '@​')
    .replace(/<!--/g, '&lt;!--')
    .trim();
  if (out.length > MAX_COMMENT) out = `${out.slice(0, MAX_COMMENT)}… [truncated]`;
  return out;
}

const CRASH_FIELDS = ['Exception Type', 'Exception Subtype', 'Exception Codes', 'Termination Reason', 'Triggered by Thread', 'Crashed Thread'];

/**
 * A few non-identifying header fields from a crash log, or null. Handles the
 * classic text format and the JSON `.ips` format; anything else is left in
 * App Store Connect rather than guessed at.
 */
export function summariseCrashLog(logText) {
  const text = String(logText ?? '');
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z ]+):\s+(.+)$/.exec(line.trim());
    if (m && CRASH_FIELDS.includes(m[1])) lines.push(`${m[1]}: ${m[2].trim()}`);
  }
  if (lines.length) return lines.slice(0, 6).join('\n');

  for (const chunk of text.split(/\n(?=\{)/)) {
    let doc;
    try { doc = JSON.parse(chunk); } catch { continue; }
    const out = [];
    if (doc?.exception?.type) out.push(`Exception Type: ${doc.exception.type}${doc.exception.signal ? ` (${doc.exception.signal})` : ''}`);
    if (doc?.exception?.subtype) out.push(`Exception Subtype: ${doc.exception.subtype}`);
    if (doc?.termination?.indicator) out.push(`Termination Reason: ${doc.termination.indicator}`);
    if (Number.isInteger(doc?.faultingThread)) out.push(`Crashed Thread: ${doc.faultingThread}`);
    if (out.length) return out.join('\n');
  }
  return null;
}

/** Build number from the `build` relationship, via the response's `included` list. */
export function buildVersion(item, included = []) {
  const id = item?.relationships?.build?.data?.id;
  if (!id) return null;
  return included.find(i => i.type === 'builds' && i.id === id)?.attributes?.version ?? null;
}

function titleText(kind, comment, crashSummary) {
  const firstLine = comment.split('\n').find(l => l.trim())?.trim();
  const fallback = kind === 'crash'
    ? (crashSummary?.split('\n')[0] ?? 'App crashed')
    : 'Screenshot with no comment';
  const text = (firstLine || fallback).replace(/\s+/g, ' ');
  return text.length > 70 ? `${text.slice(0, 69)}…` : text;
}

/** `{ title, body, labels }` for one submission. */
export function buildIssue({ kind, item, build, crashSummary = null, appId }) {
  const a = item.attributes ?? {};
  const comment = redact(a.comment);
  const when = a.createdDate ? new Date(a.createdDate).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown date';
  const device = [a.deviceModel, a.osVersion ? `iOS ${a.osVersion}` : null].filter(Boolean).join(' · ') || 'unknown';
  const lines = [
    marker(kind, item.id),
    `**Source:** TestFlight ${KINDS[kind].label} · build ${build ?? 'unknown'} · ${when}`,
    `**Device:** ${device}`,
  ];
  if (kind === 'screenshot') {
    const count = Array.isArray(a.screenshots) ? a.screenshots.length : 0;
    lines.push(`**Screenshots:** ${count} (in App Store Connect only)`);
  }
  lines.push('', '### Tester comment', comment ? comment.split('\n').map(l => `> ${l}`).join('\n') : '_No comment._');
  if (kind === 'crash') {
    lines.push('', '### Crash summary', crashSummary ? '```\n' + crashSummary.replace(/`/g, "'") + '\n```' : '_No summary; see the full log in App Store Connect._');
  }
  lines.push(
    '',
    `Feedback ID \`${item.id}\` · [TestFlight in App Store Connect](https://appstoreconnect.apple.com/apps/${encodeURIComponent(appId)}/testflight/ios) → Feedback.`,
    '',
    '---',
    '_Filed automatically by the TestFlight feedback workflow. This repository is public: tester identity, screenshots and full crash logs stay in App Store Connect. Triage as usual; nothing here is started until `approved` is added._',
  );
  return {
    title: `TestFlight ${KINDS[kind].label}: ${titleText(kind, comment, crashSummary)}`,
    body: lines.join('\n'),
    labels: ISSUE_LABELS,
  };
}
