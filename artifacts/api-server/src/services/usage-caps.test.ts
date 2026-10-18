import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ fail: false, isAdmin: false, count: 0 }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    const query: Record<string, unknown> = {};
    const chain = () => query;
    Object.assign(query, {
      select: chain, eq: chain, gte: chain, not: chain, order: chain, limit: chain,
      maybeSingle: async () => (db.fail
        ? { data: null, error: { message: "relation does not exist" } }
        : { data: { is_admin: db.isAdmin }, error: null }),
      then: (resolve: (v: unknown) => void) => resolve(db.fail
        ? { count: null, error: { message: "relation does not exist" } }
        : { count: db.count, error: null }),
    });
    return { from: () => query };
  },
}));

import { dailyLimit, imageHash, withinDailyCap } from "./usage-caps";

afterEach(() => {
  vi.unstubAllEnvs();
  db.fail = false;
  db.isAdmin = false;
  db.count = 0;
});

describe("usage caps", () => {
  it("hashes photos to stable sha256 hex", () => {
    expect(imageHash("AAAA")).toMatch(/^[0-9a-f]{64}$/);
    expect(imageHash("AAAA")).toBe(imageHash("AAAA"));
    expect(imageHash("AAAA")).not.toBe(imageHash("AAAB"));
  });

  it("uses defaults, overridable by env", () => {
    expect(dailyLimit("scan")).toBe(60);
    vi.stubEnv("CONTRIBUTOR_DAILY_SCANS", "5");
    expect(dailyLimit("scan")).toBe(5);
    vi.stubEnv("CONTRIBUTOR_DAILY_SCANS", "nonsense");
    expect(dailyLimit("scan")).toBe(60);
  });

  it("allows everything when the service key isn't set", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await withinDailyCap("user-1", "scan")).toBe(true);
  });

  describe("with a database", () => {
    const withDb = () => {
      vi.stubEnv("SUPABASE_URL", "https://example.test");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    };

    it("allows under the cap and refuses at it", async () => {
      withDb();
      db.count = 59;
      expect(await withinDailyCap("user-1", "scan")).toBe(true);
      db.count = 60;
      expect(await withinDailyCap("user-1", "scan")).toBe(false);
    });

    it("never caps admins", async () => {
      withDb();
      db.isAdmin = true;
      db.count = 10_000;
      expect(await withinDailyCap("user-1", "photo_cleanup")).toBe(true);
    });

    it("fails open when the table is missing (047 not applied)", async () => {
      withDb();
      db.fail = true;
      expect(await withinDailyCap("user-1", "submission")).toBe(true);
    });
  });
});
