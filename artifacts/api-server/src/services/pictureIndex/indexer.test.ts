import { beforeEach, describe, expect, it } from "vitest";
import { indexerState, resetIndexerForTests, runIndexer, stopIndexer, type IndexerDeps } from "./indexer";
import type { PendingReference } from "./store";
import { VertexError } from "./vertex";

// Building the index against an in-memory pin_picture_index: resumable,
// paced, failures recorded, and stopped at once when Google refuses access.

interface Row { embedding: number[] | null; error: string | null }

function world(refCount: number) {
  const refs: PendingReference[] = Array.from({ length: refCount }, (_, i) => ({
    pin_image_id: `img-${String(i).padStart(3, "0")}`, pin_id: `pin-${i}`, image_url: `https://pinandpop.test/${i}.jpg`,
  }));
  const index = new Map<string, Row>();
  const sleeps: number[] = [];
  let embedCalls = 0;
  const deps: IndexerDeps = {
    pending: async (limit, retryFailed) => refs
      .filter((r) => !index.has(r.pin_image_id) || (retryFailed && index.get(r.pin_image_id)!.embedding === null))
      .slice(0, limit),
    save: async (ref, embedding, problem) => { index.set(ref.pin_image_id, { embedding, error: embedding ? null : problem ?? null }); },
    download: async (url) => Buffer.from(url),
    embed: async () => { embedCalls++; return [1, 2, 3]; },
    sleep: async (ms) => { sleeps.push(ms); },
  };
  return { refs, index, deps, sleeps, embedCalls: () => embedCalls };
}

beforeEach(() => resetIndexerForTests());

describe("picture index: building it", () => {
  it("describes every reference picture once, and a second run finds nothing to do", async () => {
    const w = world(120);
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.index.size).toBe(120);
    expect(indexerState()).toMatchObject({ running: false, done: 120, failed: 0, stopReason: "finished" });
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.embedCalls()).toBe(120);
    expect(indexerState().done).toBe(0);
  });

  it("can do a few at a time and carry on later", async () => {
    const w = world(30);
    await runIndexer({ rate: 6000, maxPictures: 10 }, w.deps);
    expect(w.index.size).toBe(10);
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.index.size).toBe(30);
    expect(w.embedCalls()).toBe(30);
  });

  it("paces requests to the per-minute rate", async () => {
    const w = world(10);
    await runIndexer({ rate: 60 }, w.deps);
    // 60 a minute: a second apart (the first goes straight away; concurrent starts queue).
    expect(w.sleeps.filter((ms) => ms > 0).length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...w.sleeps)).toBeGreaterThan(1000);
  });

  it("saves a picture that can't be downloaded as failed, and retries it only when asked", async () => {
    const w = world(3);
    let broken = true;
    w.deps.download = async (url) => { if (broken && url.endsWith("/1.jpg")) throw new Error("download failed (404)"); return Buffer.from(url); };
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.index.get("img-001")).toEqual({ embedding: null, error: "Couldn't download the picture: download failed (404)" });
    expect(indexerState()).toMatchObject({ done: 2, failed: 1 });

    await runIndexer({ rate: 6000 }, w.deps); // not retried
    expect(indexerState()).toMatchObject({ done: 0, failed: 0 });

    broken = false;
    await runIndexer({ rate: 6000, retryFailed: true }, w.deps);
    expect(w.index.get("img-001")!.embedding).toEqual([1, 2, 3]);
  });

  it("tries a failed retry only once per run", async () => {
    const w = world(2);
    w.deps.download = async () => { throw new Error("gone"); };
    await runIndexer({ rate: 6000 }, w.deps);
    await runIndexer({ rate: 6000, retryFailed: true }, w.deps);
    expect(indexerState()).toMatchObject({ failed: 2, stopReason: "finished" });
  });

  it("waits and carries on when Google's per-minute limit is reached", async () => {
    const w = world(2);
    let limited = 1;
    w.deps.embed = async () => { if (limited-- > 0) throw new VertexError("Picture description failed (429)", 429); return [1]; };
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.sleeps).toContain(30_000);
    expect(indexerState()).toMatchObject({ done: 2, failed: 0 });
  });

  it("stops at once when Google refuses access, without marking pictures failed", async () => {
    const w = world(50);
    w.deps.embed = async () => { throw new VertexError("Picture description failed (403: Permission denied)", 403); };
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.index.size).toBe(0);
    expect(indexerState()).toMatchObject({ stopReason: "error", lastError: expect.stringContaining("403") });
  });

  it("gives up on a picture after 3 failed tries", async () => {
    const w = world(1);
    w.deps.embed = async () => { throw new VertexError("Picture description failed (500)", 500); };
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.index.get("img-000")).toEqual({ embedding: null, error: "Picture description failed (500)" });
  });

  it("runs once per server, and can be stopped", async () => {
    const w = world(400);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const embed = w.deps.embed;
    w.deps.embed = async (b) => { await gate; return embed(b); };
    const first = runIndexer({ rate: 6000 }, w.deps);
    expect(indexerState().running).toBe(true);
    expect(await runIndexer({ rate: 6000 }, w.deps)).toBe(false);
    stopIndexer();
    release();
    await first;
    expect(indexerState()).toMatchObject({ running: false, stopReason: "stopped" });
    expect(w.index.size).toBeLessThan(400);
  });

  it("stops when Google keeps refusing for too many requests, instead of waiting forever", async () => {
    const w = world(1);
    w.deps.embed = async () => { throw new VertexError("Picture description failed (429)", 429); };
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.sleeps.filter((ms) => ms === 30_000)).toHaveLength(10);
    expect(indexerState()).toMatchObject({ stopReason: "error", lastError: expect.stringContaining("quota") });
    expect(w.index.size).toBe(0);
  });

  it("stops when the model isn't offered in the region, without marking pictures failed", async () => {
    const w = world(5);
    w.deps.embed = async () => { throw new VertexError("Picture description failed (404)", 404); };
    await runIndexer({ rate: 6000 }, w.deps);
    expect(w.index.size).toBe(0);
    expect(indexerState()).toMatchObject({ stopReason: "error", lastError: expect.stringContaining("VERTEX_LOCATION") });
  });

  it("keeps database error details out of the admin screen", async () => {
    const w = world(2);
    w.deps.pending = async () => { throw new Error("Could not list pictures to index: relation \"pin_picture_index\" does not exist"); };
    await runIndexer({ rate: 6000 }, w.deps);
    expect(indexerState()).toMatchObject({ stopReason: "error", lastError: "Could not read or write the picture index. See the server log." });
  });

  it("lets every worker finish after a fatal error, so none keeps calling Google", async () => {
    const w = world(8);
    let calls = 0;
    w.deps.embed = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      throw new VertexError("Picture description failed (403)", 403);
    };
    await runIndexer({ rate: 6000 }, w.deps);
    const after = calls;
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toBe(after); // nothing still running
    expect(calls).toBeLessThanOrEqual(4); // each worker stopped after its first refusal
    expect(indexerState()).toMatchObject({ running: false, stopReason: "error" });
  });
});
