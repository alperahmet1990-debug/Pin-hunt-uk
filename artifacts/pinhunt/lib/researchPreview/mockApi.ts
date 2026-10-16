/**
 * Research Review preview: an in-memory stand-in for the Research Review API (research-review.ts and
 * research-catalogue.ts in artifacts/api-server), built from research-engine run files.
 *
 * Used by the static web preview (lib/researchPreview/index.ts, scripts/build-research-preview.mjs); it
 * follows the same rules as the local preview server (scripts/research-review-preview.mjs). It never talks to Supabase or any other service. It mirrors the
 * server's decision rules closely enough to preview the screen; the API server stays the authority.
 */

type Row = Record<string, any>;
export interface RawCandidate {
  research_key: string; entity_type: string; set_research_key?: string | null; proposed: Row;
  record_confidence: string; engine_verified?: boolean; review_reasons?: string[]; warnings?: string[];
  duplicate_status?: string; evidence?: Row[];
}
interface Cand {
  id: string; run_id: string; research_key: string; entity_type: 'pin'; set_research_key: string | null; proposed: Row;
  record_confidence: string; engine_verified: boolean; review_reasons: string[]; warnings: string[]; duplicate_status: string;
  status: string; direct_verified_by: string | null; decision_notes: string | null; decided_at: string | null; evidence: Row[];
}
export interface SavedDecision { status: string; decision_notes: string | null; decided_at: string | null; review: Row[] }
export interface SavedDecisions { format: 'pinhunt-research-review-preview-v1'; saved_at: string; decisions: Record<string, SavedDecision> }
export interface PreviewCheck { research_key: string; check: string; note: string | null }

export const CHECK_VALUES = ['ok', 'wrong', 'duplicate', 'not a pin', 'research needed'];
const STATUSES = ['researched', 'needs_direct_verification', 'needs_more_research', 'direct_verified', 'approved', 'rejected'];
const CHECKABLE = ['researched', 'needs_direct_verification', 'needs_more_research'];
const LINES = new Set(['wdw', 'dlr', 'dlp', 'dsuk', 'dsus', 'shdr', 'hkdl', 'tdr', 'lic']);
const DUP = /^(possible duplicate|possible cross-set duplicate|possible internal duplicate|probable duplicate)/i;

/** Same validation as the API's normaliseChecks (reviewer-checks.ts): last check per key wins. */
export function normaliseChecks(raw: Array<{ research_key?: unknown; check?: unknown; note?: unknown }>) {
  const byKey = new Map<string, PreviewCheck>();
  const unrecognised: string[] = [];
  for (const r of raw) {
    const key = String(r.research_key ?? '').trim();
    const check = String(r.check ?? '').trim().toLowerCase();
    if (!key || !check) continue;
    if (key.length > 200 || !CHECK_VALUES.includes(check)) { unrecognised.push(`${key.slice(0, 80)}: ${check.slice(0, 40)}`); continue; }
    const note = r.note == null ? '' : String(r.note).trim();
    byKey.set(key, { research_key: key, check, note: note ? note.slice(0, 200) : null });
  }
  return { checks: [...byKey.values()], unrecognised };
}

/** Stable, UUID-shaped ids so a candidate keeps its id across reloads and devices. */
const idFor = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;

