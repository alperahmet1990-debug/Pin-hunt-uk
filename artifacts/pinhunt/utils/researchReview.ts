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
