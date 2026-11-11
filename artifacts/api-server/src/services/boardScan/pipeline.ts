/**
 * Board scanning — orchestration.
 *
 *   upload → detect pins (detect.ts) → crop + quality (quality.ts)
 *          → match each crop (match.ts) → prioritise (rules.ts)
 *          → clean suitable crops with Pixian (services/pixian.ts)
 *          → reviewer approves → publish (services/contributed-images.ts)
 *
 * Runs in the background inside the API server: the upload returns at once
 * and the app polls. Every step saves as it goes, so a failure (or a server
 * restart) leaves a partly processed board that can be resumed — only the
 * unfinished pins are redone. Nothing is published without a reviewer.
 */
import sharp from "sharp";
import { createSupabasePinRepository, createSupabaseUserRepository, type PinRepository } from "@workspace/pin-repository";
import { getOpenAIClient, isAiConfigured } from "@workspace/integrations-openai-ai-server";
import { normalizePinPhoto, pixianConfigured, PixianTimeoutError } from "../pixian";
import { publishContributedImage } from "../contributed-images";
import { detectPins, emptyUsage, type DetectedPin, type TokenUsage } from "./detect";
import { matchCrop } from "./match";
import { assessCrop, cropBox, differenceHash, sha256, type Box } from "./quality";
import { bulkApproveBlock, CLEANUP_BLOCK_TEXT, cleanupBlock, itemPriority, type PinState } from "./rules";
import * as store from "./store";
import type { BoardScan, BoardScanItem, BoardScanStats } from "./store";

const MATCH_CONCURRENCY = 4;
const CLEAN_CONCURRENCY = 2;
const MAX_MATCH_ATTEMPTS = 3;
/** A board still "processing" with no worker after this long was interrupted. */
const STALE_MS = 10 * 60 * 1000;

export const scanModel = () => process.env.OPENAI_SCAN_MODEL ?? "gpt-5.6-luna";

let catalogue: PinRepository | null = null;
/** The catalogue as the scan sees it (public, verified pins). */
export function catalogueRepository(): PinRepository {
  if (!catalogue) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set.");
    catalogue = createSupabasePinRepository(url, key);
  }
  return catalogue;
}

function writeRepositories() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { pinRepo: createSupabasePinRepository(url, key), userRepo: createSupabaseUserRepository(url, key) };
}

/** Run `fn` over `items`, at most `limit` at a time. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

function mergeUsage(stats: BoardScanStats, usage: TokenUsage): BoardScanStats {
  return {
    ...stats,
    openaiCalls: (stats.openaiCalls ?? 0) + usage.calls,
    inputTokens: (stats.inputTokens ?? 0) + usage.inputTokens,
    outputTokens: (stats.outputTokens ?? 0) + usage.outputTokens,
  };
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

// ── Background queue ─────────────────────────────────────────────────────────
// At most BOARD_CONCURRENT_SCANS boards are processed at once per server, so
// a burst of uploads queues rather than flooding OpenAI.

const running = new Set<string>();
const waiting: string[] = [];
const concurrentScans = () => Math.max(1, Number(process.env.BOARD_CONCURRENT_SCANS) || 2);

export function isRunning(scanId: string): boolean {
  return running.has(scanId) || waiting.includes(scanId);
}

export function enqueue(scanId: string): void {
  if (isRunning(scanId)) return;
  waiting.push(scanId);
  pump();
}

function pump() {
  while (running.size < concurrentScans() && waiting.length > 0) {
    const id = waiting.shift()!;
    running.add(id);
    processBoardScan(id)
      .catch((err) => console.error(`[board-scan] ${id} crashed:`, err))
      .finally(() => {
        running.delete(id);
        pump();
      });
  }
}

/** A board left "processing" by a restart is shown as partial, ready to resume. */
export async function reconcileStale(scan: BoardScan): Promise<BoardScan> {
  if (!store.PROCESSING_STATUSES.includes(scan.status) || isRunning(scan.id)) return scan;
  if (Date.now() - new Date(scan.updated_at).getTime() < STALE_MS) return scan;
  const patch = { status: "partial" as const, error: "Processing was interrupted — resume to finish this board." };
  await store.updateScan(scan.id, patch);
  return { ...scan, ...patch };
}

// ── Steps ────────────────────────────────────────────────────────────────────

async function makeItem(scan: BoardScan, board: Buffer, position: number, pin: DetectedPin, origin: "detected" | "manual"): Promise<Partial<BoardScanItem>> {
  const crop = await cropBox(board, scan.image_width, scan.image_height, pin.box);
  const [quality, dhash] = await Promise.all([
    assessCrop(crop, pin.box, scan.image_width, scan.image_height, pin),
    differenceHash(crop),
  ]);
  const cropPath = `${scan.id}/crops/${String(position).padStart(3, "0")}.jpg`;
  await store.uploadObject(store.BOARD_BUCKET, cropPath, crop);
  return {
    board_scan_id: scan.id,
    position,
    origin,
    box: pin.box,
    crop_path: cropPath,
    crop_sha256: sha256(crop),
    crop_dhash: dhash,
    quality,
    detection: { characters: pin.characters, keywords: pin.keywords, text: pin.text, occluded: pin.occluded, partial: pin.partial },
  };
}

