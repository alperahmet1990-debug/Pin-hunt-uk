// Copy the public catalogue from main into staging (#372). Supabase is faked:
// nothing here connects anywhere.
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CATALOGUE_TABLES, CATALOGUE_TABLE_NAMES, INTERNAL_LINK_COLUMNS, MAIN_FILTERS, PERSON_COLUMNS,
  assertAnonKey, assertMainTarget, planCopy, runCopy, scrubRow, summarisePlan,
} from "./catalogue-copy.mjs";

const PROD = "prodprodprodprodprod";
const STAGING = "stagstagstagstagstag";
const jwt = (payload) => ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");
const SCRIPT = fs.readFileSync(new URL("../copy-catalogue-to-staging.mjs", import.meta.url), "utf8");

describe("main is only ever read with its public key", () => {
  it("accepts anon and publishable keys", () => {
    expect(() => assertAnonKey(jwt({ role: "anon" }))).not.toThrow();
    expect(() => assertAnonKey("sb_publishable_abc123")).not.toThrow();
  });

  it("refuses service-role, secret, unknown and missing keys", () => {
    expect(() => assertAnonKey(jwt({ role: "service_role" }))).toThrow(/service_role/);
    expect(() => assertAnonKey("sb_secret_abc123")).toThrow(/secret/);
    expect(() => assertAnonKey("not-a-key")).toThrow(/recognisable/);
    expect(() => assertAnonKey("")).toThrow(/not set/);
    const key = jwt({ role: "anon" });
    expect(() => assertAnonKey(key, { stagingServiceRoleKey: key })).toThrow(/staging service-role/);
  });

  it("never gives main a service-role key in the script", () => {
    const mainClient = SCRIPT.match(/const main = createClient\(([^;]+)\);/);
    expect(mainClient?.[1]).toContain("MAIN_SUPABASE_ANON_KEY");
    expect(mainClient?.[1]).not.toMatch(/SERVICE_ROLE/);
    expect(SCRIPT).not.toMatch(/MAIN_SUPABASE_SERVICE/);
    // The key check runs before either client exists.
    expect(SCRIPT.indexOf("assertAnonKey(")).toBeLessThan(SCRIPT.indexOf("createClient("));
    expect(SCRIPT.indexOf("await requireStaging(")).toBeLessThan(SCRIPT.indexOf("createClient("));
  });

  it("only writes to staging, and never deletes", () => {
    expect(SCRIPT).not.toMatch(/main\.from\([^)]*\)\.(insert|upsert|update|delete)/);
    expect(SCRIPT).not.toMatch(/\.delete\(/);
  });

  it("checks main is the declared production project and not staging", () => {
    const env = { MAIN_SUPABASE_URL: `https://${PROD}.supabase.co`, PRODUCTION_PROJECT_REF: PROD };
    expect(assertMainTarget(env, STAGING)).toEqual({ ref: PROD, url: `https://${PROD}.supabase.co` });
    expect(() => assertMainTarget({ ...env, MAIN_SUPABASE_URL: `https://${STAGING}.supabase.co` }, STAGING)).toThrow(/staging/);
    expect(() => assertMainTarget({ ...env, PRODUCTION_PROJECT_REF: "otherotherotherother" }, STAGING)).toThrow(/PRODUCTION_PROJECT_REF/);
    expect(() => assertMainTarget({ ...env, MAIN_SUPABASE_URL: "http://localhost" }, STAGING)).toThrow(/MAIN_SUPABASE_URL/);
  });
});

describe("only the public catalogue is copied", () => {
  it("lists catalogue tables and nothing about people", () => {
    const personal = ["profiles", "user_pins", "user_pin_images", "users", "boards", "user_boards", "community_posts", "conversations", "messages",
      "pin_submissions", "trade_ratings", "post_reports", "comment_reports", "user_tracked_sets", "catalogue_research_runs", "import_batches", "feature_flags"];
    for (const t of personal) expect(CATALOGUE_TABLE_NAMES.has(t)).toBe(false);
    expect([...CATALOGUE_TABLE_NAMES]).toEqual([
      "catalogue_sources", "characters", "categories", "pin_sets", "pins",
      "pin_set_memberships", "pin_characters", "pin_categories", "pin_external_ids", "pin_images",
    ]);
  });

  it("reads only verified, searchable pins and displayable, non-Pin & Pop images", () => {
    expect(MAIN_FILTERS.pins).toEqual([["eq", "verification_status", "verified"], ["eq", "is_searchable", true]]);
    expect(MAIN_FILTERS.pin_images).toEqual([["eq", "public_display_allowed", true], ["neq", "source", "pin_and_pop"]]);
  });

  it("clears every column that points at a person", () => {
    const row = Object.fromEntries([...PERSON_COLUMNS.map((c) => [c, "user-uuid"]), ["title", "Mickey"]]);
    const out = scrubRow(row);
    for (const c of PERSON_COLUMNS) expect(out[c]).toBeNull();
    expect(out.title).toBe("Mickey");
    expect(scrubRow({ id: 1 })).toEqual({ id: 1 });
    // pins.import_batch_id points at import_batches, which is private and never copied.
    expect(INTERNAL_LINK_COLUMNS).toContain("import_batch_id");
    expect(scrubRow({ id: 1, import_batch_id: "b-1" })).toEqual({ id: 1, import_batch_id: null });
  });

  it("parents come before the rows that link to them", () => {
    const order = CATALOGUE_TABLES.map((t) => t.table);
    for (const spec of CATALOGUE_TABLES) {
      for (const parent of Object.values(spec.refs ?? {})) expect(order.indexOf(parent)).toBeLessThan(order.indexOf(spec.table));
    }
  });
});

