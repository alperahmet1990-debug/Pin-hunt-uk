import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiReply } from './apiReply.mjs';

const api = {
  '/market-valuations': { status: 200, body: { valuations: [] } },
  'GET /price-request': { status: 200, body: { state: 'none' } },
  'POST /price-request': { status: 202, body: { state: 'pending' } },
};

test('matches a path suffix for any method', () => {
  assert.equal(apiReply(api, 'GET', '/api/pins/dp-001/market-valuations'), api['/market-valuations']);
  assert.equal(apiReply(api, 'POST', '/api/pins/dp-001/market-valuations'), api['/market-valuations']);
});

test('a method-prefixed key answers only that method', () => {
  assert.equal(apiReply(api, 'GET', '/api/pins/dp-001/price-request'), api['GET /price-request']);
  assert.equal(apiReply(api, 'POST', '/api/pins/dp-001/price-request'), api['POST /price-request']);
  assert.equal(apiReply({ 'POST /x': { status: 1 } }, 'GET', '/a/x'), null);
});

test('a method key wins over a plain key for the same path', () => {
  assert.deepEqual(apiReply({ '/x': { status: 1 }, 'POST /x': { status: 2 } }, 'POST', '/a/x'), { status: 2 });
  assert.deepEqual(apiReply({ '/x': { status: 1 }, 'POST /x': { status: 2 } }, 'GET', '/a/x'), { status: 1 });
});

test('no api, or no matching path, answers nothing (the request stays blocked)', () => {
  assert.equal(apiReply(undefined, 'GET', '/a/x'), null);
  assert.equal(apiReply(api, 'GET', '/api/scan/identify'), null);
});
