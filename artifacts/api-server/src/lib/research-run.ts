/**
 * Validation for research-engine runs (research/catalogue-engine →
 * out/staging_payload.json) before they are loaded into the catalogue_*
 * staging tables (migration 045). Pure functions: no I/O.
 *
 * The engine already applies the source policy; this re-applies it on the
 * server so a hand-edited or stale payload can never put excluded or
 * malformed evidence into staging.
 */

export const RESEARCH_RUN_FORMAT = "pinhunt-research-run/v1";
export const MAX_CANDIDATES = 2000;
export const MAX_EVIDENCE = 50000;
export const MAX_EVIDENCE_PER_CANDIDATE = 500;

const EXCLUDED_HOST = /(^|\.)(pinandpop|pinpics|pintradingdb)\.com$/i;
const MARKETPLACE_HOST = /(^|\.)(ebay|mercari|amazon|etsy|vinted|depop|poshmark)\./i;
export const KEY_RE = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const FIELD_RE = /^[a-z_]{2,40}$/;
const CONFIDENCE = new Set(["High", "Medium", "Low", "Unverified"]);
const SOURCE_CLASS = new Set(["official", "news", "fan", "unclassified", "physical", "none"]);
const METHODS = new Set(["page_fetch", "search_snippet", "physical_pin", "editorial", "legacy_record"]);

export type Confidence = "High" | "Medium" | "Low" | "Unverified";

export interface EvidenceRow {
  field: string;
  value: unknown;
  source_url: string | null;
  publisher: string | null;
  source_class: string;
  method: string;
  note: string | null;
  claim_ref: string | null;
}

export interface CandidateRow {
  research_key: string;
  entity_type: "pin" | "set";
  set_research_key: string | null;
  proposed: Record<string, unknown>;
  record_confidence: Confidence;
  engine_verified: boolean;
  review_reasons: string[];
  warnings: string[];
  duplicate_status: string;
  duplicate_pinhunt_id: string | null;
  evidence: EvidenceRow[];
}

export interface ValidatedRun {
  gitCommit: string;
  engineVersion: string;
  candidates: CandidateRow[];
  counts: {
    pins: number; sets: number; evidence: number;
    engineVerified: number; needsReview: number; duplicates: number;
    byConfidence: Record<Confidence, number>;
  };
}

export type RunValidation = { ok: true; run: ValidatedRun } | { ok: false; errors: string[] };

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

const strList = (v: unknown, maxItems = 50, maxLen = 300): string[] | null =>
  Array.isArray(v) && v.length <= maxItems && v.every(x => typeof x === "string" && x.length <= maxLen) ? (v as string[]) : null;

