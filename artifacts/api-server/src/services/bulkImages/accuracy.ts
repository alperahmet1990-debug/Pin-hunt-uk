/**
 * Bulk Image Matcher — accuracy check (as board scanning's, boardScan/accuracy.ts).
 *
 * Re-runs matching on every photo of a batch the reviewer has confirmed (to
 * a pin, whether or not it's cleaned or published yet), without changing
 * anything, and reports how often the right pin (the reviewer's answer) came
 * first and how often it was in the top 5, with the misses listed. Lets each
 * change to matching be measured on real photos.
 *
 * Runs in the background (one check per batch at a time); the result is
 * saved on the batch (stats.accuracy, migration 086). Costs the same AI calls
 * as matching those photos again (≈ 3 per photo). The batch's sets are
 * searched first, as in real use.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BulkMatchResult } from "./match";
import { batchSets, updateBatchStats, type BatchAccuracyMiss, type BatchAccuracyReport } from "./batchStats";
import { download, forMatching } from "./pipeline";

/** Statuses of photos with a reviewer's answer. */
export const ANSWERED_STATUSES = ["confirmed", "cleaning", "cleaned", "published"] as const;

const CONCURRENCY = 3;
const MAX_MISSES = 40;
/** Most photos one check re-matches (≈ 3 AI calls each). */
export const MAX_CHECKED = 300;

const running = new Set<string>();
export const batchAccuracyRunning = (batchId: string) => running.has(batchId);

export interface BatchAccuracyDeps {
  db: SupabaseClient;
  match: (photo: Buffer, ctx?: { sets?: string[] }) => Promise<BulkMatchResult>;
}

interface AnsweredItem {
  id: string;
  original_path: string;
  original_filename: string | null;
  matched_pinhunt_id: string;
  candidates: Array<{ pinhuntId: string; title: string }> | null;
}

export async function checkBatchAccuracy(batchId: string, deps: BatchAccuracyDeps): Promise<BatchAccuracyReport> {
  const { data, error } = await deps.db.from("bulk_image_items")
    .select("id, original_path, original_filename, matched_pinhunt_id, candidates")
    .eq("batch_id", batchId).in("status", [...ANSWERED_STATUSES])
    .order("created_at", { ascending: true }).limit(MAX_CHECKED);
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as unknown as AnsweredItem[]).filter((i) => !!i.matched_pinhunt_id);
  const sets = await batchSets(deps.db, batchId).catch(() => []);

  const results: Array<{ item: AnsweredItem; rank: number | null; got: BatchAccuracyMiss["got"] } | null> = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        const photo = await forMatching(await download(deps.db, item.original_path));
        const result = await deps.match(photo, sets.length ? { sets } : undefined);
        const at = result.candidates.findIndex((c) => c.pinhuntId === item.matched_pinhunt_id);
        const top = result.candidates[0];
        results.push({ item, rank: at >= 0 ? at + 1 : null, got: top ? { pinhuntId: top.pinhuntId, title: top.title, confidence: top.confidence } : null });
      } catch (err) {
        console.warn(`[bulk-images] accuracy check of item ${item.id} failed:`, err instanceof Error ? err.message : err);
        results.push(null);
      }
    }
  }));

  const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);
  const order = new Map(items.map((i, n) => [i.id, n]));
  const report: BatchAccuracyReport = {
    at: new Date().toISOString(),
    checked: ok.length,
    top1: ok.filter((r) => r.rank === 1).length,
    top5: ok.filter((r) => r.rank !== null).length,
    errors: results.length - ok.length,
    misses: ok
      .filter((r) => r.rank !== 1)
      .sort((a, b) => order.get(a.item.id)! - order.get(b.item.id)!)
      .slice(0, MAX_MISSES)
      .map((r) => ({
        itemId: r.item.id,
        filename: r.item.original_filename,
        expected: {
          pinhuntId: r.item.matched_pinhunt_id,
          title: (r.item.candidates ?? []).find((c) => c.pinhuntId === r.item.matched_pinhunt_id)?.title ?? null,
        },
        got: r.got,
        rank: r.rank,
      })),
  };
  await updateBatchStats(deps.db, batchId, () => ({ accuracy: report }));
  return report;
}

/** Start a check in the background; false if one is already running for this batch. */
export function startBatchAccuracyCheck(batchId: string, deps: BatchAccuracyDeps): boolean {
  if (running.has(batchId)) return false;
  running.add(batchId);
  void checkBatchAccuracy(batchId, deps)
    .catch((err) => console.error(`[bulk-images] accuracy check of ${batchId} failed:`, err))
    .finally(() => running.delete(batchId));
  return true;
}
