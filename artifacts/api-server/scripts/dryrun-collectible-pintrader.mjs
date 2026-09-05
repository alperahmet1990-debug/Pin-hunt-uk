/**
 * Collectible PinTrader export — dry-run reconciliation (read-only).
 *
 * Compares a downloaded Collectible PinTrader JSON export against the
 * PinHunt Master Catalogue and produces a detailed match / enrichment /
 * conflict report. This script makes NO writes of any kind — no pins,
 * pin_external_ids, pin_sets, pin_images, or Storage objects are touched.
 * An --apply mode is a separate, later task.
 *
 * Matching precedence (never resolves an ambiguous case automatically):
 *   1. Exact pin_external_ids match, source='pinpics'
 *   2. Exact pin_external_ids match, source='pintradingdb'
 *   3. Strong normalised metadata match: name + release year, corroborated
 *      by origin/series/edition where available. Multiple candidates that
 *      can't be disambiguated are reported as ambiguous, never guessed.
 *
 * Usage:
 *   node --env-file=.env scripts/dryrun-collectible-pintrader.mjs <export-dir> [--report <dir>]
 *
 * <export-dir> is the folder containing the numbered subfolders (0001, 0002, ...)
 * of extracted JSON records — NOT the zip files.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read-only queries only).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [, , exportDirArg, ...flags] = process.argv;
if (!exportDirArg || !fs.existsSync(exportDirArg)) {
  console.error("Usage: node dryrun-collectible-pintrader.mjs <export-dir> [--report <dir>]");
  process.exit(1);
}
const reportFlagIdx = flags.indexOf("--report");
const reportDir = reportFlagIdx >= 0 ? flags[reportFlagIdx + 1] : exportDirArg;
fs.mkdirSync(reportDir, { recursive: true });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with node --env-file=.env).");
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────

const clean = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s.length ? s : null;
};
const normText = (s) => {
  if (s == null) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};
const tokenSet = (s) => new Set(normText(s).split(" ").filter(Boolean));
// null = nothing to compare (not a contradiction); true/false = actual overlap result
const overlaps = (a, b) => {
  if (!a.size || !b.size) return null;
  for (const t of a) if (b.has(t)) return true;
  return false;
};
const yearFromDate = (d) => {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
};
const parseUsdPrice = (s) => {
  if (!s) return null;
  const m = String(s).match(/[\d,]+\.?\d*/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const isValidJpeg = (buf) =>
  buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;

// ── Load export (streaming — never holds all decoded images at once) ─────

