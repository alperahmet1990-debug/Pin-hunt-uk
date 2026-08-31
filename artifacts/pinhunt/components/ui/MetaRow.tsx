import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { spacing } from '@/constants/theme';

interface MetaRowProps {
  label: string;
  value: string;
  last?: boolean;
}

/** Compact label/value row for technical or catalogue detail lists (Sea Glass design language). */
export function MetaRow({ label, value, last }: MetaRowProps) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.homeLine },
      ]}
    >
      <Text style={[styles.label, { color: colors.homeMuted }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.value, { color: colors.homeInk }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  label: { fontSize: 12.5, fontFamily: 'Inter_500Medium', flex: 1 },
  value: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold', flex: 1.3, textAlign: 'right' },
});
