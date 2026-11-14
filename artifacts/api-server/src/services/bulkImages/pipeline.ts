/**
 * Bulk Image Matcher — background processing of a batch.
 *
 * Two automatic stages, each a small worker loop inside the API server:
 *   match   uploaded  → matching → suggested | unmatched   (services/bulkImages/match.ts)
 *   clean   confirmed → cleaning → cleaned                 (services/pixian.ts)
 *
 * The database is the queue: an item is claimed by a conditional update on
 * its status, so two server processes (or a double click) can't process the
 * same item twice, and nothing is lost if the server restarts or the admin
 * closes the page. Opening the batch again calls processBatch(), which
 * first returns items stuck in "matching"/"cleaning" for too long to the
 * start of that stage, then carries on.
 *
 * Cost controls (all env-configurable):
 *   BULK_MATCH_CONCURRENCY      parallel matches across the server    (2)
 *   BULK_CLEAN_CONCURRENCY      parallel Pixian calls across the server (2)
 *   BULK_MATCH_DAILY_LIMIT      matches per rolling 24 h, all batches (1500)
 *   BULK_CLEAN_DAILY_LIMIT      Pixian clean-ups per rolling 24 h     (1000)
 *   BULK_PIXIAN_MAX_PER_ITEM    Pixian calls one photo may use        (4)
 *   BULK_AUTO_CROP              crop to the main pin before Pixian    (true)
 * A photo is only cleaned after a match is confirmed, and its cleaned result
 * is kept: changing the match later reuses it instead of calling Pixian again.
 *
 * Photos taken on a pin board show neighbouring pins, and Pixian keeps
 * everything that looks like foreground. So before cleaning, the photo is
 * cropped to the main pin: the box the describe step found (no extra AI
 * call), or a box the admin drew (a "cropped-N.jpg" original, which is
 * then used as-is).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { BulkMatchResult, PinBox } from "./match";

export const BUCKET = "bulk-image-matcher";
const STALE_CLAIM_MS = 10 * 60_000;

export interface PipelineDeps {
  db: SupabaseClient;
  match: (photo: Buffer) => Promise<BulkMatchResult>;
  clean: (photo: Buffer) => Promise<Buffer>;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = Number(env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

// ── Concurrency limiter (shared by every batch in this process) ──────────────

class Limiter {
  private running = 0;
  private waiting: Array<() => void> = [];
  constructor(private readonly size: () => number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.size()) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}

const limiters = {
  match: new Limiter(() => envInt(process.env, "BULK_MATCH_CONCURRENCY", 2)),
  clean: new Limiter(() => envInt(process.env, "BULK_CLEAN_CONCURRENCY", 2)),
};

/** Stage loops running in this process, keyed `${stage}:${batchId}`. */
const active = new Map<string, Promise<void>>();
/** Why a stage stopped early (e.g. daily limit), shown on the dashboard. */
const paused = new Map<string, string>();

export function pausedReasons(batchId: string): { match?: string; clean?: string } {
  return {
    match: paused.get(`match:${batchId}`),
    clean: paused.get(`clean:${batchId}`),
  };
}

export function isRunning(batchId: string): { match: boolean; clean: boolean } {
  return { match: active.has(`match:${batchId}`), clean: active.has(`clean:${batchId}`) };
}

// ── Storage helpers ──────────────────────────────────────────────────────────

export async function download(db: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Could not read ${path}: ${error?.message ?? "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Smaller copy for the vision model: enough detail to identify, fewer tokens. */
async function forMatching(original: Buffer): Promise<Buffer> {
  return sharp(original).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 }).toBuffer();
}

/**
 * Crop to a box given as fractions of the (EXIF-rotated) image, widened by
 * `margin` of the box size on each side so a slightly tight box never cuts
 * the pin. Pixian then trims to the pin itself.
 */
export async function cropToBox(photo: Buffer, box: PinBox, margin = 0.08): Promise<Buffer> {
  // Stored originals are already EXIF-rotated and stripped (routes/bulk-images.ts).
  const { width = 0, height = 0 } = await sharp(photo).metadata();
  if (!width || !height) return photo;
  const [l, t, r, b] = box;
  const mx = (r - l) * margin;
  const my = (b - t) * margin;
  const left = Math.max(0, Math.floor((l - mx) * width));
  const top = Math.max(0, Math.floor((t - my) * height));
  const right = Math.min(width, Math.ceil((r + mx) * width));
  const bottom = Math.min(height, Math.ceil((b + my) * height));
  if (right - left < 32 || bottom - top < 32) return photo;
  return sharp(photo).extract({ left, top, width: right - left, height: bottom - top }).jpeg({ quality: 92 }).toBuffer();
}

