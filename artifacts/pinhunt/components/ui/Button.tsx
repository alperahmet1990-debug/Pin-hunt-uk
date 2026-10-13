/**
 * Button and IconButton — the shared buttons (UX-039, #152).
 *
 * Button variants: primary (filled), secondary (outlined surface),
 * destructive (filled red), text (a link-style action). Sizes: regular
 * (50 pt, the PrimaryActionBar height) and compact (44 pt). Every button is
 * at least 44 pt tall, text buttons included. `loading` swaps the icon for
 * a spinner and blocks presses; `disabled` dims and blocks.
 *
 * IconButton is a 44 pt round target for icon-only controls; an
 * accessibilityLabel is required because there's no visible text.
 */
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';

type FeatherName = keyof typeof Feather.glyphMap;

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'text';
export type ButtonSize = 'regular' | 'compact';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: FeatherName;
  /** Icon after the label, e.g. a chevron. */
  trailingIcon?: FeatherName;
  /** A second, smaller line under the label (filled variants). */
  subtitle?: string;
  /** Leading icon colour, when it carries meaning (e.g. a status colour). */
  iconColor?: string;
  /** "start" lays the button out like a row: label left, trailing icon at the end. */
  align?: 'center' | 'start';
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container's width (default for filled variants). */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label, onPress, variant = 'primary', size = 'regular', icon, trailingIcon, subtitle, iconColor, align = 'center',
  loading = false, disabled = false, fullWidth, accessibilityLabel, accessibilityHint, style, testID,
}: ButtonProps) {
  const colors = useColors();
  const blocked = disabled || loading;
  const isText = variant === 'text';
  const stretch = fullWidth ?? !isText;

  const palette = {
    // homeSurface, not a fixed white: in dark mode the periwinkle is light, so the label goes dark.
    primary: { bg: colors.homeCoral, fg: colors.homeSurface, border: colors.homeCoral },
    secondary: { bg: colors.homeSurface, fg: colors.homeInk, border: colors.homeLine },
    destructive: { bg: colors.destructive, fg: colors.destructiveForeground, border: colors.destructive },
    text: { bg: 'transparent', fg: colors.homeCoralDeep, border: 'transparent' },
  }[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={blocked}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${label}. ${subtitle}` : label)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        isText ? styles.text : size === 'compact' ? styles.compact : styles.regular,
        !isText && { backgroundColor: palette.bg, borderColor: palette.border },
        stretch ? styles.stretch : styles.hug,
        blocked && styles.blocked,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : icon ? (
        <Feather name={icon} size={size === 'compact' || isText ? 15 : 17} color={iconColor ?? palette.fg} />
      ) : null}
      <View style={[styles.labels, align === 'start' && styles.labelsStart]}>
        {/* Two lines before truncating, so long labels survive 320 pt. */}
        <Text numberOfLines={2} style={[isText || size === 'compact' ? styles.labelCompact : styles.label, align === 'center' && styles.centered, { color: palette.fg }]}>
          {label}
        </Text>
        {subtitle ? <Text numberOfLines={1} style={[styles.subtitle, { color: palette.fg }]}>{subtitle}</Text> : null}
      </View>
      {trailingIcon && !loading ? <Feather name={trailingIcon} size={15} color={palette.fg} /> : null}
    </TouchableOpacity>
  );
}

export type IconButtonVariant = 'plain' | 'tinted' | 'surface';

export interface IconButtonProps {
  icon: FeatherName;
  onPress: () => void;
  /** Required: icon-only controls need a spoken name. */
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  /** Highlight (e.g. a toggled search). */
  active?: boolean;
  disabled?: boolean;
  iconSize?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** 44 pt round icon control. */
export function IconButton({
  icon, onPress, accessibilityLabel, variant = 'plain', active = false, disabled = false, iconSize = 20, color, style, testID,
}: IconButtonProps) {
  const colors = useColors();
  const bg = active
    ? colors.homeCoral + '1F'
    : variant === 'tinted' ? colors.homeAqua : variant === 'surface' ? colors.homeSurface + 'E6' : 'transparent';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active || undefined }}
      testID={testID}
      style={[styles.icon, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Feather name={icon} size={iconSize} color={color ?? (active ? colors.homeCoral : colors.homeInk)} />
    </TouchableOpacity>
  );
}

/** Minimum touch target for any control (Apple HIG). */
export const MIN_TOUCH = 44;

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: 'transparent' },
  regular: { minHeight: 50, borderRadius: radius.lg, paddingHorizontal: spacing.xl },
  compact: { minHeight: MIN_TOUCH, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  text: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.sm, borderWidth: 0 },
  stretch: { alignSelf: 'stretch' },
  // Hugging buttons follow the parent's alignment (pass alignSelf in style to override).
  hug: {},
  blocked: { opacity: 0.5 },
  labels: { flexShrink: 1, alignItems: 'center' },
  labelsStart: { flex: 1, alignItems: 'flex-start' },
  label: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  labelCompact: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  centered: { textAlign: 'center' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_500Medium', opacity: 0.9, marginTop: 1 },
  icon: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
});
