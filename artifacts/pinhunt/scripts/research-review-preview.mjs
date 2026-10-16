#!/usr/bin/env node
// Research Review preview: the real admin screen (Expo web export, demo mode, no Supabase) served
// with a local mock of the Research Review API, loaded from a research-engine staging payload.
//
//   node scripts/research-review-preview.mjs <staging_payload.json> [--port 8787] [--skip-build]
//   then open http://localhost:8787/admin/research-review   (Mac browser, or iPad on the same network)
//
// Preview only: decisions are kept in memory and lost when the server stops. Nothing talks to
// Supabase or any external service. The demo account is an App Creator only in this build
// (EXPO_PUBLIC_DEMO_ADMIN=1, which lib/demoMode.ts ignores whenever Supabase is configured).

import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = Number(portIdx >= 0 ? args[portIdx + 1] : 8787);
const payloadPath = args.find((a, i) => !a.startsWith('--') && !(portIdx >= 0 && i === portIdx + 1));
if (!payloadPath) { console.error('usage: research-review-preview.mjs <staging_payload.json> [--port 8787] [--skip-build]'); process.exit(2); }
const outDir = path.join(os.tmpdir(), 'pinhunt-research-review-preview');

if (!args.includes('--skip-build')) {
  const env = { ...process.env, EXPO_PUBLIC_DEMO_MODE: '1', EXPO_PUBLIC_DEMO_ADMIN: '1', EXPO_PUBLIC_SUPABASE_URL: '',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: '', EXPO_PUBLIC_API_BASE_URL: '/api' };
  const r = spawnSync('pnpm', ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', outDir], { cwd: appDir, env, stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { console.error('expo export failed'); process.exit(1); }
}

// The workbook reader is the API server's own module (no copy), bundled for this script.
const readerOut = path.join(outDir, '..', 'pinhunt-preview-reviewer-checks.mjs');
const rb = spawnSync('pnpm', ['exec', 'esbuild', path.join(appDir, '..', 'api-server', 'src', 'lib', 'reviewer-checks.ts'),
  '--bundle', '--platform=node', '--format=esm', `--outfile=${readerOut}`], { cwd: path.join(appDir, '..', 'api-server'), stdio: ['ignore', 'ignore', 'inherit'] });
if (rb.status !== 0) { console.error('bundling the workbook reader failed'); process.exit(1); }
const { checksFromWorkbook, normaliseChecks } = await import(readerOut);

// ── In-memory research staging, from the engine payload ───────────────────
const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
const RUN = randomUUID();
const cands = payload.candidates.filter(c => c.entity_type === 'pin').map(c => ({
  id: randomUUID(), run_id: RUN, research_key: c.research_key, entity_type: 'pin', set_research_key: c.set_research_key ?? null,
  proposed: c.proposed, record_confidence: c.record_confidence, engine_verified: !!c.engine_verified,
  review_reasons: c.review_reasons ?? [], warnings: c.warnings ?? [], duplicate_status: c.duplicate_status ?? 'NEW',
  status: c.engine_verified ? 'needs_direct_verification' : 'researched', direct_verified_by: null, decision_notes: null, decided_at: null,
  evidence: (c.evidence ?? []).map(e => ({ id: randomUUID(), ...e })),
}));
const byId = new Map(cands.map(c => [c.id, c]));
const LINES = new Set(['wdw', 'dlr', 'dlp', 'dsuk', 'dsus', 'shdr', 'hkdl', 'tdr', 'lic']);
const line = k => (LINES.has(k.split('/')[0]) ? k.split('/')[0] : 'other');
const edition = p => { const e = String(p['Edition type'] ?? '').toLowerCase(); return e.startsWith('open') ? 'OE' : e.includes('limited edition') ? 'LE' : e.includes('limited release') ? 'LR' : 'other'; };
const year = (k, p) => { const y = Number(p['Release year'] ?? String(p['Release date'] ?? '').slice(0, 4)); if (y > 1900) return y; const m = /\/(\d{4})\//.exec(`${k}/`); return m ? Number(m[1]) : null; };
const dup = c => ['DUPLICATE', 'PROBABLE DUPLICATE'].includes(c.duplicate_status) || c.review_reasons.some(r => /^(possible duplicate|possible cross-set duplicate|possible internal duplicate|probable duplicate)/i.test(r));
const flags = c => c.evidence.filter(e => e.field === 'flag').map(e => e.value.issue);
function setStats() {
  const m = new Map();
  for (const c of cands) {
    if (!c.set_research_key) continue;
    const s = m.get(c.set_research_key) ?? { expected: null, identified: 0, name: c.proposed['Collection name'] ?? c.set_research_key, verified: 0, dup: 0 };
    const e = Number(c.proposed['Expected pin count']); if (Number.isInteger(e) && e > 0) s.expected = Math.max(s.expected ?? 0, e);
    s.identified++; if (['direct_verified', 'approved'].includes(c.status)) s.verified++; if (dup(c)) s.dup++;
    m.set(c.set_research_key, s);
  }
  return m;
}
const strip = ({ evidence, ...c }) => c;
function decide(c, decision, notes) {
  if (decision === 'approve') {
    if (c.status !== 'direct_verified') return 'Open a source and confirm the pin\'s identity before approving';
    if (!['High', 'Medium'].includes(c.record_confidence)) return 'Identity confidence is too low to approve';
    if (c.review_reasons.some(r => r.startsWith('conflict:'))) return 'Resolve the conflicting values first';
  } else if (!notes || notes.trim().length < 3) return 'Add a short note explaining the decision';
  c.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_more_research';
  c.decision_notes = notes ?? null; c.decided_at = new Date().toISOString();
  return null;
}

function api(req, url, body) {
  const p = url.pathname.replace(/^\/api/, ''); const q = Object.fromEntries(url.searchParams);
  if (p === '/admin/research/runs') return { runs: [{ id: RUN, git_commit: 'preview', loaded_at: new Date().toISOString(), summary: { pins: cands.length } }] };
  if (p === '/admin/research/candidates' && req.method === 'GET')
    return { candidates: q.entity === 'set' ? [] : cands.filter(c => !q.status || c.status === q.status).slice(0, 1000).map(strip) };
  let m = /^\/admin\/research\/candidates\/([^/]+)$/.exec(p);
  if (m) { const c = byId.get(m[1]); return c ? { candidate: strip(c), evidence: c.evidence, duplicatePin: null } : [404, { error: 'Candidate not found' }]; }
  m = /^\/admin\/research\/candidates\/([^/]+)\/direct-check$/.exec(p);
  if (m) { const c = byId.get(m[1]); if (!c) return [404, {}]; for (const f of body.fields ?? []) c.evidence.push({ id: randomUUID(), field: f, value: { confirmed: true }, source_url: body.sourceUrl, source_class: 'unclassified', method: 'human_direct_check', note: body.note ?? null }); if (['researched', 'needs_direct_verification', 'needs_more_research'].includes(c.status)) c.status = 'direct_verified'; return { ok: true, status: c.status }; }
  m = /^\/admin\/research\/candidates\/([^/]+)\/decision$/.exec(p);
  if (m) { const c = byId.get(m[1]); const err = c ? decide(c, body.decision, body.notes) : 'Candidate not found'; return err ? [409, { error: err }] : { ok: true, status: c.status }; }
  m = /^\/admin\/research\/candidates\/([^/]+)\/flag$/.exec(p);
  if (m) { const c = byId.get(m[1]); if (!body.note || body.note.trim().length < 3) return [400, { error: 'Describe the issue (3–240 characters)' }]; c.evidence.push({ id: randomUUID(), field: 'flag', value: { issue: body.note.trim() }, source_url: null, source_class: 'none', method: 'human_direct_check', note: body.note }); return { ok: true }; }
  if (p === '/admin/research/pages') return { pages: [], total: 0 };
  if (p === '/admin/research/catalogue') {
    const sets = setStats(); const text = (q.q ?? '').toLowerCase(); const src = (q.source ?? '').toLowerCase();
    const rows = cands.map(c => { const s = c.set_research_key ? sets.get(c.set_research_key) : null;
      return { ...strip(c), year: year(c.research_key, c.proposed), line: line(c.research_key), edition: edition(c.proposed), flags: flags(c), duplicate: dup(c),
        set_expected: s?.expected ?? null, set_identified: s?.identified ?? null, _src: c.evidence.map(e => e.source_url ?? '').join(' ').toLowerCase() }; });
    const base = rows.filter(r => (!q.year || r.year === Number(q.year)) && (!q.line || r.line === q.line) && (!q.edition || r.edition === q.edition)
      && (!q.set || r.set_research_key === q.set) && (!src || r._src.includes(src))
      && (!text || `${r.research_key} ${r.proposed['Pin name'] ?? ''} ${r.proposed.Characters ?? ''}`.toLowerCase().includes(text))
      && (q.only !== 'flagged' || r.flags.length) && (q.only !== 'duplicates' || r.duplicate) && (q.only !== 'incomplete' || (r.set_expected != null && r.set_identified < r.set_expected)));
    const filtered = base.filter(r => !q.status || r.status === q.status);
    const facet = f => base.reduce((a, r) => { const v = String(f(r) ?? 'none'); a[v] = (a[v] ?? 0) + 1; return a; }, {});
    const off = Number(q.offset ?? 0), lim = Math.min(200, Number(q.limit ?? 50));
    return { total: filtered.length, offset: off, limit: lim, candidates: filtered.slice(off, off + lim).map(({ _src, ...r }) => r),
      facets: { status: facet(r => r.status), year: facet(r => r.year), line: facet(r => r.line), edition: facet(r => r.edition) } };
  }
  if (p === '/admin/research/catalogue/sets') {
    let list = [...setStats().entries()].map(([k, s]) => ({ set_research_key: k, name: s.name, expected: s.expected, identified: s.identified,
      missing: s.expected != null ? Math.max(0, s.expected - s.identified) : null, verified: s.verified, possible_duplicates: s.dup }));
    if (q.only === 'incomplete') list = list.filter(s => s.missing > 0);
    return { sets: list.sort((a, b) => (b.missing ?? 0) - (a.missing ?? 0)) };
  }
  if (p === '/admin/research/catalogue/decisions') {
    const results = (body.candidateIds ?? []).map(id => { const c = byId.get(id); const err = c ? decide(c, body.decision, body.notes) : 'Candidate not found'; return err ? { candidateId: id, ok: false, reason: err } : { candidateId: id, ok: true, status: c.status }; });
    return { ok: true, results, decided: results.filter(r => r.ok).length };
  }
  if (p === '/admin/research/catalogue/checks') {
    let parsed;
    try { parsed = typeof body.file === 'string' ? checksFromWorkbook(Buffer.from(body.file, 'base64')) : normaliseChecks(body.checks ?? []); }
    catch (e) { return [400, { error: e.message }]; }
    if (!parsed.checks.length) return [400, { error: 'No checks found: fill in the "My check" column' }];
    const byKey = new Map(cands.map(c => [c.research_key, c]));
    const recorded = { ok: 0, research_needed: 0, flagged: 0 }; const held = []; const ready = []; let alreadyRecorded = 0;
    const note = ck => `Spreadsheet check ${new Date().toISOString().slice(0, 10)}: ${ck.check}${ck.note ? ` (${ck.note})` : ''}`;
    for (const ck of parsed.checks) {
      const c = byKey.get(ck.research_key); if (!c) continue;
      if (ck.check === 'ok') {
        const src = c.evidence.find(e => e.source_url && e.method !== 'human_direct_check');
        if (!src) { held.push({ research_key: c.research_key, reason: 'No usable source link to record the check against' }); continue; }
        if (c.evidence.some(e => e.method === 'human_direct_check' && String(e.note ?? '').startsWith('Spreadsheet check'))) alreadyRecorded++;
        else { c.evidence.push({ id: randomUUID(), field: 'characters', value: { confirmed: true }, source_url: src.source_url, source_class: 'unclassified', method: 'human_direct_check', note: note(ck) }); recorded.ok++; }
        if (['researched', 'needs_direct_verification', 'needs_more_research'].includes(c.status)) c.status = 'direct_verified';
        if (c.status === 'approved') continue;
        if (dup(c)) held.push({ research_key: c.research_key, reason: 'Possible duplicate: decide on the pin\'s own page' });
        else if (!['High', 'Medium'].includes(c.record_confidence)) held.push({ research_key: c.research_key, reason: 'Identity confidence is too low to approve' });
        else if (c.review_reasons.some(r => r.startsWith('conflict:'))) held.push({ research_key: c.research_key, reason: 'Resolve the conflicting values first' });
        else ready.push({ id: c.id, research_key: c.research_key });
      } else if (ck.check === 'wrong' || ck.check === 'research needed') { c.status = 'needs_more_research'; c.decision_notes = note(ck); recorded.research_needed++; }
      else { c.evidence.push({ id: randomUUID(), field: 'flag', value: { issue: note(ck) }, source_url: null, source_class: 'none', method: 'human_direct_check', note: note(ck) }); recorded.flagged++; }
    }
    const unknown = parsed.checks.filter(ck => !byKey.has(ck.research_key)).map(ck => ck.research_key);
    return { ok: true, checks: parsed.checks.length, matched: parsed.checks.length - unknown.length, recorded, alreadyRecorded,
      unknownCount: unknown.length, unknown: unknown.slice(0, 20), unrecognised: parsed.unrecognised.slice(0, 20), ready, heldCount: held.length, held: held.slice(0, 200) };
  }
  if (p === '/admin/research/catalogue/research-needed') {
    const items = cands.filter(c => c.status === 'needs_more_research' || flags(c).length).map(c => ({ research_key: c.research_key, pin_name: c.proposed['Pin name'] ?? null,
      year: year(c.research_key, c.proposed), line: line(c.research_key), status: c.status, notes: c.decision_notes, flags: flags(c) }));
    return { format: 'pinhunt-research-needed-v1', generated_at: new Date().toISOString(), run_id: RUN, count: items.length, items };
  }
  return [404, { error: 'Not in the preview mock' }];
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    let raw = ''; req.on('data', d => { raw += d; });
    req.on('end', () => {
      let out; try { out = api(req, url, raw ? JSON.parse(raw) : {}); } catch (e) { out = [500, { error: String(e) }]; }
      const [code, data] = Array.isArray(out) ? out : [200, out];
      res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
    });
    return;
  }
  let file = path.join(outDir, decodeURIComponent(url.pathname));
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(`${file}.html`) ? `${file}.html` : path.join(outDir, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`Research Review preview: http://localhost:${port}/admin/research-review  (${cands.length} pins from ${path.basename(payloadPath)}; decisions in memory only)`);
});