export const isManualCrop = (path: string) => /\/cropped-\d+\.jpg$/.test(path);

// ── Stage: match ─────────────────────────────────────────────────────────────

async function countSince(db: SupabaseClient, column: string, sinceMs: number): Promise<number> {
  const { count, error } = await db.from("bulk_image_items")
    .select("id", { count: "exact", head: true })
    .gte(column, new Date(sinceMs).toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function matchItem(
  item: { id: string; original_path: string; match_attempts: number },
  deps: PipelineDeps,
): Promise<"suggested" | "unmatched" | "failed" | "skipped"> {
  const now = deps.now ?? Date.now;
  const { data: claimed } = await deps.db.from("bulk_image_items")
    .update({
      status: "matching",
      matching_started_at: new Date(now()).toISOString(),
      match_attempts: item.match_attempts + 1,
      error: null,
      failed_stage: null,
    })
    .eq("id", item.id).eq("status", "uploaded")
    .select("id").maybeSingle();
  if (!claimed) return "skipped"; // someone else has it

  try {
    const photo = await forMatching(await download(deps.db, item.original_path));
    const result = await deps.match(photo);
    const status = result.band === "none" || result.candidates.length === 0 ? "unmatched" : "suggested";
    const { error } = await deps.db.from("bulk_image_items").update({
      status,
      candidates: result.candidates,
      description: result.description,
      top_confidence: result.topConfidence,
      match_band: result.band,
      match_verified: result.verified,
      matched_at: new Date(now()).toISOString(),
    }).eq("id", item.id).eq("status", "matching");
    if (error) throw new Error(error.message);
    return status;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[bulk-images] match failed for ${item.id}:`, message);
    await deps.db.from("bulk_image_items").update({
      status: "failed",
      failed_stage: "match",
      error: message.slice(0, 500),
      // Counts against the daily limit: the AI calls were probably made.
      matched_at: new Date(now()).toISOString(),
    }).eq("id", item.id).eq("status", "matching");
    return "failed";
  }
}

// ── Stage: clean (Pixian) ────────────────────────────────────────────────────

export async function cleanItem(
  item: {
    id: string; batch_id: string; original_path: string; cleaned_path: string | null; pixian_calls: number;
    description?: { box?: PinBox } | null;
  },
  deps: PipelineDeps,
): Promise<"cleaned" | "failed" | "skipped"> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const { data: claimed } = await deps.db.from("bulk_image_items")
    .update({ status: "cleaning", cleaning_started_at: new Date(now()).toISOString(), error: null, failed_stage: null })
    .eq("id", item.id).eq("status", "confirmed")
    .select("id").maybeSingle();
  if (!claimed) return "skipped";

  const fail = async (message: string, pixianCalls = item.pixian_calls) => {
    await deps.db.from("bulk_image_items").update({
      status: "failed", failed_stage: "clean", error: message.slice(0, 500), pixian_calls: pixianCalls,
    }).eq("id", item.id).eq("status", "cleaning");
    return "failed" as const;
  };

  // Already cleaned (e.g. the match was changed after cleaning): no new call.
  if (item.cleaned_path) {
    await deps.db.from("bulk_image_items")
      .update({ status: "cleaned", cleaned_at: new Date(now()).toISOString() })
      .eq("id", item.id).eq("status", "cleaning");
    return "cleaned";
  }

  const maxCalls = envInt(env, "BULK_PIXIAN_MAX_PER_ITEM", 4);
  if (item.pixian_calls >= maxCalls) {
    return fail(`Pixian retry limit reached (${maxCalls} clean-ups for this photo).`);
  }

  let calls = item.pixian_calls;
  try {
    let original = await download(deps.db, item.original_path);
    const box = item.description?.box;
    if (box && !isManualCrop(item.original_path) && (env.BULK_AUTO_CROP ?? "true").toLowerCase() !== "false") {
      original = await cropToBox(original, box);
    }
    calls++; // a timed-out call may still be charged, so count it before it returns
    const cleaned = await deps.clean(original);
    const cleanedPath = `${item.batch_id}/${item.id}/cleaned-${calls}.jpg`;
    const { error: upErr } = await deps.db.storage.from(BUCKET)
      .upload(cleanedPath, cleaned, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw new Error(`Could not store cleaned photo: ${upErr.message}`);
    const { createHash } = await import("node:crypto");
    const { error } = await deps.db.from("bulk_image_items").update({
      status: "cleaned",
      cleaned_path: cleanedPath,
      cleaned_sha256: createHash("sha256").update(cleaned).digest("hex"),
      pixian_calls: calls,
      cleaned_at: new Date(now()).toISOString(),
    }).eq("id", item.id).eq("status", "cleaning");
    if (error) throw new Error(error.message);
    return "cleaned";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[bulk-images] clean failed for ${item.id}:`, message);
    return fail(message, calls);
  }
}

// ── Stage loops ──────────────────────────────────────────────────────────────

type Stage = "match" | "clean";

const STAGE = {
  match: {
    from: "uploaded",
    select: "id, original_path, match_attempts",
    limitEnv: "BULK_MATCH_DAILY_LIMIT",
    limitDefault: 1500,
    countColumn: "matched_at",
    limitMessage: "Daily matching limit reached — remaining photos will be matched later.",
  },
  clean: {
    from: "confirmed",
    select: "id, batch_id, original_path, cleaned_path, pixian_calls, description",
    limitEnv: "BULK_CLEAN_DAILY_LIMIT",
    limitDefault: 1000,
    countColumn: "cleaning_started_at",
    limitMessage: "Daily Pixian clean-up limit reached — confirmed photos will be cleaned later.",
  },
} as const;

async function runStage(stage: Stage, batchId: string, deps: PipelineDeps): Promise<void> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const cfg = STAGE[stage];
  const key = `${stage}:${batchId}`;
  paused.delete(key);
  const limit = envInt(env, cfg.limitEnv, cfg.limitDefault);
  const pageSize = 10;

  for (;;) {
    const used = await countSince(deps.db, cfg.countColumn, now() - 24 * 3600_000);
    const room = limit - used;
    if (room <= 0) {
      paused.set(key, cfg.limitMessage);
      return;
    }
    const { data, error } = await deps.db.from("bulk_image_items")
      .select(cfg.select)
      .eq("batch_id", batchId).eq("status", cfg.from)
      .order("created_at", { ascending: true })
      .limit(Math.min(pageSize, room));
    if (error) throw new Error(error.message);
    const items = (data ?? []) as unknown as Array<Record<string, unknown>>;
    if (items.length === 0) return;

    const results = await Promise.all(items.map((item) => limiters[stage].run(() =>
      stage === "match"
        ? matchItem(item as Parameters<typeof matchItem>[0], deps)
        : cleanItem(item as Parameters<typeof cleanItem>[0], deps))));
    // Everything on this page was taken by another process: stop rather than spin.
    if (results.every((r) => r === "skipped")) return;
  }
}

