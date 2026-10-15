import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import {
  buildIssue, buildVersion, filedKeys, listUrl, makeAscToken, marker, redact, summariseCrashLog,
} from './lib.mjs';

const APP_ID = '6823062114';

const screenshotItem = {
  type: 'betaFeedbackScreenshotSubmissions',
  id: 'AbC-123_x',
  attributes: {
    createdDate: '2026-10-15T14:27:08.000Z',
    comment: 'Scan screen froze after taking a photo\nThen it recovered',
    deviceModel: 'iPhone17,1',
    osVersion: '26.0',
    screenshots: [{ url: 'https://example.invalid/signed', width: 1, height: 1 }],
  },
  relationships: { build: { data: { type: 'builds', id: 'build-1' } } },
};

test('ASC token is a valid ES256 JWT for the App Store Connect audience', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const token = makeAscToken({ keyId: 'KEY123', issuerId: 'issuer-uuid', privateKey: pem, now: 1_000_000_000_000 });
  const [h, p, s] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.aud, 'appstoreconnect-v1');
  assert.equal(payload.iss, 'issuer-uuid');
  assert.ok(payload.exp - payload.iat <= 20 * 60, 'Apple rejects tokens valid for more than 20 minutes');
  assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('ASC token accepts a key stored with literal \\n escapes', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const escaped = privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n');
  assert.equal(makeAscToken({ keyId: 'K', issuerId: 'I', privateKey: escaped }).split('.').length, 3);
});

test('ASC token refuses to run without credentials', () => {
  assert.throws(() => makeAscToken({ keyId: '', issuerId: 'I', privateKey: 'x' }), /required/);
});

test('list URL never asks Apple for tester identity', () => {
  for (const kind of ['screenshot', 'crash']) {
    const url = new URL(listUrl(APP_ID, kind));
    assert.match(url.pathname, new RegExp(`^/v1/apps/${APP_ID}/betaFeedback(Screenshot|Crash)Submissions$`));
    assert.equal(url.searchParams.get('sort'), '-createdDate');
    assert.equal(url.searchParams.get('include'), 'build');
    const fields = [...url.searchParams.entries()].filter(([k]) => k.startsWith('fields[betaFeedback')).map(([, v]) => v).join(',');
    assert.ok(fields.includes('comment'));
    assert.ok(!/\b(email|tester)\b/.test(fields), `requested identity fields: ${fields}`);
  }
});

test('redact removes emails and phone numbers but keeps dates, versions and ordinary text', () => {
  const out = redact('Mail me at jo.bloggs+pins@example.co.uk or call +44 7700 900123. Seen on 2026-10-15 in v1.0.0, 3 pins.');
  assert.ok(!out.includes('example.co.uk'));
  assert.ok(!out.includes('7700'));
  assert.match(out, /\[email removed\]/);
  assert.match(out, /\[number removed\]/);
  assert.match(out, /2026-10-15/);
  assert.match(out, /v1\.0\.0, 3 pins/);
});

test('redact defuses @mentions and fake markers, and caps length', () => {
  const out = redact('ping @octocat <!-- testflight-feedback:crash:zzz -->');
  assert.ok(!out.includes('@octocat'));
  assert.ok(!out.includes('<!--'));
  assert.equal(filedKeys([{ body: out }]).size, 0, 'a tester cannot forge a dedup marker');
  assert.ok(redact('x'.repeat(10_000)).length < 4100);
});

test('filedKeys reads markers from issue bodies', () => {
  const keys = filedKeys([
    { body: `${marker('screenshot', 'A1')}\nhello` },
    { body: marker('crash', 'B-2') },
    { body: null },
    { body: 'unrelated' },
  ]);
  assert.deepEqual([...keys].sort(), ['crash:B-2', 'screenshot:A1']);
});

test('buildVersion resolves the build number from included builds', () => {
  const included = [{ type: 'builds', id: 'build-1', attributes: { version: '3' } }];
  assert.equal(buildVersion(screenshotItem, included), '3');
  assert.equal(buildVersion(screenshotItem, []), null);
  assert.equal(buildVersion({}, included), null);
});

