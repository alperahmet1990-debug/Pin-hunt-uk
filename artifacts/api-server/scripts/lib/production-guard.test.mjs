import { describe, expect, it, vi } from "vitest";
import { STAGING_MARKER_BUCKET } from "./staging-guard.mjs";
import { assertNotStagingMarker, assertProductionTarget, requireProduction } from "./production-guard.mjs";

const STAGING = "stagingrefaaaaaaaaaa";
const PROD = "productionrefbbbbbbb";
const ok = {
  PINHUNT_ENV: "production",
  STAGING_PROJECT_REF: STAGING,
  PRODUCTION_PROJECT_REF: PROD,
  SUPABASE_URL: `https://${PROD}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "production-service-role",
};

const bucketClient = (result) => ({ storage: { getBucket: vi.fn(async () => result) } });
const NOT_FOUND = { data: null, error: { message: "Bucket not found" } };

describe("assertProductionTarget", () => {
  it("accepts a fully identified production target with the ref typed out", () => {
    expect(assertProductionTarget(ok, PROD)).toEqual({ ref: PROD, url: `https://${PROD}.supabase.co` });
  });

  it.each([
    ["no PINHUNT_ENV", { PINHUNT_ENV: undefined }, PROD, /PINHUNT_ENV/],
    ["PINHUNT_ENV=staging", { PINHUNT_ENV: "staging" }, PROD, /PINHUNT_ENV/],
    ["missing production ref", { PRODUCTION_PROJECT_REF: "" }, PROD, /PRODUCTION_PROJECT_REF must be/],
    ["typed ref missing", {}, undefined, /typed exactly/],
    ["typed ref is the staging ref", {}, STAGING, /typed exactly/],
    ["typed ref off by one character", {}, `${PROD.slice(0, -1)}c`, /typed exactly/],
    ["missing staging ref", { STAGING_PROJECT_REF: undefined }, PROD, /can't be told apart/],
    ["staging ref equals production", { STAGING_PROJECT_REF: PROD }, PROD, /same project/],
    ["URL points at staging", { SUPABASE_URL: `https://${STAGING}.supabase.co` }, PROD, /SUPABASE_URL/],
    ["URL is not a Supabase project URL", { SUPABASE_URL: "https://example.com" }, PROD, /SUPABASE_URL/],
    ["no service key", { SUPABASE_SERVICE_ROLE_KEY: "" }, PROD, /SUPABASE_SERVICE_ROLE_KEY/],
  ])("refuses: %s", (_label, over, typed, re) => {
    expect(() => assertProductionTarget({ ...ok, ...over }, typed)).toThrow(re);
  });

  it("never puts the service key in an error", () => {
    try {
      assertProductionTarget({ ...ok, SUPABASE_URL: "https://example.com" }, PROD);
    } catch (err) {
      expect(String(err.message)).not.toContain(ok.SUPABASE_SERVICE_ROLE_KEY);
    }
  });
});

describe("assertNotStagingMarker", () => {
  it("passes only when the staging marker bucket is clearly not there", async () => {
    await expect(assertNotStagingMarker(bucketClient(NOT_FOUND))).resolves.toBeUndefined();
  });

  it("refuses a project that holds the staging marker", async () => {
    await expect(assertNotStagingMarker(bucketClient({ data: { id: STAGING_MARKER_BUCKET }, error: null }))).rejects.toThrow(/staging project, not production/);
  });

  it("refuses when the check itself fails (network, permissions)", async () => {
    await expect(assertNotStagingMarker(bucketClient({ data: null, error: { message: "fetch failed" } }))).rejects.toThrow(/could not confirm/);
  });
});

describe("requireProduction", () => {
  it("returns the target after both checks, using the production URL", async () => {
    const createClient = vi.fn(() => bucketClient(NOT_FOUND));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(requireProduction(ok, PROD, { createClient, exit: vi.fn() })).resolves.toEqual({ ref: PROD, url: `https://${PROD}.supabase.co` });
    expect(createClient.mock.calls[0][0]).toBe(`https://${PROD}.supabase.co`);
    expect(log.mock.calls[0][0]).toMatch(/verified PRODUCTION project productionrefbbbbbbb/);
    log.mockRestore();
  });

  it("exits before creating any client when the env checks fail", async () => {
    const createClient = vi.fn();
    const exit = vi.fn();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(requireProduction({ ...ok, PINHUNT_ENV: "staging" }, PROD, { createClient, exit })).rejects.toThrow();
    expect(exit).toHaveBeenCalledWith(1);
    expect(createClient).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("exits when the target turns out to be staging", async () => {
    const exit = vi.fn();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(requireProduction(ok, PROD, { createClient: () => bucketClient({ data: { id: STAGING_MARKER_BUCKET }, error: null }), exit })).rejects.toThrow();
    expect(exit).toHaveBeenCalledWith(1);
    err.mockRestore();
  });
});
