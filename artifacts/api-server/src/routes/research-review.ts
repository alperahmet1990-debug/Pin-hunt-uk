/**
 * Research Review — staging for public-source catalogue research (migration 045).
 *
 * App Creator only. Loads research-engine runs into catalogue_* staging
 * tables, lets a reviewer record that they opened a source and confirmed a
 * pin, and records approve / reject / needs-more-research decisions.
 *
 * Deliberately NO import route: approved candidates are not written to `pins`
 * until a separately approved import step exists.
 *
 * POST /api/admin/research/runs/preview            validate a payload (no writes)
 * POST /api/admin/research/runs                    load a validated payload into staging
 * GET  /api/admin/research/runs                    recent runs
 * GET  /api/admin/research/candidates              review list (?runId&status&entity)
 * GET  /api/admin/research/candidates/:id          candidate + evidence + duplicate pin
 * POST /api/admin/research/candidates/:id/direct-check   reviewer confirmed fields from a source
 * POST /api/admin/research/candidates/:id/decision       approve | reject | needs_more_research
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import {
  IDENTITY_FIELDS,
  checkDecision,
  checkSourceUrl,
  validateResearchRun,
  type Decision,
} from "../lib/research-run";

const router: IRouter = Router();

interface CreatorRequest extends Request {
  creatorId?: string;
}

function getAnonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireAppCreator(req: CreatorRequest, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const { data: { user }, error } = await getAnonClient().auth.getUser(auth.slice(7));
    if (error || !user) { res.status(401).json({ error: "Invalid token" }); return; }
    const { data: profile } = await getAdminClient()
      .from("profiles").select("is_app_creator").eq("id", user.id).single();
    if (!profile?.is_app_creator) { res.status(403).json({ error: "App Creator access required" }); return; }
    req.creatorId = user.id;
    next();
  } catch {
    res.status(500).json({ error: "Auth check failed" });
  }
}

/** Generic client error; details stay in the server log. */
function fail(res: Response, where: string, err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  logger.error({ err, where }, "[research-review] failed");
  if (code === "42P01") {
    res.status(503).json({ error: "Research staging is not set up on this environment yet (migration 045)." });
    return;
  }
  res.status(500).json({ error: "Research review request failed" });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["researched", "needs_direct_verification", "direct_verified", "approved", "rejected",
  "needs_more_research", "imported", "superseded"]);
const OFFICIAL_HOST = /(^|\.)(disneystore\.[a-z.]+|shopdisney\.[a-z.]+|disney\.go\.com|disneylandparis\.com|disneyparksblog\.com|disney\.co\.uk)$/i;

// ── Runs ─────────────────────────────────────────────────────────────────────

router.post("/admin/research/runs/preview", requireAppCreator, (req: CreatorRequest, res: Response) => {
  const result = validateResearchRun(req.body?.run);
  if (!result.ok) { res.status(400).json({ ok: false, errors: result.errors }); return; }
  res.json({ ok: true, gitCommit: result.run.gitCommit, engineVersion: result.run.engineVersion, counts: result.run.counts });
});

