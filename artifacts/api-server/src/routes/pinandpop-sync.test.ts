import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// /api/admin/catalogue/pinandpop/*. Supabase and the Pin & Pop sync are mocked: no network.
const CREATOR = "0a0a0a0a-1111-4222-8333-444455556666";
const USER = "0b0b0b0b-1111-4222-8333-444455556666";

const state = vi.hoisted(() => ({
  syncCalls: [] as Array<{ maxPages?: number }>,
  syncResult: null as unknown,
  syncError: null as unknown,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        const id = token === "creator-token" ? CREATOR : token === "user-token" ? USER : null;
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
      },
    },
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          single: async () => ({ data: { is_app_creator: id === CREATOR }, error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ count: 116502, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("../../scripts/lib/pinandpop.mjs", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../scripts/lib/pinandpop.mjs")>();
  return {
    ...real,
    highestStoredPinAndPopId: async () => 130583,
    syncNewPins: async (args: { maxPages?: number }) => {
      state.syncCalls.push({ maxPages: args.maxPages });
      if (state.syncError) throw state.syncError;
      return state.syncResult;
    },
  };
});

import app from "../app";
import { PinAndPopApiError } from "../../scripts/lib/pinandpop.mjs";

const sync = (token?: string) => {
  const r = request(app).post("/api/admin/catalogue/pinandpop/sync");
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

describe("Pin & Pop sync routes", () => {
  beforeAll(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"));
  afterEach(() => {
    state.syncCalls = [];
    state.syncError = null;
    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });

  it("needs a signed-in App Creator", async () => {
    expect((await sync()).status).toBe(401);
    expect((await sync("bad")).status).toBe(401);
    expect((await sync("user-token")).status).toBe(403);
    expect(state.syncCalls).toHaveLength(0);
  });

  it("is unavailable when the server has no Pin & Pop token", async () => {
    vi.stubEnv("PINANDPOP_API_TOKEN", "");
    const res = await sync("creator-token");
    expect(res.status).toBe(503);
    expect(state.syncCalls).toHaveLength(0);
  });

  it("runs a bounded incremental sync and reports progress", async () => {
    vi.stubEnv("PINANDPOP_API_TOKEN", "tok");
    state.syncResult = { startedAfterId: 130583, fetched: 3, written: 3, skipped: [], highestId: 130586, complete: true, requests: 1 };
    const res = await sync("creator-token").send({ maxPages: 999 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ written: 3, highestId: 130586, complete: true, skippedCount: 0 });
    expect(state.syncCalls[0].maxPages).toBe(25);
  });

  it("doesn't echo Pin & Pop's error body when the token is rejected", async () => {
    vi.stubEnv("PINANDPOP_API_TOKEN", "tok");
    state.syncError = new PinAndPopApiError("Pin & Pop API 401: secret detail", 401);
    const res = await sync("creator-token");
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Pin & Pop rejected the API token");
    expect(JSON.stringify(res.body)).not.toContain("secret detail");
  });

  it("status reports counts without exposing the token", async () => {
    vi.stubEnv("PINANDPOP_API_TOKEN", "tok-value");
    const res = await request(app).get("/api/admin/catalogue/pinandpop/status").set("Authorization", "Bearer creator-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pins: 116502, highestId: 130583, tokenConfigured: true, running: false });
  });
});
