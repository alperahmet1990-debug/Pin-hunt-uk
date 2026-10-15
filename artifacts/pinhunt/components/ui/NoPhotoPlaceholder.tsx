/**
 * NoPhotoPlaceholder — what a pin with no catalogue photo shows (UX-066,
 * #308): a soft tile with a dotted frame (the photo is missing) around a
 * faded PinHunt "P" magnifier, with a "+" in the lens (one can be added).
 *
 * Drawn in code so it follows light and dark mode and scales to any size,
 * and read as "No photo yet" rather than as an image. PinImage renders it
 * whenever it's given PLACEHOLDER_IMAGE, so callers don't change.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export const NO_PHOTO_LABEL = 'No photo yet';

interface Props {
  style?: StyleProp<ViewStyle>;
  /** Spoken name; defaults to "No photo yet". */
  accessibilityLabel?: string;
  accessible?: boolean;
  testID?: string;
}

export function NoPhotoPlaceholder({ style, accessibilityLabel, accessible = true, testID = 'no-photo-placeholder' }: Props) {
  const colors = useColors();
  const ink = colors.homeCoral;
  return (
    <View
      testID={testID}
      accessible={accessible}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessible ? (accessibilityLabel ?? NO_PHOTO_LABEL) : undefined}
      style={[styles.root, { backgroundColor: colors.homeAqua }, style]}
    >
      {/* Fills small tiles; capped on big ones (Pin detail) so it stays an icon. */}
      <View style={styles.art}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" pointerEvents="none">
        <Rect
          x={10} y={10} width={80} height={80} rx={18}
          fill="none" stroke={ink} strokeWidth={3} strokeDasharray="1 6.5" strokeLinecap="round"
        />
        <G opacity={0.38}>
          <Rect x={33} y={26} width={10} height={50} rx={5} fill={ink} />
          <Circle cx={54} cy={42} r={12.5} fill="none" stroke={ink} strokeWidth={9} />
          <Path d="M65 53l9 9" stroke={ink} strokeWidth={8} strokeLinecap="round" />
        </G>
        <Path d="M54 37v10M49 42h10" stroke={ink} strokeWidth={3.2} strokeLinecap="round" />
      </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  art: { width: '100%', height: '100%', maxWidth: 180, maxHeight: 180 },
});