/** Match one item and save the result. Never throws: failures are recorded on the item. */
async function matchItem(item: BoardScanItem, usage: TokenUsage): Promise<BoardScanItem> {
  try {
    const crop = await store.downloadObject(store.BOARD_BUCKET, item.crop_path!);
    const result = await matchCrop(crop, item.detection ?? { characters: [], keywords: [], text: "" }, {
      openai: getOpenAIClient(),
      model: scanModel(),
      repository: catalogueRepository(),
      referenceImages: store.pinAndPopReferenceUrls,
    }, usage);
    const top = result.candidates[0];
    const patch: Partial<BoardScanItem> = {
      match_status: result.status,
      candidates: result.candidates,
      suggested_pin_id: top?.pinId ?? null,
      match_confidence: top?.confidence ?? null,
      pin_has_image: top ? !!top.imageUrl : null,
      attempts: item.attempts + 1,
      error: null,
    };
    return store.updateItem(item.id, { ...patch, priority: itemPriority({ ...item, ...patch }) });
  } catch (err) {
    console.warn(`[board-scan] matching item ${item.id} failed:`, errText(err));
    return store.updateItem(item.id, { match_status: "failed", attempts: item.attempts + 1, error: errText(err) });
  }
}

async function pinStates(items: BoardScanItem[]): Promise<Record<string, PinState>> {
  const ids = items.map(store.targetPinId).filter((x): x is string => !!x);
  return store.pinImageState(ids);
}

/**
 * Pixian clean-up for one item, if the rules allow it (rules.cleanupBlock).
 * Reuses an earlier clean-up of the identical crop instead of paying again.
 */
export async function cleanItem(
  scan: BoardScan,
  item: BoardScanItem,
  siblings: BoardScanItem[],
  pins: Record<string, PinState>,
  opts: { force?: boolean; stats?: BoardScanStats } = {},
): Promise<BoardScanItem> {
  const target = store.targetPinId(item);
  const block = cleanupBlock(scan, item, siblings, target ? pins[target] : undefined, opts.force);
  if (block) {
    const note = block === "unsuitable" && item.quality?.reasons.length
      ? `${CLEANUP_BLOCK_TEXT.unsuitable}: ${item.quality.reasons.join(", ").replace(/_/g, " ")}.`
      : CLEANUP_BLOCK_TEXT[block];
    if (block === "already_cleaned" || block === "already_published") return item;
    return store.updateItem(item.id, { cleanup_status: "skipped", cleanup_note: note });
  }
  if (!pixianConfigured()) {
    return store.updateItem(item.id, { cleanup_status: "skipped", cleanup_note: "Photo clean-up (Pixian) isn't configured on this server." });
  }
  try {
    const earlier = item.crop_sha256 ? await store.findCleanedByCropHash(item.crop_sha256) : null;
    let cleanedPath = earlier;
    if (earlier) {
      if (opts.stats) opts.stats.pixianReused = (opts.stats.pixianReused ?? 0) + 1;
    } else {
      const crop = await store.downloadObject(store.BOARD_BUCKET, item.crop_path!);
      if (opts.stats) opts.stats.pixianCalls = (opts.stats.pixianCalls ?? 0) + 1;
      const cleaned = await normalizePinPhoto(crop, "image/jpeg");
      cleanedPath = `${scan.created_by}/board-${scan.id}/${item.id}.jpg`;
      await store.uploadObject(store.CLEANED_BUCKET, cleanedPath, cleaned);
    }
    return store.updateItem(item.id, { cleanup_status: "done", cleaned_path: cleanedPath, cleanup_note: null });
  } catch (err) {
    const note = err instanceof PixianTimeoutError ? "Pixian took too long — try again." : `Clean-up failed: ${errText(err)}`;
    return store.updateItem(item.id, { cleanup_status: "failed", cleanup_note: note });
  }
}

/**
 * Process (or resume) a board: detect if not yet detected, match every pin
 * not yet matched, then clean the crops worth cleaning.
 */
