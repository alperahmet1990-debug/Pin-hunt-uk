/**
 * Self-service account deletion (B-P0-03a, #13), used by DELETE /api/account.
 *
 * Order matters, and every step can be retried:
 *   1. prepare_account_deletion (migration 051): detach the user's photo
 *      attachments and trades, keep their posts/comments/messages for the
 *      other people in them, and open an account_deletions audit row.
 *   2. Remove the user's own storage objects (first folder = user id) in the
 *      user-content buckets, through the Storage API so the files go too.
 *   3. Delete the auth user with the service role. The foreign keys then
 *      remove the profile, collection, boards and the rest, and set the
 *      author/sender of kept community content to NULL.
 *   4. Close the audit row.
 *
 * A failure part-way leaves the account in place and the request can simply
 * be repeated; steps 1–3 are no-ops for anything already done.
 *
 * Needs a service-role client. Never logs the user's id, email or content.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Buckets whose objects live under `{userId}/…` and belong to that user. */
export const USER_CONTENT_BUCKETS = [
  "avatars",
  "community-photos",
  "pin-submissions",
  "pin-contributed-images",
  "user-pin-images",
  "scan-images",
] as const;

/** Storage API remove() batch size. */
export const STORAGE_REMOVE_BATCH = 100;
/** list_account_storage_objects returns at most 10 000 rows per call. */
const MAX_STORAGE_ROUNDS = 5;

export type AccountDeletionStage = "prepare" | "storage" | "auth" | "audit";

export class AccountDeletionError extends Error {
  constructor(
    readonly stage: AccountDeletionStage,
    /** Upstream error code/status only, never its message. */
    readonly code: string | undefined,
  ) {
    super(`Account deletion failed at ${stage}`);
    this.name = "AccountDeletionError";
  }
}

export type AccountDeletionResult =
  | { status: "deleted"; storageObjectsRemoved: number; alreadyGone: boolean }
  | { status: "refused"; reason: "app_creator" };

interface StorageRow {
  bucket_id: string;
  name: string;
}

type PrepareResult =
  | { status: "not_found" }
  | { status: "refused"; reason: string }
  | { status: "ready"; audit_id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { code?: unknown; status?: unknown };
  if (typeof e.code === "string" && e.code) return e.code;
  if (typeof e.status === "number") return String(e.status);
  return undefined;
}

/**
 * Groups storage rows by bucket, keeping only the user-content buckets and
 * only paths whose first folder is exactly the user's id. Defence in depth:
 * the SQL function already filters the same way.
 */
export function groupUserStoragePaths(rows: readonly StorageRow[], userId: string): Map<string, string[]> {
  const allowed = new Set<string>(USER_CONTENT_BUCKETS);
  const byBucket = new Map<string, string[]>();
  for (const row of rows) {
    if (!row || typeof row.bucket_id !== "string" || typeof row.name !== "string") continue;
    if (!allowed.has(row.bucket_id)) continue;
    const segments = row.name.split("/");
    if (segments.length < 2 || segments[0] !== userId) continue;
    if (segments.some((s) => s === "" || s === "." || s === "..")) continue;
    const list = byBucket.get(row.bucket_id) ?? [];
    list.push(row.name);
    byBucket.set(row.bucket_id, list);
  }
  return byBucket;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("chunk size must be a positive integer");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** True when an auth admin error means the user is already gone. */
export function isUserNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; code?: unknown };
  return e.status === 404 || e.code === "user_not_found";
}

/** Removes every object the user owns in the user-content buckets. Returns the count removed. */
export async function removeUserStorage(client: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;
  for (let round = 0; round < MAX_STORAGE_ROUNDS; round++) {
    const { data, error } = await client.rpc("list_account_storage_objects", { p_user: userId });
    if (error) throw new AccountDeletionError("storage", errorCode(error));
    const rows = (Array.isArray(data) ? data : []) as StorageRow[];
    const byBucket = groupUserStoragePaths(rows, userId);
    if (byBucket.size === 0) return removed;

    for (const [bucket, paths] of byBucket) {
      for (const batch of chunk(paths, STORAGE_REMOVE_BATCH)) {
        const { error: removeError } = await client.storage.from(bucket).remove(batch);
        if (removeError) throw new AccountDeletionError("storage", errorCode(removeError));
        removed += batch.length;
      }
    }
  }
  // Still listing objects after several full passes: stop rather than loop.
  throw new AccountDeletionError("storage", "too_many_objects");
}

async function finishAudit(
  client: SupabaseClient,
  auditId: string,
  status: "completed" | "failed",
  details: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await client.rpc("finish_account_deletion", {
    p_audit_id: auditId,
    p_status: status,
    p_details: details,
  });
  return !error;
}

/**
 * Deletes the account of `userId`. Throws AccountDeletionError on failure.
 * The caller must already have authenticated `userId` as the requester.
 */
export async function deleteAccount(
  client: SupabaseClient,
  userId: string,
  onWarning: (stage: AccountDeletionStage, code: string | undefined) => void = () => {},
): Promise<AccountDeletionResult> {
  if (!isUuid(userId)) throw new AccountDeletionError("prepare", "invalid_user");

  // 1. Prepare (anonymise + audit row)
  let prepared: unknown;
  try {
    const { data, error } = await client.rpc("prepare_account_deletion", { p_user: userId });
    if (error) throw new AccountDeletionError("prepare", errorCode(error));
    prepared = data;
  } catch (err) {
    if (err instanceof AccountDeletionError) throw err;
    throw new AccountDeletionError("prepare", undefined);
  }
  if (!prepared || typeof prepared !== "object") {
    throw new AccountDeletionError("prepare", "unexpected_response");
  }
  const prep = prepared as PrepareResult;
  if (prep.status === "refused") {
    return { status: "refused", reason: "app_creator" };
  }
  const auditId = prep.status === "ready" && isUuid(prep.audit_id) ? prep.audit_id : null;

  let stage: AccountDeletionStage = "storage";
  try {
    // 2. Storage (also run when the user is already gone, to finish a
    //    partly-completed earlier attempt).
    const storageObjectsRemoved = await removeUserStorage(client, userId);

    // 3. Auth user
    stage = "auth";
    let alreadyGone = prep.status === "not_found";
    if (!alreadyGone) {
      const { error: authError } = await client.auth.admin.deleteUser(userId);
      if (authError) {
        if (isUserNotFoundError(authError)) alreadyGone = true;
        else throw new AccountDeletionError("auth", errorCode(authError));
      }
    }

    // 4. Audit: the account is gone at this point, so a failure here is
    //    logged but does not fail the request.
    if (auditId) {
      const ok = await finishAudit(client, auditId, "completed", { storage_objects: storageObjectsRemoved })
        .catch(() => false);
      if (!ok) onWarning("audit", undefined);
    }

    return { status: "deleted", storageObjectsRemoved, alreadyGone };
  } catch (err) {
    const failure = err instanceof AccountDeletionError ? err : new AccountDeletionError(stage, undefined);
    if (auditId) {
      const ok = await finishAudit(client, auditId, "failed", { failed_stage: failure.stage }).catch(() => false);
      if (!ok) onWarning("audit", undefined);
    }
    throw failure;
  }
}
