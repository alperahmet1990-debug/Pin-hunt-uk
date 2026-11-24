import { describe, expect, it, vi } from "vitest";
import { mergeSetHints, mergeSetVotes, setBoardDbForTests, updateScan } from "./store";
import type { SupabaseClient } from "@supabase/supabase-js";

// Board stats are saved from copies read earlier (the processing run,
// clean-up, approval). A set learned in between must not be dropped.

describe("mergeSetHints", () => {
  it("keeps the board's sets and adds new ones, without duplicates, up to the limit", () => {
    expect(mergeSetHints(["Tails of Friendship"], undefined)).toEqual(["Tails of Friendship"]);
    expect(mergeSetHints(["Tails of Friendship"], ["tails of friendship", "Sci-Fi Academy"])).toEqual(["Tails of Friendship", "Sci-Fi Academy"]);
    expect(mergeSetHints(["A", "B", "C", "D", "E"], ["F"])).toEqual(["A", "B", "C", "D", "E"]);
    expect(mergeSetHints(undefined, undefined)).toBeUndefined();
  });
});

describe("updateScan", () => {
  it("doesn't drop a set learned since the stats were read", async () => {
    const written: Array<Record<string, unknown>> = [];
    const fake = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stats: { setHints: ["Tails of Friendship"] } }, error: null }) }) }),
        update: (patch: Record<string, unknown>) => { written.push(patch); return { eq: async () => ({ data: null, error: null }) }; },
      }),
    } as unknown as SupabaseClient;
    vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    setBoardDbForTests(fake);
    try {
      // A processing run saving its usage counters from an older copy of stats.
      await updateScan("s1", { status: "ready", stats: { openaiCalls: 12 } });
      expect(written[0]).toMatchObject({ status: "ready", stats: { openaiCalls: 12, setHints: ["Tails of Friendship"] } });
    } finally {
      setBoardDbForTests(null);
      vi.unstubAllEnvs();
    }
  });

  it("keeps counters and votes saved meanwhile; a reset starts afresh but keeps the sets unless replaced", async () => {
    const written: Array<Record<string, unknown>> = [];
    const fake = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stats: { setHints: ["A"], pixianCalls: 3, setVotes: { b: ["i1"] }, original: { path: "s1/original.jpg", width: 6000, height: 4500 } } }, error: null }) }) }),
        update: (patch: Record<string, unknown>) => { written.push(patch); return { eq: async () => ({ data: null, error: null }) }; },
      }),
    } as unknown as SupabaseClient;
    vi.stubEnv("SUPABASE_URL", "https://db.test.invalid");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    setBoardDbForTests(fake);
    try {
      await updateScan("s1", { stats: { openaiCalls: 1, setVotes: { b: ["i2"] } } });
      const original = { path: "s1/original.jpg", width: 6000, height: 4500 };
      expect(written[0].stats).toEqual({ setHints: ["A"], pixianCalls: 3, openaiCalls: 1, setVotes: { b: ["i1", "i2"] }, original });
      // A reset starts the counters afresh but keeps the sets and the full-size photo.
      await updateScan("s1", { stats: {} }, { resetStats: true });
      expect(written[1].stats).toEqual({ setHints: ["A"], original });
      await updateScan("s1", { stats: { setHints: ["C"] } }, { resetStats: true, replaceSetHints: true });
      expect(written[2].stats).toEqual({ setHints: ["C"], original });
    } finally {
      setBoardDbForTests(null);
      vi.unstubAllEnvs();
    }
  });
});

describe("mergeSetVotes", () => {
  it("joins both copies without repeats", () => {
    expect(mergeSetVotes({ a: ["1"] }, { a: ["1", "2"], b: ["3"] })).toEqual({ a: ["1", "2"], b: ["3"] });
    expect(mergeSetVotes(undefined, undefined)).toBeUndefined();
  });
});
