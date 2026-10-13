import type { ImageInsights } from '@/utils/identifyPin';

/** Retake tips are shown the first few times the recovery panel opens. */
export const RETAKE_TIPS_KEY = '@pinhunt_scan_retake_tips_v1';
export const RETAKE_TIPS_LIMIT = 3;

export const RETAKE_TIPS = [
  'One pin per photo',
  'Take it off the backing card',
  'Good, even light and no glare',
];

/**
 * Search query for "None of these": what the scan recognised on the pin.
 * Characters first (they match catalogue titles best), then text on the pin.
 * Empty when the scan saw nothing useful, so Search opens blank.
 */
export function recoveryQuery(insights: ImageInsights | null): string {
  if (!insights) return '';
  const characters = insights.characters.map(c => c.trim()).filter(Boolean).slice(0, 2);
  if (characters.length > 0) return characters.join(' ');
  const text = insights.textOnPin?.replace(/\s+/g, ' ').trim() ?? '';
  return text.length > 40 ? text.slice(0, 40).replace(/\s\S*$/, '') : text;
}

/** The set to browse when the top two candidates agree on it, else null. */
export function sharedCandidateSet(collections: Array<string | null | undefined>): string | null {
  const [first, second] = collections;
  return first && second && first === second ? first : null;
}
