import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';

export type ChipTone = 'coral' | 'coralDeep' | 'teal' | 'sand' | 'neutral' | 'owned' | 'wanted' | 'forTrade';
export type ChipVariant = 'soft' | 'solid' | 'outline';

interface ChipProps {
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  tone?: ChipTone;
  variant?: ChipVariant;
  size?: 'sm' | 'md';
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

/** Small pill used for metadata tags, edition badges, and status labels — the "Sea Glass" chip language from Home. */
export function Chip({ label, icon, tone = 'neutral', variant = 'soft', size = 'md' }: ChipProps) {
  const colors = useColors();
  const base = toneColor(colors, tone);
  const isSm = size === 'sm';

  const bg = variant === 'solid' ? base : variant === 'outline' ? 'transparent' : base + '1E';
  const fg = variant === 'solid' ? colors.homeSurface : base;
  const borderColor = variant === 'outline' ? base + '55' : 'transparent';

  return (
    <View
      style={[
        styles.chip,
        isSm ? styles.sm : styles.md,
        { backgroundColor: bg, borderColor, borderWidth: variant === 'outline' ? 1 : 0 },
      ]}
    >
      {icon && <Feather name={icon} size={isSm ? 10 : 12} color={fg} />}
      <Text numberOfLines={1} style={[styles.label, isSm ? styles.labelSm : styles.labelMd, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  sm: { paddingHorizontal: spacing.sm, paddingVertical: 3 },
  md: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  label: { fontFamily: 'Inter_600SemiBold' },
  labelSm: { fontSize: 10.5 },
  labelMd: { fontSize: 12 },
});
