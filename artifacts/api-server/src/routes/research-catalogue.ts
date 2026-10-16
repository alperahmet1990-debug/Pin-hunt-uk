/**
 * Research Review — catalogue browse (historical backfill review). App Creator only.
 *
 * Extends the Research Review API (research-review.ts, migration 045) for reviewing large research
 * runs. No new tables: decisions use the existing candidate statuses, and a flagged issue is an
 * evidence row (field "flag", method human_direct_check) attributed to the reviewer.
 *
 * GET  /api/admin/research/catalogue?runId&year&line&edition&status&set&q&source&only&offset&limit
 *        filtered, paged pins plus facet counts (only = flagged | duplicates | incomplete)
 * GET  /api/admin/research/catalogue/sets?runId&only=incomplete      set completeness
 * POST /api/admin/research/catalogue/decisions  { candidateIds[], decision, notes }   batch decision
 * POST /api/admin/research/candidates/:id/flag  { note }                            flag an issue
 * GET  /api/admin/research/catalogue/research-needed?runId   export for the hourly research queue
 * POST /api/admin/research/catalogue/checks  { runId, file (base64 .xlsx) | checks[] }   reviewer's spreadsheet checks
 *
 * Spreadsheet checks are recorded under the logged-in reviewer: "OK" is that reviewer's direct check
 * against the source the workbook listed, the other marks become research-needed decisions or flags.
 * Nothing is approved here; the response lists the pins that are now ready, and the reviewer approves
 * them with the batch decision route.
 *
 * Batch decisions re-run checkDecision per pin: "Validate" (approve) still requires a direct check
 * by a person, so nothing is approved in bulk without its own evidence.
 */
import { Router, type IRouter, type Response } from "express";
import { IDENTITY_FIELDS, checkDecision, checkSourceUrl, type Decision } from "../lib/research-run";
import { MAX_CHECKS, checksFromWorkbook, normaliseChecks, type ReviewerCheck } from "../lib/reviewer-checks";
import { UUID, fail, getAdminClient, isOfficialHost, requireAppCreator, type CreatorRequest } from "./research-review";

const router: IRouter = Router();

const PAGE = 1000;
const CHUNK = 100;
const MAX_LIMIT = 200;
const MAX_BATCH = 100;
const LINES = new Set(["wdw", "dlr", "dlp", "dsuk", "dsus", "shdr", "hkdl", "tdr", "lic", "other"]);
const EDITIONS = new Set(["OE", "LE", "LR", "other"]);
const STATUSES = new Set(["researched", "needs_direct_verification", "direct_verified", "approved", "rejected",
  "needs_more_research", "imported", "superseded"]);
const DUP_REASON = /^(possible duplicate|possible cross-set duplicate|possible internal duplicate|probable duplicate)/i;

type Row = Record<string, unknown>;
type Cand = Row & { id: string; research_key: string; set_research_key: string | null; proposed: Row; status: string };

export function editionOf(p: Row): "OE" | "LE" | "LR" | "other" {
  const e = String(p["Edition type"] ?? "").toLowerCase();
  if (e.startsWith("open")) return "OE";
  if (e.includes("limited edition")) return "LE";
  if (e.includes("limited release")) return "LR";
  return "other";
}
export function lineOf(key: string): string {
  const head = key.split("/")[0];
  return LINES.has(head) ? head : "other";
}
export function yearOf(key: string, p: Row): number | null {
  const y = Number(p["Release year"] ?? String(p["Release date"] ?? "").slice(0, 4));
  if (Number.isInteger(y) && y > 1900) return y;
  const m = /\/(\d{4})\//.exec(`${key}/`);
  return m ? Number(m[1]) : null;
}
export function isDuplicate(c: Row): boolean {
  return ["DUPLICATE", "PROBABLE DUPLICATE"].includes(String(c.duplicate_status))
    || ((c.review_reasons as string[]) ?? []).some(r => DUP_REASON.test(r));
}

/** All pin candidates of a run (or every run), read in pages so large runs are never truncated. */
async function allPins(runId: string | undefined, cols: string): Promise<Row[]> {
  const db = getAdminClient();
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from("catalogue_candidates").select(cols).eq("entity_type", "pin");
    if (runId) q = q.eq("run_id", runId);
    const { data, error } = await q.order("research_key").range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Evidence rows for many candidates, read in chunks. */
async function evidenceFor(ids: string[], cols: string, field?: string): Promise<Row[]> {
  const db = getAdminClient();
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    let q = db.from("catalogue_evidence").select(cols).in("candidate_id", ids.slice(i, i + CHUNK));
    if (field) q = q.eq("field", field);
    const { data, error } = await q.limit(5000);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Row[]));
  }
  return out;
}

