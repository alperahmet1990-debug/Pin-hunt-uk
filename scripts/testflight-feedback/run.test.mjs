// End-to-end: runs run.mjs against a local fake of the App Store Connect and
// GitHub APIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RUN = fileURLToPath(new URL('./run.mjs', import.meta.url));
const APP = '6823062114';
const PEM = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });

function fakeApis({ ascStatus = 200 } = {}) {
  const state = { issues: [], labelPosts: 0, ascQueries: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const base = `http://127.0.0.1:${server.address().port}`;
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (url.pathname.startsWith('/asc/')) {
        if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(req.headers.authorization ?? '')) return send(401, {});
        if (ascStatus !== 200) return send(ascStatus, {});
        state.ascQueries.push(url.search);
        const p = url.pathname.slice(4);
        const included = [{ type: 'builds', id: 'b7', attributes: { version: '7' } }];
        const build = { build: { data: { type: 'builds', id: 'b7' } } };
        if (p === `/v1/apps/${APP}/betaFeedbackScreenshotSubmissions`) {
          return url.searchParams.get('cursor') === '2'
            ? send(200, { data: [{ id: 'S1', attributes: { createdDate: '2026-10-14T10:00:00Z', comment: 'older one' }, relationships: build }], included })
            : send(200, {
              data: [{ id: 'S2', attributes: { createdDate: '2026-10-15T10:00:00Z', comment: 'newer one, mail me a@b.com' }, relationships: build }],
              included,
              links: { next: `${base}/asc${p}?cursor=2` },
            });
        }
        if (p === `/v1/apps/${APP}/betaFeedbackCrashSubmissions`) {
          return send(200, { data: [{ id: 'C1', attributes: { createdDate: '2026-10-15T11:00:00Z', comment: '' }, relationships: build }], included });
        }
        if (p === '/v1/betaFeedbackCrashSubmissions/C1/crashLog') {
          return send(200, { data: { attributes: { logText: 'Incident Identifier: DEVICE\nException Type: EXC_CRASH (SIGABRT)' } } });
        }
        return send(404, {});
      }
      if (req.method === 'GET' && url.pathname === '/gh/repos/o/r/issues') {
        assert.equal(url.searchParams.get('labels'), 'testflight-feedback');
        assert.equal(url.searchParams.get('state'), 'all');
        return send(200, url.searchParams.get('page') === '1' ? state.issues : []);
      }
      if (req.method === 'POST' && url.pathname === '/gh/repos/o/r/issues') {
        const issue = { number: state.issues.length + 1, ...JSON.parse(body) };
        state.issues.push(issue);
        return send(201, issue);
      }
      if (req.method === 'POST' && url.pathname === '/gh/repos/o/r/labels') {
        state.labelPosts++;
        return send(state.labelPosts === 1 ? 201 : 422, {});
      }
      return send(404, {});
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ state, close: () => server.close(), ascUrl: `${base}/asc`, ghUrl: `${base}/gh` });
  }));
}

function run(api, extraEnv = {}) {
  const env = {
    PATH: process.env.PATH,
    ASC_KEY_ID: 'KEY', ASC_ISSUER_ID: 'ISSUER', ASC_PRIVATE_KEY: PEM, ASC_APP_ID: APP,
    ASC_API_URL: api.ascUrl, GITHUB_API_URL: api.ghUrl, GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't',
    ...extraEnv,
  };
  return new Promise(resolve => execFile(process.execPath, [RUN], { env }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
}

test('files new feedback oldest-first across pages, then skips it on the next run', async () => {
  const api = await fakeApis();
  try {
    const first = await run(api);
    assert.equal(first.code, 0, first.stderr);
    assert.deepEqual(api.state.issues.map(i => i.title), [
      'TestFlight feedback: older one',
      'TestFlight feedback: newer one, mail me [email removed]',
      'TestFlight crash: Exception Type: EXC_CRASH (SIGABRT)',
    ]);
    assert.ok(api.state.issues.every(i => i.labels.includes('agent-proposed') && i.labels.includes('testflight-feedback')));
    assert.match(api.state.issues[0].body, /build 7/);
    assert.ok(!api.state.issues[2].body.includes('DEVICE'), 'crash identifiers stay out');
    assert.equal(api.state.labelPosts, 1);
    assert.ok(api.state.ascQueries.every(q => !/email|tester/.test(decodeURIComponent(q))), 'no identity fields requested');

    const second = await run(api);
    assert.equal(second.code, 0, second.stderr);
    assert.equal(api.state.issues.length, 3, 'nothing is filed twice');
    assert.match(second.stdout, /0 new/);
  } finally {
    api.close();
  }
});

test('MAX_NEW caps a run and defers the rest', async () => {
  const api = await fakeApis();
  try {
    const out = await run(api, { MAX_NEW: '1' });
    assert.equal(out.code, 0, out.stderr);
    assert.equal(api.state.issues.length, 1);
    assert.match(out.stdout, /1 new, 2 deferred/);
    await run(api, { MAX_NEW: '1' });
    assert.equal(api.state.issues.length, 2, 'the next run picks up where the last stopped');
  } finally {
    api.close();
  }
});

test('dry run creates nothing', async () => {
  const api = await fakeApis();
  try {
    const out = await run(api, { DRY_RUN: '1' });
    assert.equal(out.code, 0, out.stderr);
    assert.equal(api.state.issues.length, 0);
    assert.equal(api.state.labelPosts, 0);
    assert.match(out.stdout, /would create: TestFlight feedback: older one/);
  } finally {
    api.close();
  }
});

test('a key without permission fails loudly and files nothing', async () => {
  const api = await fakeApis({ ascStatus: 403 });
  try {
    const out = await run(api);
    assert.notEqual(out.code, 0);
    assert.match(out.stderr, /role cannot read TestFlight feedback/);
    assert.equal(api.state.issues.length, 0);
  } finally {
    api.close();
  }
});
