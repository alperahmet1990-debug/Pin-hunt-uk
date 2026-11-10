import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/admin/messages/:id/remove (#524). Supabase is fully mocked.
const ADMIN = "0a0a0a0a-1111-4222-8333-444455556666";
const USER = "0b0b0b0b-1111-4222-8333-444455556666";
const SENDER = "0c0c0c0c-1111-4222-8333-444455556666";
const MESSAGE = "0d0d0d0d-1111-4222-8333-444455556666";

const state = vi.hoisted(() => ({
  isAdmin: {} as Record<string, boolean>,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcResult: null as unknown,
  rpcError: null as unknown,
  removed: [] as Array<{ bucket: string; paths: string[] }>,
  removeError: null as unknown,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        const id = token === "admin-token" ? "0a0a0a0a-1111-4222-8333-444455556666"
          : token === "user-token" ? "0b0b0b0b-1111-4222-8333-444455556666" : null;
        return id
          ? { data: { user: { id } }, error: null }
          : { data: { user: null }, error: { status: 401, message: "invalid JWT" } };
      },
    },
    from: (_table: string) => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({ data: { is_admin: !!state.isAdmin[id] }, error: null }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpc.push({ fn, args });
      return { data: state.rpcResult, error: state.rpcError };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          state.removed.push({ bucket, paths });
          return { data: [], error: state.removeError };
        },
      }),
    },
  }),
}));

import app from "../app";

const url = `/api/admin/messages/${MESSAGE}/remove`;
const asAdmin = () => request(app).post(url).set("Authorization", "Bearer admin-token");

describe("POST /api/admin/messages/:id/remove", () => {
  beforeAll(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    state.isAdmin = { [ADMIN]: true, [USER]: false };
    state.rpc = [];
    state.rpcResult = { status: "removed", photo_paths: [] };
    state.rpcError = null;
    state.removed = [];
    state.removeError = null;
  });

  it("returns 401 without a token and does nothing", async () => {
    const res = await request(app).post(url).send({ reason: "spam" });
    expect(res.status).toBe(401);
    expect(state.rpc).toEqual([]);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(app).post(url).set("Authorization", "Bearer bad").send({ reason: "spam" });
    expect(res.status).toBe(401);
    expect(state.rpc).toEqual([]);
  });

  it("refuses a signed-in collector who is not an admin", async () => {
    const res = await request(app).post(url).set("Authorization", "Bearer user-token").send({ reason: "spam" });
    expect(res.status).toBe(403);
    expect(state.rpc).toEqual([]);
    expect(state.removed).toEqual([]);
  });

  it("rejects a bad message id or reason before touching the database", async () => {
    const bad = await request(app).post("/api/admin/messages/not-a-uuid/remove")
      .set("Authorization", "Bearer admin-token").send({ reason: "spam" });
    expect(bad.status).toBe(400);
    expect((await asAdmin().send({})).status).toBe(400);
    expect((await asAdmin().send({ reason: "   " })).status).toBe(400);
    expect((await asAdmin().send({ reason: "x".repeat(501) })).status).toBe(400);
    expect(state.rpc).toEqual([]);
  });

  it("removes as the verified admin, with the trimmed reason, and deletes the photos", async () => {
    state.rpcResult = { status: "removed", photo_paths: [`${SENDER}/1.jpg`, `${SENDER}/2.jpg`] };
    const res = await asAdmin().send({ reason: "  Harassment  ", adminId: USER });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: true, alreadyRemoved: false, photosDeleted: 2 });
    expect(state.rpc).toEqual([{
      fn: "remove_reported_message",
      args: { p_admin_id: ADMIN, p_message_id: MESSAGE, p_reason: "Harassment" },
    }]);
    expect(state.removed).toEqual([{ bucket: "community-photos", paths: [`${SENDER}/1.jpg`, `${SENDER}/2.jpg`] }]);
  });

  it("accepts the full 500-character reason", async () => {
    const res = await asAdmin().send({ reason: "x".repeat(500) });
    expect(res.status).toBe(200);
  });

  it("never deletes paths outside a user folder", async () => {
    state.rpcResult = { status: "removed", photo_paths: ["../etc", "other/../x.jpg", "loose.jpg", 7, `${SENDER}/ok.jpg`] };
    const res = await asAdmin().send({ reason: "spam" });
    expect(res.status).toBe(200);
    expect(state.removed).toEqual([{ bucket: "community-photos", paths: [`${SENDER}/ok.jpg`] }]);
  });

  it("skips storage when the message had no photos", async () => {
    const res = await asAdmin().send({ reason: "spam" });
    expect(res.status).toBe(200);
    expect(res.body.photosDeleted).toBe(0);
    expect(state.removed).toEqual([]);
  });

  it("maps refusals from the database", async () => {
    state.rpcResult = { status: "no_open_report", photo_paths: [] };
    expect((await asAdmin().send({ reason: "spam" })).status).toBe(409);
    state.rpcResult = { status: "not_found", photo_paths: [] };
    expect((await asAdmin().send({ reason: "spam" })).status).toBe(404);
    state.rpcResult = { status: "not_admin", photo_paths: [] };
    expect((await asAdmin().send({ reason: "spam" })).status).toBe(403);
    state.rpcResult = { status: "invalid_reason", photo_paths: [] };
    expect((await asAdmin().send({ reason: "spam" })).status).toBe(400);
    expect(state.removed).toEqual([]);
  });

  it("reports a failed photo clean-up so it can be retried, and the retry deletes them", async () => {
    state.rpcResult = { status: "removed", photo_paths: [`${SENDER}/1.jpg`] };
    state.removeError = { message: "storage down" };
    const first = await asAdmin().send({ reason: "spam" });
    expect(first.status).toBe(502);

    state.rpcResult = { status: "already_removed", photo_paths: [`${SENDER}/1.jpg`] };
    state.removeError = null;
    const retry = await asAdmin().send({ reason: "spam" });
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ removed: true, alreadyRemoved: true, photosDeleted: 1 });
  });

  it("answers 503 when migration 072 is not applied", async () => {
    state.rpcError = { code: "PGRST202", message: "Could not find the function" };
    const res = await asAdmin().send({ reason: "spam" });
    expect(res.status).toBe(503);
  });

  it("returns a generic 500 on a database error", async () => {
    state.rpcError = { code: "XX000", message: "boom with details" };
    const res = await asAdmin().send({ reason: "spam" });
    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/boom/);
  });
});
