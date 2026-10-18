/**
 * The market refresh scripts load their code through an esbuild bundle (#409).
 * This builds it the same way (no network, no database) and checks the
 * scripts will find what they call.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEADS_ENTRY, bundleMarketRefresh, loadMarketRefresh } from "./market-refresh-loader.mjs";

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("market refresh loader", () => {
  it("bundles the service code with the logger silenced and packages external", async () => {
    const code = await bundleMarketRefresh();
    expect(code).not.toMatch(/from ["']pino["']/);
    expect(code).toMatch(/from ["']@supabase\/supabase-js["']/);
    expect(code).not.toMatch(/from ["']@workspace\//);
  }, 60_000);

  it("exports what the scripts call", async () => {
    const core = await loadMarketRefresh();
    for (const name of ["parseCliArgs", "executeRefreshCli", "parseUsageArgs", "executeUsageCli"]) {
      expect(typeof core[name]).toBe("function");
    }
    expect(() => core.parseCliArgs(["--all"])).toThrow(/no --all/);
    expect(core.parseCliArgs(["--pinhunt-ids", "PHUK-00000001", "--sources", "soldgraph:ebay_gb_sold"]).apply).toBe(false);
  }, 60_000);

  it("bundles the marketplace leads code the same way, and exports what its script calls (#415)", async () => {
    const code = await bundleMarketRefresh(LEADS_ENTRY);
    expect(code).not.toMatch(/from ["']pino["']/);
    expect(code).not.toMatch(/from ["']@workspace\//);
    const core = await loadMarketRefresh(LEADS_ENTRY);
    for (const name of ["parseLeadsArgs", "executeLeadsCli"]) expect(typeof core[name]).toBe("function");
    expect(core.parseLeadsArgs([]).probeSets).toBe(false);
    expect(() => core.parseLeadsArgs(["--apply"])).toThrow(/only for --probe-sets/);
  }, 60_000);

  it("every script parses arguments before the guard, and the guard before any client", () => {
    for (const file of ["../market-refresh.mjs", "../market-usage.mjs", "../marketplace-leads.mjs"]) {
      const src = read(file);
      const parse = src.search(/core\.parse(Cli|Usage|Leads)Args\(/);
      const guard = src.search(/await requireStaging\(/);
      const client = src.search(/createClient\(/);
      expect(parse).toBeGreaterThan(-1);
      expect(parse).toBeLessThan(guard);
      expect(guard).toBeLessThan(client);
      expect(src).not.toMatch(/console\.(log|error)\((?!redact)/);
    }
  });
});
