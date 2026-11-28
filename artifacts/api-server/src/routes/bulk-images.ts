/**
 * Admin Bulk Image Matcher (App Creator only, staging first).
 *
 * Upload a batch of individual pin photos → automatic catalogue match
 * suggestions → one-click confirmation → Pixian clean-up → preview →
 * publish as the pin's catalogue image. Screen: app/admin/bulk-images/*.
 * Migration 076. Processing: services/bulkImages/*.
 *
 * Off unless BULK_IMAGE_MATCHER_ENABLED=true (every route 404s otherwise),
 * so the feature can't reach production by accident.
 *
 * Batches
 *   POST /admin/bulk-images/batches                 create (with permission record)
 *   GET  /admin/bulk-images/batches                 list with counts
 *   GET  /admin/bulk-images/batches/:id             dashboard + items
 *   POST /admin/bulk-images/batches/:id/items       upload one photo
 *   POST /admin/bulk-images/batches/:id/sets        { sets: [..] } searched first; re-matches undecided photos
 *   POST /admin/bulk-images/batches/:id/accuracy    re-match confirmed photos, report right first / top 5
 *   POST /admin/bulk-images/batches/:id/process     resume background work
 *   POST /admin/bulk-images/batches/:id/retry-failed
 * Items
 *   GET  /admin/bulk-images/items/:id               review detail
 *   GET  /admin/bulk-images/items/:id/picks         look-alikes (picture index) + sets to browse
 *   POST /admin/bulk-images/items/:id/confirm       { pinhuntId, method }
 *   POST /admin/bulk-images/items/:id/skip | flag | reopen   { notes? }
 *   POST /admin/bulk-images/items/:id/reclean       reject the Pixian result, clean again
 *   POST /admin/bulk-images/items/:id/crop          { box } crop to the pin, then clean again
 *   POST /admin/bulk-images/items/:id/retry         retry the failed stage only
 *   POST /admin/bulk-images/items/:id/publish       { replaceExisting? }
 * Search
 *   GET  /admin/bulk-images/search?q=&set=&offset=  manual catalogue search; with set, browse it 30 at a time
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { getOpenAIClient, isAiConfigured } from "@workspace/integrations-openai-ai-server";
import {
  createSupabasePinRepository,
  createSupabaseUserRepository,
  type CataloguePin,
  type PinRepository,
} from "@workspace/pin-repository";
import { normalizePinPhoto, pixianConfigured } from "../services/pixian";
import { matchPhoto } from "../services/bulkImages/match";
import { BUCKET, cropToBox, download, forMatching, isRunning, pausedReasons, processBatch, type PipelineDeps } from "../services/bulkImages/pipeline";
import { parseBox } from "../services/bulkImages/match";
import { publishItem, PublishBlockedError } from "../services/bulkImages/publish";
import { pinAndPopReferenceImages } from "../services/scanReferenceImages";
import { lookalikePins } from "../services/pictureIndex/search";
import { pictureIndexConfigured } from "../services/pictureIndex/vertex";
import { batchSets, cleanSetList, learnBatchSet, readStats, rematchUndecided, SetInputError, updateBatchStats } from "../services/bulkImages/batchStats";
import { ACCURACY_COOLDOWN_MS, ANSWERED_STATUSES, batchAccuracyRunning, MAX_CHECKED, startBatchAccuracyCheck } from "../services/bulkImages/accuracy";

const router: IRouter = Router();

// ── Feature flag + App Creator auth ──────────────────────────────────────────

export function bulkImagesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BULK_IMAGE_MATCHER_ENABLED === "true";
}

interface AdminRequest extends Request {
  adminId?: string;
}

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;
function getAnonClient(): SupabaseClient {
  anonClient ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  return anonClient;
}
function getServiceClient(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the bulk image matcher.");
  }
  serviceClient ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return serviceClient;
}
function getPinRepo(): PinRepository {
  return createSupabasePinRepository(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function guard(req: AdminRequest, res: Response, next: NextFunction) {
  if (!bulkImagesEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const { data: { user }, error } = await getAnonClient().auth.getUser(auth.slice(7));
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }
    const { data: profile } = await getServiceClient()
      .from("profiles").select("is_app_creator").eq("id", user.id).single();
    if (!profile?.is_app_creator) { res.status(403).json({ error: "App Creator access required" }); return; }
    req.adminId = user.id;
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

const fail = (res: Response, err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[bulk-images]", msg);
  res.status(500).json({ error: msg });
};

// ── Pipeline wiring ──────────────────────────────────────────────────────────

const SCAN_MODEL = () => process.env.OPENAI_BULK_MATCH_MODEL ?? process.env.OPENAI_SCAN_MODEL ?? "gpt-5.6-luna";

/** pinhunt id → pins.id (UUID) for a handful of pins. */
async function pinUuids(db: SupabaseClient, pinhuntIds: string[]): Promise<Map<string, string>> {
  if (pinhuntIds.length === 0) return new Map();
  const { data, error } = await db.from("pins").select("id, pinhunt_id").in("pinhunt_id", pinhuntIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r: { id: string; pinhunt_id: string }) => [r.pinhunt_id, r.id]));
}

