// Pin check: a one-pin-at-a-time review screen for a research run on STAGING.
// Run from the repo root, with the staging API running (start:staging):
//   node --env-file=artifacts/api-server/.env.staging research/catalogue-engine/tools/review_ui/server.mjs
// then open http://localhost:4600. It listens on 127.0.0.1 only, keeps your sign-in in memory,
// and writes only through the staging API's existing Research Review routes (direct check, then
// decision), so every answer has the same audit trail as the in-app screen.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
const PORT = Number(env.REVIEW_UI_PORT || 4600);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function die(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

// ── Staging only ────────────────────────────────────────────────────────────
const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i.exec(String(env.SUPABASE_URL ?? "").trim())?.[1]?.toLowerCase();
if (env.PINHUNT_ENV !== "staging") die("PINHUNT_ENV is not 'staging'. Run with --env-file=artifacts/api-server/.env.staging.");
if (!ref || ref !== String(env.STAGING_PROJECT_REF ?? "").toLowerCase()) die("SUPABASE_URL is not the staging project (STAGING_PROJECT_REF).");
if (!env.PRODUCTION_PROJECT_REF || ref === String(env.PRODUCTION_PROJECT_REF).toLowerCase()) die("Cannot confirm this is not production (PRODUCTION_PROJECT_REF).");
if (!env.SUPABASE_ANON_KEY) die("SUPABASE_ANON_KEY is missing from .env.staging.");
const API = (env.RESEARCH_API_BASE || `http://localhost:${env.PORT || 3000}/api`).replace(/\/$/, "");

let token = null;

async function api(method, p, body) {
  let r;
  try {
    r = await fetch(`${API}${p}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw Object.assign(new Error(`Cannot reach the staging API at ${API}. Is start:staging running?`), { status: 502 }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `API error ${r.status}`), { status: r.status });
  return j;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const OFFICIAL_PREF = ["disneystore.co.uk", "shopdisney.co.uk", "disneystore.eu", "disneystore.com", "disneystore.asia", "disneystore.com.au"];
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

const prefRank = u => (OFFICIAL_PREF.indexOf(hostOf(u)) + 99) % 99;
const officialUrls = evidence => [...new Set(evidence
  .filter(e => e.source_class === "official" && e.method !== "human_direct_check" && e.source_url).map(e => e.source_url))];

/** One page per set: the official listing most of the set's pins cite, UK first. */
function setPage(pins) {
  const n = new Map();
  for (const p of pins) for (const u of p.officialUrls) n.set(u, (n.get(u) ?? 0) + 1);
  return [...n.keys()].sort((a, b) => n.get(b) - n.get(a) || prefRank(a) - prefRank(b) || a.localeCompare(b))[0] ?? null;
}

async function loadRun() {
  const { runs } = await api("GET", "/admin/research/runs");
  const run = runs[0];
  if (!run) return { run: null, pages: [] };
  const { candidates } = await api("GET", `/admin/research/candidates?runId=${run.id}&entity=pin`);
  const details = await pool(candidates, 8, c => api("GET", `/admin/research/candidates/${c.id}`));
  const pins = details.map(({ candidate: c, evidence }) => {
    const research = evidence.filter(e => e.method !== "human_direct_check");
    const sources = {};
    for (const e of research) {
      const cls = e.source_class || "unclassified";
      (sources[cls] ??= new Set()).add(hostOf(e.source_url) || e.publisher || "?");
    }
    return {
      id: c.id, key: c.research_key, set: c.set_research_key, status: c.status, confidence: c.record_confidence,
      proposed: c.proposed, reasons: c.review_reasons ?? [], warnings: c.warnings ?? [],
      officialUrls: officialUrls(evidence),
      sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, [...v].sort()])),
      checks: evidence.filter(e => e.method === "human_direct_check").length,
    };
  });
  const bySet = new Map();
  for (const p of pins) { if (!bySet.has(p.set)) bySet.set(p.set, []); bySet.get(p.set).push(p); }
  for (const list of bySet.values()) {
    const page = setPage(list);
    for (const p of list) { p.page = page; p.citesPage = !!page && p.officialUrls.includes(page); }
  }
  const byPage = new Map();
  for (const p of pins) {
    const k = p.page ?? "(no official page)";
    if (!byPage.has(k)) byPage.set(k, []);
    byPage.get(k).push(p);
  }
  const pages = [...byPage.entries()].map(([url, list]) => ({ url, pins: list.sort((a, b) => a.key.localeCompare(b.key)) }))
    .sort((a, b) => (a.url.startsWith("(") - b.url.startsWith("(")) || b.pins.length - a.pins.length || a.url.localeCompare(b.url));
  return { run: { id: run.id, commit: run.git_commit, loadedAt: run.loaded_at }, pages };
}

/** One reviewer answer: a direct check (when the page shows the pin) and a decision. */
async function act({ id, action, sourceUrl, fields, note, approve }) {
  if (action === "match") {
    if (!Array.isArray(fields) || !fields.length) throw Object.assign(new Error("No confirmed fields"), { status: 400 });
    await api("POST", `/admin/research/candidates/${id}/direct-check`, { fields, sourceUrl, note: note?.slice(0, 240) || undefined });
    if (!approve) return { status: "direct_verified" };
    const d = await api("POST", `/admin/research/candidates/${id}/decision`, { decision: "approve", notes: note || null });
    return { status: d.status };
  }
  if (action === "off" || action === "absent" || action === "undo") {
    const d = await api("POST", `/admin/research/candidates/${id}/decision`, { decision: "needs_more_research", notes: note });
    return { status: d.status };
  }
  throw Object.assign(new Error("Unknown action"), { status: 400 });
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

http.createServer((req, res) => {
  let raw = "";
  req.on("data", c => { raw += c; if (raw.length > 1e5) req.destroy(); });
  req.on("end", async () => {
    try {
      // Only this machine, only this page.
      if (req.headers.host !== `localhost:${PORT}` && req.headers.host !== `127.0.0.1:${PORT}`) return send(res, 403, { error: "forbidden" });
      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
        return send(res, 200, fs.readFileSync(path.join(HERE, "index.html"), "utf8"), "text/html; charset=utf-8");
      }
      if (req.method !== "POST" && req.url !== "/api/data") return send(res, 404, { error: "not found" });
      if (req.method === "POST" && !String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, { error: "json only" });
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === "/api/login") {
        const r = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
          method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: body.email, password: body.password }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.access_token) return send(res, 401, { error: "Sign-in failed. Use your STAGING App Creator email and password." });
        token = j.access_token;
        await api("GET", "/admin/research/runs");   // proves App Creator access
        return send(res, 200, { ok: true });
      }
      if (!token) return send(res, 401, { error: "Sign in first" });
      if (req.url === "/api/data") return send(res, 200, await loadRun());
      if (req.url === "/api/act") return send(res, 200, await act(body));
      send(res, 404, { error: "not found" });
    } catch (e) {
      if (e.status === 401) token = null;
      send(res, e.status && e.status < 600 ? e.status : 500, { error: e.message || "failed" });
    }
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Pin check (staging ${ref.slice(0, 6)}…) → open http://localhost:${PORT}`);
  console.log("Leave this running while you review. Ctrl+C to stop.");
});
