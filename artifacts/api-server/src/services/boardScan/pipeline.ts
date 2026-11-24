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
import { lookalikePins } from "../pictureIndex/search";
import { pictureIndexConfigured } from "../pictureIndex/vertex";
import { createSupabasePinRepository, createSupabaseUserRepository, type PinRepository } from "@workspace/pin-repository";
import { getOpenAIClient, isAiConfigured } from "@workspace/integrations-openai-ai-server";
import { normalizePinPhoto, pixianConfigured, PixianTimeoutError } from "../pixian";
import { estimateTilt, rotatePinPhoto, straightenPinPhoto } from "./straighten";
import { publishContributedImage } from "../contributed-images";
import { pinAndPopReferenceImages } from "../scanReferenceImages";
import { detectPins, emptyUsage, type DetectedPin, type TokenUsage } from "./detect";
import { describeCrop, matchCrop, type MatchDeps } from "./match";
import { assessCrop, boxToPixels, cropBox, differenceHash, forAi, sha256, type Box } from "./quality";
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
/** Boards asked to run again while running (e.g. a re-match after a confirmation). */
const rerun = new Set<string>();
const concurrentScans = () => Math.max(1, Number(process.env.BOARD_CONCURRENT_SCANS) || 2);

export function isRunning(scanId: string): boolean {
  return running.has(scanId) || waiting.includes(scanId);
}