function loadExport(dir) {
  const records = [];
  const imageHashCounts = new Map(); // sha256 -> count across whole export
  const imageHashFirstSeen = new Map(); // sha256 -> first "{file}#{idx}"
  let totalImages = 0;
  let invalidImages = 0;

  const subDirs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const sub of subDirs) {
    const subDir = path.join(dir, sub.name);
    for (const f of fs.readdirSync(subDir)) {
      if (!f.endsWith(".json")) continue;
      const fp = path.join(subDir, f);
      const relFile = path.relative(dir, fp);
      let d;
      try {
        d = JSON.parse(fs.readFileSync(fp, "utf8"));
      } catch (e) {
        records.push({ __file: relFile, __parseError: e.message });
        continue;
      }

      const imgMeta = [];
      const imgs = Array.isArray(d.images) ? d.images : [];
      imgs.forEach((im, idx) => {
        totalImages += 1;
        let buf;
        try {
          buf = Buffer.from(im?.data ?? "", "base64");
        } catch {
          buf = Buffer.alloc(0);
        }
        const valid = isValidJpeg(buf);
        if (!valid) invalidImages += 1;
        const hash = valid ? sha256Buf(buf) : null;
        if (hash) {
          imageHashCounts.set(hash, (imageHashCounts.get(hash) ?? 0) + 1);
          if (!imageHashFirstSeen.has(hash)) imageHashFirstSeen.set(hash, `${relFile}#${idx}`);
        }
        imgMeta.push({ format: im?.format ?? null, valid, bytes: buf.length, hash });
      });

      records.push({
        __file: relFile,
        source: d.source,
        ctpId: d.id,
        pinpicsId: d.related_ids?.PINPICS != null ? String(d.related_ids.PINPICS) : null,
        pintradingdbId: d.related_ids?.PINTRADINGDB != null ? String(d.related_ids.PINTRADINGDB) : null,
        name: clean(d.name),
        releaseFormat: clean(d.release_format),
        editionSize: d.edition_size ?? null,
        size: clean(d.size),
        releaseDate: clean(d.release_date),
        releaseYear: yearFromDate(d.release_date),
        origin: clean(d.origin),
        material: d.material ?? null,
        priceRaw: clean(d.price),
        priceUsd: parseUsdPrice(d.price),
        comment: clean(d.comment),
        groups: Array.isArray(d.groups) ? d.groups.map(clean).filter(Boolean) : [],
        images: imgMeta,
      });
    }
  }

  const duplicateGroups = [...imageHashCounts.entries()].filter(([, c]) => c > 1);
  return {
    records,
    imageStats: {
      totalImages,
      invalidImages,
      validImages: totalImages - invalidImages,
      duplicateHashGroups: duplicateGroups.length,
      duplicateImagesInvolved: duplicateGroups.reduce((s, [, c]) => s + c, 0),
      sampleDuplicates: duplicateGroups.slice(0, 10).map(([hash, count]) => ({
        hash,
        count,
        firstSeen: imageHashFirstSeen.get(hash),
      })),
    },
  };
}
function sha256Buf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── Preload PinHunt catalogue (read-only) ─────────────────────────────────