function setStats(pins: Row[]) {
  const sets = new Map<string, { expected: number | null; identified: number; name: string; verified: number; flaggedDup: number }>();
  for (const c of pins) {
    const k = c.set_research_key as string | null;
    if (!k) continue;
    const p = (c.proposed as Row) ?? {};
    const s = sets.get(k) ?? { expected: null, identified: 0, name: String(p["Collection name"] ?? k), verified: 0, flaggedDup: 0 };
    const exp = Number(p["Expected pin count"]);
    if (Number.isInteger(exp) && exp > 0) s.expected = Math.max(s.expected ?? 0, exp);
    s.identified += 1;
    if (["direct_verified", "approved", "imported"].includes(String(c.status))) s.verified += 1;
    if (isDuplicate(c)) s.flaggedDup += 1;
    sets.set(k, s);
  }
  return sets;
}

router.get("/admin/research/catalogue", requireAppCreator, async (req, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  if (q.runId && !UUID.test(q.runId)) { res.status(400).json({ error: "runId invalid" }); return; }
  if (q.line && !LINES.has(q.line)) { res.status(400).json({ error: "line invalid" }); return; }
  if (q.edition && !EDITIONS.has(q.edition)) { res.status(400).json({ error: "edition invalid" }); return; }
  if (q.status && !STATUSES.has(q.status)) { res.status(400).json({ error: "status invalid" }); return; }
  if (q.year && !/^\d{4}$/.test(q.year)) { res.status(400).json({ error: "year invalid" }); return; }
  if (q.only && !["flagged", "duplicates", "incomplete"].includes(q.only)) { res.status(400).json({ error: "only invalid" }); return; }
  const offset = Math.max(0, Number(q.offset ?? 0) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit ?? 50) || 50));
  try {
    const pins = await allPins(q.runId, "id, research_key, set_research_key, proposed, status, record_confidence, review_reasons, warnings, duplicate_status, decision_notes");
    const ids = pins.map(c => c.id as string);
    const flags = new Map<string, string[]>();
    for (const e of await evidenceFor(ids, "candidate_id, value", "flag")) {
      const list = flags.get(e.candidate_id as string) ?? [];
      list.push(String((e.value as Row)?.issue ?? ""));
      flags.set(e.candidate_id as string, list);
    }
    let sourceIds: Set<string> | null = null;
    if (q.source) {
      const needle = q.source.toLowerCase();
      sourceIds = new Set((await evidenceFor(ids, "candidate_id, source_url"))
        .filter(e => String(e.source_url ?? "").toLowerCase().includes(needle)).map(e => e.candidate_id as string));
    }
    const sets = setStats(pins);
    const text = (q.q ?? "").toLowerCase();
    const rows = (pins as Cand[]).map(c => {
      const p = c.proposed ?? {};
      const k = c.set_research_key as string | null;
      const s = k ? sets.get(k) : undefined;
      return {
        ...c, year: yearOf(c.research_key as string, p), line: lineOf(c.research_key as string), edition: editionOf(p),
        flags: flags.get(c.id as string) ?? [], duplicate: isDuplicate(c),
        set_expected: s?.expected ?? null, set_identified: s?.identified ?? null,
      };
    });
    const base = rows.filter(r =>
      (!q.year || r.year === Number(q.year)) && (!q.line || r.line === q.line) && (!q.edition || r.edition === q.edition)
      && (!q.set || r.set_research_key === q.set) && (!sourceIds || sourceIds.has(r.id))
      && (!text || `${r.research_key} ${r.proposed["Pin name"] ?? ""} ${r.proposed["Characters"] ?? ""}`.toLowerCase().includes(text))
      && (q.only !== "flagged" || r.flags.length > 0) && (q.only !== "duplicates" || r.duplicate)
      && (q.only !== "incomplete" || (r.set_expected != null && (r.set_identified ?? 0) < r.set_expected)));
    const filtered = base.filter(r => !q.status || r.status === q.status);
    const facet = (f: (r: typeof rows[number]) => unknown) => {
      const m: Record<string, number> = {};
      for (const r of base) { const v = String(f(r) ?? "none"); m[v] = (m[v] ?? 0) + 1; }
      return m;
    };
    res.json({
      total: filtered.length, offset, limit, candidates: filtered.slice(offset, offset + limit),
      facets: { status: facet(r => r.status), year: facet(r => r.year), line: facet(r => r.line), edition: facet(r => r.edition) },
    });
  } catch (err) { fail(res, "catalogue browse", err); }
});

