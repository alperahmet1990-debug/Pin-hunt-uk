#!/usr/bin/env node
/**
 * Collectible PinTrader photo -> Pin & Pop pin: AI image comparison (TEST BATCH)
 *
 * For a sample of Collectible PinTrader (CTP) photos, shows OpenAI the photo
 * next to its Pin & Pop candidates' reference images and asks which (if any)
 * is the same pin. Maintainer decision, 14 Nov 2026: Pin & Pop images may be
 * sent to OpenAI for comparison only (docs/catalogue-sync/PIN-AND-POP-QUESTIONS.md).
 *
 * WRITES NOTHING to any database. It reads:
 *   - the match estimate CSV (ctp_match_estimate.sql, run in staging),
 *   - the production gap-report export (for the CTP photo links),
 *   - staging, read-only, with the service key: candidate pins and their
 *     Pin & Pop reference image links (admin-only rows).
 * and writes, into --out: results.json, results.csv, review.html (local,
 * for your eyes: it shows Pin & Pop images and titles) and share.json
 * (counts and token totals only: safe to send to Claude).
 *
 * No install needed: plain Node 20+, built-in fetch. Run from artifacts/api-server:
 *   node --env-file=.env.staging scripts/ctp-photo-match.mjs \
 *     --estimate ~/Downloads/<estimate>.csv --production ~/Downloads/<production export>.csv \
 *     --out ~/Documents/PinHunt-Private/ctp-match-test            # dry run: no AI calls
 *   ... same command plus --run                                     # makes the AI calls
 *
 * Needs (in .env.staging, or any plain-text settings file given to Node):
 * PINHUNT_ENV=staging, STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF,
 * SUPABASE_URL (staging), SUPABASE_SERVICE_ROLE_KEY (staging), OPENAI_API_KEY.
 * Optional: OPENAI_BULK_MATCH_MODEL / OPENAI_SCAN_MODEL, OPENAI_SCAN_REASONING_EFFORT,
 * CTP_MATCH_SAMPLE (default 50), CTP_MATCH_CONCURRENCY (default 3).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { assertStagingTarget } from "./lib/staging-guard.mjs";
import { parseCsv, sideFromFiles } from "../../../scripts/catalogue-gap/core.mjs";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MAX_CANDIDATES = 6;

// ── inputs ──────────────────────────────────────────────────────────────────

export function readEstimate(text) {
  const rows = parseCsv(text);
  const out = [];
  for (const r of rows) if (r.part === "rows" && r.payload) out.push(...JSON.parse(r.payload));
  if (!out.length) throw new Error("the estimate file has no result rows (is it the ctp_match_estimate.sql download?)");
  return out;
}

export function ctpPhotos(productionText) {
  const prod = sideFromFiles({ x: productionText }, "production export");
  const map = new Map();
  for (const p of prod.pins) {
    if (!p.image_url) continue;
    map.set(p.pinhunt_id, { title: p.title, series: p.collection, year: p.release_year, edition: p.edition_type, imageUrl: p.image_url });
  }
  return map;
}

/** Deterministic, spread across tiers. */
export function pickSample(estimate, photos, size = 50) {
  const quota = [
    ["strong", 10], ["likely", 12], ["ambiguous", 13], ["weak", 5], ["fuzzy", 5], ["conflict", 2], ["possible", 3],
  ];
  const eligible = estimate
    .filter((r) => photos.has(r.ctp_pin) && (r.best_pin || r.fuzzy_candidates))
    .sort((a, b) => hash(a.ctp_pin) - hash(b.ctp_pin));
  const picked = [];
  const used = new Set();
  for (const [key, n] of quota) {
    for (const r of eligible.filter((x) => x.tier.startsWith(key)).slice(0, Math.round((n * size) / 50))) { picked.push(r); used.add(r.ctp_pin); }
  }
  for (const r of eligible) { if (picked.length >= size) break; if (!used.has(r.ctp_pin)) { picked.push(r); used.add(r.ctp_pin); } }
  return picked.slice(0, size);
}
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function estimateCandidates(r) {
  const ids = [r.best_pin, r.second_pin, ...String(r.fuzzy_candidates ?? "").split(";").map((x) => x.split(":")[0])].filter(Boolean);
  return [...new Set(ids)];
}

// ── staging (read-only) ─────────────────────────────────────────────────────

function supabaseGet(env, fetchImpl) {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  return async (pathAndQuery) => {
    const key = String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
    // New-style secret keys (sb_secret_…) go in the apikey header only; legacy
    // service_role JWTs also go in Authorization.
    const headers = key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
    const res = await fetchImpl(`${base}/rest/v1/${pathAndQuery}`, { headers });
    if (!res.ok) throw new Error(`staging read failed (${res.status}) for ${pathAndQuery.split("?")[0]}`);
    return res.json();
  };
}
const inList = (vals) => `(${vals.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",")})`;
const nameOf = (title) => String(title ?? "").replace(/^.* - /, "").trim();

