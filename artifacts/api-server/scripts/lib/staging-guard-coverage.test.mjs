/**
 * Every script that can write to a Supabase database must call the staging
 * guard before connecting. This fails when a new or edited script doesn't.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIRS = ["artifacts/api-server/scripts", "scripts"];
// Read-only with the service role (reports only, no writes).
const READ_ONLY = new Set(["artifacts/api-server/scripts/dryrun-collectible-pintrader.mjs"]);
// The staging-db tool runs its own guard (assertStagingTarget + per-project connections).
const OWN_GUARD = new Set(["artifacts/api-server/scripts/staging-db.mjs"]);
// Their database writes live in bundled service code (src/services/market/refresh),
// so the pattern check can't see them: always require the guard (#409).
const ALWAYS_GUARDED = new Set([
  "artifacts/api-server/scripts/market-refresh.mjs",
  "artifacts/api-server/scripts/market-usage.mjs",
]);

const WRITES = /\.(insert|upsert|update|delete|upload|remove|rpc)\(|auth\.admin\.|\b(INSERT|UPDATE|DELETE)\b|\\copy/;
// Connects itself: a Supabase client or a spawned psql (comments don't count).
const CONNECTS = /createClient\(|spawn(Sync)?\(\s*["']psql/;

function scripts() {
  return DIRS.flatMap((dir) =>
    fs.readdirSync(path.join(ROOT, dir))
      .filter((f) => /\.(mjs|ts|sql)$/.test(f) && !f.includes(".test.") && !f.endsWith(".d.mts"))
      .map((f) => `${dir}/${f}`));
}

describe("staging guard coverage", () => {
  const files = scripts();

  it("finds the scripts", () => {
    expect(files).toContain("artifacts/api-server/scripts/import-collectible-pintrader.mjs");
    expect(files).toContain("scripts/bulk-import.sql");
  });

  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    const writes = file.endsWith(".sql") ? /\b(insert|update|delete)\b/i.test(src) : WRITES.test(src) && CONNECTS.test(src);
    if ((!writes && !ALWAYS_GUARDED.has(file)) || READ_ONLY.has(file) || OWN_GUARD.has(file)) continue;

    it(`${file} checks it's on staging before writing`, () => {
      if (file.endsWith(".sql")) {
        expect(src.indexOf("pinhunt-staging-marker")).toBeGreaterThan(-1);
        // psql must stop on the guard's exception rather than carry on.
        expect(src.indexOf("\\set ON_ERROR_STOP on")).toBe(0);
        expect(src.indexOf("pinhunt-staging-marker")).toBeLessThan(src.search(/^\s*(insert|update|delete|\\copy)/im));
        return;
      }
      const guard = src.search(/await requireStaging\(/);
      const client = src.search(/createClient\(/);
      expect(guard).toBeGreaterThan(-1);
      expect(client === -1 || guard < client).toBe(true);
    });
  }

  it("finds the market refresh scripts (#409)", () => {
    for (const file of ALWAYS_GUARDED) expect(files).toContain(file);
  });

  it("read-only exceptions really don't write", () => {
    for (const file of READ_ONLY) {
      expect(fs.readFileSync(path.join(ROOT, file), "utf8")).not.toMatch(/\.(insert|upsert|delete|upload|remove|rpc)\(|\.from\([^)]*\)\s*\.update\(/);
    }
  });
});
