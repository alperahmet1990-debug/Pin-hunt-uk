/**
 * Board scanning — persistence (migration 083). Service-role client only:
 * every caller is an API route that has already checked the user.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseUserRepository, type PinAndPopReference } from "@workspace/pin-repository";
import type { Box, QualityReport } from "./quality";
import type { MatchCandidate } from "./match";

export const BOARD_BUCKET = "board-scans";
export const CLEANED_BUCKET = "pin-contributed-images";

export type BoardScanStatus = "queued" | "detecting" | "matching" | "cleaning" | "ready" | "partial" | "failed";
export const PROCESSING_STATUSES: readonly BoardScanStatus[] = ["queued", "detecting", "matching", "cleaning"];

export interface BoardScanStats {
  detectMs?: number;
  matchMs?: number;
  cleanMs?: number;
  totalMs?: number;
  openaiCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  pixianCalls?: number;
  pixianReused?: number;
  rawDetections?: number;
  /**
   * Sets this board's pins are searched in first: typed at upload, or the set
   * of a pin the reviewer confirmed (pipeline.learnSet). Kept here so no
   * migration is needed.
   */
  setHints?: string[];
}

export interface BoardScan {
  id: string;
  created_by: string;
  mode: "catalogue_capture" | "collector";
  status: BoardScanStatus;
  title: string | null;
  image_path: string;
  image_sha256: string;
  image_width: number;
  image_height: number;
  permission_basis: "own_photo" | "contributor_permission";
  contributor_name: string | null;
  contributor_handle: string | null;
  permission_evidence: string | null;
  permission_processing: boolean;
  permission_public_display: boolean;
  not_third_party_catalogue: boolean;
  permission_recorded_at: string;
  detection_truncated: boolean;
  stats: BoardScanStats;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type ExcludeReason = "not_a_pin" | "duplicate" | "not_wanted";

export interface BoardScanItem {
  id: string;
  board_scan_id: string;
  position: number;
  origin: "detected" | "manual";
  box: Box;
  crop_path: string | null;
  crop_sha256: string | null;
  crop_dhash: string | null;
  quality: QualityReport | null;
  detection: {
    characters: string[]; keywords: string[]; text: string; occluded: boolean; partial: boolean; glare?: boolean;
    /** The per-pin describe step has run (search terms added; box tightened for detected pins). */
    described?: boolean;
  } | null;
  match_status: "pending" | "suggested" | "unmatched" | "failed";
  candidates: MatchCandidate[];
  suggested_pin_id: string | null;
  match_confidence: number | null;
  pin_has_image: boolean | null;
  decision: "undecided" | "confirmed" | "corrected" | "excluded";
  decided_pin_id: string | null;
  exclude_reason: ExcludeReason | null;
  priority: number;
  cleanup_status: "none" | "skipped" | "done" | "failed";
  cleanup_note: string | null;
  cleaned_path: string | null;
  image_review: "none" | "approved" | "rejected";
  pin_image_id: string | null;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** The pin the reviewer chose, or else the suggestion. */
export function targetPinId(item: Pick<BoardScanItem, "decision" | "decided_pin_id" | "suggested_pin_id">): string | null {
  if (item.decision === "excluded") return null;
  return item.decided_pin_id ?? item.suggested_pin_id;
}

let client: SupabaseClient | null = null;
export function boardDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for board scanning.");
  if (!client) client = createClient(url, key);
  return client;
}

/** For tests. */
export function setBoardDbForTests(c: SupabaseClient | null) {
  client = c;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export async function insertScan(row: Partial<BoardScan>): Promise<BoardScan> {
  return check(await boardDb().from("board_scans").insert(row).select("*").single(), "Could not save board scan");
}

export async function getScan(id: string): Promise<BoardScan | null> {
  return check(await boardDb().from("board_scans").select("*").eq("id", id).maybeSingle(), "Could not read board scan");
}

/**
 * Sets already on the board, then any new ones from `next` (case-insensitive,
 * at most `max`). Stats are saved from copies read earlier (the processing
 * run, clean-up and approval), so a set learned meanwhile must survive them.
 */
export function mergeSetHints(current: string[] | undefined, next: string[] | undefined, max = 5): string[] | undefined {
  if (!current?.length && !next?.length) return next;
  const out: string[] = [];
  for (const s of [...(current ?? []), ...(next ?? [])]) {
    if (out.length >= max) break;
    if (!out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

export async function updateScan(id: string, patch: Partial<BoardScan>): Promise<void> {
  if (patch.stats) {
    const { data } = await boardDb().from("board_scans").select("stats").eq("id", id).maybeSingle();
    const current = (data as { stats?: BoardScanStats } | null)?.stats?.setHints;
    const setHints = mergeSetHints(current, patch.stats.setHints);
    if (setHints) patch = { ...patch, stats: { ...patch.stats, setHints } };
  }
  check(await boardDb().from("board_scans").update(patch).eq("id", id), "Could not update board scan");
}

export async function listScans(createdBy?: string, limit = 50): Promise<BoardScan[]> {
  let q = boardDb().from("board_scans").select("*").order("created_at", { ascending: false }).limit(limit);
  if (createdBy) q = q.eq("created_by", createdBy);
  return check(await q, "Could not list board scans") ?? [];
}

/** The same photo already uploaded by this user (and not failed), for de-duplication. */
export async function findScanByHash(createdBy: string, sha: string): Promise<BoardScan | null> {
  const rows = check(
    await boardDb().from("board_scans").select("*")
      .eq("created_by", createdBy).eq("image_sha256", sha).neq("status", "failed")
      .order("created_at", { ascending: false }).limit(1),
    "Could not check for duplicate board",
  ) ?? [];
  return rows[0] ?? null;
}

export async function countScansSince(createdBy: string, sinceIso: string): Promise<number> {
  const { count, error } = await boardDb().from("board_scans")
    .select("id", { count: "exact", head: true })
    .eq("created_by", createdBy).gte("created_at", sinceIso);
  if (error) throw new Error(`Could not count board scans: ${error.message}`);
  return count ?? 0;
}

export async function listItems(scanId: string): Promise<BoardScanItem[]> {
  return check(
    await boardDb().from("board_scan_items").select("*").eq("board_scan_id", scanId).order("position"),
    "Could not read board items",
  ) ?? [];
}

export async function getItem(scanId: string, itemId: string): Promise<BoardScanItem | null> {
  return check(
    await boardDb().from("board_scan_items").select("*").eq("board_scan_id", scanId).eq("id", itemId).maybeSingle(),
    "Could not read board item",
  );
}

export async function insertItems(rows: Partial<BoardScanItem>[]): Promise<BoardScanItem[]> {
  if (rows.length === 0) return [];
  return check(await boardDb().from("board_scan_items").insert(rows).select("*"), "Could not save detected pins") ?? [];
}

export async function updateItem(id: string, patch: Partial<BoardScanItem>): Promise<BoardScanItem> {
  return check(
    await boardDb().from("board_scan_items").update(patch).eq("id", id).select("*").single(),
    "Could not update board item",
  );
}

/** Update an item only while it still matches `where`; null when it no longer does. */
export async function updateItemIf(
  id: string,
  where: Partial<Pick<BoardScanItem, "image_review" | "cleanup_status">>,
  patch: Partial<BoardScanItem>,
): Promise<BoardScanItem | null> {
  let q = boardDb().from("board_scan_items").update(patch).eq("id", id);
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v as string);
  const rows = check(await q.select("*"), "Could not update the pin") as BoardScanItem[] | null;
  return rows?.[0] ?? null;
}

/** Paths of every object under a folder (one level), e.g. a board's crops. */
export async function listObjects(bucket: string, folder: string): Promise<string[]> {
  const { data, error } = await boardDb().storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw new Error(`Could not list images: ${error.message}`);
  return (data ?? []).filter((o) => o.name && o.id).map((o) => `${folder}/${o.name}`);
}

/** Remove objects. Best-effort: a leftover file is harmless, so failures are only logged. */
export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await boardDb().storage.from(bucket).remove(paths);
  if (error) console.warn("[board-scan] could not remove old images:", error.message);
}

/** Cleaned-photo paths that items on other boards still use (identical crops share one file). */
export async function cleanedPathsUsedElsewhere(paths: string[], scanId: string): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const rows = check(
    await boardDb().from("board_scan_items").select("cleaned_path").in("cleaned_path", paths).neq("board_scan_id", scanId),
    "Could not check shared clean-ups",
  ) as Array<{ cleaned_path: string }> | null;
  return new Set((rows ?? []).map((r) => r.cleaned_path));
}

export async function deleteScan(id: string): Promise<void> {
  check(await boardDb().from("board_scans").delete().eq("id", id), "Could not delete the board");
}

export async function deleteItemsForScan(scanId: string): Promise<void> {
  check(await boardDb().from("board_scan_items").delete().eq("board_scan_id", scanId), "Could not reset board items");
}

/**
 * A cleaned photo already made from this exact crop (any board), so the
 * same crop never goes to Pixian twice.
 */
/** Marker in the file name of a clean-up made in Pixian test mode (watermarked). */
export const PIXIAN_TEST_MARK = ".pixian-test";

export const isTestModeCleanup = (path: string | null | undefined) => !!path && path.includes(PIXIAN_TEST_MARK);

export async function findCleanedByCropHash(sha: string): Promise<string | null> {
  const rows = check(
    await boardDb().from("board_scan_items").select("cleaned_path")
      .eq("crop_sha256", sha).eq("cleanup_status", "done").not("cleaned_path", "is", null).limit(10),
    "Could not check for an earlier clean-up",
  ) ?? [];
  // A watermarked test-mode clean-up is only reused while test mode is on.
  const testMode = process.env.PIXIAN_TEST_MODE === "true";
  const paths = (rows as Array<{ cleaned_path?: string }>).map((r) => r.cleaned_path).filter((p): p is string => !!p);
  return paths.find((p) => testMode || !isTestModeCleanup(p)) ?? null;
}

export async function uploadObject(bucket: string, path: string, body: Buffer): Promise<void> {
  const { error } = await boardDb().storage.from(bucket).upload(path, body, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Could not store image: ${error.message}`);
}

export async function downloadObject(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await boardDb().storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Could not read image: ${error?.message ?? "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Remove one object. Best-effort: a leftover file is harmless, so failures are only logged. */
export async function removeObject(bucket: string, path: string): Promise<void> {
  const { error } = await boardDb().storage.from(bucket).remove([path]);
  if (error) console.warn("[board-scan] could not remove an old image:", error.message);
}

export async function copyObject(bucket: string, from: string, to: string): Promise<void> {
  const { error } = await boardDb().storage.from(bucket).copy(from, to);
  if (error) throw new Error(`Could not copy image: ${error.message}`);
}

/** Signed URLs (1 hour) for private objects, by path. Missing ones are omitted. */
export async function signedUrls(bucket: string, paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await boardDb().storage.from(bucket).createSignedUrls(unique, 3600);
  if (error) throw new Error(`Could not sign image URLs: ${error.message}`);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

/** Current catalogue photo and pending contributions for pins, by pinhunt id. */
export async function pinImageState(pinhuntIds: string[]): Promise<Record<string, { title: string; imageUrl: string | null; pendingImages: number }>> {
  if (pinhuntIds.length === 0) return {};
  const db = boardDb();
  const pins = check(
    await db.from("pins").select("id, pinhunt_id, title, image_url").in("pinhunt_id", [...new Set(pinhuntIds)]),
    "Could not look up pins",
  ) as Array<{ id: string; pinhunt_id: string; title: string; image_url: string | null }> | null;
  const out: Record<string, { title: string; imageUrl: string | null; pendingImages: number }> = {};
  if (!pins?.length) return out;
  for (const p of pins) out[p.pinhunt_id] = { title: p.title, imageUrl: p.image_url, pendingImages: 0 };
  const byUuid = new Map(pins.map((p) => [p.id, p.pinhunt_id]));
  const { data } = await db.from("pin_images").select("pin_id")
    .eq("status", "pending").not("uploaded_by", "is", null).in("pin_id", [...byUuid.keys()]);
  for (const row of (data ?? []) as Array<{ pin_id: string }>) {
    const pid = byUuid.get(row.pin_id);
    if (pid) out[pid].pendingImages += 1;
  }
  return out;
}

/**
 * Pin & Pop reference images (migration 042) by pinhunt id, for the App
 * Creator's review screen only — the same admin-only use as the Bulk Image
 * Matcher, approved by the maintainer for board scans (see BOARD-SCANNING.md,
 * "Pin & Pop reference on the review screen"). Never stored by board
 * scanning, never published.
 */
let referenceRepo: ReturnType<typeof createSupabaseUserRepository> | null = null;

export async function pinAndPopReferences(pinhuntIds: string[]): Promise<Record<string, PinAndPopReference>> {
  const ids = [...new Set(pinhuntIds)];
  if (ids.length === 0) return {};
  const pins = check(
    await boardDb().from("pins").select("id, pinhunt_id").in("pinhunt_id", ids),
    "Could not look up pins",
  ) as Array<{ id: string; pinhunt_id: string }> | null;
  if (!pins?.length) return {};
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to look up Pin & Pop references.");
  referenceRepo ??= createSupabaseUserRepository(url, key);
  const repo = referenceRepo;
  const byUuid = await repo.getPinAndPopReferences(pins.map((p) => p.id));
  const out: Record<string, PinAndPopReference> = {};
  for (const p of pins) if (byUuid[p.id]?.imageUrl) out[p.pinhunt_id] = byUuid[p.id];
  return out;
}