export async function loadCandidates(sample, photos, get) {
  const PIN_COLS = "id,pinhunt_id,title,collection,release_year,edition_type,limited_edition_size";
  const byPhid = new Map();
  // 1. extra candidates: Pin & Pop pins whose name equals the CTP name (case-insensitive)
  const extra = new Map();
  for (const r of sample) {
    const name = nameOf(photos.get(r.ctp_pin).title).replace(/[*,()"\\]/g, " ").trim();
    if (!name) continue;
    const rows = await get(`pins?select=${PIN_COLS}&catalogue_source=eq.pin_and_pop&title=ilike.${encodeURIComponent(name)}&limit=12`);
    const year = Number(photos.get(r.ctp_pin).year) || null;
    rows.sort((a, b) => (b.release_year === year) - (a.release_year === year));
    extra.set(r.ctp_pin, rows.map((p) => p.pinhunt_id));
    for (const p of rows) byPhid.set(p.pinhunt_id, p);
  }
  // 2. the estimate's candidates
  const ids = [...new Set(sample.flatMap(estimateCandidates))].filter((id) => !byPhid.has(id));
  for (let i = 0; i < ids.length; i += 80) {
    for (const p of await get(`pins?select=${PIN_COLS}&pinhunt_id=in.${encodeURIComponent(inList(ids.slice(i, i + 80)))}`)) byPhid.set(p.pinhunt_id, p);
  }
  // 3. Pin & Pop reference image links (admin-only rows)
  const uuids = [...byPhid.values()].map((p) => p.id);
  const img = new Map();
  for (let i = 0; i < uuids.length; i += 80) {
    for (const row of await get(`pin_images?select=pin_id,image_url&source=eq.pin_and_pop&pin_id=in.${encodeURIComponent(inList(uuids.slice(i, i + 80)))}`)) {
      if (/^https:\/\//.test(row.image_url) && !img.has(row.pin_id)) img.set(row.pin_id, row.image_url);
    }
  }
  return sample.map((r) => {
    const order = [...new Set([...estimateCandidates(r), ...(extra.get(r.ctp_pin) ?? [])])];
    const cands = order.map((id) => byPhid.get(id)).filter(Boolean)
      .map((p) => ({ pinhuntId: p.pinhunt_id, title: p.title, series: p.collection, year: p.release_year, edition: p.edition_type, le: p.limited_edition_size, imageUrl: img.get(p.id) ?? null }))
      .filter((c) => c.imageUrl)
      .slice(0, MAX_CANDIDATES);
    return { estimate: r, ctp: { pinhuntId: r.ctp_pin, ...photos.get(r.ctp_pin) }, candidates: cands };
  });
}

// ── OpenAI comparison ───────────────────────────────────────────────────────

export function buildRequest(item, { model, effort }) {
  const list = item.candidates.map((c, i) => `${i + 1}. ${c.pinhuntId} | "${c.title}" | series: ${c.series || "-"} | year: ${c.year ?? "?"} | edition: ${c.edition ?? "?"}${c.le ? ` ${c.le}` : ""}`).join("\n");
  const content = [
    { type: "text", text: `PHOTO A (Collectible PinTrader): "${item.ctp.title}" | series: ${item.ctp.series || "-"} | year: ${item.ctp.year ?? "?"} | edition: ${item.ctp.edition ?? "?"}` },
    { type: "image_url", image_url: { url: item.ctp.imageUrl, detail: "high" } },
    { type: "text", text: "Candidate reference images follow, in the order listed." },
  ];
  item.candidates.forEach((c, i) => {
    content.push({ type: "text", text: `Candidate ${i + 1}: ${c.pinhuntId}` });
    content.push({ type: "image_url", image_url: { url: c.imageUrl, detail: "low" } });
  });
  return {
    model,
    ...(effort ? { reasoning_effort: effort } : {}),
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: `You match Disney trading pins between two catalogues by comparing images. Photo A is one pin. Decide which candidate image shows the SAME pin design: same character(s), pose, shapes, colours, text and border. Text details are hints only; sibling pins in a series often share names, so trust the images. If none is clearly the same pin, answer null.
Candidates:
${list}
Respond with ONLY JSON: {"match": "<PinHunt ID or null>", "confidence": <0-100>, "reasoning": "<one sentence>"}` },
      { role: "user", content },
    ],
  };
}

export function parseAnswer(text, item) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ""));
  if (!m) return { match: null, confidence: 0, reasoning: "no JSON in the answer", invalid: true };
  try {
    const j = JSON.parse(m[0]);
    const ok = item.candidates.some((c) => c.pinhuntId === j.match);
    return { match: ok ? j.match : null, confidence: Number(j.confidence) || 0, reasoning: String(j.reasoning ?? ""), invalid: j.match != null && !ok };
  } catch { return { match: null, confidence: 0, reasoning: "unreadable JSON", invalid: true }; }
}