/**
 * Admin-only Pin & Pop references (migration 042) keyed by pinhunt id.
 * Never stored by this feature and never returned by a collector route.
 */
async function pinAndPopRefs(pinhuntIds: string[]) {
  const db = getServiceClient();
  const uuids = await pinUuids(db, pinhuntIds);
  const userRepo = createSupabaseUserRepository(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const byUuid = await userRepo.getPinAndPopReferences([...uuids.values()]);
  const out: Record<string, { externalId?: string; pageUrl?: string; imageUrl?: string }> = {};
  for (const [pinhuntId, uuid] of uuids) if (byUuid[uuid]) out[pinhuntId] = byUuid[uuid];
  return out;
}

function pipelineDeps(): PipelineDeps {
  const db = getServiceClient();
  const repository = getPinRepo();
  return {
    db,
    match: (photo, ctx) => matchPhoto(photo, {
      ...(ctx?.sets?.length ? { sets: ctx.sets } : {}),
      ...(ctx?.original ? { original: ctx.original } : {}),
      openai: getOpenAIClient(),
      model: SCAN_MODEL(),
      repository,
      // Pin & Pop reference images for the picture check, as board scanning gets them (5 s limit).
      referenceImages: async (ids) => Object.fromEntries(await pinAndPopReferenceImages(ids, undefined, 5_000)),
      // The picture index (migration 085), when switched on: pins that look like the photo.
      ...(pictureIndexConfigured() ? { pictureSearch: lookalikePins } : {}),
    }),
    clean: (photo) => normalizePinPhoto(photo, "image/jpeg"),
  };
}

/** Start/resume background work, if the upstream services are configured. */
async function kick(batchId: string, stages: Array<"match" | "clean"> = ["match", "clean"]) {
  const allowed = stages.filter((s) => (s === "match" ? isAiConfigured() : pixianConfigured()));
  if (allowed.length === 0) return;
  await processBatch(batchId, pipelineDeps(), allowed);
}

// ── Shapes ───────────────────────────────────────────────────────────────────

const ITEM_LIST_COLUMNS =
  "id, status, failed_stage, error, original_filename, original_path, cleaned_path, top_confidence, match_band, " +
  "match_verified, matched_pinhunt_id, candidates, pixian_calls, published_image_url, width, height, created_at, updated_at";

export const COUNT_KEYS = [
  "uploaded", "matching", "suggested", "unmatched", "flagged", "skipped",
  "confirmed", "cleaning", "cleaned", "published", "failed",
] as const;

export function summarise(statuses: Array<{ status: string; failed_stage?: string | null }>) {
  const counts: Record<string, number> = Object.fromEntries(COUNT_KEYS.map((k) => [k, 0]));
  const failedByStage: Record<string, number> = { match: 0, clean: 0, publish: 0 };
  for (const s of statuses) {
    counts[s.status] = (counts[s.status] ?? 0) + 1;
    if (s.status === "failed" && s.failed_stage) failedByStage[s.failed_stage]++;
  }
  return {
    total: statuses.length,
    counts,
    failedByStage,
    // Dashboard groups.
    awaitingMatching: counts.uploaded + counts.matching,
    awaitingReview: counts.suggested + counts.unmatched + counts.flagged,
    confirmed: counts.confirmed + counts.cleaning + counts.cleaned + counts.published,
    cleaned: counts.cleaned + counts.published,
    awaitingPublish: counts.cleaned,
    published: counts.published,
    problems: counts.failed + counts.skipped + counts.unmatched,
  };
}

async function signed(db: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrls(unique, 3600);
  if (error) throw new Error(error.message);
  const out = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

// ── Batches ──────────────────────────────────────────────────────────────────

/** Wait between hand changes to a batch's sets (each re-matches its undecided photos). */
export const SETS_COOLDOWN_MS = 60_000;

const PERMISSION_BASES = ["own_photos", "written_permission", "licence", "other"];

router.post("/admin/bulk-images/batches", guard, async (req: AdminRequest, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const supplierName = typeof b.supplierName === "string" ? b.supplierName.trim() : "";
    const permissionBasis = String(b.permissionBasis ?? "");
    if (!title || title.length > 120) { res.status(400).json({ error: "A batch title is required." }); return; }
    if (!supplierName) { res.status(400).json({ error: "Record who supplied the photos." }); return; }
    if (!PERMISSION_BASES.includes(permissionBasis)) {
      res.status(400).json({ error: "Choose the permission basis for these photos." });
      return;
    }
    let sets: string[];
    try { sets = cleanSetList(b.sets); } catch (e) {
      if (e instanceof SetInputError) { res.status(400).json({ error: e.message }); return; }
      throw e;
    }
    const { data, error } = await getServiceClient().from("bulk_image_batches").insert({
      title,
      created_by: req.adminId,
      supplier_name: supplierName.slice(0, 200),
      permission_basis: permissionBasis,
      licence: typeof b.licence === "string" && b.licence.trim() ? b.licence.trim().slice(0, 500) : null,
      permission_public_display: b.permissionPublicDisplay === true,
      permission_notes: typeof b.permissionNotes === "string" && b.permissionNotes.trim() ? b.permissionNotes.trim().slice(0, 2000) : null,
      permission_recorded_by: req.adminId,
      // Optional: the set(s) these photos come from, searched first (migration 086).
      ...(sets.length ? { stats: { setHints: sets } } : {}),
    }).select("*").single();
    if (error) throw new Error(error.message);
    res.status(201).json({ batch: data });
  } catch (err) { fail(res, err); }
});

router.get("/admin/bulk-images/batches", guard, async (_req, res) => {
  try {
    const db = getServiceClient();
    const { data: batches, error } = await db.from("bulk_image_batches")
      .select("*").eq("status", "open").order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    const ids = (batches ?? []).map((b: { id: string }) => b.id);
    const { data: items, error: itemsErr } = ids.length
      ? await db.from("bulk_image_items").select("batch_id, status, failed_stage").in("batch_id", ids).limit(50_000)
      : { data: [], error: null };
    if (itemsErr) throw new Error(itemsErr.message);
    const byBatch = new Map<string, Array<{ status: string; failed_stage: string | null }>>();
    for (const it of (items ?? []) as Array<{ batch_id: string; status: string; failed_stage: string | null }>) {
      if (!byBatch.has(it.batch_id)) byBatch.set(it.batch_id, []);
      byBatch.get(it.batch_id)!.push(it);
    }
    res.json({
      batches: (batches ?? []).map((b: { id: string }) => ({ ...b, summary: summarise(byBatch.get(b.id) ?? []) })),
    });
  } catch (err) { fail(res, err); }
});

async function loadBatch(id: string) {
  const { data, error } = await getServiceClient().from("bulk_image_batches").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as null | {
    id: string; status: string; permission_public_display: boolean; permission_recorded_at: string;
  };
}

router.get("/admin/bulk-images/batches/:id", guard, async (req, res) => {
  try {
    const db = getServiceClient();
    const batch = await loadBatch(String(req.params.id));
    if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
    const { data, error } = await db.from("bulk_image_items")
      .select(ITEM_LIST_COLUMNS).eq("batch_id", batch.id).order("created_at", { ascending: true }).limit(5000);
    if (error) throw new Error(error.message);
    const items = (data ?? []) as unknown as Array<Record<string, unknown> & {
      original_path: string; cleaned_path: string | null; status: string; failed_stage: string | null;
    }>;
    const urls = await signed(db, items.flatMap((i) => [i.original_path, i.cleaned_path ?? ""]));
    // Titles for pins chosen by manual search (not in the stored candidates).
    const missing = [...new Set(items.filter((i) => {
      const id = i.matched_pinhunt_id as string | null;
      return id && !((i.candidates as Array<{ pinhuntId: string }> | null) ?? []).some((c) => c.pinhuntId === id);
    }).map((i) => i.matched_pinhunt_id as string))];
    const titles = new Map<string, string>();
    if (missing.length) {
      const { data: rows } = await db.from("pins").select("pinhunt_id, title").in("pinhunt_id", missing);
      for (const r of (rows ?? []) as Array<{ pinhunt_id: string; title: string }>) titles.set(r.pinhunt_id, r.title);
    }
    res.json({
      batch,
      summary: summarise(items),
      running: isRunning(batch.id),
      accuracyRunning: batchAccuracyRunning(batch.id),
      paused: pausedReasons(batch.id),
      services: { matching: isAiConfigured(), pixian: pixianConfigured() },
      items: items.map(({ original_path, cleaned_path, candidates, ...rest }) => {
        const list = (Array.isArray(candidates) ? candidates : []) as Array<{ pinhuntId: string; title: string }>;
        const top = list[0];
        const matched = rest.matched_pinhunt_id ? list.find((c) => c.pinhuntId === rest.matched_pinhunt_id) : undefined;
        return {
          ...rest,
          originalUrl: urls.get(original_path) ?? null,
          cleanedUrl: cleaned_path ? urls.get(cleaned_path) ?? null : null,
          topCandidate: top ? { pinhuntId: top.pinhuntId, title: top.title } : null,
          matchedTitle: matched?.title ?? (rest.matched_pinhunt_id ? titles.get(rest.matched_pinhunt_id as string) ?? null : null),
        };
      }),
    });
  } catch (err) { fail(res, err); }
});

const MAX_IMAGE_BASE64_CHARS = 14_000_000; // ~10MB photo

router.post("/admin/bulk-images/batches/:id/items", guard, async (req: AdminRequest, res) => {
  try {
    const db = getServiceClient();
    const batch = await loadBatch(String(req.params.id));
    if (!batch || batch.status !== "open") { res.status(404).json({ error: "Batch not found" }); return; }
    const { imageBase64, filename, sourceSha256 } = (req.body ?? {}) as {
      imageBase64?: string; filename?: string; sourceSha256?: string;
    };
    if (!imageBase64) { res.status(400).json({ error: "imageBase64 is required" }); return; }
    if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) { res.status(413).json({ error: "Photo is too large (max ~10MB)." }); return; }

    const maxItems = Number(process.env.BULK_MAX_BATCH_ITEMS) > 0 ? Number(process.env.BULK_MAX_BATCH_ITEMS) : 1000;
    const { count } = await db.from("bulk_image_items").select("id", { count: "exact", head: true }).eq("batch_id", batch.id);
    if ((count ?? 0) >= maxItems) {
      res.status(409).json({ error: `A batch holds at most ${maxItems} photos — start a new batch.` });
      return;
    }

    const raw = Buffer.from(imageBase64, "base64");
    // The client hashes the file as picked (before its own resizing), so
    // dropping the same files again after an interruption is recognised.
    const sha = typeof sourceSha256 === "string" && /^[0-9a-f]{64}$/.test(sourceSha256)
      ? sourceSha256
      : createHash("sha256").update(raw).digest("hex");
    const { data: dupe } = await db.from("bulk_image_items")
      .select("id, status").eq("batch_id", batch.id).eq("original_sha256", sha).maybeSingle();
    if (dupe) { res.json({ item: dupe, duplicate: true }); return; }

    // Normalise: honour EXIF orientation, strip metadata (incl. GPS), cap size, JPEG.
    let normalised: { data: Buffer; info: { width: number; height: number } };
    try {
      normalised = await sharp(raw).rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    } catch {
      res.status(400).json({ error: "That file isn't a readable image (JPEG, PNG or WebP)." });
      return;
    }

    const id = randomUUID();
    const originalPath = `${batch.id}/${id}/original.jpg`;
    const { error: upErr } = await db.storage.from(BUCKET)
      .upload(originalPath, normalised.data, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error(`Could not store photo: ${upErr.message}`);

    const { data: item, error } = await db.from("bulk_image_items").insert({
      id,
      batch_id: batch.id,
      created_by: req.adminId,
      original_filename: typeof filename === "string" ? filename.slice(0, 255) : null,
      original_path: originalPath,
      original_sha256: sha,
      width: normalised.info.width,
      height: normalised.info.height,
    }).select("id, status").single();
    if (error) {
      await db.storage.from(BUCKET).remove([originalPath]);
      // Two uploads of the same photo at once: the unique index catches the second.
      if (/duplicate key|unique/i.test(error.message)) { res.json({ duplicate: true }); return; }
      throw new Error(error.message);
    }
    void kick(batch.id, ["match"]).catch((e) => console.error("[bulk-images] kick failed:", e));
    res.status(201).json({ item });
  } catch (err) { fail(res, err); }
});

router.post("/admin/bulk-images/batches/:id/sets", guard, async (req, res) => {
  try {
    const db = getServiceClient();
    const batch = await loadBatch(String(req.params.id));
    if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
    let sets: string[];
    try { sets = cleanSetList((req.body ?? {}).sets); } catch (e) {
      if (e instanceof SetInputError) { res.status(400).json({ error: e.message }); return; }
      throw e;
    }
    const stats = readStats((batch as { stats?: unknown }).stats);
    const before = stats.setHints ?? [];
    const changed = sets.join("\n").toLowerCase() !== before.join("\n").toLowerCase();
    // A change re-matches the batch's undecided photos (AI calls): at most once a minute.
    if (changed && stats.setsChangedAt && Date.now() - Date.parse(stats.setsChangedAt) < SETS_COOLDOWN_MS) {
      res.status(429).json({ error: "The sets were changed less than a minute ago. Wait a moment before changing them again." });
      return;
    }
    if (!changed) { res.json({ sets: before, rematching: 0 }); return; }
    await updateBatchStats(db, batch.id, () => ({ setHints: sets, setsChangedAt: new Date().toISOString() }));
    // Photos not decided yet are matched again with the new sets first.
    const rematching = changed && (req.body ?? {}).rematch !== false ? await rematchUndecided(db, batch.id) : 0;
    if (rematching > 0) void kick(batch.id, ["match"]).catch(() => {});
    res.json({ sets, rematching });
  } catch (err) { fail(res, err); }
});

router.post("/admin/bulk-images/batches/:id/accuracy", guard, async (req, res) => {
  try {
    const db = getServiceClient();
    const batch = await loadBatch(String(req.params.id));
    if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
    if (!isAiConfigured()) { res.status(503).json({ error: "Pin recognition (OpenAI) isn't configured on this server." }); return; }
    const { count, error } = await db.from("bulk_image_items").select("id", { count: "exact", head: true })
      .eq("batch_id", batch.id).in("status", [...ANSWERED_STATUSES]);
    if (error) throw new Error(error.message);
    if (!count) { res.status(400).json({ error: "Confirm some photos first: the check compares matching with your answers." }); return; }
    const last = readStats((batch as { stats?: unknown }).stats).accuracy?.at ?? null;
    const started = startBatchAccuracyCheck(batch.id, { db, match: pipelineDeps().match }, last);
    if (started === "running_here") { res.status(202).json({ started: false, running: true }); return; }
    if (started === "running_elsewhere") {
      res.status(409).json({ error: "Another batch's accuracy check is running. Try again when it has finished." });
      return;
    }
    if (started === "cooldown") {
      res.status(429).json({ error: `This batch was checked less than ${ACCURACY_COOLDOWN_MS / 60_000} minutes ago. Try again a little later.` });
      return;
    }
    res.status(202).json({ started: true, checking: Math.min(count, MAX_CHECKED) });
  } catch (err) { fail(res, err); }
});

router.post("/admin/bulk-images/batches/:id/process", guard, async (req, res) => {
  try {
    const batch = await loadBatch(String(req.params.id));
    if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
    await kick(batch.id);
    res.json({ running: isRunning(batch.id), services: { matching: isAiConfigured(), pixian: pixianConfigured() } });
  } catch (err) { fail(res, err); }
});

/** Where a failed item goes back to, so only that stage runs again. */
export const RETRY_TO: Record<string, string> = { match: "uploaded", clean: "confirmed", publish: "cleaned" };

router.post("/admin/bulk-images/batches/:id/retry-failed", guard, async (req, res) => {
  try {
    const db = getServiceClient();
    const batch = await loadBatch(String(req.params.id));
    if (!batch) { res.status(404).json({ error: "Batch not found" }); return; }
    let retried = 0;
    for (const [stage, to] of Object.entries(RETRY_TO)) {
      const { data, error } = await db.from("bulk_image_items")
        .update({ status: to, failed_stage: null, error: null })
        .eq("batch_id", batch.id).eq("status", "failed").eq("failed_stage", stage).select("id");
      if (error) throw new Error(error.message);
      retried += data?.length ?? 0;
    }
    await kick(batch.id);
    res.json({ retried });
  } catch (err) { fail(res, err); }
});

// ── Items ────────────────────────────────────────────────────────────────────

async function loadItem(id: string) {
  const { data, error } = await getServiceClient().from("bulk_image_items").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as null | (Record<string, unknown> & {
    id: string; batch_id: string; status: string; failed_stage: string | null;
    original_path: string; cleaned_path: string | null; cleaned_sha256: string | null;
    matched_pinhunt_id: string | null; candidates: Array<{ pinhuntId: string }>;
  });
}

router.get("/admin/bulk-images/items/:id", guard, async (req, res) => {
  try {
    const db = getServiceClient();
    const item = await loadItem(String(req.params.id));
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    const urls = await signed(db, [item.original_path, item.cleaned_path ?? ""]);
    const ids = [...new Set([...(item.candidates ?? []).map((c) => c.pinhuntId), item.matched_pinhunt_id].filter(Boolean))] as string[];
    const refs = await pinAndPopRefs(ids).catch(() => ({} as Awaited<ReturnType<typeof pinAndPopRefs>>));
    let matchedPin: CataloguePin | null = null;
    if (item.matched_pinhunt_id) matchedPin = await getPinRepo().getPinByPinhuntId(item.matched_pinhunt_id).catch(() => null);
    const { original_path, cleaned_path, ...rest } = item;
    res.json({
      item: {
        ...rest,
        originalUrl: urls.get(original_path) ?? null,
        cleanedUrl: cleaned_path ? urls.get(cleaned_path) ?? null : null,
      },
      // Admin-only reference imagery (never shown to collectors).
      pinAndPop: refs,
      matchedPin: matchedPin && {
        pinhuntId: matchedPin.id, title: matchedPin.title, collection: matchedPin.collection,
        imageUrl: matchedPin.imageUrl ?? null,
      },
    });
  } catch (err) { fail(res, err); }
});

const REVIEWABLE = ["suggested", "unmatched", "flagged", "skipped", "cleaned", "confirmed", "failed"];

router.post("/admin/bulk-images/items/:id/confirm", guard, async (req: AdminRequest, res) => {
  try {
    const db = getServiceClient();
    const item = await loadItem(String(req.params.id));
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    if (!REVIEWABLE.includes(item.status)) {
      res.status(409).json({ error: `This photo is ${item.status} and can't be confirmed right now.` });
      return;
    }
    const { pinhuntId, method } = (req.body ?? {}) as { pinhuntId?: string; method?: string };
    if (!pinhuntId || typeof pinhuntId !== "string") { res.status(400).json({ error: "pinhuntId is required" }); return; }
    const pin = await getPinRepo().getPinByPinhuntId(pinhuntId);
    if (!pin) { res.status(404).json({ error: "We couldn't find that pin." }); return; }
    const inCandidates = (item.candidates ?? []).findIndex((c) => c.pinhuntId === pinhuntId);
    const matchMethod = method === "manual_search" || inCandidates === -1
      ? "manual_search"
      : inCandidates === 0 ? "suggested_top" : "suggested_alternative";
    // A cleaned result is kept: re-confirming goes straight back to "cleaned".
    const nextStatus = item.cleaned_path ? "cleaned" : "confirmed";
    const { error } = await db.from("bulk_image_items").update({
      status: nextStatus,
      failed_stage: null,
      error: null,
      matched_pinhunt_id: pinhuntId,
      match_method: matchMethod,
      confirmed_by: req.adminId,
      confirmed_at: new Date().toISOString(),
    }).eq("id", item.id).eq("status", item.status);
    if (error) throw new Error(error.message);
    if (nextStatus === "confirmed") void kick(item.batch_id, ["clean"]).catch(() => {});
    // Learn the batch's set from its confirmations: once two come from the
    // same set, the photos not decided yet are matched again with it first.
    const learnt = await learnBatchSet(db, item.batch_id, pin.collection, item.id).catch((err) => {
      console.warn("[bulk-images] couldn't learn the batch's set:", err instanceof Error ? err.message : err);
      return { learned: null, rematching: 0 };
    });
    if (learnt.rematching > 0) void kick(item.batch_id, ["match"]).catch(() => {});
    res.json({ status: nextStatus, matchMethod, set: learnt.learned, rematching: learnt.rematching });
  } catch (err) { fail(res, err); }
});

async function setReviewState(req: AdminRequest, res: Response, to: "skipped" | "flagged" | "reopen") {
  try {
    const item = await loadItem(String(req.params.id));
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    if (!REVIEWABLE.includes(item.status)) {
      res.status(409).json({ error: `This photo is ${item.status} right now.` });
      return;
    }
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 1000) : undefined;
    const status = to === "reopen" ? ((item.candidates ?? []).length > 0 ? "suggested" : "unmatched") : to;
    const { error } = await getServiceClient().from("bulk_image_items").update({
      status,
      failed_stage: null,
      error: null,
      ...(notes !== undefined ? { review_notes: notes } : {}),
    }).eq("id", item.id).eq("status", item.status);
    if (error) throw new Error(error.message);
    res.json({ status });
  } catch (err) { fail(res, err); }
}
router.post("/admin/bulk-images/items/:id/skip", guard, (req, res) => setReviewState(req, res, "skipped"));
router.post("/admin/bulk-images/items/:id/flag", guard, (req, res) => setReviewState(req, res, "flagged"));
router.post("/admin/bulk-images/items/:id/reopen", guard, (req, res) => setReviewState(req, res, "reopen"));

