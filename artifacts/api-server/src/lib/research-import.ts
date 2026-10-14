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
    collection: str(p["Series / Collection"]) ?? str(p["Categories"]),
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
    catalogue_source: "research_import",
  };
}

export type Refusal =
  | "not_found" | "not_a_pin" | "not_approved" | "not_directly_verified" | "not_attributed"
  | "catalogue_duplicate" | "flagged_duplicate" | "missing_required_fields";

export const REFUSAL_TEXT: Record<Refusal, string> = {
  not_found: "Candidate not found",
  not_a_pin: "Only pin candidates can be imported",
  not_approved: "Not approved",
  not_directly_verified: "Not directly verified by a reviewer",
  not_attributed: "Approval has no recorded decider",
  catalogue_duplicate: "Already in the catalogue",
  flagged_duplicate: "Flagged as a possible duplicate",
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
  const missing: string[] = REQUIRED_PROPOSED.filter(k => str(c.proposed[k]) === null);
  if (str(c.proposed["Main character"]) === null && str(c.proposed["Characters"]) === null) missing.push("Main character");
  if (missing.length) return refuse("missing_required_fields", missing);
  const row = buildPinRow(c);
  if (existingKeys.has(`${row.title}|${row.collection ?? ""}`.toLowerCase())) return refuse("catalogue_duplicate");
  return { candidateId: c.id, ok: true, row };
}
