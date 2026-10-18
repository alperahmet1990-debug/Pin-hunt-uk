/**
 * What a submission originally said, where it has since changed (#395).
 *
 * pin_submissions.original_metadata (migration 047) is a write-once copy of
 * the fields as first submitted. Edits by the contributor (needs changes) or
 * an admin change the live fields; this lists the ones that differ, so the
 * review screen can show the original next to the current values.
 */
import type { PinSubmission } from '@workspace/pin-repository';

export interface OriginalChange {
  label: string;
  /** The value as first submitted, '' when it was blank. */
  original: string;
}

const FIELDS: Array<{ key: string; label: string; current: (s: PinSubmission) => unknown }> = [
  { key: 'proposed_name', label: 'Pin Name', current: s => s.proposedName },
  { key: 'brand', label: 'Brand', current: s => s.brand },
  { key: 'series_name', label: 'Series', current: s => s.seriesName },
  { key: 'release_location', label: 'Location', current: s => s.releaseLocation },
  { key: 'release_year', label: 'Year', current: s => s.releaseYear },
  { key: 'character_names', label: 'Characters', current: s => s.characterNames },
  { key: 'notes', label: 'Notes', current: s => s.notes },
];

const text = (v: unknown): string =>
  Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : String(v).trim();

export function originalChanges(submission: PinSubmission): OriginalChange[] {
  const original = submission.originalMetadata;
  if (!original) return [];
  return FIELDS
    .filter(f => text(original[f.key]) !== text(f.current(submission)))
    .map(f => ({ label: f.label, original: text(original[f.key]) }));
}