async function compareOne(item, env, fetchImpl, state) {
  const model = env.OPENAI_BULK_MATCH_MODEL ?? env.OPENAI_SCAN_MODEL ?? "gpt-5.6-luna";
  const effort = state.noEffort ? null : (env.OPENAI_SCAN_REASONING_EFFORT ?? "low").trim().toLowerCase() || null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetchImpl(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(buildRequest(item, { model, effort: ["none", "off", "default"].includes(effort) ? null : effort })),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 400 && /reasoning[_ ]effort/i.test(JSON.stringify(body)) && !state.noEffort) { state.noEffort = true; return compareOne(item, env, fetchImpl, state); }
    if (res.ok) {
      const text = body.choices?.[0]?.message?.content ?? "";
      return { ...parseAnswer(text, item), model, usage: body.usage ?? null };
    }
    if (attempt === 2 || ![429, 500, 502, 503, 504].includes(res.status)) return { match: null, confidence: 0, reasoning: `OpenAI error ${res.status}: ${body.error?.message ?? ""}`.slice(0, 200), error: true, model, usage: null };
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ── outputs ─────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function reviewHtml(results) {
  const cards = results.map((r, i) => {
    const cands = r.candidates.map((c) => `<figure class="${c.pinhuntId === r.ai.match ? "pick" : ""}"><img src="${esc(c.imageUrl)}" loading="lazy" alt=""><figcaption>${esc(c.pinhuntId)}<br>${esc(c.title)}<br><small>${esc(c.series)} · ${esc(c.year ?? "?")} · ${esc(c.edition ?? "?")}</small>${c.pinhuntId === r.ai.match ? "<br><b>AI pick</b>" : ""}</figcaption></figure>`).join("");
    return `<section data-id="${esc(r.ctp.pinhuntId)}"><h2>${i + 1}. ${esc(r.ctp.title)}</h2><p class="meta">${esc(r.ctp.series)} · ${esc(r.ctp.year ?? "?")} · ${esc(r.ctp.edition ?? "?")} · name-match tier: <b>${esc(r.estimate.tier)}</b> · AI: <b>${r.ai.match ? `${esc(r.ai.match)} (${r.ai.confidence})` : "no match"}</b> — ${esc(r.ai.reasoning)}</p>
<div class="row"><figure class="a"><img src="${esc(r.ctp.imageUrl)}" alt=""><figcaption>Collectible PinTrader photo</figcaption></figure>${cands || "<p>No candidate had a Pin &amp; Pop image.</p>"}</div>
<p class="verdict">Is the AI's answer right? <label><input type="radio" name="v${i}" value="right"> Right</label> <label><input type="radio" name="v${i}" value="wrong"> Wrong</label> <label><input type="radio" name="v${i}" value="unsure"> Can't tell</label></p></section>`;
  }).join("\n");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Photo Match Test</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#f6f7f5;color:#1d2a2c}h1{font-size:1.4rem}section{background:#fff;border:1px solid #d9e0de;border-radius:10px;padding:12px;margin:12px 0}h2{font-size:1rem;margin:0}.meta{color:#5b6b6c;margin:4px 0}.row{display:flex;gap:10px;overflow-x:auto}figure{margin:0;width:150px;flex:none;font-size:12px}figure img{width:150px;height:150px;object-fit:contain;background:#eef2f1;border-radius:6px}figure.a img{outline:3px solid #1f6f6a}figure.pick img{outline:3px solid #c77d00}.verdict label{margin-right:12px}button{font:600 1rem system-ui;padding:12px 18px;border-radius:8px;border:0;background:#1f6f6a;color:#fff}#done{margin:12px 0}</style>
<h1>Photo match test: ${results.length} photos</h1>
<p><b>For your eyes only:</b> this page shows Pin &amp; Pop images and titles. Teal outline = Collectible PinTrader photo; orange outline = the AI's pick. Mark each answer, then press the button at the bottom and send Claude the downloaded <code>my-answers.json</code> (it holds PinHunt IDs and your marks only).</p>
${cards}
<p id="done"><button id="save" type="button">Download my answers</button></p>
<script>
document.getElementById("save").addEventListener("click", () => {
  const out = [...document.querySelectorAll("section")].map((s, i) => ({ ctp: s.dataset.id, verdict: (s.querySelector("input[name=v" + i + "]:checked") || {}).value || null }));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
  a.download = "my-answers.json"; document.body.appendChild(a); a.click(); a.remove();
});
</script>`;
}

export function shareSummary(results) {
  const by = (f) => results.reduce((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const tokens = results.reduce((t, r) => ({ prompt: t.prompt + (r.ai.usage?.prompt_tokens ?? 0), completion: t.completion + (r.ai.usage?.completion_tokens ?? 0) }), { prompt: 0, completion: 0 });
  const tierShort = (t) => String(t).split(" (")[0];
  return {
    photos: results.length,
    model: results.find((r) => r.ai.model)?.model ?? null,
    tokens,
    ai_outcome: by((r) => (r.ai.error ? "error" : r.ai.match ? (r.ai.confidence >= 80 ? "match, confident (>=80)" : "match, less sure") : "no match")),
    ai_agrees_with_name_match: by((r) => `${tierShort(r.estimate.tier)}: ${!r.ai.match ? "AI found none" : r.ai.match === r.estimate.best_pin ? "same pin" : "different pin"}`),
    without_candidate_images: results.filter((r) => !r.candidates.length).length,
  };
}

// ── main ────────────────────────────────────────────────────────────────────

const arg = (name, argv) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const expand = (p) => path.resolve(String(p).replace(/^~(?=$|\/)/, os.homedir()));

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch, log = console.log) {
  const estimatePath = arg("--estimate", argv);
  const productionPath = arg("--production", argv);
  const outDir = arg("--out", argv);
  const run = argv.includes("--run");
  if (!estimatePath || !productionPath || !outDir) throw new Error("usage: --estimate <csv> --production <csv> --out <folder> [--run]");
  assertStagingTarget(env); // staging only, never production (scripts/lib/staging-guard.mjs)
  if (run && !env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY isn't set in .env.staging (add it on its own line; never paste it into chat).");

  const estimate = readEstimate(fs.readFileSync(expand(estimatePath), "utf8"));
  const photos = ctpPhotos(fs.readFileSync(expand(productionPath), "utf8"));
  const sample = pickSample(estimate, photos, Number(env.CTP_MATCH_SAMPLE ?? 50));
  log(`Sample: ${sample.length} photos (${Object.entries(sample.reduce((m, r) => { const k = r.tier.split(" (")[0]; m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([k, v]) => `${k} ${v}`).join(", ")}).`);

  const items = await loadCandidates(sample, photos, supabaseGet(env, fetchImpl));
  const calls = items.filter((i) => i.candidates.length).length;
  log(`Candidates loaded from staging (read-only). ${calls} photos have at least one Pin & Pop image to compare; ${items.length - calls} have none.`);
  if (!run) { log(`Dry run: no AI calls made. Add --run to make ${calls} OpenAI calls.`); return { items }; }

  fs.mkdirSync(expand(outDir), { recursive: true });
  const state = { noEffort: false };
  const results = new Array(items.length);
  let next = 0, done = 0;
  const workers = Array.from({ length: Math.max(1, Number(env.CTP_MATCH_CONCURRENCY ?? 3)) }, async () => {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      const ai = item.candidates.length ? await compareOne(item, env, fetchImpl, state) : { match: null, confidence: 0, reasoning: "no candidate images", skipped: true };
      results[i] = { ...item, ai };
      done++;
      if (done % 10 === 0 || done === items.length) log(`  compared ${done}/${items.length}`);
    }
  });
  await Promise.all(workers);

  const dir = expand(outDir);
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(results, null, 1));
  const cols = ["ctp_pin", "ctp_title", "tier", "name_best", "ai_match", "ai_confidence", "ai_reasoning", "candidates"];
  const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  fs.writeFileSync(path.join(dir, "results.csv"), [cols.join(","), ...results.map((r) => [r.ctp.pinhuntId, r.ctp.title, r.estimate.tier, r.estimate.best_pin, r.ai.match, r.ai.confidence, r.ai.reasoning, r.candidates.map((c) => c.pinhuntId).join(" ")].map(cell).join(","))].join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "review.html"), reviewHtml(results));
  const share = shareSummary(results);
  fs.writeFileSync(path.join(dir, "share.json"), JSON.stringify(share, null, 1));
  log(`Done. Tokens: ${share.tokens.prompt} in, ${share.tokens.completion} out (model ${share.model}).`);
  log(`Open ${path.join(dir, "review.html")} to check the answers. Send Claude share.json and my-answers.json.`);
  return { results, share };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`ctp-photo-match: ${e.message}`); process.exit(1); });
}
