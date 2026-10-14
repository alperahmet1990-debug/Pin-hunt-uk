/**
 * Native stack header colours from the active palette (UX-059, #262), so
 * every header follows the in-app Appearance (Light Side · Dark Side ·
 * System) instead of staying light.
 */
import type { useColors } from '@/hooks/useColors';

type Palette = Pick<ReturnType<typeof useColors>, 'homeSurface' | 'homeInk'>;

export function stackHeaderOptions(colors: Palette) {
  return {
    headerBackTitle: 'Back',
    headerStyle: { backgroundColor: colors.homeSurface },
    headerTintColor: colors.homeInk,
    headerTitleStyle: { color: colors.homeInk },
  };
}