export function enqueue(scanId: string): void {
  if (running.has(scanId)) { rerun.add(scanId); return; }
  if (waiting.includes(scanId)) return;
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
        if (rerun.delete(id)) waiting.push(id);
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

/** The photo crops are cut from: the full-size original when the board has one, else the working photo. */
export interface CropSource { image: Buffer; width: number; height: number }

async function cropSource(scan: BoardScan, board: Buffer): Promise<CropSource> {
  const original = scan.stats?.original;
  if (original) {
    try {
      return { image: await store.downloadObject(store.BOARD_BUCKET, original.path), width: original.width, height: original.height };
    } catch (err) {
      console.warn(`[board-scan] full-size photo of ${scan.id} unavailable, cropping from the working photo:`, errText(err));
    }
  }
  return { image: board, width: scan.image_width, height: scan.image_height };
}

/** Cut, check and store one pin's crop from the board. */
async function cropFields(scan: BoardScan, src: CropSource, cropPath: string, box: Box, flags: Pick<DetectedPin, "occluded" | "partial" | "glare">) {
  const crop = await cropBox(src.image, src.width, src.height, box);
  const [quality, dhash] = await Promise.all([
    assessCrop(crop, box, src.width, src.height, flags),
    differenceHash(crop),
  ]);
  await store.uploadObject(store.BOARD_BUCKET, cropPath, crop);
  return { box, crop_path: cropPath, crop_sha256: sha256(crop), crop_dhash: dhash, quality };
}

async function makeItem(scan: BoardScan, src: CropSource, position: number, pin: DetectedPin, origin: "detected" | "manual"): Promise<Partial<BoardScanItem>> {
  const cropPath = `${scan.id}/crops/${String(position).padStart(3, "0")}.jpg`;
  return {
    board_scan_id: scan.id,
    position,
    origin,
    ...(await cropFields(scan, src, cropPath, pin.box, pin)),
    detection: { characters: pin.characters, keywords: pin.keywords, text: pin.text, occluded: pin.occluded, partial: pin.partial, glare: !!pin.glare },
  };
}

/** Context around a detected box for the describe step, so a box that cut the pin off can grow. */
export const DESCRIBE_CONTEXT_PAD = 0.35;

/**
 * Map a box given as fractions of a padded context crop back onto the board,
 * and accept it only when it's plausibly the same pin as the detected box.
 */
export function refineBox(detected: Box, inContext: Box, width: number, height: number): Box | null {
  const ctx = boxToPixels(detected, width, height, DESCRIBE_CONTEXT_PAD);
  const box: Box = {
    x: (ctx.left + inContext.x * ctx.width) / width,
    y: (ctx.top + inContext.y * ctx.height) / height,
    w: (inContext.w * ctx.width) / width,
    h: (inContext.h * ctx.height) / height,
  };
  const ix = Math.max(0, Math.min(box.x + box.w, detected.x + detected.w) - Math.max(box.x, detected.x));
  const iy = Math.max(0, Math.min(box.y + box.h, detected.y + detected.h) - Math.max(box.y, detected.y));
  const smaller = Math.min(box.w * box.h, detected.w * detected.h);
  // Mostly the same area, and not wildly bigger or smaller.
  if (smaller <= 0 || (ix * iy) / smaller < 0.5) return null;
  const ratio = (box.w * box.h) / (detected.w * detected.h);
  if (ratio < 0.25 || ratio > 4) return null;
  return box;
}

/**
 * The per-pin describe step, once per item: the pin's own search terms and,
 * for detected pins, a tightened box and a new crop. Hand-drawn boxes are
 * kept as drawn. Failures fall back to the board-wide description.
 */
async function describeItem(scan: BoardScan, src: CropSource | null, item: BoardScanItem, usage: TokenUsage): Promise<BoardScanItem> {
  if (item.detection?.described) return item;
  const base = item.detection ?? { characters: [], keywords: [], text: "", occluded: false, partial: false };
  try {
    const refine = item.origin === "detected" && !!src;
    const image = refine
      ? await cropBox(src!.image, src!.width, src!.height, item.box, DESCRIBE_CONTEXT_PAD, 1600)
      : await store.downloadObject(store.BOARD_BUCKET, item.crop_path!);
    const d = await describeCrop(await forAi(image, 1600), { openai: getOpenAIClient(), model: scanModel() }, usage);
    const uniq = (a: string[], b: string[], n: number) => [...new Set([...a, ...b])].slice(0, n);
    const detection = {
      ...base,
      characters: uniq(d.characters, base.characters, 5),
      keywords: uniq(d.keywords, base.keywords, 10),
      text: d.text || base.text,
      described: true,
    };
    // Box fractions are the same on any size of the photo.
    const box = refine && d.box ? refineBox(item.box, d.box, src!.width, src!.height) : null;
    const recrop = box ? await cropFields(scan, src!, item.crop_path!, box, base) : {};
    return store.updateItem(item.id, { ...recrop, detection });
  } catch (err) {
    console.warn(`[board-scan] describing item ${item.id} failed, matching with the board description:`, errText(err));
    return item;
  }
}

/** What matching uses: the AI, the catalogue, Pin & Pop references and (when on) the picture index. */
export function matchDeps(): MatchDeps {
  return {
    openai: getOpenAIClient(),
    model: scanModel(),
    repository: catalogueRepository(),
    // Pin & Pop reference images: recognition only (scripts/PINANDPOP.md).
    referenceImages: async (ids) => Object.fromEntries(await pinAndPopReferenceImages(ids, undefined, 5_000)),
    // The picture index (migration 085), when switched on.
    ...(pictureIndexConfigured() ? { pictureSearch: lookalikePins } : {}),
  };
}

/** Match one item and save the result. Never throws: failures are recorded on the item. */
async function matchItem(scan: BoardScan, src: CropSource | null, item: BoardScanItem, usage: TokenUsage): Promise<BoardScanItem> {
  item = await describeItem(scan, src, item, usage);
  try {
    const crop = await forAi(await store.downloadObject(store.BOARD_BUCKET, item.crop_path!));
    const result = await matchCrop(crop, item.detection ?? { characters: [], keywords: [], text: "" }, matchDeps(), usage, { sets: scan.stats?.setHints ?? [] });
    const top = result.candidates[0];
    const patch: Partial<BoardScanItem> = {
      match_status: result.status,
      candidates: result.candidates,
      suggested_pin_id: top?.pinId ?? null,
      match_confidence: top?.confidence ?? null,
      pin_has_image: top ? !!top.imageUrl : null,
      attempts: item.attempts + 1,
      // Matching worked; a note here says why the picture check didn't (shown on the card).
      error: result.problem ?? null,
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

/** Straighten a cleaned photo when its pin is visibly tilted; never fails the clean-up. */
async function straightenOrKeep(cleaned: Buffer): Promise<Buffer> {
  try {
    return (await straightenPinPhoto(cleaned)).image;
  } catch (err) {
    console.warn("[board-scan] straighten skipped:", errText(err));
    return cleaned;
  }
}

/**
 * A turned photo's path records what it was turned from and by how much:
 *   <base path without .jpg>.turn.<item id>.<total degrees>.jpg
 * so every turn starts again from the un-turned clean-up (no quality lost to
 * repeated re-encoding), and the previous turned file — which only this item
 * uses — can be removed. The base itself may be shared by identical crops and
 * is never removed.
 */
const TURNED = /^(.*)\.turn\.([^./]+)\.(-?\d+(?:\.\d+)?)\.jpg$/;

export function parseTurnedPath(path: string): { base: string; itemId: string; degrees: number } | null {
  const m = TURNED.exec(path);
  return m ? { base: `${m[1]}.jpg`, itemId: m[2], degrees: Number(m[3]) } : null;
}

export function turnedPath(base: string, itemId: string, degrees: number): string {
  return `${base.replace(/\.jpg$/, "")}.turn.${itemId}.${Number(degrees.toFixed(2))}.jpg`;
}

/**
 * Turn a cleaned photo while it's still under review: by hand (`degrees`,
 * clockwise) or automatically ("auto").
 */
export async function rotateCleaned(scan: BoardScan, item: BoardScanItem, degrees: number | "auto"): Promise<BoardScanItem> {
  if (item.cleanup_status !== "done" || !item.cleaned_path) throw new ReviewError("Clean the photo before turning it.");
  if (item.image_review === "approved") throw new ReviewError("This photo is already published.");
  if (item.image_review !== "none") throw new ReviewError("This photo was rejected. Clean it again to review it.");
  const previous = item.cleaned_path;
  const turned = parseTurnedPath(previous);
  const current = turned?.itemId === item.id ? turned : null;
  const base = current?.base ?? previous;
  const sofar = current?.degrees ?? 0;

  let step: number;
  if (degrees === "auto") {
    const shown = await store.downloadObject(store.CLEANED_BUCKET, previous);
    const tilt = await estimateTilt(shown);
    if (tilt.reason !== "straightened") {
      throw new ReviewError(tilt.reason === "already_straight"
        ? "It already looks straight."
        : "Couldn't find straight edges on this pin. Turn it by hand.", 422);
    }
    step = tilt.degrees;
  } else {
    step = degrees;
  }
  const total = Math.round((sofar + step) * 100) / 100;
  let path = base;
  if (Math.abs(total) >= 0.01) {
    if (Math.abs(total) > 45) throw new ReviewError("That's turned too far. Try the other way.");
    const original = await store.downloadObject(store.CLEANED_BUCKET, base);
    path = turnedPath(base, item.id, total);
    await store.uploadObject(store.CLEANED_BUCKET, path, await rotatePinPhoto(original, total));
  }
  // Only save the new path if the photo is still under review (no race with approval).
  const updated = await store.updateItemIf(item.id, { image_review: "none" }, { cleaned_path: path });
  if (!updated) {
    if (path !== base) await store.removeObject(store.CLEANED_BUCKET, path);
    throw new ReviewError("This photo was approved or rejected meanwhile.", 409);
  }
  if (current && previous !== path) await store.removeObject(store.CLEANED_BUCKET, previous);
  return updated;
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
      const cleaned = await straightenOrKeep(await normalizePinPhoto(crop, "image/jpeg"));
      // Test-mode results carry Pixian's watermark: marked in the name so they're never published as real.
      const mark = process.env.PIXIAN_TEST_MODE === "true" ? store.PIXIAN_TEST_MARK : "";
      cleanedPath = `${scan.created_by}/board-${scan.id}/${item.id}${mark}.jpg`;
      await store.uploadObject(store.CLEANED_BUCKET, cleanedPath, cleaned);
    }
    return store.updateItem(item.id, {
      cleanup_status: "done", cleaned_path: cleanedPath, cleanup_note: null,
      // Cleaning a rejected photo again puts it back under review.
      ...(item.image_review === "rejected" ? { image_review: "none" as const } : {}),
    });
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
      // Crops come from the full-size photo when there is one (two at a time: it's big).
      const src = await cropSource(scan, board);
      const rows = await mapLimit(detection.pins.map((p, i) => ({ p, i })), src.image === board ? 4 : 2, ({ p, i }) => makeItem(scan!, src, i + 1, p, "detected"));
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
      const src = await cropSource(scan, board);
      const updated = await mapLimit(toMatch, MATCH_CONCURRENCY, (i) => matchItem(scan!, src, i, usage));
      const byId = new Map(updated.map((u) => [u.id, u]));
      items = items.map((i) => byId.get(i.id) ?? i);
      stats = mergeUsage(stats, usage);
      stats.matchMs = (stats.matchMs ?? 0) + (Date.now() - t);
    }

    // ── Clean ──
    // Only automatically, for suitable, confident crops of pins with no
    // photo; anything else waits for the reviewer to ask.
    // "skipped" is looked at again: a re-match (e.g. after a set was learned)
    // can make a skipped low-confidence pin confident. A rejected photo is
    // only cleaned again on request.
    const candidates = items.filter((i) =>
      i.cleanup_status === "none" || i.cleanup_status === "failed" ||
      (i.cleanup_status === "skipped" && i.image_review !== "rejected"));
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
  const row = await makeItem(scan, await cropSource(scan, board), position, { box, characters: [], keywords: [], text: "", occluded: false, partial: false }, "manual");
  if (pinhuntId) {
    const pin = await catalogueRepository().getPinByPinhuntId(pinhuntId);
    if (!pin) throw Object.assign(new Error("That catalogue pin wasn't found."), { status: 404 });
    Object.assign(row, {
      match_status: "suggested", decision: "confirmed", decided_pin_id: pin.id, pin_has_image: !!pin.imageUrl,
      candidates: [{ pinId: pin.id, title: pin.title, collection: pin.collection, imageUrl: pin.imageUrl ?? null, confidence: 100, reasoning: "Chosen by the reviewer." }],
    });
  }
  // A hand-drawn box has no description yet: matchItem's describe step adds one.
  const usage = emptyUsage();
  let [item] = await store.insertItems([{ ...row, priority: itemPriority(row as BoardScanItem) }]);
  if (!pinhuntId && isAiConfigured()) {
    item = await matchItem(scan, null, item, usage);
    await store.updateScan(scan.id, { stats: mergeUsage(scan.stats ?? {}, usage) });
  }
  return item;
}

/** Most sets a board searches first (typed at upload or learned from confirmations). */
export const MAX_SET_HINTS = 5;

/** A set name as given: trimmed, single-spaced, at most 120 characters. */
export function cleanSetName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, 120);
  return s.length >= 3 ? s : null;
}