test('screenshot issue: marker, metadata, quoted comment, no screenshot URLs', () => {
  const issue = buildIssue({ kind: 'screenshot', item: screenshotItem, build: '3', appId: APP_ID });
  assert.equal(issue.title, 'TestFlight feedback: Scan screen froze after taking a photo');
  assert.deepEqual(issue.labels, ['testflight-feedback', 'agent-proposed']);
  assert.ok(issue.body.startsWith(marker('screenshot', 'AbC-123_x')));
  assert.match(issue.body, /build 3 · 2026-10-15 14:27 UTC/);
  assert.match(issue.body, /iPhone17,1 · iOS 26\.0/);
  assert.match(issue.body, /\*\*Screenshots:\*\* 1 \(in App Store Connect only\)/);
  assert.match(issue.body, /> Scan screen froze after taking a photo\n> Then it recovered/);
  assert.ok(!issue.body.includes('example.invalid'), 'signed screenshot URLs must not be published');
  assert.match(issue.body, /appstoreconnect\.apple\.com\/apps\/6823062114\/testflight\/ios/);
  assert.deepEqual([...filedKeys([issue])], ['screenshot:AbC-123_x']);
});

test('crash issue without a comment is titled from the crash summary', () => {
  const item = { id: 'C9', attributes: { createdDate: '2026-10-15T09:00:00Z', comment: '' } };
  const issue = buildIssue({ kind: 'crash', item, build: null, crashSummary: 'Exception Type: EXC_CRASH (SIGABRT)', appId: APP_ID });
  assert.equal(issue.title, 'TestFlight crash: Exception Type: EXC_CRASH (SIGABRT)');
  assert.match(issue.body, /_No comment\._/);
  assert.match(issue.body, /### Crash summary\n```\nException Type: EXC_CRASH \(SIGABRT\)\n```/);
  assert.match(issue.body, /build unknown/);
});

test('long titles are truncated', () => {
  const item = { id: 'L', attributes: { comment: 'a'.repeat(200) } };
  assert.ok(buildIssue({ kind: 'screenshot', item, build: '1', appId: APP_ID }).title.length <= 'TestFlight feedback: '.length + 70);
});

test('crash summary from a text crash log keeps only header fields', () => {
  const log = [
    'Incident Identifier: 1234-ABCD',
    'Hardware Model:      iPhone17,1',
    'Exception Type:  EXC_BAD_ACCESS (SIGSEGV)',
    'Exception Codes: KERN_INVALID_ADDRESS at 0x0000000000000010',
    'Triggered by Thread:  0',
    '',
    'Thread 0 Crashed:',
    '0   PinHunt   0x0000000100abc   someFunction + 12',
  ].join('\n');
  const summary = summariseCrashLog(log);
  assert.equal(summary, [
    'Exception Type: EXC_BAD_ACCESS (SIGSEGV)',
    'Exception Codes: KERN_INVALID_ADDRESS at 0x0000000000000010',
    'Triggered by Thread: 0',
  ].join('\n'));
  assert.ok(!summary.includes('1234-ABCD'), 'device identifiers stay out');
});

test('crash summary from a JSON .ips crash log', () => {
  const ips = '{"app_name":"PinHunt","incident_id":"X"}\n' + JSON.stringify({
    exception: { type: 'EXC_CRASH', signal: 'SIGABRT' },
    termination: { indicator: 'Abort trap: 6' },
    faultingThread: 3,
  });
  assert.equal(summariseCrashLog(ips), 'Exception Type: EXC_CRASH (SIGABRT)\nTermination Reason: Abort trap: 6\nCrashed Thread: 3');
});

test('unrecognised crash logs yield no summary rather than raw text', () => {
  assert.equal(summariseCrashLog('Incident Identifier: secret-device-id\nsome other text'), null);
  assert.equal(summariseCrashLog(undefined), null);
});