describe("planCopy", () => {
  const main = {
    catalogue_sources: [{ id: "collectible_pintrader" }],
    characters: [{ id: "c-mickey", name: "Mickey" }, { id: "c-stitch", name: "Stitch" }],
    categories: [{ id: "k-1", name: "Limited" }],
    pin_sets: [{ id: "s-1", normalised_series: "doors" }],
    pins: [
      { id: "p-1", pinhunt_id: "PHUK-1", submitted_by: "u-9" },
      { id: "p-2", pinhunt_id: "PHUK-2" },
    ],
    pin_set_memberships: [{ pin_id: "p-1", set_id: "s-1" }],
    pin_characters: [
      { pin_id: "p-1", character_id: "c-mickey" },
      { pin_id: "p-2", character_id: "c-stitch" },
      { pin_id: "p-archived", character_id: "c-mickey" },
    ],
    pin_categories: [{ pin_id: "p-1", category_id: "k-1" }],
    pin_external_ids: [{ id: "e-1", pin_id: "p-1", source: "pinpics", external_id: "1" }, { id: "e-2", pin_id: "p-archived", source: "pinpics", external_id: "2" }],
    pin_images: [{ id: "i-1", pin_id: "p-1", image_url: "https://main/x.jpg", uploaded_by: "u-3" }],
  };

  it("copies everything into an empty staging, minus archived pins' links and person columns", () => {
    const plan = Object.fromEntries(planCopy(main, {}).map((p) => [p.table, p]));
    expect(plan.pins.rows).toHaveLength(2);
    expect(plan.pins.rows[0].submitted_by).toBeNull();
    expect(plan.pin_characters.rows).toEqual([{ pin_id: "p-1", character_id: "c-mickey" }, { pin_id: "p-2", character_id: "c-stitch" }]);
    expect(plan.pin_characters.skipped[0].key).toBe("1 row(s)");
    expect(plan.pin_external_ids.rows.map((r) => r.id)).toEqual(["e-1"]);
    expect(plan.pin_images.rows[0]).toMatchObject({ image_url: "https://main/x.jpg", uploaded_by: null });
  });

  it("reuses staging's own character/set rows and rewrites links to them", () => {
    const staging = { characters: [{ id: "staging-mickey", name: "Mickey" }], pin_sets: [{ id: "staging-doors", normalised_series: "doors" }] };
    const plan = Object.fromEntries(planCopy(main, staging).map((p) => [p.table, p]));
    expect(plan.characters.rows.map((r) => r.name)).toEqual(["Stitch"]);
    expect(plan.pin_sets.rows).toEqual([]);
    expect(plan.pin_characters.rows).toContainEqual({ pin_id: "p-1", character_id: "staging-mickey" });
    expect(plan.pin_set_memberships.rows).toEqual([{ pin_id: "p-1", set_id: "staging-doors" }]);
  });

  it("never overwrites a staging pin with the same PinHunt ID, and drops its links", () => {
    const plan = Object.fromEntries(planCopy(main, { pins: [{ id: "staging-p1", pinhunt_id: "PHUK-1" }] }).map((p) => [p.table, p]));
    expect(plan.pins.rows.map((r) => r.id)).toEqual(["p-2"]);
    expect(plan.pins.skipped).toEqual([{ key: "PHUK-1", reason: "pinhunt_id already in staging under another id" }]);
    expect(plan.pin_images.rows).toEqual([]);
    expect(plan.pin_set_memberships.rows).toEqual([]);
  });

  it("updates rows already copied by an earlier run (same id)", () => {
    const plan = Object.fromEntries(planCopy(main, { pins: [{ id: "p-1", pinhunt_id: "PHUK-1" }] }).map((p) => [p.table, p]));
    expect(plan.pins.rows.map((r) => r.id)).toEqual(["p-1", "p-2"]);
  });

  it("de-duplicates links that land on the same staging row", () => {
    const m = { ...main, characters: [{ id: "c-a", name: "Mickey" }, { id: "c-b", name: "Mickey Mouse" }],
      pin_characters: [{ pin_id: "p-1", character_id: "c-a" }, { pin_id: "p-1", character_id: "c-b" }] };
    const staging = { characters: [{ id: "s-m", name: "Mickey" }, { id: "s-m", name: "Mickey Mouse" }] };
    const plan = Object.fromEntries(planCopy(m, staging).map((p) => [p.table, p]));
    expect(plan.pin_characters.rows).toEqual([{ pin_id: "p-1", character_id: "s-m" }]);
  });
});

