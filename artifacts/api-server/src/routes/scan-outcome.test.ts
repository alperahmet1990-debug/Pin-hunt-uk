import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/scan/outcome (#113): what the collector picked after a scan.
// Supabase is mocked: no real database traffic.
const db = vi.hoisted(() => ({
  rows: [] as Array<{ id: number; user_id: string; kind: string; result: unknown; created_at: string; [k: string]: unknown }>,
  updates: [] as Array<{ values: Record<string, unknown>; filters: Record<string, unknown> }>,
  failUpdate: null as null | { message: string },
  authUser: "user-1" as string | null,
}));

function query(table: string) {
  const filters: Record<string, unknown> = {};
  let values: Record<string, unknown> | null = null;
  const q = {
    select: () => q,
    update: (v: Record<string, unknown>) => { values = v; return q; },
    eq: (col: string, val: unknown) => { filters[col] = val; return q; },
    gte: () => q,
    limit: () => q,
    maybeSingle: async () => {
      const row = db.rows.find(r =>
        r.user_id === filters.user_id && r.kind === filters.kind
        && (r.result as { scanId?: string } | null)?.scanId === filters["result->>scanId"]);
      return { data: row ?? null, error: null };
    },
    then: (resolve: (v: unknown) => void) => {
      if (values) db.updates.push({ values, filters: { ...filters, table } });
      resolve({ error: db.failUpdate });
    },
  };
  return q;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => (db.authUser
        ? { data: { user: { id: db.authUser } }, error: null }
        : { data: { user: null }, error: { message: "bad token" } }),
    },
    from: (table: string) => query(table),
  }),
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({ isAiConfigured: () => true, getOpenAIClient: () => ({}) }));
vi.mock("@workspace/pin-repository", () => ({ createSupabasePinRepository: () => ({ searchPins: async () => [] }) }));

process.env.SUPABASE_URL = "https://db.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

import app from "../app";
import { allowOutcome } from "./scan";

const SCAN = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OTHER_SCAN = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const post = (body: unknown, token: string | null = "test-token") => {
  const r = request(app).post("/api/scan/outcome");
  return (token ? r.set("Authorization", `Bearer ${token}`) : r).send(body as object);
};

beforeEach(() => {
  db.updates = [];
  db.failUpdate = null;
  // A fresh user per test, so the per-user rate limit starts empty.
  db.authUser = `user-${Math.random().toString(36).slice(2)}`;
  db.rows = [
    {
      id: 1, user_id: db.authUser, kind: "scan", created_at: new Date().toISOString(),
      result: { scanId: SCAN, matches: [{ pinId: "PHUK-1" }, { pinId: "PHUK-2" }, { pinId: "PHUK-3" }] },
    },
    {
      id: 2, user_id: "someone-else", kind: "scan", created_at: new Date().toISOString(),
      result: { scanId: OTHER_SCAN, matches: [{ pinId: "PHUK-9" }] },
    },
  ];
});

describe("POST /api/scan/outcome", () => {
  it("needs a signed-in user", async () => {
    const res = await post({ scanId: SCAN, chosenPinId: "PHUK-1" }, null);
    expect(res.status).toBe(401);
    db.authUser = null;
    expect((await post({ scanId: SCAN, chosenPinId: "PHUK-1" })).status).toBe(401);
    expect(db.updates).toEqual([]);
  });

  it('"That\'s it" on the best match is confirmed, rank 1', async () => {
    const res = await post({ scanId: SCAN, chosenPinId: "PHUK-1" });
    expect(res.status).toBe(204);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].values).toMatchObject({ outcome: "confirmed", chosen_pin_id: "PHUK-1", chosen_rank: 1 });
    expect(db.updates[0].filters).toMatchObject({ id: 1, user_id: db.authUser });
  });

  it("an alternative records its rank, worked out on the server", async () => {
    const res = await post({ scanId: SCAN, chosenPinId: "PHUK-3", chosenRank: 1 });
    expect(res.status).toBe(204);
    expect(db.updates[0].values).toMatchObject({ outcome: "picked_alternative", chosen_pin_id: "PHUK-3", chosen_rank: 3 });
  });

  it('"None of these" is stored with no pin and no rank', async () => {
    const res = await post({ scanId: SCAN, chosenPinId: null });
    expect(res.status).toBe(204);
    expect(db.updates[0].values).toMatchObject({ outcome: "none", chosen_pin_id: null, chosen_rank: null });
  });

  it("only the collector's own scan: someone else's scan id is not found", async () => {
    const res = await post({ scanId: OTHER_SCAN, chosenPinId: "PHUK-9" });
    expect(res.status).toBe(404);
    expect(db.updates).toEqual([]);
  });

  it("refuses a pin that wasn't one of the scan's matches", async () => {
    const res = await post({ scanId: SCAN, chosenPinId: "PHUK-404" });
    expect(res.status).toBe(400);
    expect(db.updates).toEqual([]);
  });

  it("checks the body", async () => {
    expect((await post({ scanId: "not-a-uuid", chosenPinId: null })).status).toBe(400);
    expect((await post({ scanId: SCAN })).status).toBe(400);
    expect((await post({ scanId: SCAN, chosenPinId: 42 })).status).toBe(400);
    expect((await post({ scanId: SCAN, chosenPinId: "x".repeat(65) })).status).toBe(400);
    expect(db.updates).toEqual([]);
  });

  it("answers 202 and stores nothing when the database refuses (e.g. 069 not applied)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db.failUpdate = { message: 'column "outcome" does not exist' };
    const res = await post({ scanId: SCAN, chosenPinId: "PHUK-1" });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ recorded: false });
  });

  it("is rate-limited per user", async () => {
    for (let i = 0; i < 20; i++) expect((await post({ scanId: SCAN, chosenPinId: "PHUK-1" })).status).toBe(204);
    expect((await post({ scanId: SCAN, chosenPinId: "PHUK-1" })).status).toBe(429);
  });
});

describe("allowOutcome", () => {
  it("allows 20 a minute, then again after the minute", () => {
    const t = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allowOutcome("u-rate", t + i)).toBe(true);
    expect(allowOutcome("u-rate", t + 100)).toBe(false);
    expect(allowOutcome("u-rate", t + 60_001)).toBe(true);
  });
});
