/**
 * Marketplace leads CLI and set probe (SG-10, #415): no provider call by
 * default, read-only stores, the probe's budget guard, and terminal output
 * without listing detail. Stores and the Soldgraph client are fakes; nothing
 * here reaches a database or a network.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { validateResearchRun } from "../../../lib/research-run";
import type { SoldgraphClient, SoldgraphSearchResult } from "../../soldgraph/client";
import { BudgetExceededError } from "../../soldgraph/errors";
import { ANCHORS, CATALOGUE, NOW, SETS, SOURCES, fixtureListings } from "../__fixtures__/leads";
import type { BudgetStatus, SourceRow } from "../refresh/types";
import { LeadsUsageError, executeLeadsCli, parseLeadsArgs, type LeadsCliDeps, type LeadsCliOptions } from "./cli";
import type { LeadsStore } from "./store";
import { setsWithGaps } from "./probe";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const ON = { SOLDGRAPH_ENABLED: "true", SOLDGRAPH_API_KEY: "test-key-not-real" } as NodeJS.ProcessEnv;

/** Read-only fake: any write method would be a bug, so none exists. */
function leadsStore(): LeadsStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async loadSources() { calls.push("sources"); return SOURCES; },
    async loadNearMisses() { calls.push("near-misses"); return fixtureListings(); },
    async loadCatalogue() { calls.push("catalogue"); return CATALOGUE; },
    async loadAnchors(uuids: string[]) { calls.push("anchors"); return new Map([...ANCHORS].filter(([u]) => uuids.includes(u))); },
    async loadSets() { calls.push("sets"); return SETS; },
  };
}

const SOURCE_ROWS: SourceRow[] = [
  { id: "soldgraph:ebay_gb_sold", provider: "soldgraph", market: "UK", evidenceType: "sold", enabled: true, retentionDays: 30 },
  { id: "soldgraph:ebay_fr_sold", provider: "soldgraph", market: "FR", evidenceType: "sold", enabled: false, retentionDays: 30 },
];

function refreshStore(used = 0, limit = 100) {
  const budget = vi.fn(async (month: string): Promise<BudgetStatus> =>
    ({ month, usedCredits: used, requests: used, limitCredits: limit, hardStop: true, origin: "default" }));
  const loadSources = vi.fn(async () => SOURCE_ROWS);
  return { budget, loadSources };
}

/** Raw Soldgraph eBay sold rows for a set search, with image and seller fields that must be dropped. */
const PROBE_ROWS = [
  { item_id: "p-1", title: "Madame Leota pin Haunted Mansion 50th Anniversary 2021 LE 2000", price: { value: "30", currency: "GBP" },
    sold_date: "2026-10-10T10:00:00Z", best_offer_accepted: false, url: "https://www.ebay.co.uk/itm/PROBE_URL_SENTINEL",
    image_url: "https://i.ebayimg.example/IMAGE_SENTINEL.jpg", seller: { username: "SELLER_SENTINEL" } },
  { item_id: "p-2", title: "Haunted Mansion 50th Anniversary Madame Leota LE 2000 pin 2021", price: 32, currency: "GBP",
    sold_date: "2026-10-09T10:00:00Z", best_offer_accepted: false },
  { item_id: "p-3", title: "Madame Leota Haunted Mansion 50th Anniversary pin LE 2000 2021", price: 31, currency: "GBP",
    sold_date: "2026-10-08T10:00:00Z", best_offer_accepted: false },
];

function fakeClient(opts: { failOn?: number } = {}) {
  let n = 0;
  const search = vi.fn(async (): Promise<SoldgraphSearchResult<unknown>> => {
    n += 1;
    if (opts.failOn !== undefined && n >= opts.failOn) throw new BudgetExceededError("2026-10", 100, 100);
    return { rows: PROBE_ROWS, pages: 1, truncated: false, requestIds: [] };
  });
  return { client: { search } as unknown as SoldgraphClient, search };
}

function setup(over: Partial<LeadsCliDeps> = {}) {
  const lines: string[] = [];
  const written: Array<{ file: string; text: string }> = [];
  const store = leadsStore();
  const createClient = vi.fn((): SoldgraphClient => { throw new Error("no provider call expected"); });
  const rs = refreshStore();
  const deps: LeadsCliDeps = {
    leadsStore: store,
    refreshStore: rs,
    env: ON,
    print: l => lines.push(l),
    now: () => NOW,
    createClient,
    writeFile: (file, text) => written.push({ file, text }),
    fileExists: () => false,
    repoRoot: "/repo",
    ...over,
  };
  return { deps, lines, written, store, createClient, rs };
}

const opts = (argv: string[]): LeadsCliOptions => ({ ...parseLeadsArgs(argv), gitCommit: COMMIT });

// ─── Arguments ───────────────────────────────────────────────────────────────