export function createMockApi(raw: RawCandidate[], runLabel = 'preview') {
  const RUN = '00000000-0000-4000-8000-0000000000aa';
  const merged = new Map<string, RawCandidate>();
  for (const c of raw) if (c.entity_type === 'pin') merged.set(c.research_key, c);
  let seq = 0;
  const cands: Cand[] = [...merged.values()].map((c, i) => ({
    id: idFor(i), run_id: RUN, research_key: c.research_key, entity_type: 'pin', set_research_key: c.set_research_key ?? null,
    proposed: c.proposed ?? {}, record_confidence: c.record_confidence, engine_verified: !!c.engine_verified,
    review_reasons: c.review_reasons ?? [], warnings: c.warnings ?? [], duplicate_status: c.duplicate_status ?? 'NEW',
    status: c.engine_verified ? 'needs_direct_verification' : 'researched', direct_verified_by: null,
    decision_notes: null, decided_at: null, evidence: (c.evidence ?? []).map(e => ({ id: `e${seq++}`, ...e })),
  }));
  const byId = new Map(cands.map(c => [c.id, c]));
  const byKey = new Map(cands.map(c => [c.research_key, c]));
  const initial = new Map(cands.map(c => [c.id, { status: c.status, n: c.evidence.length }]));

  const line = (k: string) => (LINES.has(k.split('/')[0]) ? k.split('/')[0] : 'other');
  const edition = (p: Row) => {
    const e = String(p['Edition type'] ?? '').toLowerCase();
    return e.startsWith('open') ? 'OE' : e.includes('limited edition') ? 'LE' : e.includes('limited release') ? 'LR' : 'other';
  };
  const year = (k: string, p: Row) => {
    const y = Number(p['Release year'] ?? String(p['Release date'] ?? '').slice(0, 4));
    if (y > 1900) return y;
    const m = /\/(\d{4})\//.exec(`${k}/`); return m ? Number(m[1]) : null;
  };
  const dup = (c: Cand) => ['DUPLICATE', 'PROBABLE DUPLICATE'].includes(c.duplicate_status) || c.review_reasons.some(r => DUP.test(r));
  const flags = (c: Cand) => c.evidence.filter(e => e.field === 'flag').map(e => e.value?.issue);
  const strip = ({ evidence: _e, ...c }: Cand) => c;
  const now = () => new Date().toISOString();
  function setStats() {
    const m = new Map<string, { expected: number | null; identified: number; name: string; verified: number; dup: number }>();
    for (const c of cands) {
      if (!c.set_research_key) continue;
      const s = m.get(c.set_research_key) ?? { expected: null, identified: 0, name: c.proposed['Collection name'] ?? c.set_research_key, verified: 0, dup: 0 };
      const e = Number(c.proposed['Expected pin count']); if (Number.isInteger(e) && e > 0) s.expected = Math.max(s.expected ?? 0, e);
      s.identified++; if (['direct_verified', 'approved'].includes(c.status)) s.verified++; if (dup(c)) s.dup++;
      m.set(c.set_research_key, s);
    }
    return m;
  }
  function decide(c: Cand, decision: string, notes: string | null) {
    if (!['approve', 'reject', 'needs_more_research'].includes(decision)) return 'Unknown decision';
    if (decision === 'approve') {
      if (c.status !== 'direct_verified') return "Open a source and confirm the pin's identity before approving";
      if (!['High', 'Medium'].includes(c.record_confidence)) return 'Identity confidence is too low to approve';
      if (c.review_reasons.some(r => r.startsWith('conflict:'))) return 'Resolve the conflicting values first';
    } else if (!notes || notes.trim().length < 3) return 'Add a short note explaining the decision';
    c.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_more_research';
    c.decision_notes = notes ?? null; c.decided_at = now();
    return null;
  }
  const review = (c: Cand, e: Row) => c.evidence.push({ id: `e${seq++}`, method: 'human_direct_check', checked_by: 'preview', ...e });

  function catalogue(q: Record<string, string>) {
    const sets = setStats(); const text = (q.q ?? '').toLowerCase(); const src = (q.source ?? '').toLowerCase();
    const rows = cands.map(c => {
      const s = c.set_research_key ? sets.get(c.set_research_key) : undefined;
      return { ...strip(c), year: year(c.research_key, c.proposed), line: line(c.research_key), edition: edition(c.proposed),
        flags: flags(c), duplicate: dup(c), set_expected: s?.expected ?? null, set_identified: s?.identified ?? null,
        _src: c.evidence.map(e => e.source_url ?? '').join(' ').toLowerCase() };
    });
    const base = rows.filter(r => (!q.year || r.year === Number(q.year)) && (!q.line || r.line === q.line) && (!q.edition || r.edition === q.edition)
      && (!q.set || r.set_research_key === q.set) && (!src || r._src.includes(src))
      && (!text || `${r.research_key} ${r.proposed['Pin name'] ?? ''} ${r.proposed.Characters ?? ''}`.toLowerCase().includes(text))
      && (q.only !== 'flagged' || r.flags.length > 0) && (q.only !== 'duplicates' || r.duplicate)
      && (q.only !== 'incomplete' || (r.set_expected != null && (r.set_identified ?? 0) < r.set_expected)));
    const filtered = base.filter(r => !q.status || r.status === q.status);
    const facet = (f: (r: Row) => unknown) => base.reduce<Record<string, number>>((a, r) => { const v = String(f(r) ?? 'none'); a[v] = (a[v] ?? 0) + 1; return a; }, {});
    const off = Number(q.offset ?? 0) || 0, lim = Math.min(200, Number(q.limit ?? 50) || 50);
    return { total: filtered.length, offset: off, limit: lim, candidates: filtered.slice(off, off + lim).map(({ _src, ...r }) => r),
      facets: { status: facet(r => r.status), year: facet(r => r.year), line: facet(r => r.line), edition: facet(r => r.edition) } };
  }

  function checks(list: PreviewCheck[], unrecognised: string[]) {
    if (!list.length) return [400, { error: 'No checks found: fill in the "My check" column (OK, Wrong, Duplicate, Not a pin, Research needed)' }] as const;
    const recorded = { ok: 0, research_needed: 0, flagged: 0 }; const held: Row[] = []; const ready: Row[] = []; let alreadyRecorded = 0;
    const note = (ck: PreviewCheck) => `Spreadsheet check ${now().slice(0, 10)}: ${ck.check}${ck.note ? ` (${ck.note})` : ''}`;
    for (const ck of list) {
      const c = byKey.get(ck.research_key); if (!c) continue;
      if (ck.check === 'ok') {
        const src = c.evidence.find(e => e.source_url && e.method !== 'human_direct_check');
        if (!src) { held.push({ research_key: c.research_key, reason: 'No usable source link to record the check against' }); continue; }
        if (c.evidence.some(e => e.method === 'human_direct_check' && String(e.note ?? '').startsWith('Spreadsheet check'))) alreadyRecorded++;
        else { review(c, { field: 'characters', value: { confirmed: true }, source_url: src.source_url, source_class: 'unclassified', note: note(ck) }); recorded.ok++; }
        if (CHECKABLE.includes(c.status)) { c.status = 'direct_verified'; c.direct_verified_by = 'preview'; c.decided_at = c.decided_at ?? now(); }
        if (c.status === 'approved') continue;
        if (dup(c)) held.push({ research_key: c.research_key, reason: "Possible duplicate: decide on the pin's own page" });
        else if (!['High', 'Medium'].includes(c.record_confidence)) held.push({ research_key: c.research_key, reason: 'Identity confidence is too low to approve' });
        else if (c.review_reasons.some(r => r.startsWith('conflict:'))) held.push({ research_key: c.research_key, reason: 'Resolve the conflicting values first' });
        else ready.push({ id: c.id, research_key: c.research_key });
      } else if (ck.check === 'wrong' || ck.check === 'research needed') {
        if (c.status === 'needs_more_research') { alreadyRecorded++; continue; }
        c.status = 'needs_more_research'; c.decision_notes = note(ck); c.decided_at = now(); recorded.research_needed++;
      } else {
        review(c, { field: 'flag', value: { issue: note(ck) }, source_url: null, source_class: 'none', note: note(ck) }); recorded.flagged++;
      }
    }
    const unknown = list.filter(ck => !byKey.has(ck.research_key)).map(ck => ck.research_key);
    return [200, { ok: true, checks: list.length, matched: list.length - unknown.length, recorded, alreadyRecorded,
      unknownCount: unknown.length, unknown: unknown.slice(0, 20), unrecognised: unrecognised.slice(0, 20),
      ready, heldCount: held.length, held: held.slice(0, 200) }] as const;
  }

  /** Handles one API call. `path` is the part after `/api`, query string included. */
  function handle(method: string, path: string, body: Row = {}): readonly [number, unknown] {
    const u = new URL(path, 'http://preview.local');
    const p = u.pathname.replace(/^\/api/, ''); const q = Object.fromEntries(u.searchParams);
    if (p === '/admin/research/runs' && method === 'GET') return [200, { runs: [{ id: RUN, git_commit: runLabel, loaded_at: now(), summary: { pins: cands.length } }] }];
    if (p === '/admin/research/candidates' && method === 'GET')
      return [200, { candidates: q.entity === 'set' ? [] : cands.filter(c => !q.status || c.status === q.status).slice(0, 1000).map(strip) }];
    let m = /^\/admin\/research\/candidates\/([^/]+)$/.exec(p);
    if (m) { const c = byId.get(m[1]); return c ? [200, { candidate: strip(c), evidence: c.evidence, duplicatePin: null }] : [404, { error: 'Candidate not found' }]; }
    m = /^\/admin\/research\/candidates\/([^/]+)\/direct-check$/.exec(p);
    if (m) {
      const c = byId.get(m[1]); if (!c) return [404, { error: 'Candidate not found' }];
      if (!Array.isArray(body.fields) || !body.fields.length) return [400, { error: 'Choose at least one field you confirmed' }];
      for (const f of body.fields) review(c, { field: f, value: { confirmed: true }, source_url: body.sourceUrl, source_class: 'unclassified', note: body.note ?? null });
      if (CHECKABLE.includes(c.status)) { c.status = 'direct_verified'; c.direct_verified_by = 'preview'; c.decided_at = c.decided_at ?? now(); }
      return [200, { ok: true, status: c.status }];
    }
    m = /^\/admin\/research\/candidates\/([^/]+)\/decision$/.exec(p);
    if (m) { const c = byId.get(m[1]); const err = c ? decide(c, body.decision, body.notes ?? null) : 'Candidate not found'; return err ? [409, { error: err }] : [200, { ok: true, status: c!.status }]; }
    m = /^\/admin\/research\/candidates\/([^/]+)\/flag$/.exec(p);
    if (m) {
      const c = byId.get(m[1]); if (!c) return [404, { error: 'Candidate not found' }];
      const note = String(body.note ?? '').trim();
      if (note.length < 3 || note.length > 240) return [400, { error: 'Describe the issue (3–240 characters)' }];
      review(c, { field: 'flag', value: { issue: note }, source_url: null, source_class: 'none', note }); c.decided_at = c.decided_at ?? now();
      return [200, { ok: true }];
    }
    if (p === '/admin/research/pages') return [200, { pages: [], total: 0 }];
    if (p === '/admin/research/catalogue') return [200, catalogue(q)];
    if (p === '/admin/research/catalogue/sets') {
      let list = [...setStats().entries()].map(([k, s]) => ({ set_research_key: k, name: s.name, expected: s.expected, identified: s.identified,
        missing: s.expected != null ? Math.max(0, s.expected - s.identified) : null, verified: s.verified, possible_duplicates: s.dup }));
      if (q.only === 'incomplete') list = list.filter(s => (s.missing ?? 0) > 0);
      return [200, { sets: list.sort((a, b) => (b.missing ?? 0) - (a.missing ?? 0)) }];
    }
    if (p === '/admin/research/catalogue/decisions') {
      const ids: string[] = Array.isArray(body.candidateIds) ? body.candidateIds : [];
      if (!ids.length || ids.length > 100) return [400, { error: 'Select between 1 and 100 different pins' }];
      const results = ids.map(id => { const c = byId.get(id); const err = c ? decide(c, body.decision, body.notes ?? null) : 'Candidate not found';
        return err ? { candidateId: id, ok: false, reason: err } : { candidateId: id, ok: true, status: c!.status }; });
      return [200, { ok: true, results, decided: results.filter(r => r.ok).length }];
    }
    if (p === '/admin/research/catalogue/checks') {
      if (!Array.isArray(body.checks)) return [400, { error: 'Upload the checked workbook' }];
      const parsed = normaliseChecks(body.checks);
      return checks(parsed.checks, [...(body.unrecognised ?? []), ...parsed.unrecognised]);
    }
    if (p === '/admin/research/catalogue/research-needed') {
      const items = cands.filter(c => c.status === 'needs_more_research' || flags(c).length).map(c => ({
        research_key: c.research_key, set_research_key: c.set_research_key, pin_name: c.proposed['Pin name'] ?? null,
        year: year(c.research_key, c.proposed), line: line(c.research_key), status: c.status, notes: c.decision_notes, flags: flags(c), decided_at: c.decided_at }));
      return [200, { format: 'pinhunt-research-needed-v1', generated_at: now(), run_id: RUN, count: items.length, items }];
    }
    return [404, { error: 'Not in the preview' }];
  }

  /** Reviewer decisions only (status changes, notes, flags and checks), keyed by research_key. */
  function snapshot(): SavedDecisions {
    const decisions: Record<string, SavedDecision> = {};
    for (const c of cands) {
      const init = initial.get(c.id)!;
      const added = c.evidence.slice(init.n).filter(e => e.method === 'human_direct_check');
      if (c.status !== init.status || c.decided_at || added.length) {
        decisions[c.research_key] = { status: c.status, decision_notes: c.decision_notes, decided_at: c.decided_at, review: added.map(({ id: _id, ...e }) => e) };
      }
    }
    return { format: 'pinhunt-research-review-preview-v1', saved_at: now(), decisions };
  }

  /** Applies saved decisions; unknown keys (e.g. from an older run) are skipped and counted. */
  function restore(saved: Partial<SavedDecisions> | null | undefined) {
    let applied = 0, skipped = 0;
    for (const [key, s] of Object.entries(saved?.decisions ?? {})) {
      const c = byKey.get(key);
      if (!c || !s || !STATUSES.includes(s.status)) { skipped++; continue; }
      c.status = s.status; c.decision_notes = typeof s.decision_notes === 'string' ? s.decision_notes.slice(0, 500) : null;
      c.decided_at = typeof s.decided_at === 'string' ? s.decided_at : null;
      // An imported decision replaces this pin's earlier preview checks rather than adding to them.
      c.evidence.length = initial.get(c.id)!.n;
      const rv = (Array.isArray(s.review) ? s.review : []).filter(e => e && typeof e === 'object').slice(0, 50);
      c.direct_verified_by = rv.length ? 'preview' : null;
      for (const e of rv) {
        const url = typeof e.source_url === 'string' && /^https?:\/\//i.test(e.source_url) ? e.source_url : null;
        c.evidence.push({ id: `e${seq++}`, ...e, source_url: url, method: 'human_direct_check' });
      }
      applied++;
    }
    return { applied, skipped };
  }

  return { handle, snapshot, restore, size: cands.length };
}
export type MockApi = ReturnType<typeof createMockApi>;