function startStage(stage: Stage, batchId: string, deps: PipelineDeps): Promise<void> {
  const key = `${stage}:${batchId}`;
  const existing = active.get(key);
  if (existing) return existing;
  const run = runStage(stage, batchId, deps)
    .catch((err) => {
      console.error(`[bulk-images] ${stage} loop for batch ${batchId} stopped:`, err);
      paused.set(key, `Stopped after an error: ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => active.delete(key));
  active.set(key, run);
  return run;
}

/** Return items abandoned mid-step (server restart) to the start of that step. */
export async function releaseStaleClaims(batchId: string, deps: PipelineDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const cutoff = new Date(now() - STALE_CLAIM_MS).toISOString();
  if (!active.has(`match:${batchId}`)) {
    await deps.db.from("bulk_image_items").update({ status: "uploaded" })
      .eq("batch_id", batchId).eq("status", "matching").lt("matching_started_at", cutoff);
  }
  if (!active.has(`clean:${batchId}`)) {
    await deps.db.from("bulk_image_items").update({ status: "confirmed" })
      .eq("batch_id", batchId).eq("status", "cleaning").lt("cleaning_started_at", cutoff);
  }
}

/**
 * Make sure both stages are working through this batch. Returns at once;
 * the work continues in the background. Safe to call as often as you like.
 */
export async function processBatch(batchId: string, deps: PipelineDeps, stages: Stage[] = ["match", "clean"]) {
  await releaseStaleClaims(batchId, deps);
  const runs = stages.map((s) => startStage(s, batchId, deps));
  return { done: Promise.all(runs) };
}