describe("parseLeadsArgs", () => {
  it("defaults to a report from stored listings with no probe and no apply", () => {
    expect(parseLeadsArgs([])).toMatchObject({
      out: null, windowDays: 180, minListings: 3, minMarketplaces: 2, probeSets: false, apply: false, confirmCredits: null,
    });
  });

  it("refuses --apply without --probe-sets: the report never writes to the database", () => {
    expect(() => parseLeadsArgs(["--apply"])).toThrow(/only for --probe-sets/);
  });

  it("checks the probe options", () => {
    expect(() => parseLeadsArgs(["--probe-sets"])).toThrow(/--probe-sources/);
    expect(() => parseLeadsArgs(["--probe-sets", "--probe-sources", "soldgraph:nope"])).toThrow(/unknown source/);
    expect(() => parseLeadsArgs(["--probe-sets", "--probe-sources", "soldgraph:ebay_gb_sold", "--apply", "--confirm-credits", "1"])).toThrow(/needs --out/);
    expect(() => parseLeadsArgs(["--probe-sets", "--probe-sources", "soldgraph:ebay_gb_sold", "--max-probe-sets", "11"])).toThrow(/1 to 10/);
    expect(() => parseLeadsArgs(["--probe-sources", "soldgraph:ebay_gb_sold"])).toThrow(/need --probe-sets/);
  });

  it("never allows single-listing leads or a non-JSON output file", () => {
    expect(() => parseLeadsArgs(["--min-listings", "1"])).toThrow(LeadsUsageError);
    expect(() => parseLeadsArgs(["--min-marketplaces", "1"])).toThrow(LeadsUsageError);
    expect(() => parseLeadsArgs(["--out", "leads.txt"])).toThrow(/\.json/);
    expect(() => parseLeadsArgs(["--all"])).toThrow(/Unknown flag/);
  });
});

// ─── Default run ─────────────────────────────────────────────────────────────

