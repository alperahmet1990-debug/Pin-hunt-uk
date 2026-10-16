/**
 * Pure helpers for the admin Research Review screen (app/admin/research-review.tsx).
 * Kept separate so they can be unit tested without rendering.
 */
import type { ChipTone } from '@/components/ui';

export type CandidateStatus =
  | 'researched' | 'needs_direct_verification' | 'direct_verified' | 'approved'
  | 'rejected' | 'needs_more_research' | 'imported' | 'superseded';

export interface ResearchCandidate {
  id: string;
  run_id?: string;
  research_key: string;
  entity_type: 'pin' | 'set';
  set_research_key: string | null;
  proposed: Record<string, unknown>;
  record_confidence: 'High' | 'Medium' | 'Low' | 'Unverified';
  engine_verified: boolean;
  review_reasons: string[];
  warnings: string[];
  duplicate_status: string;
  status: CandidateStatus;
}

export interface ResearchEvidence {
  id: string;
  field: string;
  value: unknown;
  source_url: string | null;
  publisher: string | null;
  source_class: string;
  method: string;
  note: string | null;
}

export const STATUS_FILTERS: Array<{ value: CandidateStatus; label: string }> = [
  { value: 'needs_direct_verification', label: 'Needs check' },
  { value: 'direct_verified', label: 'Checked' },
  { value: 'researched', label: 'Researched' },
  { value: 'needs_more_research', label: 'More research' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/** Fields a reviewer can confirm; the first four establish which pin it is. */
export const CHECKABLE_FIELDS: Array<{ field: string; label: string; identity: boolean }> = [
  { field: 'characters', label: 'Character(s)', identity: true },
  { field: 'attraction', label: 'Attraction', identity: true },
  { field: 'pin_name', label: 'Pin name', identity: true },
  { field: 'set_name', label: 'Set', identity: false },
  { field: 'edition_type', label: 'Edition type', identity: false },
  { field: 'edition_size', label: 'Edition size', identity: false },
  { field: 'release_date', label: 'Release date', identity: false },
  { field: 'original_price', label: 'Price', identity: false },
  { field: 'product_code', label: 'Product code', identity: false },
];

export function candidateTitle(c: Pick<ResearchCandidate, 'proposed' | 'research_key'>): string {
  const name = c.proposed['Pin name'] ?? c.proposed['set_name'];
  return typeof name === 'string' && name.trim() ? name.trim() : c.research_key;
}

export function confidenceTone(conf: string): ChipTone {
  if (conf === 'High') return 'owned';
  if (conf === 'Medium') return 'wanted';
  return 'neutral';
}

/** Only https links from evidence are ever opened. */
export function safeExternalUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 2000) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// Mirrors the server's checkSourceUrl (api-server/src/lib/research-run.ts) so the
// screen can say up front that a host will not be accepted as evidence.
const EXCLUDED_HOST = /(^|\.)(pinandpop|pinpics|pintradingdb)\.com$/i;
const MARKETPLACE_HOST = /(^|\.)(ebay|mercari|amazon|etsy|vinted|depop|poshmark)\./i;

/** True when evidence from this URL can never count (excluded database or marketplace). */
export function isExcludedSource(url: string | null): boolean {
  const safe = safeExternalUrl(url);
  if (!safe) return false;
  const host = new URL(safe).hostname;
  return EXCLUDED_HOST.test(host) || MARKETPLACE_HOST.test(host);
}

export type EvidenceLabel = 'checked' | 'lead' | 'excluded';

/**
 * Engine evidence is only a lead until a person has checked that URL for this
 * pin. `evidence` is the pin's whole evidence list.
 */
export function evidenceLabel(e: ResearchEvidence, evidence: ResearchEvidence[]): EvidenceLabel {
  if (isExcludedSource(e.source_url)) return 'excluded';
  if (e.method === 'human_direct_check') return 'checked';
  const checked = evidence.some(x => x.method === 'human_direct_check' && x.source_url === e.source_url);
  return checked ? 'checked' : 'lead';
}

/** Group pins under their set, sets sorted by key; pins sorted by title. */
export function groupBySet(cands: ResearchCandidate[]): Array<{ setKey: string; items: ResearchCandidate[] }> {
  const map = new Map<string, ResearchCandidate[]>();
  for (const c of cands) {
    if (c.entity_type !== 'pin') continue;
    const k = c.set_research_key ?? '(no set)';
    map.set(k, [...(map.get(k) ?? []), c]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([setKey, items]) => ({ setKey, items: items.sort((x, y) => candidateTitle(x).localeCompare(candidateTitle(y))) }));
}

export function formatValue(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(formatValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function evidenceByField(evidence: ResearchEvidence[]): Array<{ field: string; items: ResearchEvidence[] }> {
  const map = new Map<string, ResearchEvidence[]>();
  for (const e of evidence) map.set(e.field, [...(map.get(e.field) ?? []), e]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([field, items]) => ({ field, items }));
}

/** Most pins one set-level check or approval may include (matches the API). */
export const MAX_SET_BATCH = 60;

/** :setKey contains "/", so it travels URL-encoded. */
export function setRoute(runId: string, setKey: string, action: 'direct-check' | 'decision'): string {
  return `/admin/research/sets/${runId}/${encodeURIComponent(setKey)}/${action}`;
}

export interface SetDecisionResult {
  approved: string[];
  skipped: Array<{ candidateId: string; reason: string }>;
}

/** Plain-language outcome of a set approval, naming each pin that stayed pending. */
export function describeSetDecision(result: SetDecisionResult, titleOf: (id: string) => string): string {
  const n = result.approved.length;
  const head = `Approved ${n} pin${n === 1 ? '' : 's'}. The catalogue is not changed until a separate import.`;
  if (result.skipped.length === 0) return head;
  return `${head}\nStill pending:\n${result.skipped.map(s => `• ${titleOf(s.candidateId)}: ${s.reason}`).join('\n')}`;
}

// ── Review by page ──

export interface ResearchPage {
  source_url: string;
  source_class: string | null;
  pin_count: number;
  unchecked_count: number;
  set_keys: string[];
}

export type StructureChoice = 'one_pin' | 'separate_pins';

export const SEPARATE_PINS_NOTE = 'structure: separate pins on source';

/** Character names listed on a candidate (a string or an array in `proposed`). */
export function characterNames(c: Pick<ResearchCandidate, 'proposed'>): string[] {
  const raw = c.proposed['Characters'];
  const parts = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[,;&/]|\band\b/i) : [];
  return [...new Set(parts.map(p => p.trim()).filter(Boolean))];
}

/** Two or more characters, or a `structure:` review reason: the reviewer must say one pin or several. */
export function needsStructureChoice(c: Pick<ResearchCandidate, 'proposed' | 'review_reasons'>): boolean {
  return characterNames(c).length >= 2 || c.review_reasons.some(r => r.startsWith('structure:'));
}

/** Ticked pins that still lack a required structure choice. */
export function pinsMissingStructure(
  cands: ResearchCandidate[], ticked: string[], choices: Record<string, StructureChoice | undefined>,
): ResearchCandidate[] {
  return cands.filter(c => ticked.includes(c.id) && needsStructureChoice(c) && !choices[c.id]);
}

/** Note sent with a set check; "one pin" answers travel with it so they stay on record (240 characters max). */
export function pageCheckNote(userNote: string, oneStructureCount: number): string | null {
  const parts = [userNote.trim(), oneStructureCount > 0 ? `structure: one pin showing all characters (${oneStructureCount})` : '']
    .filter(Boolean);
  return parts.length ? parts.join(' · ').slice(0, 240) : null;
}

export function pageLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}
