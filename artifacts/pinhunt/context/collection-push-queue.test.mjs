import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CollectionPushQueue,
  normalizeCollectionQuantities,
  reconcileCollectionEntry,
} from './collection-push-queue.ts';

const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

test('rapid quantity writes finish with the latest desired value', async () => {
  let persistedQuantity = 1;
  let concurrentWrites = 0;
  let maxConcurrentWrites = 0;
  const sentQuantities = [];

  const queue = new CollectionPushQueue({
    send: async (_pinId, change) => {
      concurrentWrites += 1;
      maxConcurrentWrites = Math.max(maxConcurrentWrites, concurrentWrites);
      sentQuantities.push(change.quantity);
      // Without serialisation, quantity 3 would finish before quantity 2 and
      // the stale quantity 2 response would overwrite the latest value.
      await sleep(change.quantity === 2 ? 20 : 0);
      persistedQuantity = change.quantity;
      concurrentWrites -= 1;
      return { error: null };
    },
    onPendingChange: () => {},
  });

  queue.enqueue('PHUK-TEST', { status: 'owned', quantity: 2 });
  queue.enqueue('PHUK-TEST', { status: 'owned', quantity: 3 });
  await queue.waitForIdle();

  assert.equal(maxConcurrentWrites, 1);
  assert.deepEqual(sentQuantities, [2, 3]);
  assert.equal(persistedQuantity, 3);
});

test('two immediate increment actions both update local and persisted quantity', async () => {
  let localEntry = { status: 'owned', quantity: 1 };
  let persistedQuantity = 1;

  const queue = new CollectionPushQueue({
    send: async (_pinId, change) => {
      await sleep(change.quantity === 2 ? 10 : 0);
      persistedQuantity = change.quantity;
      return { error: null };
    },
    onPendingChange: () => {},
  });

  const adjustQuantity = delta => {
    const quantity = Math.max(1, localEntry.quantity + delta);
    localEntry = { ...localEntry, quantity };
    queue.enqueue('PHUK-TEST', localEntry);
  };

  // Deliberately fire both actions in the same turn, before any render could
  // provide a newer captured entry value to the second handler.
  adjustQuantity(1);
  adjustQuantity(1);
  assert.equal(localEntry.quantity, 3);

  await queue.waitForIdle();
  assert.equal(persistedQuantity, 3);
});

test('a cached pre-quantity entry normalizes before increment and sync', async () => {
  const cachedCollection = {
    'PHUK-LEGACY': {
      pinId: 'PHUK-LEGACY',
      status: 'owned',
      notes: '',
      dateAdded: '2026-01-01T00:00:00.000Z',
    },
  };
  let localEntry = normalizeCollectionQuantities(cachedCollection)['PHUK-LEGACY'];
  let persistedQuantity = 1;

  const queue = new CollectionPushQueue({
    send: async (_pinId, change) => {
      persistedQuantity = change.quantity;
      return { error: null };
    },
    onPendingChange: () => {},
  });

  assert.equal(localEntry.quantity, 1);
  const quantity = Math.max(1, (localEntry.quantity ?? 1) + 1);
  localEntry = { ...localEntry, quantity };
  queue.enqueue(localEntry.pinId, {
    status: localEntry.status,
    quantity: localEntry.quantity,
  });
  await queue.waitForIdle();

  assert.equal(localEntry.quantity, 2);
  assert.equal(persistedQuantity, 2);
});

test('pending hydration flushes even after the initial flush already ran', async () => {
  const sent = [];
  const queue = new CollectionPushQueue({
    send: async (pinId, change) => {
      sent.push([pinId, change.quantity]);
      return { error: null };
    },
    onPendingChange: () => {},
  });

  queue.flush();
  await queue.waitForIdle();
  assert.deepEqual(sent, []);

  queue.hydrate(
    { 'PHUK-PENDING': { status: 'for_trade', quantity: 4 } },
    true,
  );
  await queue.waitForIdle();

  assert.deepEqual(sent, [['PHUK-PENDING', 4]]);
});

