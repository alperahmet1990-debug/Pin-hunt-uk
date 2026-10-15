/**
 * ScreenHeader (UX-040, #153): the one in-app header for screens that open
 * straight onto content: pin, set, board, search, collector and Find Trades.
 * A 44 pt Back (read as "Back"), an optional title, and up to two trailing
 * controls. `overlay` floats it over a hero image (pin detail).
 *
 * The rule (docs/design/screen-header.md): those screens hide the native
 * stack header and render this; forms, settings, community and admin keep
 * the native header from stackHeaderOptions.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { spacing } from '@/constants/theme';
import { IconButton, MIN_TOUCH } from './Button';

export interface ScreenHeaderProps {
  title?: string;
  /** Defaults to going back, or Home when there's nothing to go back to. */
  onBack?: () => void;
  /** Up to two trailing controls (IconButtons, a compact Button or a chip). */
  right?: React.ReactNode;
  /** Takes the space between Back and `right` in place of the title (e.g. Search's field). */
  children?: React.ReactNode;
  /** Float over a hero image: no background, absolutely positioned, Back on a surface disc. */
  overlay?: boolean;
  /** Pad for the status bar. Turn off when the screen already does. */
  safeArea?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Status-bar padding used by the header (web has no inset, so it keeps a minimum). */
export function useHeaderTopInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'web' ? Math.max(insets.top, 24) : insets.top;
}

export function ScreenHeader({ title, onBack, right, children, overlay = false, safeArea = true, style }: ScreenHeaderProps) {
  const colors = useColors();
  const router = useRouter();
  const topInset = useHeaderTopInset();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View
      testID="screen-header"
      pointerEvents={overlay ? 'box-none' : 'auto'}
      style={[
        styles.row,
        { paddingTop: (safeArea ? topInset : 0) + (overlay ? 10 : spacing.sm) },
        overlay && styles.overlay,
        style,
      ]}
    >
      <IconButton
        icon="chevron-left"
        iconSize={22}
        accessibilityLabel="Back"
        variant={overlay ? 'surface' : 'tinted'}
        onPress={goBack}
        testID="screen-header-back"
      />
      {children ?? (
        <View style={styles.titleWrap} pointerEvents="none">
          {title ? (
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.homeInk }]}>
              {title}
            </Text>
          ) : null}
        </View>
      )}
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    minHeight: MIN_TOUCH,
  },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