describe("executeLeadsCli (default: stored listings only)", () => {
  it("makes no provider call and reads no budget", async () => {
    const { deps, createClient, rs, lines } = setup();
    expect(await executeLeadsCli(opts([]), deps)).toBe(0);
    expect(createClient).not.toHaveBeenCalled();
    expect(rs.budget).not.toHaveBeenCalled();
    expect(rs.loadSources).not.toHaveBeenCalled();
    expect(lines).toContain("No provider calls: stored listings only.");
  });

  it("writes a valid research-run file with --out, outside the repository", async () => {
    const { deps, written, lines } = setup();
    expect(await executeLeadsCli(opts(["--out", "/tmp/leads/leads.json"]), deps)).toBe(0);
    expect(written).toHaveLength(1);
    expect(written[0].file).toBe("/tmp/leads/leads.json");
    const payload = JSON.parse(written[0].text);
    expect(validateResearchRun(payload).ok).toBe(true);
    expect(payload.engine_version).toBe("marketplace-leads/1");
    expect(payload.git_commit).toBe(COMMIT);
    expect(lines.some(l => /^Validated: \d+ pin lead\(s\)/.test(l))).toBe(true);
  });

  it("only reports without --out", async () => {
    const { deps, written } = setup();
    await executeLeadsCli(opts([]), deps);
    expect(written).toHaveLength(0);
  });

  it("refuses an output file inside the repository or one that exists", async () => {
    const inside = setup();
    await expect(executeLeadsCli(opts(["--out", "/repo/artifacts/leads.json"]), inside.deps)).rejects.toThrow(/outside the repository/);
    expect(inside.store.calls).toHaveLength(0);
    const exists = setup({ fileExists: () => true });
    await expect(executeLeadsCli(opts(["--out", "/tmp/leads.json"]), exists.deps)).rejects.toThrow(/already exists/);
  });

  it("refuses an output folder that is a link back into the repository", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leads-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      fs.symlinkSync(repo, path.join(tmp, "link"));
      const { deps } = setup({ repoRoot: repo });
      await expect(executeLeadsCli(opts(["--out", path.join(tmp, "link", "leads.json")]), deps)).rejects.toThrow(/outside the repository/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("needs a git commit for the research-run format", async () => {
    const { deps } = setup();
    await expect(executeLeadsCli({ ...parseLeadsArgs([]), gitCommit: null }, deps)).rejects.toThrow(/git commit/);
  });

  it("prints counts only: no titles, links, seller words or keys", async () => {
    const { deps, lines } = setup();
    await executeLeadsCli(opts([]), deps);
    const text = lines.join("\n");
    for (const l of fixtureListings()) expect(text).not.toContain(l.title);
    expect(text).not.toMatch(/https?:|SELLERWORD|test-key-not-real/);
  });
});

// ─── Set probe ───────────────────────────────────────────────────────────────

describe("set probe", () => {
  const probeArgs = ["--probe-sets", "--probe-sources", "soldgraph:ebay_gb_sold"];

  it("finds catalogue sets with fewer pins than expected", () => {
    expect(setsWithGaps(SETS, CATALOGUE)).toEqual([{ setName: "Haunted Mansion 50th Anniversary", expected: 5, known: 1 }]);
  });

  it("is a dry run without --apply: plan and budget only, no client", async () => {
    const { deps, createClient, lines, rs } = setup();
    expect(await executeLeadsCli(opts(probeArgs), deps)).toBe(0);
    expect(createClient).not.toHaveBeenCalled();
    expect(rs.budget).toHaveBeenCalled();
    expect(lines).toContain("Set probe: dry run (no provider calls)");
    expect(lines).toContain("Worst case: 1 credit(s) for 1 search(es).");
    expect(lines.some(l => l.includes("--apply --confirm-credits 1"))).toBe(true);
  });

  it("refuses --apply when the kill switch is off, the budget is short, the source is off or the credits are not confirmed", async () => {
    const cases: Array<[Partial<LeadsCliDeps>, string[], RegExp]> = [
      [{ env: {} as NodeJS.ProcessEnv }, ["--confirm-credits", "1"], /SOLDGRAPH_ENABLED/],
      [{ refreshStore: refreshStore(100, 100) }, ["--confirm-credits", "1"], /more than the 0 left/],
      [{}, ["--confirm-credits", "2"], /must equal the worst case shown \(1\)/],
      [{}, [], /--confirm-credits 1 is required/],
    ];
    for (const [over, extra, msg] of cases) {
      const { deps, createClient, lines, written } = setup(over);
      expect(await executeLeadsCli(opts([...probeArgs, "--apply", "--out", "/tmp/l.json", ...extra]), deps)).toBe(1);
      expect(createClient).not.toHaveBeenCalled();
      expect(written).toHaveLength(0);
      expect(lines.join("\n")).toMatch(msg);
    }
    const off = setup();
    expect(await executeLeadsCli(opts(["--probe-sets", "--probe-sources", "soldgraph:ebay_fr_sold", "--apply", "--out", "/tmp/l.json", "--confirm-credits", "1"]), off.deps)).toBe(1);
    expect(off.lines.join("\n")).toMatch(/not enabled for: soldgraph:ebay_fr_sold/);
  });

  it("with --apply spends at most the confirmed credits, and its listings become set-member leads", async () => {
    const fake = fakeClient();
    const { deps, written, lines } = setup({ createClient: () => fake.client });
    expect(await executeLeadsCli(opts([...probeArgs, "--apply", "--out", "/tmp/l.json", "--confirm-credits", "1"]), deps)).toBe(0);
    expect(fake.search).toHaveBeenCalledTimes(1);
    expect(lines.some(l => /^Probe: 1 search\(es\) run, 0 failed, 1 credit\(s\) reserved/.test(l))).toBe(true);
    const payload = JSON.parse(written[0].text);
    expect(validateResearchRun(payload).ok).toBe(true);
    const text = written[0].text;
    expect(text).not.toMatch(/IMAGE_SENTINEL|SELLER_SENTINEL|PROBE_URL_SENTINEL|https?:/);
    const leota = payload.candidates.find((c: { proposed: Record<string, unknown> }) => String(c.proposed["Title words"]).includes("madame leota"));
    expect(leota.review_reasons).toContain("possible_set_member:Haunted Mansion 50th Anniversary");
    // Probe rows are never stored: the leads store has no write method at all.
    expect(Object.keys(deps.leadsStore!).filter(k => /insert|upsert|update|delete|write/i.test(k))).toEqual([]);
  });

  it("stops when the Soldgraph budget guard refuses, and keeps going with what it has", async () => {
    const fake = fakeClient({ failOn: 1 });
    const { deps, lines } = setup({ createClient: () => fake.client });
    expect(await executeLeadsCli(opts([...probeArgs, "--apply", "--out", "/tmp/l.json", "--confirm-credits", "1"]), deps)).toBe(0);
    expect(lines).toContain("Stopped early (budget).");
    expect(lines.some(l => /^Probe: 0 search\(es\) run, 1 failed/.test(l))).toBe(true);
  });

  it("caps the sets searched per run", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`, normalisedSeries: `series ${i}`, setName: `Gap Set ${i}`, expectedPinCount: 3, releasedPinCount: 0, isComplete: false,
    }));
    const store = { ...leadsStore(), loadSets: async () => many };
    const { deps, lines } = setup({ leadsStore: store });
    await executeLeadsCli(opts([...probeArgs, "--max-probe-sets", "2"]), deps);
    expect(lines.filter(l => / of 3 known, /.test(l))).toHaveLength(2);
    expect(lines).toContain("Worst case: 2 credit(s) for 2 search(es).");
  });
});