/** Confirmed pins from one set needed before the board learns it. */
export const SET_VOTES_TO_LEARN = 2;

/**
 * A reviewer confirmed or corrected a pin. Once a second confirmed pin on
 * the board comes from the same set, remember that set and re-match the
 * board's other undecided pins with it searched first (pins on a board are
 * often from the same set, and many set pins are titled only by character).
 * One pin alone isn't enough: a board often mixes sets, and one stray set
 * would steer every other pin. Returns how many pins will be re-matched; 0
 * when the set was already known, needs another confirmation, or the board
 * has enough sets.
 */
export async function learnSet(scan: BoardScan, collection: string | null | undefined, confirmedItemId: string): Promise<number> {
  const set = cleanSetName(collection);
  if (!set) return 0;
  const key = set.toLowerCase();
  const hints = scan.stats?.setHints ?? [];
  if (hints.length >= MAX_SET_HINTS || hints.some((h) => h.toLowerCase() === key)) return 0;
  const voters = [...new Set([...(scan.stats?.setVotes?.[key] ?? []), confirmedItemId])];
  if (voters.length < SET_VOTES_TO_LEARN) {
    await store.updateScan(scan.id, { stats: { setVotes: { [key]: voters } } });
    return 0;
  }
  await store.updateScan(scan.id, { stats: { setHints: [...hints, set], setVotes: { [key]: voters } } });
  const items = await store.listItems(scan.id);
  const others = items.filter((i) =>
    i.id !== confirmedItemId && i.decision === "undecided" && i.image_review === "none" &&
    i.crop_path && i.match_status !== "pending");
  for (const i of others) await store.updateItem(i.id, { match_status: "pending", attempts: 0 });
  if (others.length > 0) enqueue(scan.id);
  return others.length;
}