describe("keeping staging photos (#384)", () => {
  const main = { pins: [
    { id: "p-1", pinhunt_id: "PHUK-1", image_url: "https://main/1.jpg" },
    { id: "p-2", pinhunt_id: "PHUK-2", image_url: "https://main/2.jpg" },
    { id: "p-3", pinhunt_id: "PHUK-3", image_url: null },
    { id: "p-4", pinhunt_id: "PHUK-4", image_url: "https://main/4.jpg" },
  ] };
  const staging = { pins: [
    { id: "p-1", pinhunt_id: "PHUK-1", image_url: "https://staging/cleaned-1.jpg" },
    { id: "p-2", pinhunt_id: "PHUK-2", image_url: "https://main/2.jpg" },
    { id: "p-3", pinhunt_id: "PHUK-3", image_url: "https://staging/contributed-3.jpg" },
    { id: "p-4", pinhunt_id: "PHUK-4", image_url: null },
  ] };
  const pinsStep = (plan) => plan.find((p) => p.table === "pins");

  it("keeps a staging photo that differs from main's, by default", () => {
    const step = pinsStep(planCopy(main, staging));
    const byId = Object.fromEntries(step.rows.map((r) => [r.id, r.image_url]));
    expect(byId).toEqual({
      "p-1": "https://staging/cleaned-1.jpg", // cleaned in staging
      "p-2": "https://main/2.jpg", // same as main
      "p-3": "https://staging/contributed-3.jpg", // main has none, staging does
      "p-4": "https://main/4.jpg", // staging has none, main's fills it
    });
    expect(step.kept).toBe(2);
  });

  it("--refresh-images takes main's photos", () => {
    const step = pinsStep(planCopy(main, staging, { refreshImages: true }));
    expect(step.rows.map((r) => r.image_url)).toEqual(["https://main/1.jpg", "https://main/2.jpg", null, "https://main/4.jpg"]);
    expect(step.kept).toBe(0);
  });

  it("pins new to staging are copied as they are", () => {
    const step = pinsStep(planCopy(main, {}));
    expect(step.rows.map((r) => r.image_url)).toEqual(["https://main/1.jpg", "https://main/2.jpg", null, "https://main/4.jpg"]);
  });

  it("the report says how many staging photos were kept", () => {
    const lines = summarisePlan(planCopy(main, staging));
    expect(lines.find((l) => l.startsWith("pins"))).toMatch(/kept 2 staging photo\(s\)/);
  });

  it("runCopy passes the option through and writes the kept photos back", async () => {
    const upsert = vi.fn(async () => {});
    const deps = {
      readMain: async (t) => (t === "pins" ? main.pins : []),
      readStaging: async (t) => (t === "pins" ? staging.pins : []),
      upsert,
      log: () => {},
    };
    await runCopy({ apply: true }, deps);
    const written = upsert.mock.calls.filter(([t]) => t === "pins").flatMap(([, rows]) => rows);
    expect(written.find((r) => r.id === "p-1").image_url).toBe("https://staging/cleaned-1.jpg");
    upsert.mockClear();
    await runCopy({ apply: true, refreshImages: true }, deps);
    const refreshed = upsert.mock.calls.filter(([t]) => t === "pins").flatMap(([, rows]) => rows);
    expect(refreshed.find((r) => r.id === "p-1").image_url).toBe("https://main/1.jpg");
  });
});

describe("runCopy", () => {
  const deps = (over = {}) => ({
    readMain: vi.fn(async (table) => (table === "pins" ? [{ id: "p-1", pinhunt_id: "PHUK-1" }, { id: "p-2", pinhunt_id: "PHUK-2" }] : [])),
    readStaging: vi.fn(async () => []),
    upsert: vi.fn(async () => {}),
    log: () => {},
    ...over,
  });

  it("writes nothing without --apply", async () => {
    const d = deps();
    const result = await runCopy({ apply: false }, d);
    expect(d.upsert).not.toHaveBeenCalled();
    expect(result.written).toBe(0);
    expect(d.readMain).toHaveBeenCalledWith("pins", MAIN_FILTERS.pins);
    expect(d.readStaging).toHaveBeenCalledWith("pins", ["id", "pinhunt_id", "image_url"]);
  });

  it("with --apply upserts by primary key, table by table", async () => {
    const d = deps();
    const result = await runCopy({ apply: true }, d);
    expect(d.upsert).toHaveBeenCalledWith("pins", expect.any(Array), ["id"]);
    expect(result).toMatchObject({ written: 2, failed: [] });
  });

  it("isolates bad rows so the rest still land", async () => {
    const upsert = vi.fn(async (table, rows) => {
      if (rows.some((r) => r.id === "p-2")) throw new Error("violates check constraint");
    });
    const result = await runCopy({ apply: true }, deps({ upsert }));
    expect(result.written).toBe(1);
    expect(result.failed).toEqual([{ table: "pins", key: "p-2", reason: "violates check constraint" }]);
  });
});
