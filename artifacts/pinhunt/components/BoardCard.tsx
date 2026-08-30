import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { getPinImageSource } from '@/utils/pinImage';
import type { Board } from '@/types/board';
import type { CataloguePin } from '@workspace/pin-repository';

interface BoardCardProps {
  board: Board;
  pins: CataloguePin[];
  onPress: () => void;
}

export function BoardCard({ board, pins, onPress }: BoardCardProps) {
  const colors = useColors();
  const thumbs = pins.slice(0, 4);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      {/* Thumbnail grid */}
      {thumbs.length === 0 ? (
        <View style={[styles.emptyThumb, { backgroundColor: colors.muted }]}>
          <Feather name="grid" size={24} color={colors.mutedForeground} />
        </View>
      ) : thumbs.length === 1 ? (
        <Image source={getPinImageSource(thumbs[0])} style={styles.singleThumb} />
      ) : (
        <View style={styles.thumbGrid}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.thumbCell, { backgroundColor: colors.muted }]}>
              {thumbs[i] ? (
                <Image source={getPinImageSource(thumbs[i]!)} style={styles.thumbCellImage} />
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
          {board.name}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.count, { color: colors.mutedForeground }]}>
            {pins.length} {pins.length === 1 ? 'pin' : 'pins'}
          </Text>
          {!board.isCustom && (
            <View style={[styles.suggestedBadge, { backgroundColor: colors.accent + '22' }]}>
              <Text style={[styles.suggestedLabel, { color: colors.accent }]}>Suggested</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Compact horizontal card for use in the collection list header */
export function BoardCardHorizontal({ board, pins, onPress }: BoardCardProps) {
  const colors = useColors();
  const thumb = pins[0];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.hCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      {thumb ? (
        <Image source={getPinImageSource(thumb)} style={styles.hThumb} />
      ) : (
        <View style={[styles.hThumb, styles.hThumbEmpty, { backgroundColor: colors.muted }]}>
          <Feather name="grid" size={18} color={colors.mutedForeground} />
        </View>
      )}
      <View style={styles.hInfo}>
        <Text style={[styles.hName, { color: colors.foreground }]} numberOfLines={2}>
          {board.name}
        </Text>
        <Text style={[styles.hCount, { color: colors.mutedForeground }]}>
          {pins.length} {pins.length === 1 ? 'pin' : 'pins'}
        </Text>
        {!board.isCustom && (
          <View style={[styles.suggestedBadge, { backgroundColor: colors.accent + '22', marginTop: 4 }]}>
            <Text style={[styles.suggestedLabel, { color: colors.accent }]}>Suggested</Text>
          </View>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginRight: 10 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Vertical card
  card: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
  },
  emptyThumb: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleThumb: {
    width: '100%',
    aspectRatio: 1,
    resizeMode: 'cover',
  },
  thumbGrid: {
    width: '100%',
    aspectRatio: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  thumbCell: {
    width: '50%',
    height: '50%',
    overflow: 'hidden',
  },
  thumbCellImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  info: {
    padding: 10,
    gap: 5,
  },
  name: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 17,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  count: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  suggestedBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  suggestedLabel: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
  },
  // Horizontal card
  hCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  hThumb: {
    width: 72,
    height: 72,
    resizeMode: 'cover',
  },
  hThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hInfo: {
    flex: 1,
    padding: 12,
    gap: 3,
  },
  hName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 18,
  },
  hCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
