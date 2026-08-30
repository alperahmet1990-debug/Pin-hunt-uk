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