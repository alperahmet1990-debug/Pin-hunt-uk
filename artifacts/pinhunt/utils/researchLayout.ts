/**
 * Research Review layout rules (RR-20): which tab a candidate belongs to and
 * when the detail becomes a side panel instead of a sheet.
 */
import type { ResearchCandidate } from '@/utils/researchReview';
import { groupBySet } from '@/utils/researchReview';

/** Width (px) from which the list and detail panel sit side by side. */
export const WIDE_BREAKPOINT = 900;

export type ReviewTab = 'queue' | 'singles' | 'board';

export const NO_SET_KEY = '(no set)';

export function isWideLayout(width: number): boolean {
  return width >= WIDE_BREAKPOINT;
}

/** Queue: pins that belong to a set. OE & singles: pins with no set. */
export function groupsForTab(tab: 'queue' | 'singles', candidates: ResearchCandidate[]) {
  const groups = groupBySet(candidates);
  return tab === 'singles'
    ? groups.filter(g => g.setKey === NO_SET_KEY)
    : groups.filter(g => g.setKey !== NO_SET_KEY);
}
