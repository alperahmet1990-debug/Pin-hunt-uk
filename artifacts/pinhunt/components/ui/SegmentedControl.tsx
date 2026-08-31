import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import type { ChipTone } from './Chip';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  tone: ChipTone;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

function toneColor(colors: ReturnType<typeof useColors>, tone: ChipTone): string {
  switch (tone) {
    case 'coral': return colors.homeCoral;
    case 'coralDeep': return colors.homeCoralDeep;
    case 'teal': return colors.homeTeal;
    case 'sand': return colors.homeSandInk;
    case 'owned': return colors.owned;
    case 'wanted': return colors.wanted;
    case 'forTrade': return colors.forTrade;
    case 'neutral':
    default:
      return colors.homeMuted;
  }
}

/** Segmented toggle used for mutually-exclusive collection states (Owned / ISO / For Trade). */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const colors = useColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
      {options.map(opt => {
        const active = opt.value === value;
        const tone = toneColor(colors, opt.tone);
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.85}
            style={[
              styles.segment,
              active && { backgroundColor: tone, shadowColor: tone },
              active && styles.segmentActiveShadow,
            ]}
          >
            {opt.icon && <Feather name={opt.icon} size={14} color={active ? colors.homeSurface : colors.homeMuted} />}
            <Text
              numberOfLines={1}
              style={[styles.label, { color: active ? colors.homeSurface : colors.homeMuted }]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  segmentActiveShadow: {
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  label: { fontSize: 12.5, fontFamily: 'Inter_700Bold' },
});
