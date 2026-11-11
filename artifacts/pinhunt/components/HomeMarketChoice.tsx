/**
 * UK or US, as two large options (#560). Used in Complete Profile and in
 * Profile → Home market.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import type { HomeMarket } from '@/utils/format';
import { MARKET_LABEL } from '@/utils/homeMarket';

export function HomeMarketChoice({ value, onChange, disabled }: {
  value: HomeMarket;
  onChange: (market: HomeMarket) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View accessibilityRole="radiogroup" style={styles.list}>
      {(['UK', 'US'] as const).map(market => {
        const on = market === value;
        const label = MARKET_LABEL[market];
        return (
          <TouchableOpacity
            key={market}
            onPress={() => onChange(market)}
            disabled={disabled}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={`${label.name}. ${label.detail}`}
            style={[styles.option, {
              backgroundColor: on ? colors.homeAqua : colors.homeSurface,
              borderColor: on ? colors.homeCoral : colors.homeLine,
            }]}
          >
            <Text style={styles.flag}>{label.flag}</Text>
            <View style={styles.copy}>
              <Text style={[styles.name, { color: colors.homeInk }]}>{label.name}</Text>
              <Text style={[styles.detail, { color: colors.homeMuted }]}>{label.detail}</Text>
            </View>
            {on && <Feather name="check-circle" size={20} color={colors.homeCoral} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, minHeight: 64 },
  flag: { fontSize: 24 },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  detail: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
