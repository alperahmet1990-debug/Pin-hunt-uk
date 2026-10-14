/**
 * Import dry run for approved research candidates (#237). Pure functions: they
 * decide which candidates could become new pins and what the row would look
 * like. Nothing here touches a database. See docs/research/research-import-design.md.
 */
import { isDuplicateStatus } from "./research-run";

/** Largest import batch (and dry-run request). */
export const MAX_IMPORT_BATCH = 50;

export interface ImportCandidate {
  id: string;
  entity_type: string;
  status: string;
  proposed: Record<string, unknown>;
  review_reasons: string[] | null;
  warnings: string[] | null;
  duplicate_status: string | null;
  duplicate_pin_id: string | null;
  direct_verified_by: string | null;
  decided_by: string | null;
}

/** Master Catalogue-shaped `proposed` keys that must be present to build a pin. */
export const REQUIRED_PROPOSED = ["Pin name", "Brand", "Release year"] as const;

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const int = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== "" && Number.isInteger(n) ? n : null;
};
const num = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : null;
};

/**
 * The `pins` row an import would insert. `pinhunt_id` is deliberately absent:
 * the real import mints it with next_pinhunt_id() inside the write.
 * Visibility stays closed: not verified, flagged for review.
 */
export function buildPinRow(c: ImportCandidate) {
  const p = c.proposed;
  return {
    title: str(p["Pin name"]),
    brand: str(p["Brand"]),
    collection: str(p["Collection name"]) ?? str(p["Series"]) ?? str(p["Series / Collection"]) ?? str(p["Categories"]),
    main_character: str(p["Main character"]),
    all_characters: str(p["Characters"]),
    release_year: int(p["Release year"]),
    release_date: str(p["Release date"]),
    edition_type: str(p["Edition type"]),
    limited_edition_size: int(p["Edition size"]),
    retailer: str(p["Park / Retailer"]),
    retail_price: num(p["Original price"]),
    currency: str(p["Currency"]),
    verification_status: "needs_source_verification",
    is_seed_record: true,
    needs_review: true,
    // Provenance is the import batch plus catalogue_candidates.imported_pin_id. catalogue_source
    // references catalogue_sources(id) and no research source row exists, so it stays null.
    catalogue_source: null,
  };
}

export type Refusal =
  | "not_found" | "not_a_pin" | "not_approved" | "not_directly_verified" | "not_attributed"
  | "catalogue_duplicate" | "flagged_duplicate" | "unresolved_conflict" | "missing_required_fields";

export const REFUSAL_TEXT: Record<Refusal, string> = {
  not_found: "Candidate not found",
  not_a_pin: "Only pin candidates can be imported",
  not_approved: "Not approved",
  not_directly_verified: "Not directly verified by a reviewer",
  not_attributed: "Approval has no recorded decider",
  catalogue_duplicate: "Already in the catalogue",
  flagged_duplicate: "Flagged as a possible duplicate",
  unresolved_conflict: "Has an unresolved conflict or review hold",
  missing_required_fields: "Missing required fields",
};

export interface Verdict {
  candidateId: string;
  ok: boolean;
  reason?: Refusal;
  message?: string;
  missing?: string[];
  row?: ReturnType<typeof buildPinRow>;
}

/** `existingKeys`: lower-cased "title|collection" of live pins matching the batch's titles. */
export function judgeCandidate(c: ImportCandidate, existingKeys: Set<string>): Verdict {
  const refuse = (reason: Refusal, missing?: string[]): Verdict => ({
    candidateId: c.id, ok: false, reason, missing,
    message: missing ? `${REFUSAL_TEXT[reason]}: ${missing.join(", ")}` : REFUSAL_TEXT[reason],
  });
  if (c.entity_type !== "pin") return refuse("not_a_pin");
  if (c.status !== "approved") return refuse("not_approved");
  if (!c.direct_verified_by) return refuse("not_directly_verified");
  if (!c.decided_by) return refuse("not_attributed");
  if (c.duplicate_pin_id || isDuplicateStatus(c.duplicate_status)) return refuse("catalogue_duplicate");
  if ((c.review_reasons ?? []).some(r => /duplicate/i.test(r))) return refuse("flagged_duplicate");
  if ((c.review_reasons ?? []).some(r => /^conflict:/i.test(r))) return refuse("unresolved_conflict");
  const missing: string[] = REQUIRED_PROPOSED.filter(k => str(c.proposed[k]) === null);
  if (str(c.proposed["Main character"]) === null && str(c.proposed["Characters"]) === null) missing.push("Main character");
  const row = buildPinRow(c);
  if (row.collection === null) missing.push("Collection name");
  if (missing.length) return refuse("missing_required_fields", missing);
  if (existingKeys.has(`${row.title}|${row.collection ?? ""}`.toLowerCase())) return refuse("catalogue_duplicate");
  return { candidateId: c.id, ok: true, row };
}

/** The fields a candidate select needs to be judged. */
export const CANDIDATE_SELECT =
  "id, entity_type, status, proposed, review_reasons, warnings, duplicate_status, duplicate_pin_id, direct_verified_by, decided_by";

// Minimal query surface shared by the dry run and the import (the Supabase client satisfies it).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

/**
 * Loads the candidates and judges each one exactly as the dry run does. The live-pin lookup is
 * read-only. Missing ids are refused as not_found. Order follows `ids`.
 */
export async function judgeBatch(db: Db, ids: string[]): Promise<Verdict[]> {
  const { data, error } = await db.from("catalogue_candidates").select(CANDIDATE_SELECT).in("id", ids).limit(MAX_IMPORT_BATCH);
  if (error) throw error;
  const found = new Map(((data ?? []) as ImportCandidate[]).map(c => [c.id, c]));
  const titles = [...new Set([...found.values()]
    .map(c => (typeof c.proposed?.["Pin name"] === "string" ? (c.proposed["Pin name"] as string).trim() : ""))
    .filter(Boolean))];
  const existingKeys = new Set<string>();
  if (titles.length) {
    const { data: pins, error: pinErr } = await db.from("pins").select("title, collection").in("title", titles).limit(1000);
    if (pinErr) throw pinErr;
    for (const p of (pins ?? []) as Array<{ title: string; collection: string | null }>) {
      existingKeys.add(`${p.title}|${p.collection ?? ""}`.toLowerCase());
    }
  }
  return ids.map(id => {
    const c = found.get(id);
    return c ? judgeCandidate(c, existingKeys)
      : { candidateId: id, ok: false, reason: "not_found" as const, message: REFUSAL_TEXT.not_found };
  });
}

/** Valid request body: 1..MAX_IMPORT_BATCH distinct UUIDs. */
export function parseCandidateIds(raw: unknown, uuid: RegExp): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IMPORT_BATCH
    || !raw.every(x => typeof x === "string" && uuid.test(x)) || new Set(raw).size !== raw.length) return null;
  return raw as string[];
}