/**
 * A board can be scanned again or deleted only while nothing from it is
 * published: a published catalogue photo's provenance (pin_images
 * source_record_id → board_scan_items.id → the board's permission record)
 * must not be lost.
 */
async function assertNothingPublished(scan: BoardScan, items: BoardScanItem[]) {
  if (isRunning(scan.id)) throw new ReviewError("This board is still being processed. Try again when it has finished.", 409);
  const published = items.filter((i) => i.image_review === "approved").length;
  if (published > 0) {
    throw new ReviewError(
      `${published} photo${published === 1 ? " from this board is" : "s from this board are"} published to the catalogue, so the board is kept as their record.`,
      409, "board_has_published",
    );
  }
}

/**
 * Scan the same board photo again from the start: detection, describing,
 * matching and clean-up, with the latest matching rules and an optional set.
 * Earlier pins, their crops and cleaned photos (unless another board uses
 * the same file) are removed; the board photo and its permission record are kept.
 */
export async function rescanBoard(scan: BoardScan, setHint?: string | null): Promise<void> {
  const items = await store.listItems(scan.id);
  await assertNothingPublished(scan, items);
  const cleaned = [...new Set(items.map((i) => i.cleaned_path).filter((p): p is string => !!p))];
  const shared = await store.cleanedPathsUsedElsewhere(cleaned, scan.id);
  await store.removePendingBoardImages(items.map((i) => i.id));
  await store.deleteItemsForScan(scan.id);
  await store.removeObjects(store.BOARD_BUCKET, await store.listObjects(store.BOARD_BUCKET, `${scan.id}/crops`).catch(() => []));
  // Cleaned photos of the old pins (the files pending photo records pointed
  // to, too), unless another board uses the same file.
  await store.removeObjects(store.CLEANED_BUCKET, cleaned.filter((p) => !shared.has(p)));
  const set = cleanSetName(setHint);
  // Fresh counters. A set typed now replaces the board's sets (one learned
  // earlier may be what went wrong); otherwise they're kept.
  await store.updateScan(scan.id, {
    status: "queued", error: null, detection_truncated: false,
    stats: set ? { setHints: [set] } : {},
  }, { resetStats: true, replaceSetHints: !!set });
  enqueue(scan.id);
}

