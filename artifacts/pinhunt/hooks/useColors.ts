import { useResolvedColorScheme } from './useAppearance';
import colors, { semanticColors } from '@/constants/colors';

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting, or the in-app Appearance choice
 * (System · Light Side · Dark Side, #224) when one is set.
 */
export function useColors() {
  const scheme = useResolvedColorScheme();
  const palette =
    scheme === 'dark' && 'dark' in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  // `tokens`: semantic names for the same values (constants/colors.ts, #150).
  return { ...palette, radius: colors.radius, tokens: semanticColors(palette) };
}
