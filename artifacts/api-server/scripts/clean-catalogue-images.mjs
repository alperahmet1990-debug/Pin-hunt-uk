/**
 * Catalogue image clean-up with Pixian (#367). Run by the maintainer on
 * their own machine, against staging, with their own keys. Agents never run
 * it: it calls a paid API and a hosted database.
 *
 *   fetch    download the current images of some catalogue pins (read-only)
 *   clean    send them to Pixian: --test (free, watermarked) or --paid
 *   review   build review.html (before/after) and review.json (approvals)
 *   publish  upload approved paid results and switch pins.image_url (dry run without --apply)
 *   revert   put the original images back (dry run without --apply)
 *
 * Usage (from artifacts/api-server, Node 22.18+):
 *   node --env-file=.env.staging scripts/clean-catalogue-images.mjs fetch --limit 10
 *   node --env-file=.env.staging scripts/clean-catalogue-images.mjs clean --test
 *   node --env-file=.env.staging scripts/clean-catalogue-images.mjs review
 *   node --env-file=.env.staging scripts/clean-catalogue-images.mjs publish [--apply]
 *
 * See scripts/CLEAN-CATALOGUE-IMAGES.md for the full walkthrough.
 * Files go in ./catalogue-image-clean (or --dir), which git ignores.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { requireStaging } from "./lib/staging-guard.mjs";
import {
  STORAGE_BUCKET, parseArgs, parseIdsFile, redact, renderReviewHtml, reviewTemplate,
  runClean, runFetch, runPublish, runRevert,
} from "./lib/catalogue-image-clean.mjs";

const SECRETS = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.PIXIAN_API_ID, process.env.PIXIAN_API_SECRET];
const log = (msg) => console.log(redact(msg, SECRETS));
const fail = (msg) => {
  console.error(redact(msg, SECRETS));
  process.exit(1);
};

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  fail(`${err.message}\nSee the header of scripts/clean-catalogue-images.mjs for usage.`);
}

const dir = path.resolve(opts.dir);
const inDir = (rel) => {
  const full = path.resolve(dir, rel);
  if (!full.startsWith(dir + path.sep)) throw new Error(`refusing path outside ${dir}`);
  return full;
};
const readFile = (rel) => fs.readFile(inDir(rel));
const writeFile = async (rel, buf) => {
  await fs.mkdir(path.dirname(inDir(rel)), { recursive: true });
  await fs.writeFile(inDir(rel), buf);
};
const readJson = async (rel, fallback) => {
  try { return JSON.parse(await fs.readFile(inDir(rel), "utf8")); } catch { return fallback; }
};
const writeJson = (rel, value) => writeFile(rel, Buffer.from(JSON.stringify(value, null, 2) + "\n"));
const now = () => new Date().toISOString();

/** Staging only: the guard refuses production before any client exists. */
async function connect() {
  const target = await requireStaging();
  return createClient(target.url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

function supabaseDeps(db) {
  const must = ({ data, error }, what) => {
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
  };
  return {
    async loadSources() {
      return must(await db.from("catalogue_sources")
        .select("id, exact_license_variant, storage_allowed, public_display_allowed, app_use_allowed"), "catalogue_sources");
    },
    async loadPins(o) {
      let ids = o.pinhuntIds;
      if (o.idsFile) ids = [...ids, ...parseIdsFile(await fs.readFile(o.idsFile, "utf8"))];
      const cols = "id, pinhunt_id, title, image_url";
      if (ids.length) {
        const rows = [];
        for (const part of chunk(ids, 200)) {
          rows.push(...must(await db.from("pins").select(cols).in("pinhunt_id", part).not("image_url", "is", null), "pins"));
        }
        return rows;
      }
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const page = must(await db.from("pins").select(cols).not("image_url", "is", null)
          .order("pinhunt_id").range(from, from + 999), "pins");
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    },
    async loadPinImages(pinIds) {
      const rows = [];
      for (const part of chunk(pinIds, 200)) {
        rows.push(...must(await db.from("pin_images").select("pin_id, image_url, source, source_record_id").in("pin_id", part), "pin_images"));
      }
      return rows;
    },
    async upload(objectPath, buf) {
      must(await db.storage.from(STORAGE_BUCKET).upload(objectPath, buf, { contentType: "image/jpeg", upsert: true }), "upload");
      return db.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath).data.publicUrl;
    },
    async setPinImage(pinId, url, expectedUrl) {
      const rows = must(await db.from("pins").update({ image_url: url })
        .eq("id", pinId).eq("image_url", expectedUrl).select("id"), "pins update");
      return rows.length === 1;
    },
    async insertPinImage(row) {
      must(await db.from("pin_images").insert(row), "pin_images insert");
    },
  };
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "" };
}

const manifest = await readJson("manifest.json", { pins: [] });

try {
  if (opts.command === "fetch") {
    const result = await runFetch(opts, manifest, { ...supabaseDeps(await connect()), download, writeFile, log });
    await writeJson("manifest.json", result.manifest);
  } else if (opts.command === "clean") {
    // Explicit either way, so a paid run never comes back watermarked and a test run never costs credits.
    if (opts.test) process.env.PIXIAN_TEST_MODE = "true";
    else delete process.env.PIXIAN_TEST_MODE;
    const { pixianConfigured, normalizePinPhoto } = await import("../src/services/pixian.ts");
    if (!pixianConfigured()) fail("PIXIAN_API_ID and PIXIAN_API_SECRET must be set.");
    const result = await runClean(opts, manifest, { readFile, writeFile, normalize: normalizePinPhoto, now, log });
    await writeJson("manifest.json", result.manifest);
  } else if (opts.command === "review") {
    const review = reviewTemplate(manifest, await readJson("review.json", {}));
    await writeJson("review.json", review);
    await writeFile("review.html", Buffer.from(renderReviewHtml(manifest, review)));
    log(`review: open ${inDir("review.html")}, tick the ones to publish, and save review.json into ${dir}.`);
  } else if (opts.command === "publish") {
    const review = await readJson("review.json", {});
    // A dry run connects too, to check rights against the live catalogue_sources rows; it writes nothing.
    const result = await runPublish(opts, manifest, review, { ...supabaseDeps(await connect()), readFile, now, log });
    await writeJson("manifest.json", result.manifest);
  } else if (opts.command === "revert") {
    const db = opts.apply ? supabaseDeps(await connect()) : { setPinImage: async () => false };
    const result = await runRevert(opts, manifest, { ...db, log });
    await writeJson("manifest.json", result.manifest);
  }
} catch (err) {
  fail(`${opts.command} failed: ${err.message}`);
}
