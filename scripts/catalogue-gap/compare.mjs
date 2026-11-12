#!/usr/bin/env node
// Catalogue gap report: compares the staging and production exports made by
// supabase/verify/catalogue-gap/*.sql. Offline: reads local files only, never
// connects to Supabase or anything else, and writes nothing but the report.
//
//   node scripts/catalogue-gap/compare.mjs <folder> --staging-ref <ref> --production-ref <ref>
//
// <folder> holds staging/ and production/, each with 1_summary.json,
// 2_pins.csv, 3_images.csv and (optionally) 4_storage.csv and 5_work.json.
// Writes <folder>/report.md and <folder>/review.csv.
// Project refs are the 20-letter ids in each project's URL (not secrets).
// See docs/catalogue-sync/GAP-REPORT.md.

import fs from "node:fs";
import path from "node:path";
import { compare, isRef, loadSide, renderMarkdown, renderReviewCsv } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const folder = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const stagingRef = opt("--staging-ref");
const productionRef = opt("--production-ref");

if (!folder || !isRef(stagingRef) || !isRef(productionRef)) {
  console.error("Usage: node scripts/catalogue-gap/compare.mjs <folder> --staging-ref <20-char ref> --production-ref <20-char ref>");
  process.exit(1);
}

try {
  const staging = loadSide(path.join(folder, "staging"));
  const production = loadSide(path.join(folder, "production"));
  const result = compare(staging, production, { stagingRef, productionRef });
  fs.writeFileSync(path.join(folder, "report.md"), renderMarkdown(result, { staging, production }));
  fs.writeFileSync(path.join(folder, "review.csv"), renderReviewCsv(result.review));
  const crit = result.review.filter((r) => r.severity === "critical").length;
  const dec = result.review.filter((r) => r.severity === "review").length;
  for (const c of result.checks) console.log(`${c.level.toUpperCase()}: ${c.text}`);
  console.log(`Wrote ${path.join(folder, "report.md")} and review.csv: ${crit} critical, ${dec} to decide, ${result.photos.ready.length} photo(s) ready.`);
  if (result.checks.some((c) => c.level === "error")) process.exitCode = 2;
} catch (e) {
  console.error(`catalogue-gap: ${e.message}`);
  process.exit(1);
}
