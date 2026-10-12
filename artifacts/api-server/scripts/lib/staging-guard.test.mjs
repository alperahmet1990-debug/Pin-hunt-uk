import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  STAGING_MARKER_BUCKET,
  assertStagingMarker,
  assertStagingTarget,
  productionRefs,
  readEnvValue,
  refFromSupabaseUrl,
  requireStaging,
} from "./staging-guard.mjs";

const STAGING = "stagingrefaaaaaaaaaa";
const PROD = "productionrefbbbbbbb";
const ok = {
  PINHUNT_ENV: "staging",
  STAGING_PROJECT_REF: STAGING,
  PRODUCTION_PROJECT_REF: PROD,
  SUPABASE_URL: `https://${STAGING}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
};
const none = new Set();

describe("assertStagingTarget", () => {
  it("accepts a fully identified staging target", () => {
    expect(assertStagingTarget(ok, { production: new Set([PROD]) })).toEqual({ ref: STAGING, url: `https://${STAGING}.supabase.co` });
  });

  it("tolerates a trailing slash and upper case in the URL", () => {
    expect(() => assertStagingTarget({ ...ok, SUPABASE_URL: `HTTPS://${STAGING.toUpperCase()}.supabase.co/` }, { production: none })).not.toThrow();
  });

  it.each([
    ["no PINHUNT_ENV", { PINHUNT_ENV: undefined }, /PINHUNT_ENV/],
    ["PINHUNT_ENV=production", { PINHUNT_ENV: "production" }, /PINHUNT_ENV/],
    ["missing staging ref", { STAGING_PROJECT_REF: "" }, /STAGING_PROJECT_REF/],
    ["malformed staging ref", { STAGING_PROJECT_REF: "short" }, /STAGING_PROJECT_REF/],
    ["missing production ref (can't verify)", { PRODUCTION_PROJECT_REF: undefined }, /can't be verified/],
    ["staging ref equals production ref", { STAGING_PROJECT_REF: PROD, SUPABASE_URL: `https://${PROD}.supabase.co` }, /is the production project/],
    ["URL for another project", { SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co" }, /SUPABASE_URL/],
    ["non-Supabase URL", { SUPABASE_URL: "http://localhost:54321" }, /SUPABASE_URL/],
    ["no service-role key", { SUPABASE_SERVICE_ROLE_KEY: "" }, /SERVICE_ROLE/],
  ])("refuses: %s", (_label, patch, message) => {
    expect(() => assertStagingTarget({ ...ok, ...patch }, { production: none })).toThrow(message);
  });

  it("refuses a target found in a local production .env", () => {
    expect(() => assertStagingTarget(ok, { production: new Set([STAGING]) })).toThrow(/production project/);
  });
});

describe("productionRefs", () => {
  it("collects the declared ref and the refs in local .env files, ignoring other keys", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"));
    fs.mkdirSync(path.join(root, "a"));
    fs.writeFileSync(path.join(root, "a/.env"), 'SECRET=x\nSUPABASE_URL="https://cccccccccccccccccccc.supabase.co"\n');
    fs.writeFileSync(path.join(root, ".env"), "export EXPO_PUBLIC_SUPABASE_URL=https://dddddddddddddddddddd.supabase.co/\n");
    const refs = productionRefs({ PRODUCTION_PROJECT_REF: PROD }, { repoRoot: root, files: ["a/.env", ".env", "missing/.env"] });
    expect([...refs].sort()).toEqual(["cccccccccccccccccccc", "dddddddddddddddddddd", PROD].sort());
  });

  it("reads single keys and parses refs strictly", () => {
    expect(readEnvValue("/nonexistent/.env", "SUPABASE_URL")).toBeNull();
    expect(refFromSupabaseUrl("https://abc.supabase.co")).toBeNull();
    expect(refFromSupabaseUrl(`https://${STAGING}.supabase.co.evil.com`)).toBeNull();
  });
});

describe("assertStagingMarker / requireStaging", () => {
  const client = (bucket) => ({
    storage: { getBucket: vi.fn(async () => (bucket ? { data: { id: bucket }, error: null } : { data: null, error: { message: "not found" } })) },
  });

  it("passes only when the marker bucket exists", async () => {
    await expect(assertStagingMarker(client(STAGING_MARKER_BUCKET))).resolves.toBeUndefined();
    await expect(assertStagingMarker(client(null))).rejects.toThrow(/staging:restore/);
  });

  it("exits before returning when any check fails", async () => {
    const exit = vi.fn();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(requireStaging({ ...ok, PINHUNT_ENV: "production" }, { exit, createClient: () => client(STAGING_MARKER_BUCKET) })).rejects.toThrow();
    expect(exit).toHaveBeenCalledWith(1);
    await expect(requireStaging(ok, { exit, createClient: () => client(null) })).rejects.toThrow(/staging:restore/);
    err.mockRestore();
  });

  it("returns the target when everything checks out", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = { ...ok, PRODUCTION_PROJECT_REF: "eeeeeeeeeeeeeeeeeeee" };
    // Real productionRefs() reads this repo's local .env files; the fake staging ref can't be in them.
    await expect(requireStaging(env, { exit: vi.fn(), createClient: () => client(STAGING_MARKER_BUCKET) })).resolves.toEqual({ ref: STAGING, url: `https://${STAGING}.supabase.co` });
    log.mockRestore();
  });
});
