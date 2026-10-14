/**
 * ErrorState — the one way a screen says something failed (UX-046, #156):
 * an icon for the kind of problem, a plain title and line, and Retry.
 * `compact` is the inline version for a banner inside a screen.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Button } from './Button';
import { radius, spacing } from '@/constants/theme';
import type { UserError, UserErrorKind } from '@/utils/userError';

const ICON: Record<UserErrorKind, keyof typeof Feather.glyphMap> = {
  offline: 'wifi-off',
  timeout: 'clock',
  auth: 'lock',
  server: 'alert-triangle',
  unknown: 'alert-circle',
};

interface ErrorStateProps {
  error: UserError;
  onRetry?: () => void;
  retryLabel?: string;
  /** A second way forward, e.g. "Search instead". */
  secondary?: { label: string; onPress: () => void; icon?: keyof typeof Feather.glyphMap };
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({ error, onRetry, retryLabel = 'Try again', secondary, compact, style }: ErrorStateProps) {
  const colors = useColors();
  return (
    <View
      style={[compact ? [styles.compact, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }] : styles.full, style]}
    >
      {/* One announcement for the problem; the buttons stay separately focusable. */}
      <View
        style={compact ? styles.compactHead : styles.fullHead}
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${error.title}. ${error.message}`}
      >
        <View style={[styles.icon, compact && styles.iconCompact, { backgroundColor: colors.homeAqua }]}>
          <Feather name={ICON[error.kind]} size={compact ? 16 : 22} color={colors.homeInk} />
        </View>
        <View style={compact ? styles.compactText : styles.fullText}>
          <Text style={[compact ? styles.titleCompact : styles.title, { color: colors.homeInk }]}>{error.title}</Text>
          <Text style={[styles.message, !compact && styles.messageCentred, { color: colors.homeMuted }]}>{error.message}</Text>
        </View>
      </View>
      {(onRetry || secondary) && (
        <View style={compact ? styles.actionsRow : styles.actionsStack}>
          {onRetry && (
            <Button label={retryLabel} icon="refresh-cw" size="compact" onPress={onRetry} fullWidth={compact} style={compact ? styles.flex : undefined} />
          )}
          {secondary && (
            <Button
              label={secondary.label}
              icon={secondary.icon}
              size="compact"
              variant="secondary"
              onPress={secondary.onPress}
              fullWidth={compact}
              style={compact ? styles.flex : undefined}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.lg },
  fullHead: { alignItems: 'center', gap: spacing.md },
  fullText: { alignItems: 'center', gap: 4 },
  compact: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  compactHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  compactText: { flex: 1, gap: 2 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  iconCompact: { width: 36, height: 36, borderRadius: 18 },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  titleCompact: { fontSize: 14.5, fontFamily: 'Inter_700Bold' },
  message: { fontSize: 13.5, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  messageCentred: { textAlign: 'center', maxWidth: 280 },
  actionsStack: { gap: spacing.sm, alignItems: 'center' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
