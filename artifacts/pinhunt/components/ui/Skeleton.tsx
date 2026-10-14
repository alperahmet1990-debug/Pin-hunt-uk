/**
 * Skeleton — loading placeholders shaped like the content they stand in for
 * (UX-045, #155), so screens don't jump when it arrives:
 *   SkeletonGrid    rows of PinTile-sized tiles (same columns and gutter as PinGrid)
 *   SkeletonRows    list rows: thumbnail + two lines (search results, trade rows)
 *   SkeletonHeader  avatar + name + meta (collector profile)
 *   Skeleton + SkeletonBlock  build your own shape
 *
 * Blocks use the surface tokens (homeAqua for artwork, homeLine for text).
 * Each group gently pulses as one; with Reduce Motion on it holds still.
 * Screen readers hear one "Loading …" progress element, not the blocks.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { PIN_GRID_GUTTER, pinGridColumns, pinTileSize } from './PinGrid';

/** True while the system Reduce Motion setting is on. */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduced(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => { if (mounted) setReduced(v); });
    return () => { mounted = false; sub.remove(); };
  }, []);
  return reduced;
}

interface SkeletonProps {
  /** What VoiceOver hears, e.g. "Loading pins". */
  label: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}

/** A pulsing group of SkeletonBlocks, announced once as loading. */
export function Skeleton({ label, style, children, testID }: SkeletonProps) {
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) { pulse.setValue(1); return; }
    const useNativeDriver = Platform.OS !== 'web';
    const ease = Easing.inOut(Easing.ease);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.55, duration: 800, easing: ease, useNativeDriver }),
      Animated.timing(pulse, { toValue: 1, duration: 800, easing: ease, useNativeDriver }),
    ]));
    loop.start();
    return () => { loop.stop(); pulse.setValue(1); };
  }, [pulse, reduceMotion]);

  return (
    <Animated.View
      testID={testID}
      style={[style, { opacity: pulse }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      pointerEvents="none"
    >
      {children}
    </Animated.View>
  );
}

interface SkeletonBlockProps {
  width?: DimensionValue;
  height: number;
  /** Corner radius; defaults to a soft text-bar rounding. */
  rounded?: number;
  /** 'art' for image areas, 'text' for lines of text. */
  tone?: 'art' | 'text';
  style?: StyleProp<ViewStyle>;
}

export function SkeletonBlock({ width = '100%', height, rounded = 5, tone = 'text', style }: SkeletonBlockProps) {
  const colors = useColors();
  return (
    <View
      style={[{ width, height, borderRadius: rounded, backgroundColor: tone === 'art' ? colors.homeAqua : colors.homeLine }, style]}
    />
  );
}

/** One PinTile-shaped placeholder: square artwork + one title line. */
export function SkeletonTile({ size }: { size: number }) {
  return (
    <View style={{ width: size }}>
      <SkeletonBlock width={size} height={size} rounded={radius.md} tone="art" />
      <SkeletonBlock width="70%" height={9} style={styles.tileLabel} />
    </View>
  );
}

interface SkeletonGridProps {
  label?: string;
  rows?: number;
  /** Side padding the real grid uses (PinGrid default: the screen gutter). */
  sidePadding?: number;
  /** Override for grids that aren't PinGrid-sized. */
  columns?: number;
  tileSize?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Placeholder rows matching PinGrid's columns, tile size and gutters. */
export function SkeletonGrid({
  label = 'Loading pins', rows = 3, sidePadding = spacing.lg, columns, tileSize, gap = PIN_GRID_GUTTER, style, testID,
}: SkeletonGridProps) {
  const { width } = useWindowDimensions();
  const cols = columns ?? pinGridColumns(width);
  const size = tileSize ?? pinTileSize(width, cols, sidePadding);
  return (
    <Skeleton label={label} style={[{ paddingHorizontal: sidePadding }, style]} testID={testID}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={[styles.gridRow, { gap }]}>
          {Array.from({ length: cols }, (_, c) => <SkeletonTile key={c} size={size} />)}
        </View>
      ))}
    </Skeleton>
  );
}

/** One list-row placeholder: thumbnail, title line and a shorter meta line. */
export function SkeletonRow({ thumb = 44, style }: { thumb?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      <SkeletonBlock width={thumb} height={thumb} rounded={radius.sm - 2} tone="art" />
      <View style={styles.rowText}>
        <SkeletonBlock width="68%" height={12} />
        <SkeletonBlock width="44%" height={10} style={styles.rowMeta} />
      </View>
    </View>
  );
}

interface SkeletonRowsProps {
  label: string;
  count?: number;
  thumb?: number;
  /** Row style (padding, divider) so rows sit exactly where real rows will. */
  rowStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SkeletonRows({ label, count = 6, thumb, rowStyle, style, testID }: SkeletonRowsProps) {
  return (
    <Skeleton label={label} style={style} testID={testID}>
      {Array.from({ length: count }, (_, i) => <SkeletonRow key={i} thumb={thumb} style={rowStyle} />)}
    </Skeleton>
  );
}

interface SkeletonHeaderProps {
  label: string;
  avatarSize?: number;
  /** 'stacked': centred avatar over name (profile hero); 'inline': avatar beside name. */
  layout?: 'stacked' | 'inline';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Avatar, name and meta line, as on a profile header. */
export function SkeletonHeader({ label, avatarSize = 88, layout = 'stacked', style, testID }: SkeletonHeaderProps) {
  const stacked = layout === 'stacked';
  return (
    <Skeleton label={label} style={[stacked ? styles.headerStacked : styles.headerInline, style]} testID={testID}>
      <SkeletonBlock width={avatarSize} height={avatarSize} rounded={avatarSize / 2} tone="art" />
      <View style={stacked ? styles.headerTextStacked : styles.rowText}>
        <SkeletonBlock width={stacked ? 160 : '55%'} height={stacked ? 20 : 15} rounded={6} />
        <SkeletonBlock width={stacked ? 110 : '38%'} height={11} style={styles.rowMeta} />
      </View>
    </Skeleton>
  );
}

const styles = StyleSheet.create({
  // PinTile's title: 11 pt text 6 pt below the artwork (≈ 20 pt in all).
  tileLabel: { alignSelf: 'center', marginTop: 9, marginBottom: 2 },
  gridRow: { flexDirection: 'row', marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1 },
  rowMeta: { marginTop: 7 },
  headerStacked: { alignItems: 'center', gap: spacing.sm },
  headerInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerTextStacked: { alignItems: 'center', gap: 2, marginTop: spacing.xs },
});