router.get("/admin/research/catalogue/sets", requireAppCreator, async (req, res: Response) => {
  const { runId, only } = req.query as Record<string, string | undefined>;
  if (runId && !UUID.test(runId)) { res.status(400).json({ error: "runId invalid" }); return; }
  try {
    const sets = setStats(await allPins(runId, "id, set_research_key, proposed, status, review_reasons, duplicate_status"));
    let list = [...sets.entries()].map(([key, s]) => ({
      set_research_key: key, name: s.name, expected: s.expected, identified: s.identified,
      missing: s.expected != null ? Math.max(0, s.expected - s.identified) : null, verified: s.verified, possible_duplicates: s.flaggedDup,
    }));
    if (only === "incomplete") list = list.filter(s => (s.missing ?? 0) > 0);
    list.sort((a, b) => (b.missing ?? 0) - (a.missing ?? 0) || a.set_research_key.localeCompare(b.set_research_key));
    res.json({ sets: list });
  } catch (err) { fail(res, "catalogue sets", err); }
});

router.post("/admin/research/catalogue/decisions", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const { candidateIds, decision, notes } = (req.body ?? {}) as { candidateIds?: unknown; decision?: unknown; notes?: unknown };
  if (!Array.isArray(candidateIds) || candidateIds.length === 0 || candidateIds.length > MAX_BATCH
    || !candidateIds.every(x => typeof x === "string" && UUID.test(x)) || new Set(candidateIds).size !== candidateIds.length) {
    res.status(400).json({ error: `Select between 1 and ${MAX_BATCH} different pins` }); return;
  }
  if (!["approve", "reject", "needs_more_research"].includes(decision as string)) { res.status(400).json({ error: "Unknown decision" }); return; }
  if (notes != null && (typeof notes !== "string" || notes.length > 2000)) { res.status(400).json({ error: "Notes are too long" }); return; }
  try {
    const db = getAdminClient();
    const results: Array<{ candidateId: string; ok: boolean; status?: string; reason?: string }> = [];
    for (const id of candidateIds as string[]) {
      const { data: c, error } = await db.from("catalogue_candidates")
        .select("id, entity_type, status, record_confidence, review_reasons, warnings, direct_verified_by").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!c) { results.push({ candidateId: id, ok: false, reason: "Candidate not found" }); continue; }
      const problem = checkDecision({
        decision: decision as Decision, notes: (notes as string | null) ?? null,
        candidate: {
          entity_type: c.entity_type as string, status: c.status as string, record_confidence: c.record_confidence as string,
          review_reasons: (c.review_reasons as string[]) ?? [], warnings: (c.warnings as string[]) ?? [],
          direct_verified_by: (c.direct_verified_by as string | null) ?? null,
        },
      });
      if (problem) { results.push({ candidateId: id, ok: false, reason: problem }); continue; }
      const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "needs_more_research";
      const now = new Date().toISOString();
      const { data: updated, error: upErr } = await db.from("catalogue_candidates").update({
        status, decided_by: req.creatorId, decided_at: now, decision_notes: (notes as string | null) ?? null, updated_at: now,
      }).eq("id", id).eq("status", c.status as string).select("id");
      if (upErr) throw upErr;
      results.push(updated?.length ? { candidateId: id, ok: true, status } : { candidateId: id, ok: false, reason: "Changed while you were deciding. Reload and try again." });
    }
    res.json({ ok: true, results, decided: results.filter(r => r.ok).length });
  } catch (err) { fail(res, "batch decision", err); }
});

router.post("/admin/research/candidates/:id/flag", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) { res.status(400).json({ error: "id invalid" }); return; }
  const { note } = (req.body ?? {}) as { note?: unknown };
  if (typeof note !== "string" || note.trim().length < 3 || note.length > 240) { res.status(400).json({ error: "Describe the issue (3–240 characters)" }); return; }
  try {
    const db = getAdminClient();
    const { data: c, error } = await db.from("catalogue_candidates").select("id, status").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
    const { error: insErr } = await db.from("catalogue_evidence").insert({
      candidate_id: id, field: "flag", value: { issue: note.trim() }, source_url: null, publisher: null,
      source_class: "none", method: "human_direct_check", note: note.trim().slice(0, 240), checked_by: req.creatorId,
    });
    if (insErr) throw insErr;
    res.json({ ok: true });
  } catch (err) { fail(res, "flag", err); }
});

