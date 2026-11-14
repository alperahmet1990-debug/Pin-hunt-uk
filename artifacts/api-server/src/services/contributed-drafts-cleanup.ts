/**
 * Delete abandoned contribution previews after 24 hours.
 *
 * /pin-images/contribute/preview (routes/contribute-pin-image.ts) stores a
 * draft per user at {userId}/drafts/{pinId}__{hash}.jpg: the Pixian-cleaned
 * photo in pin-contributed-images and, with the collector's consent, the
 * photo as taken in pin-contributed-raw (migration 079). Submitting moves the
 * draft out of drafts/; a new preview replaces the old one. A preview that is
 * never submitted would otherwise stay until the user's next preview or
 * account deletion, so this sweep removes drafts older than DRAFT_MAX_AGE_MS
 * from both buckets. Submitted photos (outside drafts/) are never touched;
 * reviewed raw originals are deleted on approve/reject (discardRawOriginal).
 *
 * Runs in-process (index.ts): once at start-up, then every hour. Deleting is
 * idempotent, so overlapping runs on several instances are harmless. A user
 * whose last object is removed drops out of the root listing mid-run, which
 * can shift a later page; anything skipped is caught on the next run.
 * Logs counts only, never user ids or paths.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DRAFT_BUCKETS = ["pin-contributed-images", "pin-contributed-raw"] as const;
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DRAFT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const PAGE = 1000;

export interface DraftSweepResult {
  removed: number;
  /** Buckets that could not be swept (e.g. pin-contributed-raw before 079). */
  failedBuckets: string[];
}

function isStale(obj: { id: string | null; updated_at: string | null; created_at: string | null }, cutoff: number) {
  if (obj.id === null) return false; // a folder, not a file
  const at = Date.parse(obj.updated_at ?? obj.created_at ?? "");
  return Number.isFinite(at) && at < cutoff;
}

export async function purgeStaleDrafts(
  db: SupabaseClient,
  now: number = Date.now(),
  maxAgeMs: number = DRAFT_MAX_AGE_MS,
): Promise<DraftSweepResult> {
  const cutoff = now - maxAgeMs;
  const result: DraftSweepResult = { removed: 0, failedBuckets: [] };

  for (const name of DRAFT_BUCKETS) {
    const bucket = db.storage.from(name);
    try {
      for (let offset = 0; ; offset += PAGE) {
        // Top level: one folder per user.
        const { data: folders, error } = await bucket.list("", { limit: PAGE, offset });
        if (error) throw new Error(error.message);
        for (const folder of folders ?? []) {
          if (folder.id !== null) continue; // only user folders
          const dir = `${folder.name}/drafts`;
          const { data: files, error: listError } = await bucket.list(dir, { limit: PAGE });
          if (listError) throw new Error(listError.message);
          const stale = (files ?? []).filter((f) => isStale(f, cutoff)).map((f) => `${dir}/${f.name}`);
          if (stale.length === 0) continue;
          const { error: removeError } = await bucket.remove(stale);
          if (removeError) throw new Error(removeError.message);
          result.removed += stale.length;
        }
        if (!folders || folders.length < PAGE) break;
      }
    } catch (err) {
      result.failedBuckets.push(name);
      console.error(`[drafts-cleanup] could not sweep ${name}:`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}

/**
 * Start the sweep: now, then every DRAFT_SWEEP_INTERVAL_MS. Returns a stop
 * function. Does nothing without service-role Supabase credentials.
 */
export function startDraftCleanup(
  log: { info: (obj: object, msg: string) => void },
  intervalMs: number = DRAFT_SWEEP_INTERVAL_MS,
): () => void {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return () => {};
  const db = createClient(url, key);
  let running = false;
  const run = async () => {
    if (running) return; // never overlap within this process
    running = true;
    try {
      const { removed, failedBuckets } = await purgeStaleDrafts(db);
      if (removed > 0 || failedBuckets.length > 0) {
        log.info({ removed, failedBuckets }, "Stale contribution drafts swept");
      }
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