async function preloadAll(table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`preload ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const { records: ctp, imageStats } = loadExport(exportDirArg);
  const parseErrors = ctp.filter((r) => r.__parseError);
  const validRecords = ctp.filter((r) => !r.__parseError);

  const pins = await preloadAll(
    "pins",
    "id, pinhunt_id, title, collection, collection_name, origin, release_date, release_year, " +
      "edition_type, limited_edition_size, retail_price, currency, external_identifiers, " +
      "catalogue_status, verification_status, image_url, back_image_url, normalised_series"
  );
  const extIds = await preloadAll("pin_external_ids", "pin_id, source, external_id");
  const sets = await preloadAll(
    "pin_sets",
    "id, normalised_series, set_name, collection_name, programme, release_year, scope, collection_type"
  );
  const pinImages = await preloadAll("pin_images", "pin_id, image_type, is_primary");

  const pinById = new Map(pins.map((p) => [p.id, p]));
  const byPinpics = new Map();
  const byPintradingdb = new Map();
  const extIdsByPin = new Map(); // pin_id -> { pinpics?, pintradingdb? }
  for (const e of extIds) {
    if (e.source === "pinpics") byPinpics.set(String(e.external_id), e.pin_id);
    if (e.source === "pintradingdb") byPintradingdb.set(String(e.external_id), e.pin_id);
    if (!extIdsByPin.has(e.pin_id)) extIdsByPin.set(e.pin_id, {});
    extIdsByPin.get(e.pin_id)[e.source] = e.external_id;
  }

  const imageCountByPin = new Map();
  const primaryByPin = new Set();
  for (const im of pinImages) {
    imageCountByPin.set(im.pin_id, (imageCountByPin.get(im.pin_id) ?? 0) + 1);
    if (im.is_primary) primaryByPin.add(im.pin_id);
  }
  const hasAnyImage = (p) => !!p.image_url || !!p.back_image_url || imageCountByPin.has(p.id);

  // Metadata index: normalised(name) + release_year -> [pins]
  const metaIndex = new Map();
  for (const p of pins) {
    const y = p.release_year ?? yearFromDate(p.release_date);
    if (!p.title || y == null) continue;
    const key = normText(p.title) + "|" + y;
    if (!metaIndex.has(key)) metaIndex.set(key, []);
    metaIndex.get(key).push(p);
  }

  // ── Set index for section D ──
  const normalisedSetNames = new Set();
  for (const s of sets) {
    normalisedSetNames.add(normText(s.set_name));
    normalisedSetNames.add(normText(s.collection_name));
    normalisedSetNames.add(normText(s.normalised_series));
  }
  const setTokenIndex = sets.map((s) => ({
    set: s,
    tokens: tokenSet([s.set_name, s.collection_name].filter(Boolean).join(" ")),
  }));

  const allGroups = new Set();
  for (const r of validRecords) for (const g of r.groups) allGroups.add(g);

  const setAnalysis = { matched: [], newCandidate: [], ambiguous: [] };
  for (const g of allGroups) {
    const gNorm = normText(g);
    if (normalisedSetNames.has(gNorm)) {
      setAnalysis.matched.push(g);
      continue;
    }
    const gTokens = tokenSet(g);
    const overlapping = setTokenIndex.filter((s) => overlaps(gTokens, s.tokens) === true);
    if (overlapping.length === 0) {
      setAnalysis.newCandidate.push(g);
    } else {
      setAnalysis.ambiguous.push({ group: g, candidates: overlapping.map((o) => o.set.set_name) });
    }
  }

  // ── Per-record matching ──
  const results = [];
  for (const r of validRecords) {
    const pinpicsMatchId = r.pinpicsId ? byPinpics.get(r.pinpicsId) ?? null : null;
    const ptdbMatchId = r.pintradingdbId ? byPintradingdb.get(r.pintradingdbId) ?? null : null;

    let tier, matchedPinId = null, note = null, ambiguousCandidates = null;

    if (pinpicsMatchId && ptdbMatchId) {
      if (pinpicsMatchId === ptdbMatchId) {
        tier = "id_confirmed_both";
        matchedPinId = pinpicsMatchId;
      } else {
        tier = "id_conflict";
        note = { pinpicsMatchId, ptdbMatchId };
      }
    } else if (pinpicsMatchId) {
      tier = "id_pinpics";
      matchedPinId = pinpicsMatchId;
    } else if (ptdbMatchId) {
      tier = "id_pintradingdb";
      matchedPinId = ptdbMatchId;
    } else {
      const key = normText(r.name) + "|" + r.releaseYear;
      const candidates = r.name && r.releaseYear != null ? metaIndex.get(key) ?? [] : [];
      if (candidates.length === 0) {
        tier = "unmatched";
      } else if (candidates.length === 1) {
        tier = "metadata_strong";
        matchedPinId = candidates[0].id;
      } else {
        const originTokens = tokenSet(r.origin);
        const groupTokens = tokenSet(r.groups.join(" "));
        const filtered = candidates.filter((c) => {
          const originOverlap = overlaps(originTokens, tokenSet(c.origin));
          const collOverlap = overlaps(groupTokens, tokenSet([c.collection, c.collection_name].filter(Boolean).join(" ")));
          return originOverlap === true || collOverlap === true;
        });
        if (filtered.length === 1) {
          tier = "metadata_strong";
          matchedPinId = filtered[0].id;
          note = "disambiguated_via_origin_or_series";
        } else {
          tier = "ambiguous";
          ambiguousCandidates = candidates.map((c) => c.pinhunt_id);
        }
      }
    }

    const target = matchedPinId ? pinById.get(matchedPinId) : null;

    // ── Enrichment diff (section C) ──
    let enrichment = null;
    if (target) {
      const diff = (field, existing, incoming, same) => {
        if (existing == null || existing === "") return incoming != null ? { field, status: "candidate", incoming } : null;
        if (incoming == null) return null;
        return same(existing, incoming)
          ? { field, status: "corroborated" }
          : { field, status: "conflict", existing, incoming };
      };

      const existingExt = extIdsByPin.get(target.id) ?? {};
      const targetGroupTokens = tokenSet([target.collection, target.collection_name, target.normalised_series].filter(Boolean).join(" "));
      const groupsMatchExisting = r.groups.some((g) => overlaps(tokenSet(g), targetGroupTokens) === true);

      enrichment = [
        diff("release_date", target.release_date, r.releaseDate, (a, b) => String(a).slice(0, 10) === b),
        diff("release_year", target.release_year, r.releaseYear, (a, b) => Number(a) === Number(b)),
        diff("edition_type", target.edition_type, r.releaseFormat, (a, b) => normText(a) === normText(b)),
        diff("limited_edition_size", target.limited_edition_size, r.editionSize, (a, b) => Number(a) === Number(b)),
        diff("origin", target.origin, r.origin, (a, b) => normText(a) === normText(b) || overlaps(tokenSet(a), tokenSet(b)) === true),
        target.retail_price == null
          ? r.priceUsd != null
            ? { field: "retail_price", status: "candidate", incoming: r.priceUsd, note: "CTP price is USD; PinHunt retail_price is GBP — needs currency handling, not a raw copy" }
            : null
          : r.priceUsd != null
          ? { field: "retail_price", status: "conflict", existing: target.retail_price, incoming: r.priceUsd, note: "cannot safely corroborate across currencies (existing GBP vs CTP USD)" }
          : null,
        r.groups.length === 0
          ? null
          : !target.normalised_series && !target.collection_name
          ? { field: "set_group", status: "candidate", incoming: r.groups }
          : { field: "set_group", status: groupsMatchExisting ? "corroborated" : "conflict", existing: target.collection ?? target.normalised_series, incoming: r.groups },
        existingExt.pinpics == null
          ? r.pinpicsId != null
            ? { field: "pinpics_id", status: "candidate", incoming: r.pinpicsId }
            : null
          : { field: "pinpics_id", status: String(existingExt.pinpics) === r.pinpicsId ? "corroborated" : "conflict", existing: existingExt.pinpics, incoming: r.pinpicsId },
        existingExt.pintradingdb == null
          ? r.pintradingdbId != null
            ? { field: "pintradingdb_id", status: "candidate", incoming: r.pintradingdbId }
            : null
          : { field: "pintradingdb_id", status: String(existingExt.pintradingdb) === r.pintradingdbId ? "corroborated" : "conflict", existing: existingExt.pintradingdb, incoming: r.pintradingdbId },
      ].filter(Boolean);
    }

    results.push({
      file: r.__file,
      ctpId: r.ctpId,
      name: r.name,
      pinpicsId: r.pinpicsId,
      pintradingdbId: r.pintradingdbId,
      releaseDate: r.releaseDate,
      origin: r.origin,
      imageCount: r.images.length,
      tier,
      note,
      ambiguousCandidates,
      matchedPinId,
      matchedPinhuntId: target?.pinhunt_id ?? null,
      matchedCatalogueStatus: target?.catalogue_status ?? null,
      targetHasImage: target ? hasAnyImage(target) : null,
      enrichment,
    });
  }

  // ── Aggregate section A ──
  const tierCounts = {};
  for (const r of results) tierCounts[r.tier] = (tierCounts[r.tier] ?? 0) + 1;
  const matchedResults = results.filter((r) => r.matchedPinId);
  const trustedMatches = matchedResults.filter((r) => r.matchedCatalogueStatus === "trusted");
  const archivedMatches = matchedResults.filter((r) => r.matchedCatalogueStatus === "archived" || (r.matchedCatalogueStatus && r.matchedCatalogueStatus !== "trusted"));

  const sectionA = {
    totalRecords: validRecords.length,
    parseErrors: parseErrors.length,
    exactPinpicsMatches: results.filter((r) => r.tier === "id_pinpics" || r.tier === "id_confirmed_both").length,
    exactPintradingdbMatches: results.filter((r) => r.tier === "id_pintradingdb" || r.tier === "id_confirmed_both").length,
    bothIdsAgree: tierCounts.id_confirmed_both ?? 0,
    idConflicts: tierCounts.id_conflict ?? 0,
    strongMetadataMatches: tierCounts.metadata_strong ?? 0,
    ambiguousMatches: tierCounts.ambiguous ?? 0,
    completelyUnmatched: tierCounts.unmatched ?? 0,
    matchesToTrusted: trustedMatches.length,
    matchesToArchivedOrOther: archivedMatches.length,
  };

  // ── Section B: images ──
  const matchedNoImage = matchedResults.filter((r) => r.targetHasImage === false);
  const matchedCouldReplacePrimary = matchedNoImage.filter((r) => r.imageCount > 0);
  const matchedHasImageCouldAddReference = matchedResults.filter((r) => r.targetHasImage === true && r.imageCount > 0);
  const sectionB = {
    matchedPinsWithNoImage: matchedNoImage.length,
    couldProvideReplacementOrPrimaryImage: matchedCouldReplacePrimary.length,
    couldProvideAdditionalReferenceImages: matchedHasImageCouldAddReference.length,
    totalUsableDecodedImages: imageStats.validImages,
    invalidOrCorruptImages: imageStats.invalidImages,
    duplicateImageHashGroups: imageStats.duplicateHashGroups,
    duplicateImagesInvolved: imageStats.duplicateImagesInvolved,
    sampleDuplicates: imageStats.sampleDuplicates,
  };

  // ── Section C: enrichment rollup ──
  const enrichFields = [
    "release_date", "release_year", "edition_type", "limited_edition_size",
    "origin", "retail_price", "set_group", "pinpics_id", "pintradingdb_id",
  ];
  const sectionC = {};
  for (const f of enrichFields) {
    sectionC[f] = { candidate: 0, corroborated: 0, conflict: 0 };
  }
  for (const r of matchedResults) {
    for (const e of r.enrichment ?? []) {
      if (sectionC[e.field]) sectionC[e.field][e.status] += 1;
    }
  }

  // ── Section D: sets ──
  const sectionD = {
    totalDistinctGroups: allGroups.size,
    matchedExistingSets: setAnalysis.matched.length,
    newSetCandidates: setAnalysis.newCandidate.length,
    ambiguousSetMatches: setAnalysis.ambiguous.length,
    matchedExamples: setAnalysis.matched.slice(0, 10),
    newCandidateExamples: setAnalysis.newCandidate.slice(0, 10),
    ambiguousExamples: setAnalysis.ambiguous.slice(0, 10),
  };

  // ── Section E: samples ──
  const highConfidence = matchedResults
    .filter((r) => r.tier === "id_confirmed_both" || r.tier === "id_pinpics" || r.tier === "id_pintradingdb" || (r.tier === "metadata_strong" && !r.note))
    .slice(0, 10);
  const enrichmentRich = matchedResults
    .map((r) => ({ r, candidateCount: (r.enrichment ?? []).filter((e) => e.status === "candidate").length }))
    .filter((x) => x.candidateCount >= 3)
    .sort((a, b) => b.candidateCount - a.candidateCount)
    .slice(0, 10)
    .map((x) => ({ ...x.r, candidateCount: x.candidateCount }));
  const goodNewCandidates = results
    .filter((r) => r.tier === "unmatched" && r.pinpicsId && r.releaseDate && r.imageCount > 0)
    .map((r) => ({ r, richness: [r.pinpicsId, r.pintradingdbId, r.releaseDate, r.origin, r.imageCount > 0].filter(Boolean).length }))
    .sort((a, b) => b.richness - a.richness)
    .slice(0, 10)
    .map((x) => x.r);
  const idConflicts = results.filter((r) => r.tier === "id_conflict");
  const ambiguousSamples = results.filter((r) => r.tier === "ambiguous").slice(0, 10);

  const sectionE = { highConfidence, enrichmentRich, goodNewCandidates, idConflicts, ambiguousSamples };

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run (no writes performed)",
    imageRights: {
      source_name: "Collectible PinTrader",
      rights_basis: "public Creative Commons export (per developer's stated reuse terms)",
      exact_license_variant: "pending confirmation",
      public_display_allowed: false,
    },
    sectionA_overall: sectionA,
    sectionB_images: sectionB,
    sectionC_enrichment: sectionC,
    sectionD_sets: sectionD,
    sectionE_samples: sectionE,
  };

  const reportPath = path.join(reportDir, `dryrun-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, allResults: results }, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
