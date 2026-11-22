/**
 * Board scanning — accuracy check.
 *
 * Re-runs matching on every pin of a board the reviewer has confirmed or
 * corrected, without changing anything, and reports how often the right pin
 * (the reviewer's answer) came first and how often it was in the top 5, with
 * the misses listed. Lets each change to matching be measured on real boards.
 *
 * Runs in the background on the API server (one check per board at a time);
 * the result is saved on the board (`stats.accuracy`, no migration) so the
 * review screen shows the last one. Costs the same AI calls as matching those
 * pins again (≈ 2–3 per pin).
 *
 * Caveat: a set the board learned from these same confirmations is searched
 * first, as in real use; the check measures matching as the reviewer would
 * see it on a re-scan, not a cold first look.
 */
import { emptyUsage } from "./detect";
import { matchCrop, type MatchDeps } from "./match";
import { forAi } from "./quality";
import * as store from "./store";
import type { BoardScan, BoardScanItem } from "./store";

export interface AccuracyMiss {
  itemId: string;
  position: number;
  expected: { pinId: string; title: string | null };
  /** What matching put first (null when it found nothing). */
  got: { pinId: string; title: string; confidence: number } | null;
  /** Where the right pin came in the suggestions (1–5), or null if not there. */
  rank: number | null;
}

export interface AccuracyReport {
  at: string;
  checked: number;
  top1: number;
  top5: number;
  /** Pins whose crop or matching failed (not counted as right or wrong). */
  errors: number;
  misses: AccuracyMiss[];
}

const CONCURRENCY = 3;
const MAX_MISSES = 40;

const running = new Set<string>();
export const accuracyRunning = (scanId: string) => running.has(scanId);

/** The pins a check is run on: those with the reviewer's answer and a crop. */
export function answeredItems(items: BoardScanItem[]): BoardScanItem[] {
  return items.filter((i) => (i.decision === "confirmed" || i.decision === "corrected") && !!store.targetPinId(i) && !!i.crop_path);
}

export interface AccuracyDeps {
  matchDeps: () => MatchDeps;
  match?: typeof matchCrop;
  download?: (path: string) => Promise<Buffer>;
}

/** Run the check now and return the report (also saved on the board). */
export async function checkAccuracy(scan: BoardScan, deps: AccuracyDeps): Promise<AccuracyReport> {
  const match = deps.match ?? matchCrop;
  const download = deps.download ?? ((p: string) => store.downloadObject(store.BOARD_BUCKET, p));
  const items = answeredItems(await store.listItems(scan.id));
  const md = deps.matchDeps();
  const usage = emptyUsage();
  const results: Array<{ item: BoardScanItem; rank: number | null; got: AccuracyMiss["got"] } | null> = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        const crop = await forAi(await download(item.crop_path!));
        const result = await match(crop, item.detection ?? { characters: [], keywords: [], text: "" }, md, usage, { sets: scan.stats?.setHints ?? [] });
        const expected = store.targetPinId(item)!;
        const at = result.candidates.findIndex((c) => c.pinId === expected);
        const top = result.candidates[0];
        results.push({ item, rank: at >= 0 ? at + 1 : null, got: top ? { pinId: top.pinId, title: top.title, confidence: top.confidence } : null });
      } catch (err) {
        console.warn(`[board-scan] accuracy check of item ${item.id} failed:`, err instanceof Error ? err.message : err);
        results.push(null);
      }
    }
  }));
  const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);
  const titleOf = (item: BoardScanItem, pinId: string) =>
    (item.candidates ?? []).find((c) => c.pinId === pinId)?.title ?? null;
  const report: AccuracyReport = {
    at: new Date().toISOString(),
    checked: ok.length,
    top1: ok.filter((r) => r.rank === 1).length,
    top5: ok.filter((r) => r.rank !== null).length,
    errors: results.length - ok.length,
    misses: ok
      .filter((r) => r.rank !== 1)
      .sort((a, b) => a.item.position - b.item.position)
      .slice(0, MAX_MISSES)
      .map((r) => {
        const expected = store.targetPinId(r.item)!;
        return { itemId: r.item.id, position: r.item.position, expected: { pinId: expected, title: titleOf(r.item, expected) }, got: r.got, rank: r.rank };
      }),
  };
  await store.updateScan(scan.id, { stats: { accuracy: report } });
  return report;
}

/** Start a check in the background; false if one is already running for this board. */
export function startAccuracyCheck(scan: BoardScan, deps: AccuracyDeps): boolean {
  if (running.has(scan.id)) return false;
  running.add(scan.id);
  void checkAccuracy(scan, deps)
    .catch((err) => console.error(`[board-scan] accuracy check of ${scan.id} failed:`, err))
    .finally(() => running.delete(scan.id));
  return true;
}
