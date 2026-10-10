/**
 * Pure helpers for syncing custom Boards with Supabase `user_boards`
 * (migration 043). Kept free of React/Supabase imports so they can be
 * tested with `node --test` (see boards-sync.test.mjs).
 */
import type { Board } from '@/types/board';

/** A pending write for one board. `rev` identifies the exact change sent. */
export type BoardChange =
  | { op: 'upsert'; rev: number; board: Board }
  | { op: 'delete'; rev: number };

export function boardChangesMatch(pending: BoardChange | undefined, sent: BoardChange) {
  return pending?.op === sent.op && pending.rev === sent.rev;
}

export interface BoardRow {
  user_id: string;
  id: string;
  name: string;
  pin_ids: string[];
  thumbnail_pin_id: string | null;
  created_at: string;
}

const MAX_NAME = 80;
const MAX_PINS = 5000;

/** Board → row, clamped to the table's CHECK constraints so a push never fails on them. */
export function boardToRow(board: Board, userId: string): BoardRow {
  const name = board.name.trim().slice(0, MAX_NAME) || 'Untitled board';
  return {
    user_id: userId,
    id: board.id,
    name,
    pin_ids: [...new Set(board.pinIds)].slice(0, MAX_PINS),
    thumbnail_pin_id: board.thumbnailPinId ?? null,
    created_at: board.createdAt || new Date().toISOString(),
  };
}

export function rowToBoard(row: Omit<BoardRow, 'user_id'>): Board {
  return {
    id: row.id,
    name: row.name,
    pinIds: row.pin_ids ?? [],
    createdAt: row.created_at,
    isCustom: true,
    thumbnailPinId: row.thumbnail_pin_id ?? undefined,
  };
}

/**
 * Merge the server's boards with the device's.
 *
 * - Boards in `keepLocal` (pending or changed since the pull started) keep
 *   their local version — including local deletion.
 * - Server boards are otherwise authoritative (edits/deletes made on another
 *   device apply here).
 * - Local-only boards are kept and returned in `toPush` when `adoptLocal`
 *   (first sync of this account on this device — upload existing boards).
 *   Otherwise they were deleted elsewhere and are dropped.
 */
export function reconcileBoards(
  server: Board[],
  local: Board[],
  keepLocal: Set<string>,
  adoptLocal: boolean,
): { boards: Board[]; toPush: Board[] } {
  const localById = new Map(local.map(b => [b.id, b]));
  const serverIds = new Set(server.map(b => b.id));
  const boards: Board[] = [];
  const toPush: Board[] = [];

  for (const s of server) {
    if (keepLocal.has(s.id)) {
      const l = localById.get(s.id);
      if (l) boards.push(l);
      continue;
    }
    boards.push(s);
  }
  for (const l of local) {
    if (serverIds.has(l.id)) continue;
    if (keepLocal.has(l.id)) {
      boards.push(l);
    } else if (adoptLocal) {
      boards.push(l);
      toPush.push(l);
    }
  }
  return { boards, toPush };
}
