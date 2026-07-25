/**
 * Catalogue Import Routes
 *
 * POST /api/admin/catalogue-import/preview   — parse xlsx, return headers + first 20 rows
 * POST /api/admin/catalogue-import           — dry-run or real import
 * GET  /api/admin/catalogue-import/batches   — list recent import batches
 * POST /api/admin/catalogue-import/batches/:batchId/rollback — undo a batch
 *
 * Security: all endpoints require a valid Supabase JWT belonging to an admin
 * profile. The service-role key is used server-side only and never exposed to
 * the client.
 */
import { Router, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import crypto from "crypto";

const router = Router();

// ─── Supabase clients ─────────────────────────────────────────────────────────

function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

function getAnonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

async function requireAdmin(req: Request & { adminUserId?: string }, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  const token = auth.slice(7);
  try {
    const anonClient = getAnonClient();
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) { res.status(403).json({ error: "Admin access required" }); return; }
    req.adminUserId = user.id;
    next();
  } catch (e) {
    res.status(500).json({ error: "Auth check failed" });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clean(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function splitSemicolon(v: unknown): string[] {
  const s = clean(v);
  if (!s) return [];
  return s.split(/[;,]/).map(x => x.trim()).filter(Boolean);
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function toDecimal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  // Excel serial date
  if (typeof v === "number") {
    try {
      const d = XLSX.SSF.parse_date_code(v);
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    } catch { return null; }
  }
  const s = String(v).trim();
  if (!s) return null;
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isValidUrl(v: unknown): boolean {
  if (!v) return false;
  try { new URL(String(v)); return true; } catch { return false; }
}

function normaliseKey(brand: string, series: string, title: string, character: string, year: number | null): string {
  const parts = [brand, series, title, character, year ?? ""].map(p =>
    String(p).toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  return parts.join("|");
}

function classifyVerification(raw: string | null): {
  verificationStatus: string;
  isSeedRecord: boolean;
  needsReview: boolean;
  confidenceLevel: string;
} {
  const s = (raw ?? "").toLowerCase().trim();

  // Use exact / explicit token matching so "unverified" can never be promoted
  // to "verified" via a substring check.
  const VERIFIED_EXACT = new Set(["verified", "source verified", "official", "source_verified"]);
  if (VERIFIED_EXACT.has(s)) {
    return { verificationStatus: "verified", isSeedRecord: false, needsReview: false, confidenceLevel: "verified" };
  }
  if (s.includes("community")) {
    return { verificationStatus: "community_submitted", isSeedRecord: false, needsReview: false, confidenceLevel: "high" };
  }
  // "unverified", "ai expanded", "speculative", "low" → unverified seed
  if (s === "unverified" || s.includes("ai") || s.includes("speculative") || s === "low") {
    return { verificationStatus: "unverified", isSeedRecord: true, needsReview: true, confidenceLevel: "low" };
  }
  // "needs source verification", "medium", blank, or anything else → seed needing review
  return { verificationStatus: "needs_source_verification", isSeedRecord: true, needsReview: true, confidenceLevel: "medium" };
}

// ─── Column mapping ───────────────────────────────────────────────────────────

// Maps exact spreadsheet header → canonical key
const HEADER_MAP: Record<string, string> = {
  "pinhunt_id":         "pinhunt_id",
  "pin name":           "title",
  "pin_name":           "title",
  "name":               "title",
  "brand":              "brand",
  "series":             "collection",
  "series / collection":"collection",
  "collection":         "collection",
  "characters":         "characters",
  "character(s)":       "characters",
  "character":          "characters",
  "release year":       "release_year",
  "release_year":       "release_year",
  "year":               "release_year",
  "edition size":       "limited_edition_size",
  "edition_size":       "limited_edition_size",
  "external_ids":       "external_ids",
  "external ids":       "external_ids",
  "categories":         "categories",
  "category":           "categories",
  "release date":       "release_date",
  "release_date":       "release_date",
  "park / retailer":    "retailer",
  "park/retailer":      "retailer",
  "retailer":           "retailer",
  "park":               "retailer",
  "edition type":       "edition_type",
  "edition_type":       "edition_type",
  "original price":     "retail_price",
  "original_price":     "retail_price",
  "price":              "retail_price",
  "currency":           "currency",
  "front image url":    "image_url",
  "front image":        "image_url",
  "front_image_url":    "image_url",
  "back image url":     "back_image_url",
  "back image":         "back_image_url",
  "back_image_url":     "back_image_url",
  "source url":         "source_url",
  "source_url":         "source_url",
  "verification status":"verification_status",
  "verification_status":"verification_status",
  "notes":              "notes",
  "manufacturer":       "manufacturer",
};

interface MappedRow {
  pinhuntId: string;
  title: string;
  brand: string;
  collection: string;
  characters: string[];
  categories: string[];
  releaseYear: number | null;
  releaseDate: string | null;
  limitedEditionSize: number | null;
  editionType: string | null;
  retailer: string | null;
  retailPrice: number | null;
  currency: string;
  imageUrl: string | null;
  backImageUrl: string | null;
  sourceUrl: string | null;
  verificationStatusRaw: string | null;
  manufacturer: string | null;
  externalIds: Record<string, unknown>;
  notes: string | null;
  // derived
  verificationStatus: string;
  isSeedRecord: boolean;
  needsReview: boolean;
  confidenceLevel: string;
  needsFrontImage: boolean;
  needsBackImage: boolean;
  fallbackKey: string;
}

interface RowError {
  rowNum: number;
  pinhuntId: string | null;
  title: string | null;
  result: "error" | "warning";
  message: string;
}

function mapRow(
  rawRow: Record<string, unknown>,
  rowNum: number,
  seenKeys: Set<string>,
): { row: MappedRow; errors: RowError[] } | { row: null; errors: RowError[] } {
  const errors: RowError[] = [];

  const pinhuntId = clean(rawRow["pinhunt_id"]);
  const title = clean(rawRow["title"]);
  const brand = clean(rawRow["brand"]) ?? "Unknown";
  const collection = clean(rawRow["collection"]) ?? "";

  if (!title) {
    errors.push({ rowNum, pinhuntId, title, result: "error", message: "Pin name is required" });
    return { row: null, errors };
  }

  if (pinhuntId && !/^PHUK-\d+$/i.test(pinhuntId)) {
    errors.push({ rowNum, pinhuntId, title, result: "warning", message: `PinHunt ID format unexpected: ${pinhuntId}` });
  }

  const releaseYear = toInt(rawRow["release_year"]);
  if (releaseYear !== null && (releaseYear < 1900 || releaseYear > 2030)) {
    errors.push({ rowNum, pinhuntId, title, result: "warning", message: `Unusual release year: ${releaseYear}` });
  }

  const limitedEditionSize = toInt(rawRow["limited_edition_size"]);
  const releaseDate = toDate(rawRow["release_date"]);
  const editionType = clean(rawRow["edition_type"]);
  const retailer = clean(rawRow["retailer"]);
  const retailPrice = toDecimal(rawRow["retail_price"]);
  const currency = clean(rawRow["currency"]) ?? "GBP";
  const imageUrl = clean(rawRow["image_url"]);
  const backImageUrl = clean(rawRow["back_image_url"]);
  const sourceUrl = clean(rawRow["source_url"]);
  const manufacturer = clean(rawRow["manufacturer"]);
  const notes = clean(rawRow["notes"]);
  const characters = splitSemicolon(rawRow["characters"]);
  const categories = splitSemicolon(rawRow["categories"]);

  if (imageUrl && !isValidUrl(imageUrl)) {
    errors.push({ rowNum, pinhuntId, title, result: "warning", message: "Front image URL invalid" });
  }
  if (backImageUrl && !isValidUrl(backImageUrl)) {
    errors.push({ rowNum, pinhuntId, title, result: "warning", message: "Back image URL invalid" });
  }

  // External IDs — try to parse as JSON
  let externalIds: Record<string, unknown> = {};
  const rawExtIds = rawRow["external_ids"];
  if (rawExtIds) {
    try { externalIds = typeof rawExtIds === "object" ? (rawExtIds as Record<string, unknown>) : JSON.parse(String(rawExtIds)); }
    catch { externalIds = { raw: String(rawExtIds) }; }
  }

  const verificationStatusRaw = clean(rawRow["verification_status"]);
  const classified = classifyVerification(verificationStatusRaw);

  // Duplicate detection (within this batch)
  const fallbackKey = normaliseKey(brand, collection, title, characters[0] ?? "", releaseYear);
  if (!pinhuntId && seenKeys.has(fallbackKey)) {
    errors.push({ rowNum, pinhuntId, title, result: "warning", message: "Possible duplicate row (no pinhunt_id, same brand/series/title/character/year)" });
  }
  if (!pinhuntId) seenKeys.add(fallbackKey);

  const row: MappedRow = {
    pinhuntId: pinhuntId ?? `PHUK-NOID-${rowNum}`,
    title, brand, collection, characters, categories,
    releaseYear, releaseDate, limitedEditionSize, editionType,
    retailer, retailPrice, currency,
    imageUrl, backImageUrl, sourceUrl, manufacturer, externalIds, notes,
    verificationStatusRaw,
    ...classified,
    needsFrontImage: !imageUrl,
    needsBackImage: !backImageUrl,
    fallbackKey,
  };

  return { row, errors };
}

// ─── Parse xlsx ───────────────────────────────────────────────────────────────

function parseWorkbook(buffer: Buffer, sheetName?: string): {
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  canonicalHeaders: string[];
  rawRows: Record<string, unknown>[];
  totalRows: number;
} {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetNames = wb.SheetNames;
  const selected = sheetName ?? sheetNames.find(s => s.toLowerCase().includes("master")) ?? sheetNames[0];
  const ws = wb.Sheets[selected];
  if (!ws) throw new Error(`Sheet "${selected}" not found`);

  const jsonRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
  if (jsonRows.length < 2) throw new Error("Workbook has no data rows");

  const rawHeaders = (jsonRows[0] as unknown[]).map(h => String(h ?? "").trim());
  const canonicalHeaders = rawHeaders.map(h => HEADER_MAP[h.toLowerCase()] ?? h.toLowerCase().replace(/\s+/g, "_"));

  const dataRows: Record<string, unknown>[] = [];
  for (let i = 1; i < jsonRows.length; i++) {
    const cols = jsonRows[i] as unknown[];
    const obj: Record<string, unknown> = {};
    canonicalHeaders.forEach((key, idx) => { obj[key] = cols[idx] ?? null; });
    dataRows.push(obj);
  }

  return { sheetNames, selectedSheet: selected, headers: rawHeaders, canonicalHeaders, rawRows: dataRows, totalRows: dataRows.length };
}

// ─── Preview endpoint ─────────────────────────────────────────────────────────

router.post("/admin/catalogue-import/preview", requireAdmin, async (req: Request & { adminUserId?: string }, res: Response) => {
  try {
    const { fileBase64, filename = "upload.xlsx", sheetName } = req.body as { fileBase64: string; filename?: string; sheetName?: string };
    if (!fileBase64) { res.status(400).json({ error: "fileBase64 is required" }); return; }

    const buffer = Buffer.from(fileBase64, "base64");
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

    const { sheetNames, selectedSheet, headers, canonicalHeaders, rawRows, totalRows } = parseWorkbook(buffer, sheetName);
    const previewRows = rawRows.slice(0, 20);

    const columnMapping = headers.map((h, i) => ({
      spreadsheetHeader: h,
      databaseField: HEADER_MAP[h.toLowerCase()] ?? "(unmapped)",
    }));

    res.json({ filename, fileHash, sheetNames, selectedSheet, headers, canonicalHeaders, previewRows, totalRows, columnMapping });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Parse failed" });
  }
});

// ─── Import endpoint ──────────────────────────────────────────────────────────

router.post("/admin/catalogue-import", requireAdmin, async (req: Request & { adminUserId?: string }, res: Response) => {
  const {
    fileBase64, filename = "upload.xlsx", sheetName,
    dryRun = false, force = false,
  } = req.body as { fileBase64: string; filename?: string; sheetName?: string; dryRun?: boolean; force?: boolean };

  if (!fileBase64) { res.status(400).json({ error: "fileBase64 is required" }); return; }

  const db = getAdminClient();
  const buffer = Buffer.from(fileBase64, "base64");
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

  // Duplicate file check
  if (!force) {
    const { data: existing } = await db
      .from("import_batches")
      .select("id, filename, completed_at, status")
      .eq("file_hash", fileHash)
      .eq("status", "completed")
      .maybeSingle();
    if (existing) {
      res.status(409).json({
        error: "duplicate_file",
        message: `This exact file was already imported (batch ${existing.id}). Pass force=true to re-import.`,
        existingBatchId: existing.id,
      });
      return;
    }
  }

  let { rawRows, totalRows } = parseWorkbook(buffer, sheetName);

  // Map + validate all rows
  const seenKeys = new Set<string>();
  const validRows: MappedRow[] = [];
  const allErrors: RowError[] = [];

  rawRows.forEach((raw, i) => {
    const result = mapRow(raw, i + 2, seenKeys); // +2 = 1-indexed + header row
    if (result.row) validRows.push(result.row);
    allErrors.push(...result.errors);
  });

  const errorRows = allErrors.filter(e => e.result === "error");

  const summary = {
    totalRows,
    validRows: validRows.length,
    errorRows: errorRows.length,
    warningRows: allErrors.filter(e => e.result === "warning").length,
    seedRows: validRows.filter(r => r.isSeedRecord).length,
    verifiedRows: validRows.filter(r => !r.isSeedRecord).length,
    missingFrontImage: validRows.filter(r => r.needsFrontImage).length,
    missingBackImage: validRows.filter(r => r.needsBackImage).length,
    insertedRows: 0,
    updatedRows: 0,
    skippedRows: 0,
  };

  if (dryRun) {
    // Rows without a real pinhunt_id are skipped by the real import — be consistent here
    const actionableRows = validRows.filter(r => !r.pinhuntId.startsWith("PHUK-NOID-"));
    const skippedNoid = validRows.length - actionableRows.length;

    const pinhuntIds = actionableRows.map(r => r.pinhuntId);
    const { data: existing } = await db.from("pins").select("pinhunt_id").in("pinhunt_id", pinhuntIds);
    const existingSet = new Set((existing ?? []).map((r: { pinhunt_id: string }) => r.pinhunt_id));
    summary.insertedRows = actionableRows.filter(r => !existingSet.has(r.pinhuntId)).length;
    summary.updatedRows  = actionableRows.filter(r =>  existingSet.has(r.pinhuntId)).length;
    summary.skippedRows  = skippedNoid;

    res.json({ dryRun: true, summary, errorReport: allErrors.slice(0, 200) });
    return;
  }

  // ── Real import ──

  // Create batch record
  const { data: batch, error: batchErr } = await db
    .from("import_batches")
    .insert({
      filename, file_hash: fileHash, status: "running",
      total_rows: totalRows, imported_by: req.adminUserId,
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    res.status(500).json({ error: "Failed to create import batch: " + (batchErr?.message ?? "unknown") });
    return;
  }

  const batchId: string = batch.id;
  let insertedRows = 0, updatedRows = 0, skippedRows = 0;
  const rowSnapshots: Record<string, unknown> = {};

  // Fetch existing pins (all fields we will overwrite + junction memberships for rollback snapshots)
  const allPinhuntIds = validRows.map(r => r.pinhuntId).filter(id => !id.startsWith("PHUK-NOID-"));
  const { data: existingPins } = await db
    .from("pins")
    .select([
      "id", "pinhunt_id", "title", "brand", "collection",
      "release_year", "release_date", "limited_edition_size", "edition_type",
      "retailer", "retail_price", "currency", "image_url", "back_image_url",
      "source_url", "manufacturer", "external_identifiers",
      "verification_status", "is_seed_record", "needs_review",
      "confidence_level", "needs_front_image", "needs_back_image",
      "import_batch_id", "catalogue_source", "catalogue_updated_at",
      "pin_categories(categories(name))",
      "pin_characters(characters(name))",
    ].join(", "))
    .in("pinhunt_id", allPinhuntIds);

  // Cast required: Supabase TS inference mis-resolves the complex select (PostgREST embed syntax)
  const existingMap = new Map(
    ((existingPins ?? []) as unknown as Record<string, unknown>[])
      .map(p => [p.pinhunt_id as string, p]),
  );

  // Collect unique categories + characters for bulk upsert
  const allCategoryNames = new Set<string>();
  const allCharacterNames = new Set<string>();
  validRows.forEach(r => {
    r.categories.forEach(c => allCategoryNames.add(c));
    r.characters.forEach(c => allCharacterNames.add(c));
  });

  // Upsert categories
  if (allCategoryNames.size > 0) {
    await db.from("categories").upsert(
      [...allCategoryNames].map(name => ({ name })),
      { onConflict: "name", ignoreDuplicates: true },
    );
  }

  // Upsert characters
  if (allCharacterNames.size > 0) {
    await db.from("characters").upsert(
      [...allCharacterNames].map(name => ({ name })),
      { onConflict: "name", ignoreDuplicates: true },
    );
  }

  // Fetch IDs for all categories + characters
  const { data: catRows } = await db.from("categories").select("id, name").in("name", [...allCategoryNames]);
  const { data: charRows } = await db.from("characters").select("id, name").in("name", [...allCharacterNames]);
  const catMap = new Map((catRows ?? []).map((r: Record<string, unknown>) => [r.name as string, r.id as string]));
  const charMap = new Map((charRows ?? []).map((r: Record<string, unknown>) => [r.name as string, r.id as string]));

  // Process in batches of 500
  const BATCH_SIZE = 500;
  for (let batchStart = 0; batchStart < validRows.length; batchStart += BATCH_SIZE) {
    const chunk = validRows.slice(batchStart, batchStart + BATCH_SIZE);

    const pinUpserts = chunk
      .filter(r => !r.pinhuntId.startsWith("PHUK-NOID-"))
      .map(r => {
        const existing = existingMap.get(r.pinhuntId);
        if (existing) {
          // Full snapshot of every field we overwrite + junction memberships (for lossless rollback)
          rowSnapshots[r.pinhuntId] = {
            existed: true,
            title: existing.title, brand: existing.brand, collection: existing.collection,
            release_year: existing.release_year, release_date: existing.release_date,
            limited_edition_size: existing.limited_edition_size, edition_type: existing.edition_type,
            retailer: existing.retailer, retail_price: existing.retail_price, currency: existing.currency,
            image_url: existing.image_url, back_image_url: existing.back_image_url,
            source_url: existing.source_url, manufacturer: existing.manufacturer,
            external_identifiers: existing.external_identifiers,
            verification_status: existing.verification_status,
            is_seed_record: existing.is_seed_record, needs_review: existing.needs_review,
            confidence_level: existing.confidence_level,
            needs_front_image: existing.needs_front_image, needs_back_image: existing.needs_back_image,
            import_batch_id: existing.import_batch_id, catalogue_source: existing.catalogue_source,
            catalogue_updated_at: existing.catalogue_updated_at,
            // Junction memberships so rollback can restore associations exactly
            categories: (existing.pin_categories as Array<{ categories: { name: string } }> | null)
              ?.map(pc => pc.categories.name) ?? [],
            characters: (existing.pin_characters as Array<{ characters: { name: string } }> | null)
              ?.map(pc => pc.characters.name) ?? [],
          };
          updatedRows++;

          // Never downgrade a verified record to seed
          const targetVerStatus = existing.verification_status === "verified" ? "verified" : r.verificationStatus;
          const targetSeed = existing.verification_status === "verified" ? false : r.isSeedRecord;
          const targetReview = existing.verification_status === "verified" ? false : r.needsReview;

          return {
            pinhunt_id: r.pinhuntId,
            title: r.title, brand: r.brand, collection: r.collection,
            release_year: r.releaseYear, release_date: r.releaseDate,
            limited_edition_size: r.limitedEditionSize,
            edition_type: r.editionType, retailer: r.retailer,
            retail_price: r.retailPrice, currency: r.currency,
            // Never overwrite existing user-contributed images with blank
            image_url: r.imageUrl ?? existing.image_url,
            back_image_url: r.backImageUrl ?? existing.back_image_url,
            source_url: r.sourceUrl, manufacturer: r.manufacturer,
            external_identifiers: Object.keys(r.externalIds).length ? r.externalIds : {},
            verification_status: targetVerStatus,
            is_seed_record: targetSeed, needs_review: targetReview,
            confidence_level: r.confidenceLevel,
            needs_front_image: r.needsFrontImage, needs_back_image: r.needsBackImage,
            import_batch_id: batchId, catalogue_source: "pinhunt_import",
            catalogue_updated_at: new Date().toISOString(),
          };
        } else {
          rowSnapshots[r.pinhuntId] = { existed: false };
          insertedRows++;
          return {
            pinhunt_id: r.pinhuntId,
            title: r.title, brand: r.brand, collection: r.collection,
            release_year: r.releaseYear, release_date: r.releaseDate,
            limited_edition_size: r.limitedEditionSize,
            edition_type: r.editionType, retailer: r.retailer,
            retail_price: r.retailPrice, currency: r.currency,
            image_url: r.imageUrl, back_image_url: r.backImageUrl,
            source_url: r.sourceUrl, manufacturer: r.manufacturer,
            external_identifiers: Object.keys(r.externalIds).length ? r.externalIds : {},
            verification_status: r.verificationStatus,
            is_seed_record: r.isSeedRecord, needs_review: r.needsReview,
            confidence_level: r.confidenceLevel,
            needs_front_image: r.needsFrontImage, needs_back_image: r.needsBackImage,
            import_batch_id: batchId, catalogue_source: "pinhunt_import",
          };
        }
      });

    if (pinUpserts.length === 0) { skippedRows += chunk.length; continue; }

    const { data: upserted, error: upsertErr } = await db
      .from("pins")
      .upsert(pinUpserts, { onConflict: "pinhunt_id" })
      .select("id, pinhunt_id");

    if (upsertErr) {
      allErrors.push({ rowNum: batchStart, pinhuntId: null, title: null, result: "error", message: "Batch upsert failed: " + upsertErr.message });
      continue;
    }

    // Update pin_categories and pin_characters for this chunk
    const upsertedMap = new Map((upserted ?? []).map((p: Record<string, unknown>) => [p.pinhunt_id as string, p.id as string]));

    const pinIds = [...upsertedMap.values()];
    if (pinIds.length > 0) {
      // Clear existing junction rows for these pins
      await Promise.all([
        db.from("pin_categories").delete().in("pin_id", pinIds),
        db.from("pin_characters").delete().in("pin_id", pinIds),
      ]);

      const categoryJunctions: Array<{ pin_id: string; category_id: string }> = [];
      const characterJunctions: Array<{ pin_id: string; character_id: string }> = [];

      chunk.forEach(r => {
        const pinId = upsertedMap.get(r.pinhuntId);
        if (!pinId) return;
        r.categories.forEach(cat => {
          const catId = catMap.get(cat);
          if (catId) categoryJunctions.push({ pin_id: pinId, category_id: catId });
        });
        r.characters.forEach(char => {
          const charId = charMap.get(char);
          if (charId) characterJunctions.push({ pin_id: pinId, character_id: charId });
        });
      });

      if (categoryJunctions.length > 0) {
        await db.from("pin_categories").upsert(categoryJunctions, { onConflict: "pin_id,category_id", ignoreDuplicates: true });
      }
      if (characterJunctions.length > 0) {
        await db.from("pin_characters").upsert(characterJunctions, { onConflict: "pin_id,character_id", ignoreDuplicates: true });
      }
    }
  }

  // Finalize batch record
  const errorReport = allErrors.slice(0, 1000);
  await db.from("import_batches").update({
    status: "completed",
    inserted_rows: insertedRows, updated_rows: updatedRows,
    skipped_rows: skippedRows, error_rows: errorRows.length,
    seed_rows: summary.seedRows, verified_rows: summary.verifiedRows,
    error_report: errorReport, row_snapshots: rowSnapshots,
    completed_at: new Date().toISOString(),
  }).eq("id", batchId);

  res.json({
    dryRun: false,
    batchId,
    summary: { ...summary, insertedRows, updatedRows, skippedRows },
    errorReport: errorReport.slice(0, 200),
  });
});

// ─── List batches ─────────────────────────────────────────────────────────────

router.get("/admin/catalogue-import/batches", requireAdmin, async (_req, res: Response) => {
  const db = getAdminClient();
  const { data, error } = await db
    .from("import_batches")
    .select("id, filename, status, total_rows, inserted_rows, updated_rows, skipped_rows, error_rows, seed_rows, verified_rows, imported_by, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ batches: data ?? [] });
});

// ─── Rollback ─────────────────────────────────────────────────────────────────

router.post("/admin/catalogue-import/batches/:batchId/rollback", requireAdmin, async (req: Request & { adminUserId?: string }, res: Response) => {
  const { batchId } = req.params;
  const db = getAdminClient();

  const { data: batch, error: batchErr } = await db
    .from("import_batches")
    .select("status, row_snapshots")
    .eq("id", batchId)
    .single();

  if (batchErr || !batch) { res.status(404).json({ error: "Batch not found" }); return; }
  if (batch.status === "rolled_back") { res.status(409).json({ error: "Already rolled back" }); return; }
  if (batch.status !== "completed") { res.status(409).json({ error: "Batch is not completed" }); return; }

  const snapshots = (batch.row_snapshots as Record<string, { existed: boolean; [k: string]: unknown }>) ?? {};
  const insertedIds = Object.entries(snapshots).filter(([, s]) => !s.existed).map(([pinhuntId]) => pinhuntId);
  const updatedIds = Object.entries(snapshots).filter(([, s]) => s.existed).map(([pinhuntId]) => pinhuntId);

  let rolledBack = 0, skipped = 0;

  // Delete newly inserted pins that have no user activity
  if (insertedIds.length > 0) {
    const { data: pinRows } = await db.from("pins").select("id, pinhunt_id").in("pinhunt_id", insertedIds);
    const pinIdMap = new Map((pinRows ?? []).map((p: Record<string, unknown>) => [p.pinhunt_id as string, p.id as string]));
    const pinUuids = [...pinIdMap.values()];

    if (pinUuids.length > 0) {
      // Fetch ALL user_pins rows for the affected pins — no limit so every referenced pin is protected
      const { data: userRefs } = await db.from("user_pins").select("pin_id").in("pin_id", pinUuids);
      const referencedPinIds = new Set((userRefs ?? []).map((r: Record<string, unknown>) => r.pin_id as string));

      const deletable = pinUuids.filter(id => !referencedPinIds.has(id));
      const skippable = pinUuids.filter(id => referencedPinIds.has(id));

      if (deletable.length > 0) {
        await db.from("pins").delete().in("id", deletable);
        rolledBack += deletable.length;
      }
      if (skippable.length > 0) {
        // Mark as needing review instead of deleting
        await db.from("pins").update({ needs_review: true }).in("id", skippable);
        skipped += skippable.length;
      }
    }
  }

  // Restore ALL pre-import field values and junction memberships for updated pins
  for (const [pinhuntId, snap] of Object.entries(snapshots)) {
    if (!snap.existed) continue;

    // Restore every field the import overwrote
    await db.from("pins").update({
      title: snap.title, brand: snap.brand, collection: snap.collection,
      release_year: snap.release_year, release_date: snap.release_date,
      limited_edition_size: snap.limited_edition_size, edition_type: snap.edition_type,
      retailer: snap.retailer, retail_price: snap.retail_price, currency: snap.currency,
      image_url: snap.image_url, back_image_url: snap.back_image_url,
      source_url: snap.source_url, manufacturer: snap.manufacturer,
      external_identifiers: snap.external_identifiers,
      verification_status: snap.verification_status,
      is_seed_record: snap.is_seed_record, needs_review: snap.needs_review,
      confidence_level: snap.confidence_level,
      needs_front_image: snap.needs_front_image, needs_back_image: snap.needs_back_image,
      import_batch_id: snap.import_batch_id ?? null,
      catalogue_source: snap.catalogue_source ?? null,
      catalogue_updated_at: snap.catalogue_updated_at ?? null,
    }).eq("pinhunt_id", pinhuntId);

    // Restore junction table memberships exactly
    const { data: pinRow } = await db.from("pins").select("id").eq("pinhunt_id", pinhuntId).single();
    if (pinRow) {
      const pinId = pinRow.id as string;

      // Categories
      await db.from("pin_categories").delete().eq("pin_id", pinId);
      const prevCategories = (snap.categories as string[]) ?? [];
      if (prevCategories.length > 0) {
        const { data: catIds } = await db.from("categories").select("id, name").in("name", prevCategories);
        const catJunctions = (catIds ?? []).map((c: Record<string, unknown>) => ({ pin_id: pinId, category_id: c.id as string }));
        if (catJunctions.length > 0) await db.from("pin_categories").insert(catJunctions);
      }

      // Characters
      await db.from("pin_characters").delete().eq("pin_id", pinId);
      const prevCharacters = (snap.characters as string[]) ?? [];
      if (prevCharacters.length > 0) {
        const { data: charIds } = await db.from("characters").select("id, name").in("name", prevCharacters);
        const charJunctions = (charIds ?? []).map((c: Record<string, unknown>) => ({ pin_id: pinId, character_id: c.id as string }));
        if (charJunctions.length > 0) await db.from("pin_characters").insert(charJunctions);
      }
    }

    rolledBack++;
  }

  await db.from("import_batches").update({ status: "rolled_back" }).eq("id", batchId);

  res.json({ success: true, batchId, rolledBack, skippedDueToUserActivity: skipped });
});

export default router;
