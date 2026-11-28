/**
 * Admin "Price pins" routes: App Creator only, input errors as 400, the
 * confirmation rule as 422, fails closed without the service key. The batch
 * itself is covered in admin-batch.test.ts. No network.
 */
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminBatchDeps } from "../services/market/price-request/admin-batch";
import type { BatchPin } from "../services/market/price-request/batch";

let role: "creator" | "admin" | "none" = "creator";
let hasDeps = true;

vi.mock("./research-review", async importOriginal => {
  const real = await importOriginal<typeof import("./research-review")>();
  return {
    ...real,
    requireAppCreator: (req: { headers: Record<string, string> }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
      if (!req.headers.authorization) return res.status(401).json({ error: "Missing Authorization header" });
      if (role !== "creator") return res.status(403).json({ error: "App Creator access required" });
      next();
    },
  };
});

const start = vi.fn();
vi.mock("../services/market/price-request/deps", async importOriginal => {
  const real = await importOriginal<typeof import("../services/market/price-request/deps")>();
  return {
    ...real,
    createAdminBatchDeps: (): AdminBatchDeps | null => hasDeps
      ? {
          env: { SOLDGRAPH_ENABLED: "true", SOLDGRAPH_API_KEY: "test-key-not-real", MARKET_VALUATION_V2_ENABLED: "true", MARKET_VALUATION_PUBLISHED_MARKETS: "UK" },
          store: {
            listPins: async q => (q.pinhuntIds ?? []).map((id): BatchPin => ({ uuid: `u-${id}`, pinhuntId: id })),
            recentlyAnswered: async () => new Set(),
            budget: async () => ({ usedCredits: 0, limitCredits: 50, hardStop: true }),
          },
          request: {} as AdminBatchDeps["request"],
          start,
          popularPinhuntIds: async n => ["PHUK-00000001", "PHUK-00000002", "PHUK-00000003"].slice(0, n),
        }
      : null,
  };
});

const { default: app } = await import("../app");
const { resetAdminBatchForTests } = await import("../services/market/price-request/admin-batch");
const auth = { Authorization: "Bearer good" };
const body = { pins: { kind: "popular", count: 3 }, maxCredits: 10 };

beforeEach(() => {
  role = "creator";
  hasDeps = true;
  start.mockReset();
  start.mockResolvedValue({
    kind: "started", requestId: "r", worstCaseCredits: 1,
    done: Promise.resolve({ status: "complete", outcome: "priced", soldCounts: { UK: 2 }, creditsSpent: 1 }),
  });
});
afterEach(() => resetAdminBatchForTests());

describe("admin price batch routes", () => {
  it("is App Creator only", async () => {
    expect((await request(app).get("/api/admin/price-batch")).status).toBe(401);
    role = "admin";
    expect((await request(app).post("/api/admin/price-batch/plan").set(auth).send(body)).status).toBe(403);
    expect((await request(app).post("/api/admin/price-batch/run").set(auth).send({ ...body, confirmCredits: 3 })).status).toBe(403);
    expect(start).not.toHaveBeenCalled();
  });

  it("fails closed without the service key", async () => {
    hasDeps = false;
    expect((await request(app).post("/api/admin/price-batch/plan").set(auth).send(body)).status).toBe(503);
  });

  it("shows setup, plans for free, and refuses an unconfirmed run", async () => {
    const s = await request(app).get("/api/admin/price-batch").set(auth);
    expect(s.body).toMatchObject({ markets: ["UK"], switches: { soldgraph: true, valuationV2: true }, job: null });

    const plan = await request(app).post("/api/admin/price-batch/plan").set(auth).send(body);
    expect(plan.status).toBe(200);
    expect(plan.body.plan).toMatchObject({ toPrice: 3, plannedCredits: 3 });
    expect(plan.body.blockers).toEqual([]);

    const bad = await request(app).post("/api/admin/price-batch/plan").set(auth).send({ ...body, maxCredits: "lots" });
    expect(bad.status).toBe(400);

    const unconfirmed = await request(app).post("/api/admin/price-batch/run").set(auth).send(body);
    expect(unconfirmed.status).toBe(422);
    expect(start).not.toHaveBeenCalled();
  });

  it("starts a confirmed run, then reports it", async () => {
    const run = await request(app).post("/api/admin/price-batch/run").set(auth).send({ ...body, confirmCredits: 3 });
    expect(run.status).toBe(202);
    expect(run.body.job).toMatchObject({ state: "running", plannedCredits: 3, pinsToTry: 3 });
    await vi.waitFor(async () => {
      const s = await request(app).get("/api/admin/price-batch").set(auth);
      expect(s.body.job).toMatchObject({ state: "finished", tried: 3, creditsSpent: 3 });
    });
  });
});