export async function processBoardScan(scanId: string): Promise<void> {
  const started = Date.now();
  let scan = await store.getScan(scanId);
  if (!scan) return;
  let stats: BoardScanStats = { ...(scan.stats ?? {}) };
  const setStatus = async (status: BoardScan["status"], extra: Partial<BoardScan> = {}) => {
    await store.updateScan(scanId, { status, stats, ...extra });
    scan = { ...scan!, status, ...extra };
  };

  try {
    if (!isAiConfigured()) throw new Error("Pin recognition (OpenAI) isn't configured on this server.");
    const board = await store.downloadObject(store.BOARD_BUCKET, scan.image_path);
    let items = await store.listItems(scanId);

    // ── Detect ──
    if (items.length === 0) {
      await setStatus("detecting", { error: null });
      const t = Date.now();
      const detection = await detectPins(getOpenAIClient(), scanModel(), { image: board, width: scan.image_width, height: scan.image_height });
      stats = mergeUsage(stats, detection.usage);
      stats.rawDetections = detection.rawCount;
      const rows = await mapLimit(detection.pins.map((p, i) => ({ p, i })), 4, ({ p, i }) => makeItem(scan!, board, i + 1, p, "detected"));
      items = await store.insertItems(rows);
      items.sort((a, b) => a.position - b.position);
      stats.detectMs = (stats.detectMs ?? 0) + (Date.now() - t);
      await setStatus("matching", { detection_truncated: detection.truncated });
      if (items.length === 0) {
        stats.totalMs = (stats.totalMs ?? 0) + (Date.now() - started);
        await setStatus("ready", { error: "No pins were found in this photo. You can add pins by hand." });
        return;
      }
    }

    // ── Match ──
    const toMatch = items.filter((i) =>
      i.decision !== "excluded" && i.crop_path &&
      (i.match_status === "pending" || i.match_status === "failed") && i.attempts < MAX_MATCH_ATTEMPTS);
    if (toMatch.length > 0) {
      await setStatus("matching");
      const t = Date.now();
      const usage = emptyUsage();
      const updated = await mapLimit(toMatch, MATCH_CONCURRENCY, (i) => matchItem(i, usage));
      const byId = new Map(updated.map((u) => [u.id, u]));
      items = items.map((i) => byId.get(i.id) ?? i);
      stats = mergeUsage(stats, usage);
      stats.matchMs = (stats.matchMs ?? 0) + (Date.now() - t);
    }

    // ── Clean ──
    // Only automatically, for suitable, confident crops of pins with no
    // photo; anything else waits for the reviewer to ask.
    const candidates = items.filter((i) => i.cleanup_status === "none" || i.cleanup_status === "failed");
    if (candidates.length > 0 && scan.permission_public_display) {
      await setStatus("cleaning");
      const t = Date.now();
      const pins = await pinStates(items);
      // Sequential decisions within the board so duplicates resolve to the best crop.
      const ordered = [...candidates].sort((a, b) => (b.quality?.score ?? 0) - (a.quality?.score ?? 0));
      await mapLimit(ordered, CLEAN_CONCURRENCY, async (item) => {
        const fresh = await cleanItem(scan!, item, items, pins, { stats });
        items = items.map((i) => (i.id === fresh.id ? fresh : i));
      });
      stats.cleanMs = (stats.cleanMs ?? 0) + (Date.now() - t);
    }

    const failed = items.filter((i) => i.match_status === "failed").length;
    stats.totalMs = (stats.totalMs ?? 0) + (Date.now() - started);
    await setStatus(failed ? "partial" : "ready", {
      error: failed ? `${failed} pin${failed === 1 ? "" : "s"} couldn't be matched — resume to try again.` : null,
    });
  } catch (err) {
    console.error(`[board-scan] ${scanId} failed:`, err);
    stats.totalMs = (stats.totalMs ?? 0) + (Date.now() - started);
    const hasItems = (await store.listItems(scanId).catch(() => [])).length > 0;
    await store.updateScan(scanId, { status: hasItems ? "partial" : "failed", stats, error: errText(err) }).catch(() => {});
  }
}

// ── Reviewer actions ─────────────────────────────────────────────────────────