router.post("/admin/bulk-images/items/:id/reclean", guard, async (req, res) => {
  try {
    const item = await loadItem(String(req.params.id));
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    if (item.status !== "cleaned") { res.status(409).json({ error: "Only a cleaned photo can be cleaned again." }); return; }
    // Keep the old cleaned file for audit; the next clean writes a new path.
    const { error } = await getServiceClient().from("bulk_image_items")
      .update({ status: "confirmed", cleaned_path: null, cleaned_sha256: null })
      .eq("id", item.id).eq("status", "cleaned");
    if (error) throw new Error(error.message);
    void kick(item.batch_id, ["clean"]).catch(() => {});
    res.json({ status: "confirmed" });
  } catch (err) { fail(res, err); }
});

/**
 * Crop the photo to the pin (box drawn by the admin, as fractions of the
 * photo shown) and clean it again. For photos with neighbouring
 * pins in frame that Pixian can't separate. The upload itself is kept; the
 * crop becomes the photo that is cleaned and published.
 */
const CROPPABLE = ["suggested", "unmatched", "flagged", "skipped", "confirmed", "cleaned", "failed"];

router.post("/admin/bulk-images/items/:id/crop", guard, async (req, res) => {
  try {
    const db = getServiceClient();
    const item = await loadItem(String(req.params.id));
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    if (!CROPPABLE.includes(item.status) || (item.status === "failed" && item.failed_stage !== "clean")) {
      res.status(409).json({ error: `This photo is ${item.status} and can't be cropped now.` });
      return;
    }
    const box = parseBox(req.body?.box);
    if (!box) { res.status(400).json({ error: "Draw a box around the pin first." }); return; }
    const maxCalls = Number(process.env.BULK_PIXIAN_MAX_PER_ITEM) > 0 ? Number(process.env.BULK_PIXIAN_MAX_PER_ITEM) : 4;
    const pixianCalls = Number(item.pixian_calls ?? 0);
    if (pixianCalls >= maxCalls) {
      res.status(409).json({ error: `This photo has used its ${maxCalls} clean-ups. Crop it on your computer and upload it again.` });
      return;
    }

    // The box is drawn on the photo the admin sees: the current one (an
    // earlier crop, if any). The first upload stays in storage untouched.
    const cropped = await cropToBox(await download(db, item.original_path), box, 0);
    const croppedPath = `${item.batch_id}/${item.id}/cropped-${Date.now()}.jpg`;
    const { error: upErr } = await db.storage.from(BUCKET)
      .upload(croppedPath, cropped, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error(`Could not store the crop: ${upErr.message}`);

    // Matched photos go straight back to clean-up; unmatched ones keep their review state.
    const needsClean = ["confirmed", "cleaned", "failed"].includes(item.status) && !!item.matched_pinhunt_id;
    const { error } = await db.from("bulk_image_items").update({
      original_path: croppedPath,
      cleaned_path: null,
      cleaned_sha256: null,
      ...(needsClean ? { status: "confirmed", failed_stage: null, error: null } : {}),
    }).eq("id", item.id).eq("status", item.status);
    if (error) throw new Error(error.message);
    if (needsClean) void kick(item.batch_id, ["clean"]).catch(() => {});
    res.json({ status: needsClean ? "confirmed" : item.status });
  } catch (err) { fail(res, err); }
});

router.post("/admin/bulk-images/items/:id/retry", guard, async (req, res) => {
  try {
    const item = await loadItem(String(req.params.id));
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    if (item.status !== "failed" || !item.failed_stage) { res.status(409).json({ error: "Only a failed photo can be retried." }); return; }
    const to = RETRY_TO[item.failed_stage];
    const { error } = await getServiceClient().from("bulk_image_items")
      .update({ status: to, failed_stage: null, error: null }).eq("id", item.id).eq("status", "failed");
    if (error) throw new Error(error.message);
    if (to !== "cleaned") void kick(item.batch_id, [to === "uploaded" ? "match" : "clean"]).catch(() => {});
    res.json({ status: to });
  } catch (err) { fail(res, err); }
});

router.post("/admin/bulk-images/items/:id/publish", guard, async (req: AdminRequest, res) => {
  const db = getServiceClient();
  let itemId: string | null = null;
  try {
    const item = await loadItem(String(req.params.id));
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    itemId = item.id;
    if (item.status === "published") { res.json({ status: "published", publicUrl: item.published_image_url }); return; }
    const { data: batch } = await db.from("bulk_image_batches")
      .select("permission_public_display, permission_recorded_at").eq("id", item.batch_id).single();
    const result = await publishItem(
      item as Parameters<typeof publishItem>[0],
      batch as { permission_public_display: boolean; permission_recorded_at: string },
      req.adminId!,
      { replaceExisting: req.body?.replaceExisting === true },
      { db, pinRepo: getPinRepo() },
    );
    const { error } = await db.from("bulk_image_items").update({
      status: "published",
      failed_stage: null,
      error: null,
      published_pin_image_id: result.pinImageId,
      published_image_url: result.publicUrl,
      replaced_image_url: result.replacedImageUrl,
      published_by: req.adminId,
      published_at: new Date().toISOString(),
    }).eq("id", item.id);
    if (error) throw new Error(error.message);
    res.json({ status: "published", publicUrl: result.publicUrl, replacedImageUrl: result.replacedImageUrl });
  } catch (err) {
    if (err instanceof PublishBlockedError) {
      res.status(409).json({ error: err.message, code: err.code, existingImageUrl: err.existingImageUrl ?? null });
      return;
    }
    if (itemId) {
      await db.from("bulk_image_items").update({
        status: "failed", failed_stage: "publish", error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      }).eq("id", itemId).eq("status", "cleaned");
    }
    fail(res, err);
  }
});

// ── Manual search ────────────────────────────────────────────────────────────

/** Pins per page when browsing a set. */
export const BROWSE_PAGE = 30;
/** Look-alikes offered for one photo. */
export const LOOKALIKE_PICKS = 24;

function pickRow(p: CataloguePin) {
  return {
    pinhuntId: p.id, title: p.title, collection: p.collection, brand: p.brand,
    edition: p.edition ?? null, characters: p.characters.slice(0, 6), imageUrl: p.imageUrl ?? null,
  };
}

/**
 * Manual catalogue search. With `set`, browse that set (optionally narrowed
 * by `q`) a page at a time (`offset`), so a pin titled only by character can
 * be picked from its set's pictures.
 */
router.get("/admin/bulk-images/search", guard, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const set = typeof req.query.set === "string" && req.query.set.trim() ? req.query.set.trim().slice(0, 120) : null;
    const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 5_000));
    if (!set && q.length < 2) { res.json({ results: [], pinAndPop: {}, total: 0, more: false }); return; }
    const repo = getPinRepo();
    let pins: CataloguePin[];
    let total: number;
    if (!set && /^PHUK-\d{8}$/i.test(q)) {
      // An exact PinHunt id goes straight to that pin.
      pins = [await repo.getPinByPinhuntId(q.toUpperCase())].filter((p): p is CataloguePin => !!p);
      total = pins.length;
    } else if (set) {
      ({ pins, total } = await repo.searchPinsPage(q, { status: "active", collection: set, limit: BROWSE_PAGE, offset }));
    } else {
      pins = await repo.searchPins(q, { limit: 20 });
      total = pins.length;
    }
    const results = pins.map(pickRow);
    const pinAndPop = await pinAndPopRefs(results.map((r) => r.pinhuntId)).catch(() => ({}));
    res.json({ results, pinAndPop, total, more: !!set && offset + pins.length < total });
  } catch (err) { fail(res, err); }
});

