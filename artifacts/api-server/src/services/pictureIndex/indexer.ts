/**
 * Picture index — building it.
 *
 * Describes every Pin & Pop reference picture once (download → embedding →
 * pin_picture_index). Runs in the background on the API server when an admin
 * asks, paced to stay under Vertex AI's per-minute quota, and resumable: each
 * picture is saved as it's done, so after a restart "Continue" picks up
 * where it stopped. A picture whose URL changes is described again.
 *
 * The picture is held in memory only while it's described; never stored.
 *
 * Failures:
 *   - a picture that can't be downloaded or read is saved as failed (with
 *     the reason) and skipped until "Retry failed";
 *   - Vertex "too many requests" waits and tries the same picture again;
 *   - Vertex refusing access (401/403) or a missing project stops the run,
 *     since every other picture would fail the same way.
 */
import { downloadPicture } from "../boardScan/references";
import * as store from "./store";
import { embedImage, VertexError } from "./vertex";

export interface IndexerDeps {
  pending: typeof store.pendingReferences;
  save: typeof store.saveEmbedding;
  download: (url: string) => Promise<Buffer>;
  embed: (image: Buffer) => Promise<number[]>;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: IndexerDeps = {
  pending: store.pendingReferences,
  save: store.saveEmbedding,
  download: downloadPicture,
  embed: (image) => embedImage(image),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export interface IndexerState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  /** Described in this run. */
  done: number;
  /** Saved as failed in this run. */
  failed: number;
  /** Why the last run stopped early, or the last picture's problem. */
  lastError: string | null;
  stopReason: "finished" | "stopped" | "error" | null;
}

const state: IndexerState = { running: false, startedAt: null, finishedAt: null, done: 0, failed: 0, lastError: null, stopReason: null };
let stopRequested = false;

export const indexerState = (): IndexerState => ({ ...state });

export function stopIndexer() {
  if (state.running) stopRequested = true;
}

export function resetIndexerForTests() {
  Object.assign(state, { running: false, startedAt: null, finishedAt: null, done: 0, failed: 0, lastError: null, stopReason: null });
  stopRequested = false;
}

/** Requests per minute to Vertex: under its default quota unless raised. */
export function ratePerMinute(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.PICTURE_INDEX_RATE_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 3000) : 100;
}

const BATCH = 50;
const CONCURRENCY = 4;
const MAX_TRIES = 3;
const RATE_LIMIT_WAIT_MS = 30_000;
/** Consecutive "too many requests" waits before the run stops (a quota problem, not a burst). */
const MAX_RATE_LIMIT_WAITS = 10;

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

class StopRun extends Error {}

/**
 * Build (or continue) the index. Resolves when the run ends; returns false
 * at once if one is already running on this server.
 */
export async function runIndexer(
  opts: { retryFailed?: boolean; maxPictures?: number; rate?: number } = {},
  deps: IndexerDeps = defaultDeps,
): Promise<boolean> {
  if (state.running) return false;
  Object.assign(state, { running: true, startedAt: new Date().toISOString(), finishedAt: null, done: 0, failed: 0, lastError: null, stopReason: null });
  stopRequested = false;
  const interval = 60_000 / (opts.rate ?? ratePerMinute());
  let nextSlot = 0;
  let rateLimitWaits = 0;
  // Wait for this request's turn: requests start at most `rate` per minute.
  const pace = async () => {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + interval;
    if (wait > 0) await deps.sleep(wait);
  };
  let retryFailed = opts.retryFailed ?? false; // retried pictures that fail again stay failed
  const limit = opts.maxPictures ?? Infinity;

  const describe = async (ref: store.PendingReference) => {
    let picture: Buffer;
    try {
      picture = await deps.download(ref.image_url);
    } catch (err) {
      await deps.save(ref, null, `Couldn't download the picture: ${errText(err)}`);
      state.failed++;
      return;
    }
    for (let attempt = 1; ; attempt++) {
      if (stopRequested) throw new StopRun();
      await pace();
      try {
        const embedding = await deps.embed(picture);
        rateLimitWaits = 0;
        await deps.save(ref, embedding);
        state.done++;
        return;
      } catch (err) {
        const status = err instanceof VertexError ? err.status : undefined;
        if (status === 404) {
          throw new Error("Google couldn't find the picture model in this region. Set VERTEX_LOCATION to a region that offers it (an EU one such as europe-west4, so crops stay in the UK/EU), then Continue.");
        }
        if (status === 401 || status === 403 || (err instanceof VertexError && status === undefined && /credentials|project/i.test(err.message))) {
          throw err; // every picture would fail the same way
        }
        if (status === 429) {
          if (++rateLimitWaits > MAX_RATE_LIMIT_WAITS) {
            throw new Error("Google kept refusing for too many requests. Check the Vertex AI quota (or lower PICTURE_INDEX_RATE_PER_MIN), then Continue.");
          }
          state.lastError = "Google's per-minute limit was reached; waiting before carrying on.";
          await deps.sleep(RATE_LIMIT_WAIT_MS);
          continue;
        }
        if (attempt >= MAX_TRIES) {
          await deps.save(ref, null, errText(err));
          state.failed++;
          state.lastError = errText(err).slice(0, 200);
          return;
        }
      }
    }
  };

  try {
    // Pictures tried in this run: one that fails again comes back from
    // `pending` while retrying, and mustn't be tried twice.
    const tried = new Set<string>();
    while (!stopRequested && state.done + state.failed < limit) {
      const fetched = await deps.pending(retryFailed ? 500 : BATCH, retryFailed);
      const batch = fetched.filter((r) => !tried.has(r.pin_image_id)).slice(0, Math.min(BATCH, limit - state.done - state.failed));
      if (batch.length === 0) {
        if (retryFailed) { retryFailed = false; continue; } // the failed ones are done; carry on with new ones
        break;
      }
      for (const r of batch) tried.add(r.pin_image_id);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
        while (next < batch.length && !stopRequested) await describe(batch[next++]);
      }));
    }
    state.stopReason = stopRequested ? "stopped" : "finished";
  } catch (err) {
    if (err instanceof StopRun) {
      state.stopReason = "stopped";
    } else {
      state.stopReason = "error";
      state.lastError = errText(err).slice(0, 200);
      console.warn("[picture-index] stopped:", state.lastError);
    }
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
    stopRequested = false;
  }
  return true;
}
