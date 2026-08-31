/**
 * Shared layout tokens for the "Sea Glass & Coral" design language
 * established on Home (constants/colors.ts `home*` palette).
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
