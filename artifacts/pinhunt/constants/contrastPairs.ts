/**
 * Every documented Storybook text/background pair (UX-049, #158), checked in
 * light and dark by constants/__tests__/contrastPairs.test.ts and listed in
 * docs/design/colour-contrast.md.
 *
 * WCAG AA: 'text' needs 4.5:1; 'large' (≥ 18 pt, or ≥ 14 pt bold) and
 * 'icon' need 3:1. When a pair fails, choose a different existing token for
 * that use — never change palette values without a design decision.
 */
import type { Palette } from './colors';

export type ContrastRole = 'text' | 'large' | 'icon';
type Token = keyof Palette;

export interface ContrastPair {
  id: string;
  fg: Token;
  bg: Token;
  role: ContrastRole;
  /** Where the pair is used. */
  use: string;
}

export const MIN_RATIO: Record<ContrastRole, number> = { text: 4.5, large: 3, icon: 3 };

export const CONTRAST_PAIRS: ContrastPair[] = [
  // Body text
  { id: 'ink-canvas', fg: 'homeInk', bg: 'homeBackground', role: 'text', use: 'Body text and titles on the page' },
  { id: 'ink-surface', fg: 'homeInk', bg: 'homeSurface', role: 'text', use: 'Text on cards and sheets' },
  { id: 'ink-subtle', fg: 'homeInk', bg: 'homeAqua', role: 'text', use: 'Secondary button labels, chips, search fields' },
  { id: 'muted-canvas', fg: 'homeMuted', bg: 'homeBackground', role: 'text', use: 'Metadata and captions on the page (11–13 pt)' },
  { id: 'muted-surface', fg: 'homeMuted', bg: 'homeSurface', role: 'text', use: 'Metadata on cards and sheets' },
  { id: 'muted-subtle', fg: 'homeMuted', bg: 'homeAqua', role: 'text', use: 'Inactive segment labels, placeholders, neutral chips' },
  // Actions
  { id: 'primary-label', fg: 'homeSurface', bg: 'homeCoral', role: 'text', use: 'Primary button label' },
  { id: 'text-action-canvas', fg: 'homeCoralDeep', bg: 'homeBackground', role: 'text', use: 'Text buttons and links on the page' },
  { id: 'text-action-surface', fg: 'homeCoralDeep', bg: 'homeSurface', role: 'text', use: 'Text buttons and links on cards' },
  { id: 'primary-icon', fg: 'homeCoral', bg: 'homeSurface', role: 'icon', use: 'Active icons and selection marks' },
  { id: 'danger-label', fg: 'destructiveForeground', bg: 'destructive', role: 'text', use: 'Destructive button label (15 pt bold)' },
  { id: 'danger-text', fg: 'destructive', bg: 'homeSurface', role: 'text', use: 'Error messages and "Delete" rows' },
  // Treasure (plum)
  { id: 'treasure-warm', fg: 'homeSandInk', bg: 'homeWarmSurface', role: 'text', use: 'Official callouts and seed-record banner' },
  { id: 'treasure-surface', fg: 'homeSandInk', bg: 'homeSurface', role: 'text', use: 'LE and completion accents on cards' },
  // Home hero (text sits over the start of the CoralDeep → Coral gradient)
  { id: 'hero-title-deep', fg: 'homeHeroText', bg: 'homeCoralDeep', role: 'large', use: 'Home hero "Find a Pin" (28 pt bold)' },
  { id: 'hero-title', fg: 'homeHeroText', bg: 'homeCoral', role: 'large', use: 'Home hero "Find a Pin" (28 pt bold)' },
  { id: 'hero-subtitle', fg: 'homeHeroSubtitle', bg: 'homeCoral', role: 'text', use: 'Home hero subtitle (13 pt)' },
  // Continue Collecting card
  { id: 'collect-title', fg: 'homeCollectText', bg: 'homeTeal', role: 'text', use: 'Continue Collecting set name' },
  { id: 'collect-detail', fg: 'homeHeroMuted', bg: 'homeTeal', role: 'text', use: 'Continue Collecting "3 of 5 collected" (11 pt)' },
  // Accent icons
  { id: 'teal-icon', fg: 'homeTealSoft', bg: 'homeSurface', role: 'icon', use: 'Community shortcut and "Based on your collection" icons' },
  // Status markers (white glyph on a status colour)
  { id: 'owned-marker', fg: 'homeSurface', bg: 'owned', role: 'icon', use: 'Owned tick on pin tiles' },
  { id: 'wanted-marker', fg: 'homeSurface', bg: 'wanted', role: 'icon', use: 'ISO bookmark on pin tiles' },
  { id: 'trade-marker', fg: 'homeSurface', bg: 'forTrade', role: 'icon', use: 'For Trade arrows on pin tiles' },
];

/**
 * Pairs that fail today and need a design decision (a different token for
 * that use, or a palette change). Listed so they're visible, not hidden: the
 * test fails if one gets worse, and asks for its removal here once it passes.
 */
export const KNOWN_CONTRAST_GAPS: Array<{ id: string; scheme: 'light' | 'dark'; recorded: number; note: string }> = [
  { id: 'muted-subtle', scheme: 'light', recorded: 4.22, note: 'Inactive segment labels are 12.5 pt bold, so the 4.5:1 body rule applies' },
  { id: 'danger-label', scheme: 'light', recorded: 4.29, note: '15 pt bold is just under the large-text size' },
  { id: 'danger-label', scheme: 'dark', recorded: 4.29, note: 'Same red in dark mode' },
  { id: 'danger-text', scheme: 'light', recorded: 4.29, note: 'Error and Delete text on cards' },
  { id: 'danger-text', scheme: 'dark', recorded: 3.54, note: 'Error and Delete text on dark cards' },
  { id: 'hero-title-deep', scheme: 'dark', recorded: 1.88, note: 'The dark-mode hero gradient is light periwinkle under white text' },
  { id: 'hero-title', scheme: 'dark', recorded: 2.39, note: 'As above' },
  { id: 'hero-subtitle', scheme: 'dark', recorded: 2.23, note: 'As above' },
  { id: 'teal-icon', scheme: 'dark', recorded: 1.70, note: 'Dark teal icon on a dark card' },
  { id: 'hero-subtitle', scheme: 'light', recorded: 4.26, note: 'Where the subtitle crosses the lighter middle of the gradient' },
];
