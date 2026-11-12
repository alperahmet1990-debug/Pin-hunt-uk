/**
 * Bulk board scanning — admin catalogue image capture (Step A).
 *
 * POST   /admin/board-scans                         Upload a board photo + permission record; processing starts in the background.
 * GET    /admin/board-scans                         Recent boards.
 * GET    /admin/board-scans/:id                     Board + pins (signed image URLs), metrics.
 * POST   /admin/board-scans/:id/resume              Finish an interrupted/partial board.
 * POST   /admin/board-scans/:id/items               Add a pin detection missed: { box, pinId? }.
 * PATCH  /admin/board-scans/:id/items/:itemId       { action: confirm | set_pin | exclude | reset | reject_image }.
 * POST   /admin/board-scans/:id/items/:itemId/clean    Pixian clean-up on request ({ force } lifts the judgement calls).
 * POST   /admin/board-scans/:id/items/:itemId/approve  Publish the cleaned photo to its pin ({ pinId?, replaceExisting? }).
 * POST   /admin/board-scans/:id/approve-ready       Publish every cleaned, confident photo of a pin with no photo.
 * GET    /admin/board-scans-pin-search?q=           Catalogue search for corrections.
 *
 * Same Bearer JWT → profiles.is_admin check as routes/pin-images.ts. Staging
 * first: needs migration 078. Pipeline: services/boardScan/pipeline.ts.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAiConfigured } from "@workspace/integrations-openai-ai-server";
import {
  addManualItem,
  approveItem,
  approveReady,
  catalogueRepository,
  cleanItem,
  enqueue,
  isRunning,
  reconcileStale,
  ReviewError,
} from "../services/boardScan/pipeline";
import { boardMaxPins } from "../services/boardScan/detect";
import { normaliseBoardPhoto, sha256, type Box } from "../services/boardScan/quality";
import { boardMetrics, itemPriority } from "../services/boardScan/rules";
import * as store from "../services/boardScan/store";
import type { BoardScan, BoardScanItem, ExcludeReason } from "../services/boardScan/store";
import { pixianConfigured } from "../services/pixian";

const router: IRouter = Router();

// ── Admin auth (same convention as pin-images.ts) ────────────────────────────

interface AdminRequest extends Request {
  adminId?: string;
}

let anonClient: SupabaseClient | null = null;
function getAnonClient(): SupabaseClient {
  if (!anonClient) anonClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  return anonClient;
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const { data: { user }, error } = await getAnonClient().auth.getUser(auth.slice(7));
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }
    const { data: profile } = await store.boardDb().from("profiles").select("is_admin").eq("id", user.id).single();
    if (!(profile as { is_admin?: boolean } | null)?.is_admin) { res.status(403).json({ error: "Admin access required" }); return; }
    req.adminId = user.id;
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

function fail(res: Response, err: unknown) {
  if (err instanceof ReviewError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err);
  res.status(status && status >= 400 && status < 600 ? status : 500).json({ error: msg });
}

const MAX_IMAGE_BASE64_CHARS = 18_000_000; // ~13MB photo; app.ts accepts 20mb bodies
const dailyLimit = () => Math.max(1, Number(process.env.BOARD_SCAN_DAILY_LIMIT) || 40);

function cleanText(v: unknown, max = 300): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function parseBox(v: unknown): Box | null {
  const b = v as Partial<Box> | null;
  if (!b) return null;
  const nums = [b.x, b.y, b.w, b.h].map(Number);
  if (!nums.every(Number.isFinite)) return null;
  const [x, y, w, h] = nums;
  if (x < 0 || y < 0 || w <= 0.005 || h <= 0.005 || x + w > 1.0001 || y + h > 1.0001) return null;
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

async function loadScan(req: AdminRequest, res: Response): Promise<BoardScan | null> {
  const scan = await store.getScan(String(req.params.id));
  if (!scan) {
    res.status(404).json({ error: "Board not found" });
    return null;
  }
  return reconcileStale(scan);
}

async function loadItem(req: AdminRequest, res: Response, scan: BoardScan): Promise<BoardScanItem | null> {
  const item = await store.getItem(scan.id, String(req.params.itemId));
  if (!item) {
    res.status(404).json({ error: "Pin not found on this board" });
    return null;
  }
  return item;
}

/** Board + items as the review screen needs them. */
async function scanView(scan: BoardScan) {
  const items = await store.listItems(scan.id);
  const [boardUrls, cropUrls, cleanedUrls, pins] = await Promise.all([
    store.signedUrls(store.BOARD_BUCKET, [scan.image_path]),
    store.signedUrls(store.BOARD_BUCKET, items.map((i) => i.crop_path ?? "")),
    store.signedUrls(store.CLEANED_BUCKET, items.map((i) => i.cleaned_path ?? "")),
    store.pinImageState(items.map(store.targetPinId).filter((x): x is string => !!x)),
  ]);
  return {
    scan: { ...scan, imageUrl: boardUrls[scan.image_path] ?? null, processing: isRunning(scan.id) },
    items: items.map((i) => {
      const target = store.targetPinId(i);
      return {
        ...i,
        cropUrl: i.crop_path ? cropUrls[i.crop_path] ?? null : null,
        cleanedUrl: i.cleaned_path ? cleanedUrls[i.cleaned_path] ?? null : null,
        targetPinId: target,
        targetPin: target ? pins[target] ?? null : null,
      };
    }),
    metrics: boardMetrics(scan, items),
    config: { maxPins: boardMaxPins(), pixianConfigured: pixianConfigured(), aiConfigured: isAiConfigured() },
  };
}

