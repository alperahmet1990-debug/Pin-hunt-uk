import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { CollectionStatus } from '@/types/pin';

interface CollectionBadgeProps {
  status: CollectionStatus;
  size?: 'sm' | 'md';
}

const LABELS: Record<CollectionStatus, string> = {
  owned: 'Owned',
  wanted: 'ISO',
  for_trade: 'For Trade',
  none: '',
};

export function CollectionBadge({ status, size = 'sm' }: CollectionBadgeProps) {
  const colors = useColors();

  if (status === 'none') return null;

  const bgColor =
    status === 'owned'
      ? colors.owned
      : status === 'wanted'
        ? colors.wanted
        : colors.forTrade;

  const isSm = size === 'sm';

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, isSm && styles.sm]}>
      <Text
        style={[
          styles.label,
          { color: '#fff' },
          isSm ? styles.labelSm : styles.labelMd,
        ]}
        numberOfLines={1}
      >
        {LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
  },
  labelSm: {
    fontSize: 10,
  },
  labelMd: {
    fontSize: 12,
  },
});
