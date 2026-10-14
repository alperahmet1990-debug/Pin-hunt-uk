/**
 * Space below a tab screen's content so its last item clears the tab bar
 * (UX-057, #260). On web the tab bar floats over the content
 * (`position: 'absolute'`, app/(tabs)/_layout.tsx) and is this tall.
 */
import { Platform } from 'react-native';

export const WEB_TAB_BAR_HEIGHT = 84;

/** Breathing room between the last item and the top of the tab bar. */
export const TAB_BAR_CLEARANCE = 20;

/**
 * Bottom padding for a tab screen's scroll content. Native keeps the
 * screen's own value (`nativePad`, already safe-area aware); web clears the
 * floating tab bar.
 */
export function tabScreenBottomPad(nativePad: number, os: string = Platform.OS): number {
  return os === 'web' ? WEB_TAB_BAR_HEIGHT + TAB_BAR_CLEARANCE : nativePad;
}