// ── Upload ───────────────────────────────────────────────────────────────────

router.post("/admin/board-scans", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    if (!imageBase64) { res.status(400).json({ error: "imageBase64 is required" }); return; }
    if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) { res.status(413).json({ error: "Photo is too large." }); return; }
    if (!isAiConfigured()) { res.status(503).json({ error: "Pin recognition isn't configured on this server." }); return; }

    // Permission record — required before anything is cropped or processed.
    const p = (body.permission ?? {}) as Record<string, unknown>;
    const basis = p.basis === "own_photo" || p.basis === "contributor_permission" ? p.basis : null;
    if (!basis) { res.status(400).json({ error: "Say whose photo this is (permission.basis)." }); return; }
    if (p.processing !== true) {
      res.status(400).json({ error: "Permission to crop and process this photo is required." });
      return;
    }
    if (p.notThirdPartyCatalogue !== true) {
      res.status(400).json({ error: "Confirm the photo isn't taken from Pin & Pop or another catalogue or website." });
      return;
    }
    const contributorName = cleanText(p.contributorName, 120);
    const evidence = cleanText(p.evidence, 500);
    if (basis === "contributor_permission" && (!contributorName || !evidence)) {
      res.status(400).json({ error: "For a collector's photo, record who gave permission and where the evidence is kept." });
      return;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if ((await store.countScansSince(req.adminId!, since)) >= dailyLimit()) {
      res.status(429).json({ error: `Daily limit of ${dailyLimit()} boards reached.` });
      return;
    }

    let normalised;
    try {
      normalised = await normaliseBoardPhoto(Buffer.from(imageBase64, "base64"));
    } catch {
      res.status(400).json({ error: "That file couldn't be read as a photo." });
      return;
    }
    // Same photo again: return the existing board rather than paying twice.
    const sha = sha256(normalised.image);
    const existing = await store.findScanByHash(req.adminId!, sha);
    if (existing) {
      res.json({ scan: existing, duplicate: true });
      return;
    }

    const scan = await store.insertScan({
      created_by: req.adminId!,
      mode: "catalogue_capture",
      status: "queued",
      title: cleanText(body.title, 120),
      image_path: "pending",
      image_sha256: sha,
      image_width: normalised.width,
      image_height: normalised.height,
      permission_basis: basis,
      contributor_name: contributorName,
      contributor_handle: cleanText(p.contributorHandle, 120),
      permission_evidence: evidence,
      permission_processing: true,
      permission_public_display: p.publicDisplay === true,
      not_third_party_catalogue: true,
    });
    const imagePath = `${scan.id}/board.jpg`;
    try {
      await store.uploadObject(store.BOARD_BUCKET, imagePath, normalised.image);
    } catch (err) {
      await store.updateScan(scan.id, { status: "failed", error: "Could not store the photo." });
      throw err;
    }
    await store.updateScan(scan.id, { image_path: imagePath });
    enqueue(scan.id);
    res.status(202).json({ scan: { ...scan, image_path: imagePath }, duplicate: false });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/admin/board-scans", requireAdmin, async (_req: AdminRequest, res: Response) => {
  try {
    const scans = await Promise.all((await store.listScans()).map(reconcileStale));
    res.json({ scans: scans.map((s) => ({ ...s, processing: isRunning(s.id) })) });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/admin/board-scans-pin-search", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const q = cleanText(req.query.q, 100);
    if (!q || q.length < 2) { res.json({ pins: [] }); return; }
    const exact = /^PHUK-\d+$/i.test(q) ? await catalogueRepository().getPinByPinhuntId(q.toUpperCase()) : null;
    const pins = exact ? [exact] : await catalogueRepository().searchPins(q, { status: "active", limit: 25 });
    res.json({
      pins: pins.map((p) => ({ pinId: p.id, title: p.title, collection: p.collection, imageUrl: p.imageUrl ?? null })),
    });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/admin/board-scans/:id", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const scan = await loadScan(req, res);
    if (!scan) return;
    res.json(await scanView(scan));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/admin/board-scans/:id/resume", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const scan = await loadScan(req, res);
    if (!scan) return;
    if (isRunning(scan.id)) { res.status(202).json({ queued: true }); return; }
    // Failed pins get a fresh set of attempts when a person asks.
    for (const i of await store.listItems(scan.id)) {
      if (i.match_status === "failed") await store.updateItem(i.id, { attempts: 0 });
    }
    await store.updateScan(scan.id, { status: "queued", error: null });
    enqueue(scan.id);
    res.status(202).json({ queued: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/admin/board-scans/:id/items", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const scan = await loadScan(req, res);
    if (!scan) return;
    const box = parseBox((req.body ?? {}).box);
    if (!box) { res.status(400).json({ error: "box {x, y, w, h} (fractions of the photo) is required" }); return; }
    const pinId = cleanText((req.body ?? {}).pinId, 64) ?? undefined;
    const item = await addManualItem(scan, box, pinId);
    res.json({ item });
  } catch (err) {
    fail(res, err);
  }
});

const EXCLUDE_REASONS: readonly ExcludeReason[] = ["not_a_pin", "duplicate", "not_wanted"];

router.patch("/admin/board-scans/:id/items/:itemId", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const scan = await loadScan(req, res);
    if (!scan) return;
    const item = await loadItem(req, res, scan);
    if (!item) return;
    const body = (req.body ?? {}) as { action?: string; pinId?: string; reason?: string };
    let patch: Partial<BoardScanItem>;
    switch (body.action) {
      case "confirm":
        if (!item.suggested_pin_id) { res.status(400).json({ error: "There's no suggestion to confirm." }); return; }
        patch = { decision: "confirmed", decided_pin_id: item.suggested_pin_id, exclude_reason: null };
        break;
      case "set_pin": {
        const pinId = cleanText(body.pinId, 64);
        const pin = pinId ? await catalogueRepository().getPinByPinhuntId(pinId) : null;
        if (!pin) { res.status(404).json({ error: "That catalogue pin wasn't found." }); return; }
        patch = {
          decision: pin.id === item.suggested_pin_id ? "confirmed" : "corrected",
          decided_pin_id: pin.id,
          exclude_reason: null,
          pin_has_image: !!pin.imageUrl,
        };
        break;
      }
      case "exclude": {
        const reason = EXCLUDE_REASONS.includes(body.reason as ExcludeReason) ? (body.reason as ExcludeReason) : "not_wanted";
        patch = { decision: "excluded", exclude_reason: reason };
        break;
      }
      case "reset":
        patch = { decision: "undecided", decided_pin_id: null, exclude_reason: null };
        break;
      case "reject_image":
        if (item.image_review === "approved") { res.status(400).json({ error: "Already published." }); return; }
        patch = { image_review: "rejected" };
        break;
      default:
        res.status(400).json({ error: "Unknown action" });
        return;
    }
    if (item.image_review === "approved" && body.action !== "reject_image") {
      res.status(400).json({ error: "This photo is already published; change the catalogue pin instead." });
      return;
    }
    let updated = await store.updateItem(item.id, { ...patch, priority: itemPriority({ ...item, ...patch }) });

    // A confirmed or corrected match may now qualify for clean-up (the
    // usual rules still apply — no forced Pixian calls here).
    if ((body.action === "confirm" || body.action === "set_pin") && updated.cleanup_status !== "done") {
      const siblings = await store.listItems(scan.id);
      const target = store.targetPinId(updated);
      const pins = target ? await store.pinImageState([target]) : {};
      const stats = { ...(scan.stats ?? {}) };
      updated = await cleanItem(scan, updated, siblings, pins, { stats });
      if (stats.pixianCalls !== scan.stats?.pixianCalls) await store.updateScan(scan.id, { stats });
    }
    res.json({ item: updated });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/admin/board-scans/:id/items/:itemId/clean", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const scan = await loadScan(req, res);
    if (!scan) return;
    const item = await loadItem(req, res, scan);
    if (!item) return;
    if (!pixianConfigured()) { res.status(503).json({ error: "Photo clean-up (Pixian) isn't configured on this server." }); return; }
    const siblings = await store.listItems(scan.id);
    const target = store.targetPinId(item);
    const pins = target ? await store.pinImageState([target]) : {};
    // A failed or skipped clean-up can be retried.
    const retry = item.cleanup_status === "done" ? item : { ...item, cleanup_status: "none" as const };
    const stats = { ...(scan.stats ?? {}) };
    const updated = await cleanItem(scan, retry, siblings, pins, { force: (req.body ?? {}).force === true, stats });
    await store.updateScan(scan.id, { stats });
    res.json({ item: updated });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/admin/board-scans/:id/items/:itemId/approve", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const scan = await loadScan(req, res);
    if (!scan) return;
    const item = await loadItem(req, res, scan);
    if (!item) return;
    const body = (req.body ?? {}) as { pinId?: string; replaceExisting?: boolean };
    const updated = await approveItem(scan, item, req.adminId!, {
      pinId: cleanText(body.pinId, 64) ?? undefined,
      replaceExisting: body.replaceExisting === true,
    });
    res.json({ item: updated });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/admin/board-scans/:id/approve-ready", requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const scan = await loadScan(req, res);
    if (!scan) return;
    res.json(await approveReady(scan, req.adminId!));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
