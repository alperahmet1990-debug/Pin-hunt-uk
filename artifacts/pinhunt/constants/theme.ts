/**
 * Shared layout tokens for the Storybook design language (approved
 * 12 Oct 2026; colours in constants/colors.ts, semantic names via
 * `useColors().tokens`).
 *
 * Color tokens live in constants/colors.ts / useColors() — this file only
 * holds the scheme-independent spacing/radius/shadow scale so reusable
 * primitives (components/ui/*) and screens share the same rhythm.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 21,
  xxl: 25,
  pill: 999,
} as const;

// Merge with `{ shadowColor: colors.homeShadow }` (or another home token) at
// the call site — shadow color is theme-dependent, these are not.
export const shadow = {
  hero: {
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  card: {
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
} as const;

/**
 * Dynamic Type policy (B-P2-15, docs/design/dynamic-type.md). Text follows
 * the system text size by default. Only text inside fixed-size, dense UI is
 * capped, as a `maxFontSizeMultiplier`:
 * - `badge`: labels on a pin image or inside a fixed-height control (×N,
 *   "Missing", segmented control labels), which can't grow without covering
 *   the artwork or clipping.
 * - `dense`: one-line captions and chips in grids and rows (tile names,
 *   status chips), which grow a little and then truncate.
 */
export const fontScale = {
  badge: 1.2,
  dense: 1.35,
} as const;