/**
 * Starting points for correcting one photo: the batch's sets plus the sets
 * of its suggestions (to browse), and, when the picture index is on, the
 * catalogue pins that look most like the photo (one Vertex call ≈ $0.0001).
 */
router.get("/admin/bulk-images/items/:id/picks", guard, async (req, res) => {
  try {
    const item = await loadItem(String(req.params.id));
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    const db = getServiceClient();
    const sets: string[] = [];
    for (const s of [...(await batchSets(db, item.batch_id).catch(() => [])), ...((item.candidates ?? []) as Array<{ collection?: string }>).map((c) => c.collection ?? "")]) {
      const name = s.trim();
      if (name && !sets.some((x) => x.toLowerCase() === name.toLowerCase())) sets.push(name);
    }
    let lookalikes: ReturnType<typeof pickRow>[] = [];
    if (pictureIndexConfigured()) {
      try {
        const photo = await forMatching(await download(db, item.original_path));
        const ids = await lookalikePins(photo, LOOKALIKE_PICKS);
        const pins = await getPinRepo().getPinsByIds(ids);
        const rank = new Map(ids.map((id, n) => [id, n]));
        lookalikes = pins.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!).map(pickRow);
      } catch (err) {
        console.warn("[bulk-images] look-alikes unavailable:", err instanceof Error ? err.message : err);
      }
    }
    const pinAndPop = await pinAndPopRefs(lookalikes.map((r) => r.pinhuntId)).catch(() => ({}));
    res.json({ sets: sets.slice(0, 6), lookalikes, pinAndPop, pictureIndex: pictureIndexConfigured() });
  } catch (err) { fail(res, err); }
});

export default router;