/**
 * Delete a board: its pins, its photo and crops, and cleaned photos no other
 * board uses. Refused while anything from it is published.
 */
export async function deleteBoard(scan: BoardScan): Promise<void> {
  const items = await store.listItems(scan.id);
  await assertNothingPublished(scan, items);
  const cleaned = [...new Set(items.map((i) => i.cleaned_path).filter((p): p is string => !!p))];
  const shared = await store.cleanedPathsUsedElsewhere(cleaned, scan.id);
  await store.removePendingBoardImages(items.map((i) => i.id));
  await store.deleteItemsForScan(scan.id);
  await store.deleteScan(scan.id);
  const crops = await store.listObjects(store.BOARD_BUCKET, `${scan.id}/crops`).catch(() => [] as string[]);
  await store.removeObjects(store.BOARD_BUCKET, [scan.image_path, ...(scan.stats?.original ? [scan.stats.original.path] : []), ...crops]);
  await store.removeObjects(store.CLEANED_BUCKET, cleaned.filter((p) => !shared.has(p)));
}

export class ReviewError extends Error {
  constructor(message: string, public status = 400, public code?: string) {
    super(message);
  }
}

/** A pending photo record an earlier, failed approval of this item left behind, if it still fits. */
async function reusableImage(item: BoardScanItem, target: string, userRepo: ReturnType<typeof writeRepositories>["userRepo"]) {
  const { data } = await store.boardDb().from("pin_images").select("id, status")
    .eq("source", "pinhunt_board_scan").eq("source_record_id", item.id)
    .order("created_at", { ascending: false }).limit(1);
  const prior = (data as Array<{ id: string; status: string }> | null)?.[0];
  if (!prior || prior.status !== "pending") return null;
  const image = await userRepo.getContributedImage(prior.id).catch(() => null);
  if (image && image.pinhuntId === target && image.storagePath === item.cleaned_path) return image;
  // Left over from an attempt for another pin or photo: remove it so it doesn't sit in the review queue.
  await store.boardDb().from("pin_images").delete().eq("id", prior.id).eq("status", "pending");
  return null;
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
  if (store.isTestModeCleanup(item.cleaned_path) && process.env.PIXIAN_TEST_MODE !== "true") {
    // Offer "Clean photo" again for a real clean-up.
    await store.updateItem(item.id, {
      cleanup_status: "skipped", cleaned_path: null,
      cleanup_note: "This photo was cleaned in Pixian test mode (watermarked). Clean it again before publishing.",
    });
    throw new ReviewError("This photo was cleaned in Pixian test mode and carries a watermark. Clean it again before publishing.", 409, "test_mode_cleanup");
  }
  const target = opts.pinId ?? store.targetPinId(item);
  if (!target) throw new ReviewError("Choose the catalogue pin first.");

  const state = (await store.pinImageState([target]))[target];
  if (!state) throw new ReviewError("That catalogue pin wasn't found.", 404);
  if (state.imageUrl && !opts.replaceExisting) {
    throw new ReviewError("This pin already has a catalogue photo. Approve again with “replace” to swap it.", 409, "pin_has_photo");
  }

  const { userRepo, pinRepo } = writeRepositories();
  // Safe to retry: an earlier attempt that created the photo record but
  // failed to publish left a pending row with this item's provenance. Reuse
  // it (a second row would break the provenance unique index and publish a
  // photo with no permission trail); drop it if it no longer fits.
  let image = await reusableImage(item, target, userRepo);
  if (!image) {
    image = await userRepo.createContributedImage(reviewerId, target, {
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
  }
  await store.updateItem(item.id, { pin_image_id: image.id });

  // The reviewer confirmed the replacement above; publishContributedImage
  // would otherwise refuse a pin whose photo came from somewhere else.
  await publishContributedImage(image, reviewerId, { serviceClient: store.boardDb(), userRepo, pinRepo },
    { replaceExisting: opts.replaceExisting === true });
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
