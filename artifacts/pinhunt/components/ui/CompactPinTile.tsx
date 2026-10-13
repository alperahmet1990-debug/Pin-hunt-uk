import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { getPinImageSource } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import type { CataloguePin } from '@workspace/pin-repository';
import type { CollectionStatus } from '@/types/pin';
import { STATUS_BADGE } from './StatusBadge';

interface CompactPinTileProps {
  pin: CataloguePin;
  owned: boolean;
  size: number;
  onPress: () => void;
  /** Small "+" affordance for a missing pin — mirrors PinCard's existing quick-add pattern. */
  onQuickAdd?: () => void;
  /**
   * Collection status for the corner marker (Owned ✓, For Trade ⇄, ISO bookmark).
   * Without it the tile only marks owned pins, as before.
   */
  status?: CollectionStatus;
  /** Copies owned; shown as ×N in the top-left corner when above 1. */
  copies?: number;
}

const MARKER_ICON: Record<Exclude<CollectionStatus, 'none'>, keyof typeof Feather.glyphMap> = {
  owned: 'check',
  for_trade: 'repeat',
  wanted: 'bookmark',
};

/**
 * Small, image-led pin preview — "what else is in this set?", not a shopping card.
 * Used by Pin Detail's set strip and the Set Detail grid so both share one look.
 */
export function CompactPinTile({ pin, owned, size, onPress, onQuickAdd, status, copies }: CompactPinTileProps) {
  const colors = useColors();
  const marker: Exclude<CollectionStatus, 'none'> | null =
    status && status !== 'none' ? status : owned ? 'owned' : null;
  const markerColor =
    marker === 'for_trade' ? colors.forTrade : marker === 'wanted' ? colors.wanted : colors.owned;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ width: size }}
      accessibilityRole="button"
      accessibilityLabel={
        [pin.title, marker && STATUS_BADGE[marker].label, copies && copies > 1 ? `${copies} copies` : null]
          .filter(Boolean)
          .join(', ')
      }
    >
      <View style={{ width: size, height: size }}>
        {/* Only the pin artwork fades for missing pins; the markers stay full strength. */}
        <View style={[styles.imageWrap, { width: size, height: size, backgroundColor: colors.homeAqua, opacity: owned ? 1 : 0.5 }]}>
          <Image source={getPinImageSource(pin)} style={styles.image} resizeMode="contain" />
        </View>
        {marker && (
          <View style={[styles.statusMarker, { backgroundColor: markerColor }]}>
            <Feather name={MARKER_ICON[marker]} size={9} color={colors.homeSurface} />
          </View>
        )}
        {copies != null && copies > 1 && (
          <View style={[styles.copiesBadge, { backgroundColor: colors.homeInk }]}>
            <Text style={[styles.copiesLabel, { color: colors.homeSurface }]}>×{copies}</Text>
          </View>
        )}
        {!owned && onQuickAdd && (
          <TouchableOpacity
            onPress={e => { e.stopPropagation?.(); onQuickAdd(); }}
            hitSlop={13}
            accessibilityLabel={`Quick add ${pin.title}`}
            style={[styles.addBadge, { backgroundColor: colors.homeCoral }]}
          >
            <Feather name="plus" size={11} color={colors.homeSurface} />
          </TouchableOpacity>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.name, { color: owned ? colors.homeInk : colors.homeMuted }]}>
        {pin.title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  imageWrap: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  image: { width: '100%', height: '100%' },
  statusMarker: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiesBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    minWidth: 22,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiesLabel: { fontSize: 9.5, fontFamily: 'Inter_700Bold' },
  addBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 6, textAlign: 'center' },
});