router.post("/admin/research/runs", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const result = validateResearchRun(req.body?.run);
  if (!result.ok) { res.status(400).json({ ok: false, errors: result.errors }); return; }
  const { run } = result;
  const db = getAdminClient();
  let runId: string | null = null;
  try {
    const { data: runRow, error: runErr } = await db.from("catalogue_research_runs").insert({
      engine_version: run.engineVersion, git_commit: run.gitCommit, summary: run.counts,
      packet_hashes: [], loaded_by: req.creatorId, status: "loaded",
    }).select("id").single();
    if (runErr || !runRow) throw runErr ?? new Error("run insert returned nothing");
    runId = runRow.id as string;

    // Map duplicate pinhunt_ids to live pin UUIDs (read-only lookup).
    const dupIds = [...new Set(run.candidates.map(c => c.duplicate_pinhunt_id).filter((x): x is string => !!x))];
    const pinIdByPinhunt = new Map<string, string>();
    if (dupIds.length) {
      const { data: pins, error } = await db.from("pins").select("id, pinhunt_id").in("pinhunt_id", dupIds);
      if (error) throw error;
      for (const p of pins ?? []) pinIdByPinhunt.set(p.pinhunt_id as string, p.id as string);
    }

    const candidateIdByKey = new Map<string, string>();
    for (let i = 0; i < run.candidates.length; i += 200) {
      const chunk = run.candidates.slice(i, i + 200).map(c => ({
        run_id: runId, research_key: c.research_key, entity_type: c.entity_type, set_research_key: c.set_research_key,
        proposed: c.proposed, record_confidence: c.record_confidence, engine_verified: c.engine_verified,
        review_reasons: c.review_reasons, warnings: c.warnings, duplicate_status: c.duplicate_status,
        duplicate_pin_id: c.duplicate_pinhunt_id ? pinIdByPinhunt.get(c.duplicate_pinhunt_id) ?? null : null,
        status: c.engine_verified ? "needs_direct_verification" : "researched",
      }));
      const { data, error } = await db.from("catalogue_candidates").insert(chunk).select("id, research_key");
      if (error) throw error;
      for (const r of data ?? []) candidateIdByKey.set(r.research_key as string, r.id as string);
    }

    const evidence = run.candidates.flatMap(c => c.evidence.map(e => ({
      candidate_id: candidateIdByKey.get(c.research_key), field: e.field, value: e.value,
      source_url: e.source_url, publisher: e.publisher, source_class: e.source_class,
      method: e.method, note: e.note, claim_ref: e.claim_ref,
    })));
    for (let i = 0; i < evidence.length; i += 1000) {
      const { error } = await db.from("catalogue_evidence").insert(evidence.slice(i, i + 1000));
      if (error) throw error;
    }
    res.json({ ok: true, runId, counts: run.counts });
  } catch (err) {
    // Never leave a half-loaded run behind: the cascade removes its candidates and evidence.
    if (runId) await db.from("catalogue_research_runs").delete().eq("id", runId);
    fail(res, "load run", err);
  }
});

router.get("/admin/research/runs", requireAppCreator, async (_req, res: Response) => {
  try {
    const { data, error } = await getAdminClient().from("catalogue_research_runs")
      .select("id, engine_version, git_commit, summary, status, loaded_at").order("loaded_at", { ascending: false }).limit(20);
    if (error) throw error;
    res.json({ runs: data ?? [] });
  } catch (err) { fail(res, "list runs", err); }
});

// ── Candidates ───────────────────────────────────────────────────────────────

router.get("/admin/research/candidates", requireAppCreator, async (req, res: Response) => {
  const { runId, status, entity } = req.query as Record<string, string | undefined>;
  if (runId && !UUID.test(runId)) { res.status(400).json({ error: "runId invalid" }); return; }
  if (status && !STATUSES.has(status)) { res.status(400).json({ error: "status invalid" }); return; }
  if (entity && entity !== "pin" && entity !== "set") { res.status(400).json({ error: "entity invalid" }); return; }
  try {
    let q = getAdminClient().from("catalogue_candidates")
      .select("id, run_id, research_key, entity_type, set_research_key, proposed, record_confidence, engine_verified, review_reasons, warnings, duplicate_status, status, direct_verified_at, decided_at")
      .order("research_key").limit(1000);
    if (runId) q = q.eq("run_id", runId);
    if (status) q = q.eq("status", status);
    if (entity) q = q.eq("entity_type", entity);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ candidates: data ?? [] });
  } catch (err) { fail(res, "list candidates", err); }
});

router.get("/admin/research/candidates/:id", requireAppCreator, async (req, res: Response) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) { res.status(400).json({ error: "id invalid" }); return; }
  try {
    const db = getAdminClient();
    const { data: candidate, error } = await db.from("catalogue_candidates").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!candidate) { res.status(404).json({ error: "Candidate not found" }); return; }
    const { data: evidence, error: evErr } = await db.from("catalogue_evidence")
      .select("id, field, value, source_url, publisher, source_class, method, note, checked_by, created_at")
      .eq("candidate_id", id).order("field").limit(2000);
    if (evErr) throw evErr;
    let duplicatePin: Record<string, unknown> | null = null;
    if (candidate.duplicate_pin_id) {
      const { data: pin } = await db.from("pins")
        .select("pinhunt_id, title, collection, main_character, all_characters, release_year, edition_type, limited_edition_size, image_url")
        .eq("id", candidate.duplicate_pin_id).maybeSingle();
      duplicatePin = pin ?? null;
    }
    res.json({ candidate, evidence: evidence ?? [], duplicatePin });
  } catch (err) { fail(res, "get candidate", err); }
});

