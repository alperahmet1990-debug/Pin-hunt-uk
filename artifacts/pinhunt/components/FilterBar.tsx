import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Brand, CollectionStatus } from '@/types/pin';

export type StatusFilter = CollectionStatus | 'any';

interface FilterBarProps {
  selectedBrand: Brand | 'All';
  onBrandChange: (brand: Brand | 'All') => void;
  selectedStatus: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
}

const BRANDS: Array<Brand | 'All'> = ['All', 'Disney Parks', 'Loungefly', 'BoxLunch'];

const STATUSES: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'any' },
  { label: 'Owned', value: 'owned' },
  { label: 'Wanted', value: 'wanted' },
  { label: 'For Trade', value: 'for_trade' },
  { label: 'Not in Collection', value: 'none' },
];

function Chip({
  label,
  active,
  onPress,
  activeColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
}) {
  const colors = useColors();
  const bg = active ? (activeColor ?? colors.primary) : colors.secondary;
  const fg = active ? '#fff' : colors.mutedForeground;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, { backgroundColor: bg, borderRadius: colors.radius - 2, borderColor: active ? 'transparent' : colors.border }]}
    >
      <Text style={[styles.chipLabel, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function FilterBar({
  selectedBrand,
  onBrandChange,
  selectedStatus,
  onStatusChange,
}: FilterBarProps) {
  const colors = useColors();

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {BRANDS.map(b => (
          <Chip
            key={b}
            label={b}
            active={selectedBrand === b}
            onPress={() => onBrandChange(b)}
          />
        ))}
      </ScrollView>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {STATUSES.map(s => (
          <Chip
            key={s.value}
            label={s.label}
            active={selectedStatus === s.value}
            onPress={() => onStatusChange(s.value)}
            activeColor={
              s.value === 'owned'
                ? colors.owned
                : s.value === 'wanted'
                  ? colors.wanted
                  : s.value === 'for_trade'
                    ? colors.forTrade
                    : undefined
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 0,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
});
