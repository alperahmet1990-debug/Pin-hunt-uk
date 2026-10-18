// node --test scripts/lib/webLeakCheck.test.mjs  (#398)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { jwtRole, scanDir, scanText } from './webLeakCheck.mjs';

const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = role => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role, exp: 2000000000 })}.c2lnbmF0dXJlc2lnbmF0dXJl`;

test('the anon key and the Supabase URL are allowed', () => {
  const bundle = `const url="https://abcdefghijklmnopqrst.supabase.co";const key="${jwt('anon')}";`;
  assert.deepEqual(scanText(bundle), []);
});

test('a service-role key is refused', () => {
  assert.equal(jwtRole(jwt('service_role')), 'service_role');
  assert.deepEqual(scanText(`k="${jwt('service_role')}"`), ['JWT with role service_role']);
});

test('other secrets are refused', () => {
  assert.ok(scanText('x="sb_secret_abcdefghijklmnop"').includes('Supabase secret key'));
  assert.ok(scanText('x="sk-proj-abcdefghijklmnopqrstuvwxyz"').includes('OpenAI-style secret key'));
  assert.ok(scanText('{"private_key_id": "1"}').includes('Google service-account key'));
  assert.ok(scanText('PIXIAN_API_SECRET: "abcdefghijk"').includes('server-only setting with a value'));
});

test('a variable name alone is fine (no value next to it)', () => {
  assert.deepEqual(scanText('// set PIXIAN_API_SECRET on the server'), []);
});

test('scanDir reports the file a secret is in', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'leak-'));
  try {
    writeFileSync(path.join(dir, 'ok.js'), `k="${jwt('anon')}"`);
    writeFileSync(path.join(dir, 'bad.js'), `k="${jwt('service_role')}"`);
    writeFileSync(path.join(dir, 'image.png'), `k="${jwt('service_role')}"`);
    assert.deepEqual(scanDir(dir), ['bad.js: JWT with role service_role']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