router.get("/admin/research/catalogue/research-needed", requireAppCreator, async (req, res: Response) => {
  const { runId } = req.query as Record<string, string | undefined>;
  if (runId && !UUID.test(runId)) { res.status(400).json({ error: "runId invalid" }); return; }
  try {
    const pins = await allPins(runId, "id, research_key, set_research_key, proposed, status, decision_notes, decided_at");
    const flags = new Map<string, string[]>();
    for (const e of await evidenceFor(pins.map(c => c.id as string), "candidate_id, value", "flag")) {
      const list = flags.get(e.candidate_id as string) ?? [];
      list.push(String((e.value as Row)?.issue ?? ""));
      flags.set(e.candidate_id as string, list);
    }
    const items = pins
      .filter(c => c.status === "needs_more_research" || flags.has(c.id as string))
      .map(c => {
        const p = (c.proposed as Row) ?? {};
        return {
          research_key: c.research_key, set_research_key: c.set_research_key, pin_name: p["Pin name"] ?? null,
          year: yearOf(c.research_key as string, p), line: lineOf(c.research_key as string), status: c.status,
          notes: c.decision_notes ?? null, flags: flags.get(c.id as string) ?? [], decided_at: c.decided_at ?? null,
        };
      });
    res.json({ format: "pinhunt-research-needed-v1", generated_at: new Date().toISOString(), run_id: runId ?? null, count: items.length, items });
  } catch (err) { fail(res, "research needed", err); }
});

const MAX_FILE_BASE64 = 14_000_000;
const CHECKABLE = ["researched", "needs_direct_verification", "needs_more_research"];
const PROPOSED_FIELD: Record<string, string> = { characters: "Characters", main_character: "Main character", attraction: "Attraction", pin_name: "Pin name" };
const SHEET_NOTE = "Spreadsheet check";

