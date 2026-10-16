/**
 * CollectionSummary — the stats card at the top of My Collection and a
 * board (UX-067, #340): two or three numbers, each with a small icon, on
 * the soft lilac surface. Counts only; no values (maintainer, 16 Oct).
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { fontScale, radius, spacing } from '@/constants/theme';

export interface SummaryStat {
  value: number;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  /** The app's For Trade colour for trading numbers; periwinkle otherwise. */
  tone?: 'default' | 'trade';
}

export function CollectionSummary({ stats, style }: { stats: SummaryStat[]; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View
      testID="collection-summary"
      accessible
      accessibilityLabel={stats.map(s => `${s.value} ${s.label}`).join(', ')}
      style={[styles.card, { backgroundColor: colors.homeAqua }, style]}
    >
      {stats.map((stat, i) => (
        <View key={stat.label} style={[styles.stat, i > 0 && [styles.divider, { borderLeftColor: colors.homeLine }]]}>
          <View style={styles.valueRow}>
            <Feather name={stat.icon} size={15} color={stat.tone === 'trade' ? colors.forTrade : colors.homeCoral} />
            <Text style={[styles.value, { color: colors.homeInk }]} maxFontSizeMultiplier={fontScale.dense}>
              {stat.value.toLocaleString()}
            </Text>
          </View>
          <Text style={[styles.label, { color: colors.homeMuted }]} numberOfLines={1} maxFontSizeMultiplier={fontScale.dense}>
            {stat.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: radius.lg, paddingVertical: spacing.md },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  divider: { borderLeftWidth: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 },
});
