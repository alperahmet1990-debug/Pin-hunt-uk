import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertStagingTarget, readSupabaseUrlFromEnvFile } from "./staging-guard.mjs";

const REF = "abcdefghijklmnopqrst";
const ok = {
  PINHUNT_ENV: "staging",
  STAGING_PROJECT_REF: REF,
  SUPABASE_URL: `https://${REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
};

describe("assertStagingTarget", () => {
  it("accepts a matching staging target", () => {
    expect(assertStagingTarget(ok)).toEqual({ ref: REF, url: `https://${REF}.supabase.co` });
  });

  it("tolerates a trailing slash and upper case in the URL", () => {
    expect(() => assertStagingTarget({ ...ok, SUPABASE_URL: `HTTPS://${REF.toUpperCase()}.supabase.co/` })).not.toThrow();
  });

  it("refuses without PINHUNT_ENV=staging", () => {
    expect(() => assertStagingTarget({ ...ok, PINHUNT_ENV: undefined })).toThrow(/PINHUNT_ENV/);
    expect(() => assertStagingTarget({ ...ok, PINHUNT_ENV: "production" })).toThrow(/PINHUNT_ENV/);
  });

  it("refuses a missing or malformed project ref", () => {
    expect(() => assertStagingTarget({ ...ok, STAGING_PROJECT_REF: "" })).toThrow(/STAGING_PROJECT_REF/);
    expect(() => assertStagingTarget({ ...ok, STAGING_PROJECT_REF: "short" })).toThrow(/STAGING_PROJECT_REF/);
  });

  it("refuses a URL for a different project", () => {
    expect(() => assertStagingTarget({ ...ok, SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co" })).toThrow(/does not match/);
  });

  it("refuses without a service-role key", () => {
    expect(() => assertStagingTarget({ ...ok, SUPABASE_SERVICE_ROLE_KEY: "" })).toThrow(/SERVICE_ROLE/);
  });

  it("refuses when the target is the production URL", () => {
    expect(() => assertStagingTarget(ok, { productionUrl: `https://${REF}.supabase.co/` })).toThrow(/production/);
  });
});

describe("readSupabaseUrlFromEnvFile", () => {
  it("reads only SUPABASE_URL, and returns null for a missing file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-"));
    const file = path.join(dir, ".env");
    fs.writeFileSync(file, 'EXPO_PUBLIC_SUPABASE_URL=https://other.supabase.co\nSUPABASE_URL="https://prod.supabase.co"\nSECRET=x\n');
    expect(readSupabaseUrlFromEnvFile(file)).toBe("https://prod.supabase.co");
    expect(readSupabaseUrlFromEnvFile(path.join(dir, "missing"))).toBeNull();
  });
});
