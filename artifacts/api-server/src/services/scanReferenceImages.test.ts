import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pinAndPopReferenceImages } from "./scanReferenceImages";

type Result = { data: unknown; error: unknown } | Error;

/** A Supabase client whose table queries record their filters and answer from `results`. */
function fakeClient(results: Record<string, Result>) {
  const calls: Array<[string, string, ...unknown[]]> = [];
  const from = vi.fn((table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "abortSignal"]) {
      q[m] = (...a: unknown[]) => { calls.push([table, m, ...a]); return q; };
    }
    const result = results[table] ?? { data: [], error: null };
    q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      result instanceof Error ? Promise.reject(result).then(ok, bad) : Promise.resolve(result).then(ok, bad);
    return q;
  });
  return { client: { from } as unknown as SupabaseClient, calls, from };
}

const PINS = {
  data: [
    { id: "uuid-1", pinhunt_id: "PHUK-10000001" },
    { id: "uuid-2", pinhunt_id: "PHUK-10000002" },
    { id: "uuid-3", pinhunt_id: "PHUK-10000003" },
  ],
  error: null,
};

describe("pinAndPopReferenceImages", () => {
  it("reads only Pin & Pop reference rows for the given pins", async () => {
    const { client, calls } = fakeClient({
      pins: PINS,
      pin_images: {
        data: [
          { pin_id: "uuid-1", image_url: "https://pinandpop.com/a.jpg" },
          { pin_id: "uuid-1", image_url: "https://pinandpop.com/a2.jpg" },
          { pin_id: "uuid-2", image_url: "https://pinandpop.com/b.jpg" },
          { pin_id: "uuid-3", image_url: "http://insecure.test/c.jpg" },
        ],
        error: null,
      },
    });
    const out = await pinAndPopReferenceImages(["PHUK-10000001", "PHUK-10000002", "PHUK-10000003", "PHUK-10000001"], client);
    expect(calls).toContainEqual(["pins", "in", "pinhunt_id", ["PHUK-10000001", "PHUK-10000002", "PHUK-10000003"]]);
    expect(calls).toContainEqual(["pin_images", "eq", "source", "pin_and_pop"]);
    expect(calls).toContainEqual(["pin_images", "eq", "image_type", "reference"]);
    expect(calls).toContainEqual(["pin_images", "in", "pin_id", ["uuid-1", "uuid-2", "uuid-3"]]);
    expect([...out]).toEqual([
      ["PHUK-10000001", "https://pinandpop.com/a.jpg"],
      ["PHUK-10000002", "https://pinandpop.com/b.jpg"],
    ]);
  });

  it("is best effort: no client, no pins, an error or a throw give nothing", async () => {
    expect((await pinAndPopReferenceImages(["PHUK-1"], null)).size).toBe(0);
    const unused = fakeClient({});
    expect((await pinAndPopReferenceImages([], unused.client)).size).toBe(0);
    expect(unused.from).not.toHaveBeenCalled();
    const noPins = fakeClient({ pins: { data: [], error: null } });
    expect((await pinAndPopReferenceImages(["PHUK-1"], noPins.client)).size).toBe(0);
    expect(noPins.from).toHaveBeenCalledTimes(1);
    expect((await pinAndPopReferenceImages(["PHUK-1"], fakeClient({ pins: { data: null, error: { message: "x" } } }).client)).size).toBe(0);
    expect((await pinAndPopReferenceImages(["PHUK-1"], fakeClient({ pins: PINS, pin_images: new Error("aborted") }).client)).size).toBe(0);
  });
});
