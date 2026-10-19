import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountDeletionError,
  STORAGE_REMOVE_BATCH,
  chunk,
  deleteAccount,
  groupUserStoragePaths,
  isUserNotFoundError,
  removeUserStorage,
} from "./account-deletion";

const USER = "0a0a0a0a-1111-4222-8333-444455556666";
const OTHER = "0b0b0b0b-1111-4222-8333-444455556666";
const AUDIT = "0c0c0c0c-1111-4222-8333-444455556666";

type RpcResult = { data: unknown; error: unknown };

/** Minimal fake of the service-role client: rpc, storage.remove, auth.admin.deleteUser. */
function fakeClient(opts: {
  prepare?: RpcResult;
  storageRounds?: Array<Array<{ bucket_id: string; name: string }>>;
  listError?: unknown;
  removeError?: unknown;
  deleteUserError?: unknown;
  finishError?: unknown;
} = {}) {
  const calls = {
    rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    removed: [] as Array<{ bucket: string; paths: string[] }>,
    deletedUsers: [] as string[],
  };
  const rounds = [...(opts.storageRounds ?? [])];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args });
      if (fn === "prepare_account_deletion") {
        return opts.prepare ?? { data: { status: "ready", audit_id: AUDIT }, error: null };
      }
      if (fn === "list_account_storage_objects") {
        if (opts.listError) return { data: null, error: opts.listError };
        return { data: rounds.shift() ?? [], error: null };
      }
      if (fn === "finish_account_deletion") {
        return { data: null, error: opts.finishError ?? null };
      }
      throw new Error(`unexpected rpc ${fn}`);
    }),
    storage: {
      from: (bucket: string) => ({
        remove: vi.fn(async (paths: string[]) => {
          if (opts.removeError) return { data: null, error: opts.removeError };
          calls.removed.push({ bucket, paths });
          return { data: [], error: null };
        }),
      }),
    },
    auth: {
      admin: {
        deleteUser: vi.fn(async (id: string) => {
          calls.deletedUsers.push(id);
          return { data: null, error: opts.deleteUserError ?? null };
        }),
      },
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("groupUserStoragePaths", () => {
  it("keeps only the user's own folder in user-content buckets", () => {
    const grouped = groupUserStoragePaths(
      [
        { bucket_id: "avatars", name: `${USER}/avatar.jpg` },
        { bucket_id: "pin-submissions", name: `${USER}/sub-1/front.jpg` },
        { bucket_id: "pin-submissions", name: `${USER}/drafts/x.jpg` },
        { bucket_id: "community-photos", name: `${OTHER}/1.jpg` },
        { bucket_id: "pin-catalogue", name: `${USER}/catalogue.jpg` },
        { bucket_id: "avatars", name: `${USER}x/avatar.jpg` },
        { bucket_id: "avatars", name: USER },
        { bucket_id: "avatars", name: `${USER}/../${OTHER}/avatar.jpg` },
      ],
      USER,
    );
    expect(Object.fromEntries(grouped)).toEqual({
      avatars: [`${USER}/avatar.jpg`],
      "pin-submissions": [`${USER}/sub-1/front.jpg`, `${USER}/drafts/x.jpg`],
    });
  });

  it("ignores malformed rows", () => {
    const rows = [null, { bucket_id: 1, name: "x" }, { bucket_id: "avatars" }] as never;
    expect(groupUserStoragePaths(rows, USER).size).toBe(0);
  });
});

describe("chunk", () => {
  it("splits into fixed-size batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
  it("rejects a bad size", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});

describe("isUserNotFoundError", () => {
  it("recognises 404 and user_not_found", () => {
    expect(isUserNotFoundError({ status: 404 })).toBe(true);
    expect(isUserNotFoundError({ code: "user_not_found" })).toBe(true);
    expect(isUserNotFoundError({ status: 500 })).toBe(false);
    expect(isUserNotFoundError(null)).toBe(false);
  });
});

describe("removeUserStorage", () => {
  it("removes in batches and re-lists until nothing is left", async () => {
    const many = Array.from({ length: STORAGE_REMOVE_BATCH + 5 }, (_, i) => ({
      bucket_id: "community-photos",
      name: `${USER}/${i}.jpg`,
    }));
    const { client, calls } = fakeClient({ storageRounds: [many, []] });
    await expect(removeUserStorage(client, USER)).resolves.toBe(STORAGE_REMOVE_BATCH + 5);
    expect(calls.removed.map((r) => r.paths.length)).toEqual([STORAGE_REMOVE_BATCH, 5]);
    expect(calls.rpc.filter((c) => c.fn === "list_account_storage_objects")).toHaveLength(2);
  });

  it("fails with a storage error when listing fails", async () => {
    const { client } = fakeClient({ listError: { code: "42501", message: "secret detail" } });
    const err = await removeUserStorage(client, USER).catch((e) => e);
    expect(err).toBeInstanceOf(AccountDeletionError);
    expect(err).toMatchObject({ stage: "storage", code: "42501" });
    expect(String(err.message)).not.toContain("secret detail");
  });

  it("stops after a bounded number of rounds", async () => {
    const row = [{ bucket_id: "avatars", name: `${USER}/a.jpg` }];
    const { client } = fakeClient({ storageRounds: [row, row, row, row, row, row] });
    await expect(removeUserStorage(client, USER)).rejects.toMatchObject({ stage: "storage", code: "too_many_objects" });
  });
});

describe("deleteAccount", () => {
  it("prepares, removes storage, deletes the auth user and completes the audit row", async () => {
    const { client, calls } = fakeClient({
      storageRounds: [[{ bucket_id: "avatars", name: `${USER}/avatar.jpg` }], []],
    });
    const result = await deleteAccount(client, USER);
    expect(result).toEqual({ status: "deleted", storageObjectsRemoved: 1, alreadyGone: false });
    expect(calls.rpc[0]).toEqual({ fn: "prepare_account_deletion", args: { p_user: USER } });
    expect(calls.deletedUsers).toEqual([USER]);
    expect(calls.rpc.at(-1)).toEqual({
      fn: "finish_account_deletion",
      args: { p_audit_id: AUDIT, p_status: "completed", p_details: { storage_objects: 1 } },
    });
  });

  it("is a no-op success when the user is already gone", async () => {
    const { client, calls } = fakeClient({ prepare: { data: { status: "not_found" }, error: null } });
    const result = await deleteAccount(client, USER);
    expect(result).toEqual({ status: "deleted", storageObjectsRemoved: 0, alreadyGone: true });
    expect(calls.deletedUsers).toEqual([]);
    expect(calls.rpc.some((c) => c.fn === "finish_account_deletion")).toBe(false);
  });

  it("treats a 404 from the auth admin API as already deleted", async () => {
    const { client } = fakeClient({ deleteUserError: { status: 404 } });
    await expect(deleteAccount(client, USER)).resolves.toMatchObject({ status: "deleted", alreadyGone: true });
  });

  it("refuses the App Creator without touching storage or auth", async () => {
    const { client, calls } = fakeClient({
      prepare: { data: { status: "refused", reason: "app_creator" }, error: null },
    });
    await expect(deleteAccount(client, USER)).resolves.toEqual({ status: "refused", reason: "app_creator" });
    expect(calls.deletedUsers).toEqual([]);
    expect(calls.removed).toEqual([]);
  });

  it("does not delete the auth user when storage removal fails, and marks the audit row failed", async () => {
    const { client, calls } = fakeClient({
      storageRounds: [[{ bucket_id: "avatars", name: `${USER}/avatar.jpg` }]],
      removeError: { status: 500 },
    });
    await expect(deleteAccount(client, USER)).rejects.toMatchObject({ stage: "storage", code: "500" });
    expect(calls.deletedUsers).toEqual([]);
    expect(calls.rpc.at(-1)).toEqual({
      fn: "finish_account_deletion",
      args: { p_audit_id: AUDIT, p_status: "failed", p_details: { failed_stage: "storage" } },
    });
  });

  it("fails at the auth stage on other auth errors", async () => {
    const { client } = fakeClient({ deleteUserError: { status: 500, code: "unexpected_failure" } });
    await expect(deleteAccount(client, USER)).rejects.toMatchObject({ stage: "auth", code: "unexpected_failure" });
  });

  it("fails at prepare without further steps when the RPC errors", async () => {
    const { client, calls } = fakeClient({ prepare: { data: null, error: { code: "PGRST202" } } });
    await expect(deleteAccount(client, USER)).rejects.toMatchObject({ stage: "prepare", code: "PGRST202" });
    expect(calls.rpc).toHaveLength(1);
    expect(calls.deletedUsers).toEqual([]);
  });

  it("still succeeds when only closing the audit row fails", async () => {
    const warn = vi.fn();
    const { client } = fakeClient({ finishError: { code: "XX000" } });
    await expect(deleteAccount(client, USER, warn)).resolves.toMatchObject({ status: "deleted" });
    expect(warn).toHaveBeenCalledWith("audit", undefined);
  });

  it("rejects a non-uuid user id before any call", async () => {
    const { client, calls } = fakeClient();
    await expect(deleteAccount(client, "not-a-uuid")).rejects.toMatchObject({ stage: "prepare", code: "invalid_user" });
    expect(calls.rpc).toHaveLength(0);
  });
});
