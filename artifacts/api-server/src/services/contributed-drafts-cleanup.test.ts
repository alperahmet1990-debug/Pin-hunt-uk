import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { DRAFT_MAX_AGE_MS, purgeStaleDrafts, startDraftCleanup } from "./contributed-drafts-cleanup";

// A fake storage that lists like Supabase: "" gives one folder per user
// (id null), a folder path gives the files directly inside it.
type Files = Map<string, string>; // path -> updated_at ISO

function fakeDb(buckets: Record<string, Files | "missing">) {
  return {
    storage: {
      from: (name: string) => {
        const files = buckets[name];
        return {
          list: async (prefix: string, opts: { limit: number; offset?: number }) => {
            if (files === "missing" || files === undefined) return { data: null, error: { message: "Bucket not found" } };
            if (prefix === "") {
              const users = [...new Set([...files.keys()].map((p) => p.split("/")[0]))].sort();
              const page = users.slice(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit);
              return { data: page.map((u) => ({ name: u, id: null, updated_at: null, created_at: null })), error: null };
            }
            const inside = [...files.entries()]
              .filter(([p]) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes("/"))
              .map(([p, at]) => ({ name: p.slice(prefix.length + 1), id: `id-${p}`, updated_at: at, created_at: at }));
            return { data: inside, error: null };
          },
          remove: async (paths: string[]) => {
            if (files === "missing" || files === undefined) return { data: null, error: { message: "Bucket not found" } };
            paths.forEach((p) => files.delete(p));
            return { data: [], error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
}

const NOW = Date.parse("2026-11-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("purgeStaleDrafts", () => {
  it("deletes drafts older than 24 hours from both contribution buckets", async () => {
    const cleaned: Files = new Map([
      ["user-a/drafts/PHUK-1__old.jpg", ago(25 * HOUR)],
      ["user-b/drafts/PHUK-2__fresh.jpg", ago(2 * HOUR)],
    ]);
    const raw: Files = new Map([
      ["user-a/drafts/PHUK-1__old.jpg", ago(25 * HOUR)],
      ["user-b/drafts/PHUK-2__fresh.jpg", ago(2 * HOUR)],
    ]);
    const res = await purgeStaleDrafts(fakeDb({ "pin-contributed-images": cleaned, "pin-contributed-raw": raw }), NOW);
    expect(res).toEqual({ removed: 2, failedBuckets: [] });
    expect([...cleaned.keys()]).toEqual(["user-b/drafts/PHUK-2__fresh.jpg"]);
    expect([...raw.keys()]).toEqual(["user-b/drafts/PHUK-2__fresh.jpg"]);
  });

  it("never touches submitted photos, however old", async () => {
    const cleaned: Files = new Map([
      ["user-a/PHUK-1/1700000000000.jpg", ago(400 * 24 * HOUR)],
      ["user-a/drafts/PHUK-1__old.jpg", ago(30 * HOUR)],
    ]);
    const raw: Files = new Map([["user-a/PHUK-1/1700000000000.jpg", ago(400 * 24 * HOUR)]]);
    await purgeStaleDrafts(fakeDb({ "pin-contributed-images": cleaned, "pin-contributed-raw": raw }), NOW);
    expect([...cleaned.keys()]).toEqual(["user-a/PHUK-1/1700000000000.jpg"]);
    expect([...raw.keys()]).toEqual(["user-a/PHUK-1/1700000000000.jpg"]);
  });

  it("keeps a draft exactly at the limit, and one with no usable timestamp", async () => {
    const cleaned: Files = new Map([
      ["user-a/drafts/at-limit.jpg", ago(DRAFT_MAX_AGE_MS)],
      ["user-b/drafts/no-date.jpg", "not a date"],
    ]);
    const res = await purgeStaleDrafts(fakeDb({ "pin-contributed-images": cleaned, "pin-contributed-raw": new Map() }), NOW);
    expect(res.removed).toBe(0);
    expect(cleaned.size).toBe(2);
  });

  it("still sweeps the cleaned drafts when the raw bucket doesn't exist yet (079 not applied)", async () => {
    const cleaned: Files = new Map([["user-a/drafts/old.jpg", ago(48 * HOUR)]]);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await purgeStaleDrafts(fakeDb({ "pin-contributed-images": cleaned, "pin-contributed-raw": "missing" }), NOW);
    expect(res).toEqual({ removed: 1, failedBuckets: ["pin-contributed-raw"] });
    expect(cleaned.size).toBe(0);
    // Counts and bucket names only: no user ids or paths in the log.
    expect(spy.mock.calls.map((c) => c.join(" ")).join("\n")).not.toContain("user-a");
    spy.mockRestore();
  });

  it("pages through more users than one listing returns", async () => {
    const cleaned: Files = new Map();
    for (let i = 0; i < 1500; i++) cleaned.set(`user-${String(i).padStart(4, "0")}/PHUK-1/1.jpg`, ago(HOUR));
    cleaned.set("user-1499/drafts/old.jpg", ago(48 * HOUR));
    const res = await purgeStaleDrafts(fakeDb({ "pin-contributed-images": cleaned, "pin-contributed-raw": new Map() }), NOW);
    expect(res.removed).toBe(1);
    expect(cleaned.has("user-1499/drafts/old.jpg")).toBe(false);
  });
});

describe("startDraftCleanup", () => {
  it("does nothing without service-role credentials", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const log = { info: vi.fn() };
    const stop = startDraftCleanup(log);
    stop();
    expect(log.info).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