test('a stale pull cannot overwrite a local increment with a pending write', async () => {
  let releaseFirstWrite;
  const firstWriteBlocked = new Promise(resolve => {
    releaseFirstWrite = resolve;
  });
  let sendCount = 0;
  let persistedQuantity = 1;
  let localEntry = { status: 'owned', quantity: 1 };

  const queue = new CollectionPushQueue({
    send: async (_pinId, change) => {
      sendCount += 1;
      if (sendCount === 1) await firstWriteBlocked;
      persistedQuantity = change.quantity;
      return { error: null };
    },
    onPendingChange: () => {},
  });

  const adjustQuantity = delta => {
    localEntry = {
      ...localEntry,
      quantity: Math.max(1, (localEntry.quantity ?? 1) + delta),
    };
    queue.enqueue('PHUK-PULL-RACE', localEntry);
  };

  adjustQuantity(1);
  assert.equal(localEntry.quantity, 2);

  // A pull that began before the increment returns the old server quantity.
  localEntry = reconcileCollectionEntry(
    { status: 'owned', quantity: 1 },
    localEntry,
    queue.has('PHUK-PULL-RACE'),
  );
  assert.equal(localEntry.quantity, 2);

  adjustQuantity(1);
  assert.equal(localEntry.quantity, 3);
  releaseFirstWrite();
  await queue.waitForIdle();

  assert.equal(persistedQuantity, 3);
});
// ── Batch mode (sendBatch) ────────────────────────────────────────────────────

const batchQueue = (overrides = {}) => {
  const calls = { batch: [], single: [] };
  const queue = new CollectionPushQueue({
    send: async (pinId, change) => { calls.single.push([pinId, change.status]); return { error: null }; },
    sendBatch: async items => { calls.batch.push(items.map(([id]) => id)); return { error: null, failedKeys: [] }; },
    onPendingChange: () => {},
    ...overrides,
  });
  return { queue, calls };
};
const owned = { status: 'owned', quantity: 1 };

test('enqueueMany sends one batch and clears every pin', async () => {
  const { queue, calls } = batchQueue();
  queue.enqueueMany([['A', owned], ['B', owned], ['C', owned]]);
  await queue.waitForIdle();
  assert.deepEqual(calls.batch, [['A', 'B', 'C']]);
  assert.deepEqual(calls.single, []);
  assert.deepEqual(queue.entries(), []);
});

test('a single ready pin still uses the per-pin path', async () => {
  const { queue, calls } = batchQueue();
  queue.enqueueMany([['A', owned]]);
  await queue.waitForIdle();
  assert.deepEqual(calls.batch, []);
  assert.deepEqual(calls.single, [['A', 'owned']]);
});

test('rejected pins stay pending without a tight retry loop', async () => {
  const { queue, calls } = batchQueue({
    sendBatch: async items => { calls.batch.push(items.map(([id]) => id)); return { error: null, failedKeys: ['B'] }; },
  });
  queue.enqueueMany([['A', owned], ['B', owned]]);
  await queue.waitForIdle();
  assert.deepEqual(queue.entries().map(([id]) => id), ['B']);
  assert.equal(calls.batch.length, 1);
  assert.deepEqual(calls.single, []);
});

test('a failed batch call falls back to per-pin sends', async () => {
  const { queue, calls } = batchQueue({
    sendBatch: async () => ({ error: { message: 'function set_user_pin_statuses does not exist' } }),
  });
  queue.enqueueMany([['A', owned], ['B', owned]]);
  await queue.waitForIdle();
  assert.deepEqual(calls.single.map(([id]) => id).sort(), ['A', 'B']);
  assert.deepEqual(queue.entries(), []);
});

test('a pin changed during an in-flight batch is sent again with the latest value', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { queue, calls } = batchQueue({
    sendBatch: async items => { calls.batch.push(items.map(([id]) => id)); await gate; return { error: null, failedKeys: [] }; },
  });
  queue.enqueueMany([['A', owned], ['B', owned]]);
  queue.enqueue('A', { status: 'none', quantity: 1 });
  release();
  await queue.waitForIdle();
  assert.deepEqual(calls.single, [['A', 'none']]);
  assert.deepEqual(queue.entries(), []);
});

test('large selections are split into maxBatch-sized requests', async () => {
  const { queue, calls } = batchQueue({ maxBatch: 2 });
  queue.enqueueMany(['A', 'B', 'C', 'D', 'E'].map(id => [id, owned]));
  await queue.waitForIdle();
  assert.deepEqual(calls.batch, [['A', 'B'], ['C', 'D']]);
  assert.deepEqual(calls.single, [['E', 'owned']]);
  assert.deepEqual(queue.entries(), []);
});

test('flush sends a hydrated backlog as a batch', async () => {
  const { queue, calls } = batchQueue();
  queue.hydrate({ A: owned, B: owned, C: owned }, true);
  await queue.waitForIdle();
  assert.deepEqual(calls.batch, [['A', 'B', 'C']]);
  assert.deepEqual(queue.entries(), []);
});
