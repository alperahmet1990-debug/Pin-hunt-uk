import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CollectionStatus } from '@/types/pin';
import { Chip, type ChipTone } from './Chip';

type ActiveStatus = Exclude<CollectionStatus, 'none'>;

/** Icon, colour and words for each collection state, matching QuickAddSheet. ISO and For Trade stay distinct. */
export const STATUS_BADGE: Record<ActiveStatus, {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  tone: ChipTone;
  accessibilityLabel: string;
}> = {
  owned: { label: 'Owned', icon: 'check-circle', tone: 'owned', accessibilityLabel: 'Status: Owned' },
  wanted: { label: 'ISO', icon: 'bookmark', tone: 'wanted', accessibilityLabel: 'Status: ISO, on your wishlist' },
  for_trade: { label: 'For Trade', icon: 'repeat', tone: 'forTrade', accessibilityLabel: 'Status: For Trade' },
};

interface StatusBadgeProps {
  status: CollectionStatus | undefined;
  size?: 'sm' | 'md';
}

/** Collection status marker (icon + colour + label). Renders nothing for pins not in the collection. */
export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  if (!status || status === 'none') return null;
  const cfg = STATUS_BADGE[status];
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={cfg.accessibilityLabel}>
      <Chip label={cfg.label} icon={cfg.icon} tone={cfg.tone} size={size} />
    </View>
  );
}
