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

/**
 * Characters both top candidates have (#301), for Suggest a pin when the
 * scan itself named none: if the two closest pins share a character, the
 * missing pin very likely has it too. Empty otherwise.
 */
export function sharedCandidateCharacters(characterLists: Array<string[] | null | undefined>): string[] {
  const [first, second] = characterLists;
  if (!first?.length || !second?.length) return [];
  const other = new Set(second.map(c => c.trim().toLowerCase()));
  return first.map(c => c.trim()).filter(c => c && other.has(c.toLowerCase()));
}