router.post("/admin/research/catalogue/checks", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const { runId, file, checks: rawChecks } = (req.body ?? {}) as { runId?: unknown; file?: unknown; checks?: unknown };
  if (typeof runId !== "string" || !UUID.test(runId)) { res.status(400).json({ error: "Choose a research run first" }); return; }
  let parsed: { checks: ReviewerCheck[]; unrecognised: string[] };
  try {
    if (typeof file === "string") {
      if (file.length > MAX_FILE_BASE64) { res.status(413).json({ error: "The workbook is too large (10 MB maximum)" }); return; }
      parsed = checksFromWorkbook(Buffer.from(file, "base64"));
    } else if (Array.isArray(rawChecks)) {
      parsed = normaliseChecks(rawChecks as Array<Record<string, unknown>>);
    } else { res.status(400).json({ error: "Upload the checked workbook" }); return; }
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Could not read the workbook" }); return; }
  if (parsed.checks.length === 0) { res.status(400).json({ error: 'No checks found: fill in the "My check" column (OK, Wrong, Duplicate, Not a pin, Research needed)' }); return; }
  if (parsed.checks.length > MAX_CHECKS) { res.status(400).json({ error: `At most ${MAX_CHECKS} checks per upload` }); return; }
  try {
    const db = getAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const pins = await allPins(runId, "id, research_key, status, entity_type, proposed, record_confidence, review_reasons, warnings, direct_verified_by");
    const byKey = new Map(pins.map(c => [c.research_key as string, c as Cand]));
    const matched = parsed.checks.filter(c => byKey.has(c.research_key));
    const unknown = parsed.checks.filter(c => !byKey.has(c.research_key)).map(c => c.research_key);
    const ids = matched.map(c => byKey.get(c.research_key)!.id);
    const evidence = await evidenceFor(ids, "candidate_id, field, source_url, method, checked_by, note");
    const mine = new Set(evidence.filter(e => e.method === "human_direct_check" && e.checked_by === req.creatorId
      && String(e.note ?? "").startsWith(SHEET_NOTE)).map(e => `${e.candidate_id}|${e.field}`));
    const sourceOf = new Map<string, string>();
    for (const e of evidence) {
      const u = e.source_url as string | null;
      if (e.method !== "human_direct_check" && u && !sourceOf.has(e.candidate_id as string) && !checkSourceUrl(u)) sourceOf.set(e.candidate_id as string, u);
    }
    const recorded = { ok: 0, research_needed: 0, flagged: 0 };
    let alreadyRecorded = 0;
    const held: Array<{ research_key: string; reason: string }> = [];
    const okRows: Row[] = [];
    const verify: string[] = [];
    for (const ck of matched) {
      const c = byKey.get(ck.research_key)!;
      if (["imported", "superseded"].includes(c.status)) { held.push({ research_key: ck.research_key, reason: "Can no longer be changed" }); continue; }
      const label = ck.check === "ok" ? "OK" : ck.check[0].toUpperCase() + ck.check.slice(1);
      const note = `${SHEET_NOTE} ${today}: ${label}${ck.note ? ` (${ck.note})` : ""}`.slice(0, 240);
      if (ck.check === "ok") {
        const url = sourceOf.get(c.id);
        if (!url) { held.push({ research_key: ck.research_key, reason: "No usable source link to record the check against" }); continue; }
        const p = c.proposed ?? {};
        const fields = IDENTITY_FIELDS.filter(f => p[PROPOSED_FIELD[f]] != null && p[PROPOSED_FIELD[f]] !== "");
        const todo = (fields.length ? fields : ["characters"]).filter(f => !mine.has(`${c.id}|${f}`));
        if (!todo.length) alreadyRecorded += 1;
        const host = new URL(url).hostname;
        for (const f of todo) okRows.push({
          candidate_id: c.id, field: f, value: { confirmed: true }, source_url: url, publisher: host.replace(/^www\./, ""),
          source_class: isOfficialHost(host.toLowerCase()) ? "official" : "unclassified",
          method: "human_direct_check", note, checked_by: req.creatorId,
        });
        if (c.entity_type === "pin" && CHECKABLE.includes(c.status)) verify.push(c.id);
        if (todo.length) recorded.ok += 1;
      } else if (ck.check === "wrong" || ck.check === "research needed") {
        if (c.status === "needs_more_research") { alreadyRecorded += 1; continue; }
        const now = new Date().toISOString();
        const { error } = await db.from("catalogue_candidates").update({
          status: "needs_more_research", decided_by: req.creatorId, decided_at: now, decision_notes: note, updated_at: now,
        }).eq("id", c.id).eq("status", c.status);
        if (error) throw error;
        recorded.research_needed += 1;
      } else {
        if (mine.has(`${c.id}|flag`)) { alreadyRecorded += 1; continue; }
        okRows.push({ candidate_id: c.id, field: "flag", value: { issue: note }, source_url: null, publisher: null,
          source_class: "none", method: "human_direct_check", note, checked_by: req.creatorId });
        recorded.flagged += 1;
      }
    }
    for (let i = 0; i < okRows.length; i += 500) {
      const { error } = await db.from("catalogue_evidence").insert(okRows.slice(i, i + 500));
      if (error) throw error;
    }
    for (let i = 0; i < verify.length; i += CHUNK) {
      const now = new Date().toISOString();
      const { error } = await db.from("catalogue_candidates").update({
        status: "direct_verified", direct_verified_by: req.creatorId, direct_verified_at: now, updated_at: now,
      }).in("id", verify.slice(i, i + CHUNK)).in("status", CHECKABLE);
      if (error) throw error;
    }
    // Which OK'd pins could be approved now? Same rules as a single decision; nothing is approved here.
    const okKeys = new Set(matched.filter(c => c.check === "ok").map(c => c.research_key));
    const fresh = (await allPins(runId, "id, research_key, status, entity_type, record_confidence, review_reasons, warnings, direct_verified_by, duplicate_status"))
      .filter(c => okKeys.has(c.research_key as string));
    const ready: Array<{ id: string; research_key: string }> = [];
    for (const c of fresh) {
      if (held.some(h => h.research_key === c.research_key)) continue;
      if (c.status === "approved") continue;
      // Possible duplicates are never approved in bulk; they are decided on their own page.
      if (isDuplicate(c)) { held.push({ research_key: c.research_key as string, reason: "Possible duplicate: decide on the pin's own page" }); continue; }
      const problem = checkDecision({ decision: "approve", notes: null, candidate: {
        entity_type: c.entity_type as string, status: c.status as string, record_confidence: c.record_confidence as string,
        review_reasons: (c.review_reasons as string[]) ?? [], warnings: (c.warnings as string[]) ?? [],
        direct_verified_by: (c.direct_verified_by as string | null) ?? null,
      } });
      if (problem) held.push({ research_key: c.research_key as string, reason: problem });
      else ready.push({ id: c.id as string, research_key: c.research_key as string });
    }
    res.json({
      ok: true, checks: parsed.checks.length, matched: matched.length, recorded, alreadyRecorded,
      unknownCount: unknown.length, unknown: unknown.slice(0, 20), unrecognised: parsed.unrecognised.slice(0, 20),
      ready, heldCount: held.length, held: held.slice(0, 200),
    });
  } catch (err) { fail(res, "spreadsheet checks", err); }
});

export default router;