router.post("/admin/research/candidates/:id/direct-check", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) { res.status(400).json({ error: "id invalid" }); return; }
  const { fields, sourceUrl, note } = (req.body ?? {}) as { fields?: unknown; sourceUrl?: unknown; note?: unknown };
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 30 || !fields.every(f => typeof f === "string" && /^[a-z_]{2,40}$/.test(f))) {
    res.status(400).json({ error: "Choose at least one field you confirmed" }); return;
  }
  const urlProblem = typeof sourceUrl === "string" && sourceUrl.startsWith("https://") ? checkSourceUrl(sourceUrl) : "Paste the https link of the page you opened";
  if (urlProblem) { res.status(400).json({ error: urlProblem }); return; }
  if (note != null && (typeof note !== "string" || note.length > 240)) { res.status(400).json({ error: "Note must be 240 characters or fewer" }); return; }
  try {
    const db = getAdminClient();
    const { data: c, error } = await db.from("catalogue_candidates").select("id, entity_type, status, proposed").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
    if (["imported", "superseded"].includes(c.status as string)) { res.status(409).json({ error: "This candidate can no longer be changed" }); return; }
    const host = new URL(sourceUrl as string).hostname;
    const rows = (fields as string[]).map(f => ({
      candidate_id: id, field: f, value: { confirmed: true },
      source_url: sourceUrl, publisher: host.replace(/^www\./, ""),
      source_class: OFFICIAL_HOST.test(host) ? "official" : "unclassified",
      method: "human_direct_check", note: (note as string | undefined) ?? null, checked_by: req.creatorId,
    }));
    const { error: insErr } = await db.from("catalogue_evidence").insert(rows);
    if (insErr) throw insErr;
    const confirmsIdentity = (fields as string[]).some(f => IDENTITY_FIELDS.includes(f));
    let status = c.status as string;
    if (confirmsIdentity && c.entity_type === "pin" && ["researched", "needs_direct_verification", "needs_more_research"].includes(status)) {
      const { error: upErr } = await db.from("catalogue_candidates").update({
        status: "direct_verified", direct_verified_by: req.creatorId, direct_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (upErr) throw upErr;
      status = "direct_verified";
    }
    res.json({ ok: true, status, recorded: rows.length });
  } catch (err) { fail(res, "direct check", err); }
});

router.post("/admin/research/candidates/:id/decision", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) { res.status(400).json({ error: "id invalid" }); return; }
  const { decision, notes } = (req.body ?? {}) as { decision?: unknown; notes?: unknown };
  if (notes != null && (typeof notes !== "string" || notes.length > 2000)) { res.status(400).json({ error: "Notes are too long" }); return; }
  try {
    const db = getAdminClient();
    const { data: c, error } = await db.from("catalogue_candidates")
      .select("id, entity_type, status, record_confidence, review_reasons, warnings, direct_verified_by").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
    const problem = checkDecision({
      decision: decision as Decision, notes: (notes as string | null) ?? null,
      candidate: {
        entity_type: c.entity_type as string, status: c.status as string, record_confidence: c.record_confidence as string,
        review_reasons: (c.review_reasons as string[]) ?? [], warnings: (c.warnings as string[]) ?? [],
        direct_verified_by: (c.direct_verified_by as string | null) ?? null,
      },
    });
    if (problem) { res.status(409).json({ error: problem }); return; }
    const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "needs_more_research";
    const { error: upErr } = await db.from("catalogue_candidates").update({
      status, decided_by: req.creatorId, decided_at: new Date().toISOString(),
      decision_notes: (notes as string | null) ?? null, updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (upErr) throw upErr;
    res.json({ ok: true, status });
  } catch (err) { fail(res, "decision", err); }
});

export default router;
