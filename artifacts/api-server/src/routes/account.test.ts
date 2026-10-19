import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// DELETE /api/account. Supabase is fully mocked: no network traffic.
const CALLER = "0a0a0a0a-1111-4222-8333-444455556666";
const AUDIT = "0c0c0c0c-1111-4222-8333-444455556666";

const state = vi.hoisted(() => ({
  getUser: null as null | ((token: string) => Promise<unknown>),
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  prepare: null as unknown,
  prepareError: null as unknown,
  storage: [] as unknown[],
  removed: [] as Array<{ bucket: string; paths: string[] }>,
  deleted: [] as string[],
  deleteError: null as unknown,
  createdWithKeys: [] as string[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => {
    state.createdWithKeys.push(key);
    return {
      auth: {
        getUser: (token: string) => state.getUser!(token),
        admin: {
          deleteUser: async (id: string) => {
            state.deleted.push(id);
            return { data: null, error: state.deleteError };
          },
        },
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.rpc.push({ fn, args });
        if (fn === "prepare_account_deletion") return { data: state.prepare, error: state.prepareError };
        if (fn === "list_account_storage_objects") {
          const rows = state.storage;
          state.storage = [];
          return { data: rows, error: null };
        }
        return { data: null, error: null };
      },
      storage: {
        from: (bucket: string) => ({
          remove: async (paths: string[]) => {
            state.removed.push({ bucket, paths });
            return { data: [], error: null };
          },
        }),
      },
    };
  },
}));

import app from "../app";

const validUser = async (token: string) =>
  token === "good-token"
    ? { data: { user: { id: CALLER } }, error: null }
    : { data: { user: null }, error: { status: 401, message: "invalid JWT" } };

describe("DELETE /api/account", () => {
  beforeAll(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    state.getUser = validUser;
    state.rpc = [];
    state.prepare = { status: "ready", audit_id: AUDIT };
    state.prepareError = null;
    state.storage = [];
    state.removed = [];
    state.deleted = [];
    state.deleteError = null;
  });

  it("returns 401 without a token and does nothing", async () => {
    const res = await request(app).delete("/api/account");
    expect(res.status).toBe(401);
    expect(state.rpc).toEqual([]);
    expect(state.deleted).toEqual([]);
  });

  it("returns 401 for a non-Bearer authorization header", async () => {
    const res = await request(app).delete("/api/account").set("Authorization", "Basic abc");
    expect(res.status).toBe(401);
    expect(state.deleted).toEqual([]);
  });

  it("returns 401 with an invalid token and does nothing", async () => {
    const res = await request(app).delete("/api/account").set("Authorization", "Bearer bad-token");
    expect(res.status).toBe(401);
    expect(res.body.error).not.toMatch(/JWT/);
    expect(state.rpc).toEqual([]);
    expect(state.deleted).toEqual([]);
  });

  it("returns 401 when the auth check throws", async () => {
    state.getUser = async () => {
      throw new Error("network down");
    };
    const res = await request(app).delete("/api/account").set("Authorization", "Bearer good-token");
    expect(res.status).toBe(401);
    expect(state.deleted).toEqual([]);
  });

  it("deletes only the caller: storage under their folder, then their auth user", async () => {
    state.storage = [
      { bucket_id: "avatars", name: `${CALLER}/avatar.jpg` },
      { bucket_id: "pin-submissions", name: `${CALLER}/s1/front.jpg` },
    ];
    const res = await request(app)
      .delete("/api/account")
      .set("Authorization", "Bearer good-token")
      // A user id in the body or query is ignored.
      .query({ userId: "0b0b0b0b-1111-4222-8333-444455556666" })
      .send({ userId: "0b0b0b0b-1111-4222-8333-444455556666" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(state.rpc[0]).toEqual({ fn: "prepare_account_deletion", args: { p_user: CALLER } });
    expect(state.removed).toEqual([
      { bucket: "avatars", paths: [`${CALLER}/avatar.jpg`] },
      { bucket: "pin-submissions", paths: [`${CALLER}/s1/front.jpg`] },
    ]);
    expect(state.deleted).toEqual([CALLER]);
    expect(state.rpc.at(-1)).toMatchObject({ fn: "finish_account_deletion", args: { p_status: "completed" } });
    expect(state.createdWithKeys).toContain("test-service-role-key");
  });

  it("a second call for an account that is already gone is a no-op success", async () => {
    state.prepare = { status: "not_found" };
    const res = await request(app).delete("/api/account").set("Authorization", "Bearer good-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(state.deleted).toEqual([]);
  });

  it("returns 409 for the App Creator account and deletes nothing", async () => {
    state.prepare = { status: "refused", reason: "app_creator" };
    const res = await request(app).delete("/api/account").set("Authorization", "Bearer good-token");
    expect(res.status).toBe(409);
    expect(state.deleted).toEqual([]);
    expect(state.removed).toEqual([]);
  });

  it("returns a generic 500 when a step fails, without leaking details", async () => {
    state.prepareError = { code: "42883", message: "function prepare_account_deletion(uuid) does not exist" };
    const res = await request(app).delete("/api/account").set("Authorization", "Bearer good-token");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/prepare_account_deletion|42883|uuid/);
    expect(state.deleted).toEqual([]);
  });

  it("returns a generic 500 when the auth user delete fails", async () => {
    state.deleteError = { status: 500, code: "unexpected_failure", message: "Database error deleting user" };
    const res = await request(app).delete("/api/account").set("Authorization", "Bearer good-token");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/Database error/);
  });

  it("returns 503 when the service role is not configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await request(app).delete("/api/account").set("Authorization", "Bearer good-token");
    expect(res.status).toBe(503);
    expect(state.rpc).toEqual([]);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });

  it("only answers DELETE", async () => {
    const res = await request(app).post("/api/account").set("Authorization", "Bearer good-token");
    expect(res.status).toBe(404);
    expect(state.deleted).toEqual([]);
  });
});
