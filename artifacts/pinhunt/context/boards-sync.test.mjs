import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boardChangesMatch,
  boardToRow,
  reconcileBoards,
  rowToBoard,
} from './boards-sync.ts';
import { PushQueue } from './collection-push-queue.ts';

const board = (id, name = id, pinIds = []) => ({
  id, name, pinIds, createdAt: '2026-10-01T00:00:00.000Z', isCustom: true,
});
const ids = boards => boards.map(b => b.id);

test('first sync on a device keeps and uploads local-only boards', () => {
  const { boards, toPush } = reconcileBoards(
    [board('a')], [board('b')], new Set(), true,
  );
  assert.deepEqual(ids(boards), ['a', 'b']);
  assert.deepEqual(ids(toPush), ['b']);
});

test('returning device drops boards deleted on another device', () => {
  const { boards, toPush } = reconcileBoards(
    [board('a')], [board('a'), board('gone')], new Set(), false,
  );
  assert.deepEqual(ids(boards), ['a']);
  assert.deepEqual(toPush, []);
});

test('server edits win unless the board has a local pending change', () => {
  const server = [board('a', 'Server A'), board('b', 'Server B')];
  const local = [board('a', 'Local A'), board('b', 'Local B')];
  const { boards } = reconcileBoards(server, local, new Set(['b']), false);
  assert.deepEqual(boards.map(b => b.name), ['Server A', 'Local B']);
});

test('a pending local delete is not resurrected by a stale pull', () => {
  const { boards } = reconcileBoards([board('a'), board('b')], [board('a')], new Set(['b']), false);
  assert.deepEqual(ids(boards), ['a']);
});

test('a pending local create survives a pull that predates it', () => {
  const { boards, toPush } = reconcileBoards([], [board('new')], new Set(['new']), false);
  assert.deepEqual(ids(boards), ['new']);
  assert.deepEqual(toPush, []);
});

test('rows are clamped to the table constraints and round-trip', () => {
  const pins = Array.from({ length: 5005 }, (_, i) => `PHUK-${i}`);
  const row = boardToRow({ ...board('a', '  ' + 'x'.repeat(100) + '  ', [...pins, 'PHUK-1']), thumbnailPinId: 'PHUK-1' }, 'u1');
  assert.equal(row.name.length, 80);
  assert.equal(row.pin_ids.length, 5000);
  assert.equal(row.user_id, 'u1');
  assert.equal(boardToRow(board('b', '   '), 'u1').name, 'Untitled board');
  const back = rowToBoard(row);
  assert.equal(back.thumbnailPinId, 'PHUK-1');
  assert.equal(back.isCustom, true);
});

test('board queue coalesces rapid edits and sends deletes last', async () => {
  const sent = [];
  let release;
  const first = new Promise(r => { release = r; });
  const queue = new PushQueue({
    send: async (_id, change) => {
      sent.push(change.op === 'upsert' ? change.board.name : 'delete');
      if (sent.length === 1) await first;
      return { error: null };
    },
    onPendingChange: () => {},
    isSame: boardChangesMatch,
  });
  queue.enqueue('a', { op: 'upsert', rev: 1, board: board('a', 'v1') });
  queue.enqueue('a', { op: 'upsert', rev: 2, board: board('a', 'v2') });
  queue.enqueue('a', { op: 'delete', rev: 3 });
  release();
  await queue.waitForIdle();
  // v2 is skipped: only the latest desired state is sent after v1.
  assert.deepEqual(sent, ['v1', 'delete']);
  assert.equal(queue.has('a'), false);
});

test('a failed board write stays pending for the next flush', async () => {
  let fail = true;
  const queue = new PushQueue({
    send: async () => ({ error: fail ? { message: 'relation "user_boards" does not exist' } : null }),
    onPendingChange: () => {},
    isSame: boardChangesMatch,
  });
  queue.enqueue('a', { op: 'upsert', rev: 1, board: board('a') });
  await queue.waitForIdle();
  assert.equal(queue.has('a'), true);
  fail = false;
  queue.flush();
  await queue.waitForIdle();
  assert.equal(queue.has('a'), false);
});