/** https/http URL that is not an excluded database or a marketplace. */
export function checkSourceUrl(url: unknown): string | null {
  if (url === null || url === undefined) return null;
  if (typeof url !== "string" || url.length > 2000) return "source URL invalid";
  let u: URL;
  try { u = new URL(url); } catch { return "source URL invalid"; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "source URL must be http(s)";
  if (EXCLUDED_HOST.test(u.hostname)) return "excluded source (Pin & Pop / PinPics / PinTradingDB)";
  if (MARKETPLACE_HOST.test(u.hostname)) return "marketplace listings are not evidence";
  return null;
}

export function validateResearchRun(payload: unknown): RunValidation {
  const errors: string[] = [];
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return { ok: false, errors: ["payload must be a JSON object"] };
  if (p.format !== RESEARCH_RUN_FORMAT) errors.push(`format must be "${RESEARCH_RUN_FORMAT}"`);
  const gitCommit = typeof p.git_commit === "string" && /^[0-9a-f]{7,40}$/.test(p.git_commit) ? p.git_commit : null;
  if (!gitCommit) errors.push("git_commit must be a 7–40 character hex commit id");
  const engineVersion = str(p.engine_version, 100);
  if (!engineVersion) errors.push("engine_version is required");
  if (!Array.isArray(p.candidates) || p.candidates.length === 0) errors.push("candidates must be a non-empty array");
  if (errors.length) return { ok: false, errors };

  const raw = p.candidates as unknown[];
  if (raw.length > MAX_CANDIDATES) return { ok: false, errors: [`too many candidates (max ${MAX_CANDIDATES})`] };

  const seen = new Set<string>();
  const candidates: CandidateRow[] = [];
  let evidenceTotal = 0;
  raw.forEach((rc, i) => {
    const c = rc as Record<string, unknown>;
    const where = `candidate ${i + 1}`;
    const key = typeof c?.research_key === "string" && c.research_key.length <= 200 && KEY_RE.test(c.research_key) ? c.research_key : null;
    if (!key) { errors.push(`${where}: research_key invalid`); return; }
    if (seen.has(key)) { errors.push(`${where}: duplicate research_key ${key}`); return; }
    seen.add(key);
    const type = c.entity_type === "pin" || c.entity_type === "set" ? c.entity_type : null;
    const conf = typeof c.record_confidence === "string" && CONFIDENCE.has(c.record_confidence) ? (c.record_confidence as Confidence) : null;
    const setKey = c.set_research_key == null ? null
      : typeof c.set_research_key === "string" && KEY_RE.test(c.set_research_key) ? c.set_research_key : undefined;
    const proposed = c.proposed && typeof c.proposed === "object" && !Array.isArray(c.proposed) ? (c.proposed as Record<string, unknown>) : null;
    const reasons = strList(c.review_reasons ?? []);
    const warnings = strList(c.warnings ?? []);
    if (!type || !conf || setKey === undefined || !proposed || !reasons || !warnings) {
      errors.push(`${where} (${key}): entity_type, record_confidence, set_research_key, proposed, review_reasons or warnings invalid`);
      return;
    }
    if (JSON.stringify(proposed).length > 20000) { errors.push(`${where} (${key}): proposed too large`); return; }
    const dupId = c.duplicate_pinhunt_id == null ? null : (typeof c.duplicate_pinhunt_id === "string" && /^PHUK-[0-9A-Z]+$/i.test(c.duplicate_pinhunt_id) ? c.duplicate_pinhunt_id : undefined);
    if (dupId === undefined) { errors.push(`${where} (${key}): duplicate_pinhunt_id invalid`); return; }

    const evidence: EvidenceRow[] = [];
    if (Array.isArray(c.evidence) && c.evidence.length > MAX_EVIDENCE_PER_CANDIDATE) {
      errors.push(`${where} (${key}): too much evidence (max ${MAX_EVIDENCE_PER_CANDIDATE} rows per candidate)`);
      return;
    }
    for (const [j, re] of (Array.isArray(c.evidence) ? c.evidence : []).entries()) {
      const e = re as Record<string, unknown>;
      const at = `${where} (${key}) evidence ${j + 1}`;
      if (typeof e?.field !== "string" || !FIELD_RE.test(e.field)) { errors.push(`${at}: field invalid`); continue; }
      if (typeof e.method !== "string" || !METHODS.has(e.method)) { errors.push(`${at}: method invalid`); continue; }
      if (typeof e.source_class !== "string" || !SOURCE_CLASS.has(e.source_class)) { errors.push(`${at}: source_class invalid`); continue; }
      const urlProblem = checkSourceUrl(e.source_url);
      if (urlProblem) { errors.push(`${at}: ${urlProblem}`); continue; }
      if (e.value === undefined || JSON.stringify(e.value).length > 600) { errors.push(`${at}: value missing or too long`); continue; }
      if (e.note != null && (typeof e.note !== "string" || e.note.length > 240)) { errors.push(`${at}: note too long`); continue; }
      evidence.push({
        field: e.field, value: e.value, source_url: (e.source_url as string | null) ?? null,
        publisher: typeof e.publisher === "string" ? e.publisher.slice(0, 200) : null,
        source_class: e.source_class, method: e.method,
        note: (e.note as string | null) ?? null,
        claim_ref: typeof e.claim_ref === "string" ? e.claim_ref.slice(0, 40) : null,
      });
    }
    evidenceTotal += evidence.length;
    candidates.push({
      research_key: key, entity_type: type, set_research_key: setKey, proposed, record_confidence: conf,
      engine_verified: c.engine_verified === true && type === "pin", review_reasons: reasons, warnings,
      duplicate_status: typeof c.duplicate_status === "string" ? c.duplicate_status.slice(0, 80) : "NEW",
      duplicate_pinhunt_id: dupId, evidence,
    });
  });
  if (evidenceTotal > MAX_EVIDENCE) errors.push(`too much evidence (max ${MAX_EVIDENCE} rows)`);
  if (errors.length) return { ok: false, errors: errors.slice(0, 200) };

  const pins = candidates.filter(c => c.entity_type === "pin");
  const byConfidence = { High: 0, Medium: 0, Low: 0, Unverified: 0 } as Record<Confidence, number>;
  pins.forEach(c => { byConfidence[c.record_confidence] += 1; });
  return {
    ok: true,
    run: {
      gitCommit: gitCommit!, engineVersion: engineVersion!, candidates,
      counts: {
        pins: pins.length, sets: candidates.length - pins.length, evidence: evidenceTotal,
        engineVerified: pins.filter(c => c.engine_verified).length,
        needsReview: pins.filter(c => c.review_reasons.length > 0).length,
        duplicates: pins.filter(c => c.duplicate_status.startsWith("DUPLICATE") || c.duplicate_status.startsWith("PROBABLE")).length,
        byConfidence,
      },
    },
  };
}

// ── Approval rules (mirrored by the table constraints in migration 045) ──────

/** Fields whose human check establishes WHICH pin this is. */
export const IDENTITY_FIELDS = ["characters", "main_character", "attraction", "pin_name"];

/** Most pins one set-level check or decision may touch. */
export const MAX_SET_BATCH = 60;

/** Exact or probable duplicates of a live pin are never approved in bulk. */
export const isDuplicateStatus = (status: string | null | undefined) =>
  !!status && (status.startsWith("DUPLICATE") || status.startsWith("PROBABLE"));

export type Decision = "approve" | "reject" | "needs_more_research";

export interface DecisionInput {
  decision: Decision;
  notes: string | null;
  candidate: {
    entity_type: string;
    status: string;
    record_confidence: string;
    review_reasons: string[];
    warnings: string[];
    direct_verified_by: string | null;
  };
}

/** Returns an error message when the decision is not allowed, otherwise null. */
export function checkDecision({ decision, notes, candidate }: DecisionInput): string | null {
  if (!["approve", "reject", "needs_more_research"].includes(decision)) return "Unknown decision";
  if (["imported", "superseded"].includes(candidate.status)) return "This candidate can no longer be changed";
  if (decision !== "approve") {
    return notes && notes.trim().length >= 3 ? null : "Add a short note explaining the decision";
  }
  if (candidate.entity_type !== "pin") return "Sets are approved through their pins";
  if (candidate.status !== "direct_verified" || !candidate.direct_verified_by) {
    return "Open a source and confirm the pin's identity before approving";
  }
  if (!["High", "Medium"].includes(candidate.record_confidence)) return "Identity confidence is too low to approve";
  if (candidate.review_reasons.some(r => r.startsWith("conflict:"))) return "Resolve the conflicting values first";
  if (candidate.warnings.length > 0 && !(notes && notes.trim().length >= 3)) {
    return "This pin has variant values: add a note saying which values you confirmed";
  }
  return null;
}
