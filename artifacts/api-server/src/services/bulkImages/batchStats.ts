/**
 * Bulk Image Matcher — per-batch stats (migration 086): the sets searched
 * first for every photo, the votes that teach a batch a set, and the last
 * accuracy check. The same ideas as a board scan's stats (boardScan/store.ts).
 *
 * A batch of someone's own photos is often one set, and many set pins are
 * titled only by character ("Lumière"), so searching the batch's set first
 * is the cheapest way to tell them apart.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSetName, MAX_SET_HINTS, SET_VOTES_TO_LEARN } from "../boardScan/pipeline";
import { mergeSetHints } from "../boardScan/store";

export interface BatchAccuracyMiss {
  itemId: string;
  filename: string | null;
  expected: { pinhuntId: string; title: string | null };
  got: { pinhuntId: string; title: string; confidence: number } | null;
  /** Where the right pin came in the suggestions (1–5), or null if not there. */
  rank: number | null;
}

export interface BatchAccuracyReport {
  at: string;
  checked: number;
  top1: number;
  top5: number;
  errors: number;
  misses: BatchAccuracyMiss[];
}

export interface BatchStats {
  setHints?: string[];
  /** Lower-cased set name → confirmed item ids that came from it. */
  setVotes?: Record<string, string[]>;
  accuracy?: BatchAccuracyReport;
}

export function readStats(raw: unknown): BatchStats {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as BatchStats) : {};
}

/** Sets typed by the reviewer: cleaned, without repeats, at most MAX_SET_HINTS. */
export function cleanSetList(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\n,;]+/) : [];
  return mergeSetHints([], list.map(cleanSetName).filter((s): s is string => !!s), MAX_SET_HINTS) ?? [];
}

/**
 * Save a batch's stats: read the latest copy and change only `patch`'s keys,
 * so a set learned from a confirmation and an accuracy report saved at the
 * same moment don't wipe each other.
 */
export async function updateBatchStats(db: SupabaseClient, batchId: string, patch: (current: BatchStats) => BatchStats): Promise<BatchStats> {
  const { data, error } = await db.from("bulk_image_batches").select("stats").eq("id", batchId).maybeSingle();
  if (error) throw new Error(error.message);
  const current = readStats((data as { stats?: unknown } | null)?.stats);
  const next = { ...current, ...patch(current) };
  const { error: upErr } = await db.from("bulk_image_batches").update({ stats: next }).eq("id", batchId);
  if (upErr) throw new Error(upErr.message);
  return next;
}

export async function batchSets(db: SupabaseClient, batchId: string): Promise<string[]> {
  const { data } = await db.from("bulk_image_batches").select("stats").eq("id", batchId).maybeSingle();
  return readStats((data as { stats?: unknown } | null)?.stats).setHints ?? [];
}

/**
 * A reviewer confirmed a photo as a pin from `collection`. Once a second
 * confirmed photo in the batch comes from the same set, the batch learns it
 * (up to MAX_SET_HINTS) and its photos that aren't decided yet are matched
 * again with the set searched first. One photo alone isn't enough: a batch
 * can mix sets. Returns how many photos will be re-matched.
 */
export async function learnBatchSet(db: SupabaseClient, batchId: string, collection: string | null | undefined, confirmedItemId: string): Promise<{ learned: string | null; rematching: number }> {
  const set = cleanSetName(collection);
  if (!set) return { learned: null, rematching: 0 };
  const key = set.toLowerCase();
  let learned: string | null = null;
  await updateBatchStats(db, batchId, (cur) => {
    const hints = cur.setHints ?? [];
    if (hints.length >= MAX_SET_HINTS || hints.some((h) => h.toLowerCase() === key)) return {};
    const voters = [...new Set([...(cur.setVotes?.[key] ?? []), confirmedItemId])];
    const setVotes = { ...(cur.setVotes ?? {}), [key]: voters };
    if (voters.length < SET_VOTES_TO_LEARN) return { setVotes };
    learned = set;
    return { setVotes, setHints: [...hints, set] };
  });
  if (!learned) return { learned: null, rematching: 0 };
  return { learned, rematching: await rematchUndecided(db, batchId, confirmedItemId) };
}

/** Send the batch's suggested/unmatched photos (not the one just confirmed) back to be matched again. */
export async function rematchUndecided(db: SupabaseClient, batchId: string, exceptItemId?: string): Promise<number> {
  let q = db.from("bulk_image_items")
    .update({ status: "uploaded", match_attempts: 0 })
    .eq("batch_id", batchId).in("status", ["suggested", "unmatched"]);
  if (exceptItemId) q = q.neq("id", exceptItemId);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}