/** Add a pin detection missed: crop it, assess it, and match it unless the pin is given. */
export async function addManualItem(scan: BoardScan, box: Box, pinhuntId?: string): Promise<BoardScanItem> {
  const board = await store.downloadObject(store.BOARD_BUCKET, scan.image_path);
  const items = await store.listItems(scan.id);
  const position = items.reduce((m, i) => Math.max(m, i.position), 0) + 1;
  const row = await makeItem(scan, board, position, { box, characters: [], keywords: [], text: "", occluded: false, partial: false }, "manual");
  if (pinhuntId) {
    const pin = await catalogueRepository().getPinByPinhuntId(pinhuntId);
    if (!pin) throw Object.assign(new Error("That catalogue pin wasn't found."), { status: 404 });
    Object.assign(row, {
      match_status: "suggested", decision: "confirmed", decided_pin_id: pin.id, pin_has_image: !!pin.imageUrl,
      candidates: [{ pinId: pin.id, title: pin.title, collection: pin.collection, imageUrl: pin.imageUrl ?? null, confidence: 100, reasoning: "Chosen by the reviewer." }],
    });
  }
  const usage = emptyUsage();
  if (!pinhuntId && isAiConfigured()) {
    // A hand-drawn box has no description yet; the catalogue search needs
    // one, so describe the crop with the same detection call.
    try {
      const crop = await store.downloadObject(store.BOARD_BUCKET, row.crop_path!);
      const meta = await sharp(crop).metadata();
      const found = await detectPins(getOpenAIClient(), scanModel(), { image: crop, width: meta.width ?? 1, height: meta.height ?? 1 }, { maxPins: 3 });
      usage.calls += found.usage.calls;
      usage.inputTokens += found.usage.inputTokens;
      usage.outputTokens += found.usage.outputTokens;
      const main = [...found.pins].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0];
      if (main) row.detection = { characters: main.characters, keywords: main.keywords, text: main.text, occluded: false, partial: false };
    } catch (err) {
      console.warn("[board-scan] describing a hand-added pin failed, matching without it:", errText(err));
    }
  }
  let [item] = await store.insertItems([{ ...row, priority: itemPriority(row as BoardScanItem) }]);
  if (!pinhuntId && isAiConfigured()) {
    item = await matchItem(item, usage);
    await store.updateScan(scan.id, { stats: mergeUsage(scan.stats ?? {}, usage) });
  }
  return item;
}

export class ReviewError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

/**
 * Publish one cleaned crop as its pin's catalogue photo. Approving is the
 * reviewer confirming both the match and the photo.
 */
export async function approveItem(
  scan: BoardScan,
  item: BoardScanItem,
  reviewerId: string,
  opts: { pinId?: string; replaceExisting?: boolean } = {},
): Promise<BoardScanItem> {
  if (!scan.permission_public_display) {
    throw new ReviewError("This board's owner hasn't allowed public display, so it can't be published.", 409, "no_public_permission");
  }
  if (item.decision === "excluded") throw new ReviewError("This pin is excluded from the board.");
  if (item.image_review === "approved") throw new ReviewError("Already published.");
  if (item.cleanup_status !== "done" || !item.cleaned_path) throw new ReviewError("Clean the photo before approving it.");
  const target = opts.pinId ?? store.targetPinId(item);
  if (!target) throw new ReviewError("Choose the catalogue pin first.");

  const state = (await store.pinImageState([target]))[target];
  if (!state) throw new ReviewError("That catalogue pin wasn't found.", 404);
  if (state.imageUrl && !opts.replaceExisting) {
    throw new ReviewError("This pin already has a catalogue photo. Approve again with “replace” to swap it.", 409, "pin_has_photo");
  }

  const { userRepo, pinRepo } = writeRepositories();
  const image = await userRepo.createContributedImage(reviewerId, target, {
    storagePath: item.cleaned_path,
    consentGranted: true,
    proposalReason: state.imageUrl ? "poor_quality" : "missing",
  });
  // Provenance: trace the published photo back to its board and permission
  // record. Best effort — a database without 037's columns still publishes.
  const { error: provenanceError } = await store.boardDb().from("pin_images")
    .update({ source: "pinhunt_board_scan", source_record_id: item.id, content_hash: item.crop_sha256 })
    .eq("id", image.id);
  if (provenanceError) console.warn(`[board-scan] provenance not saved for image ${image.id}:`, provenanceError.message);

  await publishContributedImage(image, reviewerId, { serviceClient: store.boardDb(), userRepo, pinRepo });
  return store.updateItem(item.id, {
    decision: target === item.suggested_pin_id ? "confirmed" : "corrected",
    decided_pin_id: target,
    image_review: "approved",
    pin_image_id: image.id,
    pin_has_image: true,
  });
}

/** Publish every cleaned crop that is ready and needs no judgement call (rules.bulkApproveBlock). */
export async function approveReady(scan: BoardScan, reviewerId: string) {
  const items = await store.listItems(scan.id);
  const pins = await pinStates(items);
  const approved: string[] = [];
  const skipped: Array<{ id: string; position: number; reason: string }> = [];
  const claimed = new Set<string>();
  for (const item of [...items].sort((a, b) => b.priority - a.priority)) {
    if (item.image_review !== "none" || item.decision === "excluded") continue;
    const target = store.targetPinId(item);
    let reason = bulkApproveBlock(scan, item, target ? pins[target] : undefined);
    if (!reason && target && claimed.has(target)) reason = "another crop of this pin was just published";
    if (reason) {
      skipped.push({ id: item.id, position: item.position, reason });
      continue;
    }
    try {
      await approveItem(scan, item, reviewerId);
      approved.push(item.id);
      claimed.add(target!);
    } catch (err) {
      skipped.push({ id: item.id, position: item.position, reason: errText(err) });
    }
  }
  return { approved, skipped };
}
