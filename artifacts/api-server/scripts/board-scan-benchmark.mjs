#!/usr/bin/env node
/**
 * Board scanning benchmark — STAGING ONLY.
 *
 * Uploads test board photos to a running staging API server, waits for
 * processing, and reports the measurements from scripts/BOARD-SCANNING.md:
 * pins detected, matched correctly, usable cleaned photos, manual
 * corrections, and cost/time per board.
 *
 * Accuracy figures come from your review in the app (Admin → Board Scans):
 * run `upload`, review each board (confirm/correct/exclude/add missed
 * pins), then run `report`.
 *
 *   pnpm --filter @workspace/api-server run staging:board-bench upload ~/boards/grogu.jpg ~/boards/ratatouille.jpg ~/boards/toy-story.jpg
 *   pnpm --filter @workspace/api-server run staging:board-bench report <scanId> <scanId> <scanId> [--expected expected.json]
 *
 * Needs in .env.staging (never committed): BOARD_BENCH_EMAIL and
 * BOARD_BENCH_PASSWORD for a staging admin account. Optional:
 * BOARD_BENCH_API (default http://localhost:$PORT/api).
 *
 * expected.json (optional) gives the true pin count per board, so detection
 * can be estimated before review: { "<scanId>": { "pins": 24 } }
 *
 * Upload flags: --contributor "Name" --evidence "where permission is kept"
 * (default: a PinHunt-owned photo), --no-public (match only, no clean-up).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { requireStaging } from "./lib/staging-guard.mjs";

const [, , command, ...rest] = process.argv;
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === "--no-public") flags.noPublic = true;
  else if (a.startsWith("--")) flags[a.slice(2)] = rest[++i];
  else args.push(a);
}

if (!["upload", "report"].includes(command) || args.length === 0) {
  console.error("Usage: board-scan-benchmark.mjs upload <photo...> | report <scanId...> [--expected file.json]");
  process.exit(2);
}

await requireStaging();
const api = process.env.BOARD_BENCH_API ?? `http://localhost:${process.env.PORT ?? 3000}/api`;
if (!process.env.BOARD_BENCH_EMAIL || !process.env.BOARD_BENCH_PASSWORD) {
  console.error("Set BOARD_BENCH_EMAIL and BOARD_BENCH_PASSWORD (a staging admin) in .env.staging.");
  process.exit(2);
}
const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({
  email: process.env.BOARD_BENCH_EMAIL,
  password: process.env.BOARD_BENCH_PASSWORD,
});
if (signInError || !signIn.session) {
  console.error("Sign-in failed:", signInError?.message ?? "no session");
  process.exit(1);
}
const token = signIn.session.access_token;

async function call(p, init = {}) {
  const res = await fetch(`${api}${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body.error ?? res.statusText}`);
  return body;
}

const PROCESSING = new Set(["queued", "detecting", "matching", "cleaning"]);
async function waitFor(id) {
  const started = Date.now();
  for (;;) {
    const view = await call(`/admin/board-scans/${id}`);
    if (!view.scan.processing && !PROCESSING.has(view.scan.status)) return view;
    if (Date.now() - started > 15 * 60_000) throw new Error(`board ${id} still processing after 15 minutes`);
    process.stdout.write(`  ${id.slice(0, 8)}: ${view.scan.status} (${view.items.length} pins)\r`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

const pct = (n) => (n == null ? "—" : `${Math.round(n * 100)}%`);

function row(view, expected) {
  const m = view.metrics;
  const items = view.items;
  const truth = expected?.pins;
  const reviewed = m.undecided === 0;
  const avgConf = items.length
    ? Math.round(items.reduce((s, i) => s + (i.match_confidence ?? 0), 0) / items.length)
    : 0;
  return {
    board: view.scan.title ?? view.scan.id.slice(0, 8),
    status: view.scan.status,
    detected: m.detected,
    pinsOnBoard: truth ?? (reviewed ? m.pinsOnBoard : null),
    detection: truth ? pct(Math.min(m.detected - m.falsePositives, truth) / truth) : reviewed ? pct(m.detectionRate) : "review first",
    falseDetections: m.falsePositives,
    missed: m.manualAdds,
    matchAccuracy: m.reviewedMatches ? `${pct(m.matchAccuracy)} of ${m.reviewedMatches}` : "review first",
    avgConfidence: avgConf,
    suitableCrops: m.suitableCrops,
    cleaned: m.cleaned,
    published: m.published,
    manualCorrections: m.manualCorrections,
    unsuitable: Object.entries(items.reduce((acc, i) => {
      for (const r of i.quality?.reasons ?? []) acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {})).map(([k, v]) => `${k}:${v}`).join(" ") || "—",
    aiCalls: m.openaiCalls,
    tokens: m.inputTokens + m.outputTokens,
    pixian: m.pixianCalls,
    costUsd: m.estimatedCostUsd ?? "set BOARD_COST_* to estimate",
    seconds: m.totalSeconds,
  };
}

function printTable(rows) {
  const keys = Object.keys(rows[0]);
  console.log(`\n| ${keys.join(" | ")} |\n| ${keys.map(() => "---").join(" | ")} |`);
  for (const r of rows) console.log(`| ${keys.map((k) => String(r[k] ?? "—")).join(" | ")} |`);
}

const expected = flags.expected ? JSON.parse(fs.readFileSync(flags.expected, "utf8")) : {};
const views = [];

if (command === "upload") {
  for (const file of args) {
    const imageBase64 = fs.readFileSync(file).toString("base64");
    const contributor = flags.contributor;
    const { scan, duplicate } = await call("/admin/board-scans", {
      method: "POST",
      body: JSON.stringify({
        imageBase64,
        title: path.basename(file).replace(/\.[^.]+$/, ""),
        permission: {
          basis: contributor ? "contributor_permission" : "own_photo",
          contributorName: contributor,
          evidence: flags.evidence,
          processing: true,
          publicDisplay: !flags.noPublic,
          notThirdPartyCatalogue: true,
        },
      }),
    });
    console.log(`${path.basename(file)} → ${scan.id}${duplicate ? " (already uploaded — reusing)" : ""}`);
    views.push(await waitFor(scan.id));
  }
  console.log("\nNow review each board in the app (Admin → Board Scans), then run `report` with these ids for accuracy:");
  console.log(views.map((v) => v.scan.id).join(" "));
} else {
  for (const id of args) views.push(await waitFor(id));
}

const rows = views.map((v) => row(v, expected[v.scan.id] ?? expected[v.scan.title]));
printTable(rows);
const out = path.resolve(`board-bench-${Date.now()}.json`);
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
console.log(`\nSaved ${out}`);
