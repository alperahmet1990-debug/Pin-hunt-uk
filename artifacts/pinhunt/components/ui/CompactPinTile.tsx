import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { getPinImageSource } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import type { CataloguePin } from '@workspace/pin-repository';

interface CompactPinTileProps {
  pin: CataloguePin;
  owned: boolean;
  size: number;
  onPress: () => void;
  /** Small "+" affordance for a missing pin — mirrors PinCard's existing quick-add pattern. */
  onQuickAdd?: () => void;
}

/**
 * Small, image-led pin preview — "what else is in this set?", not a shopping card.
 * Used by Pin Detail's set strip and the Set Detail grid so both share one look.
 */
export function CompactPinTile({ pin, owned, size, onPress, onQuickAdd }: CompactPinTileProps) {
  const colors = useColors();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ width: size }}>
      <View style={[styles.imageWrap, { width: size, height: size, backgroundColor: colors.homeAqua, opacity: owned ? 1 : 0.5 }]}>
        <Image source={getPinImageSource(pin)} style={styles.image} resizeMode="contain" />
        {owned && (
          <View style={[styles.ownedBadge, { backgroundColor: colors.owned }]}>
            <Feather name="check" size={9} color={colors.homeSurface} />
          </View>
        )}
        {!owned && onQuickAdd && (
          <TouchableOpacity
            onPress={e => { e.stopPropagation?.(); onQuickAdd(); }}
            hitSlop={8}
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
  ownedBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
