import React from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { CollectionBadge } from './CollectionBadge';
import type { Pin } from '@/types/pin';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 12) / 2;

const BRAND_COLORS: Record<string, string> = {
  'Disney Parks': '#1A4A8A',
  Loungefly: '#8A1A4A',
  BoxLunch: '#1A8A4A',
};

interface PinCardProps {
  pin: Pin;
  onPress: () => void;
  mode?: 'grid' | 'list';
}

export function PinCard({ pin, onPress, mode = 'grid' }: PinCardProps) {
  const colors = useColors();
  const { getEntry } = useCollection();
  const entry = getEntry(pin.id);
  const status = entry?.status ?? 'none';

  if (mode === 'list') {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[
          styles.listCard,
          {
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            borderColor: colors.border,
          },
        ]}
      >
        <Image source={pin.image} style={styles.listImage} />
        <View style={styles.listInfo}>
          <Text
            style={[styles.listTitle, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {pin.title}
          </Text>
          <View
            style={[
              styles.brandBadge,
              { backgroundColor: BRAND_COLORS[pin.brand] ?? colors.accent, borderRadius: 4 },
            ]}
          >
            <Text style={styles.brandLabel} numberOfLines={1}>
              {pin.brand}
            </Text>
          </View>
          <Text style={[styles.listMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {pin.collection}
          </Text>
          <View style={styles.listFooter}>
            <Text style={[styles.listPrice, { color: colors.gold }]}>
              £{pin.estimatedValueGBP.toFixed(0)}
            </Text>
            {status !== 'none' && <CollectionBadge status={status} size="sm" />}
          </View>
        </View>
        {pin.limitedEditionSize ? (
          <View style={[styles.leBadge, { backgroundColor: colors.gold }]}>
            <Text style={styles.leLabel}>LE {pin.limitedEditionSize.toLocaleString()}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.gridCard,
        {
          backgroundColor: colors.card,
          borderRadius: colors.radius,
          borderColor: colors.border,
          width: GRID_CARD_WIDTH,
        },
      ]}
    >
      <View style={styles.imageWrap}>
        <Image source={pin.image} style={styles.gridImage} />
        {pin.limitedEditionSize ? (
          <View style={[styles.leBadge, { backgroundColor: colors.gold }]}>
            <Text style={styles.leLabel}>LE</Text>
          </View>
        ) : null}
        {pin.isNewRelease ? (
          <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.newLabel}>NEW</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.gridInfo}>
        <Text
          style={[styles.gridTitle, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {pin.title}
        </Text>
        <View
          style={[
            styles.brandBadge,
            { backgroundColor: BRAND_COLORS[pin.brand] ?? colors.accent, borderRadius: 4 },
          ]}
        >
          <Text style={styles.brandLabel} numberOfLines={1}>
            {pin.brand}
          </Text>
        </View>
        <View style={styles.gridFooter}>
          <Text style={[styles.gridPrice, { color: colors.gold }]}>
            £{pin.estimatedValueGBP.toFixed(0)}
          </Text>
          {status !== 'none' && <CollectionBadge status={status} size="sm" />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Grid
  gridCard: {
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 12,
  },
  imageWrap: {
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: GRID_CARD_WIDTH,
    resizeMode: 'cover',
  },
  gridInfo: {
    padding: 10,
    gap: 6,
  },
  gridTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 17,
  },
  gridFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  gridPrice: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  // List
  listCard: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 10,
    position: 'relative',
  },
  listImage: {
    width: 90,
    height: 90,
    resizeMode: 'cover',
  },
  listInfo: {
    flex: 1,
    padding: 10,
    gap: 4,
  },
  listTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 18,
  },
  listMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  listFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  listPrice: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  // Shared
  brandBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  brandLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
  leBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  leLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#1A1A2E',
  },
  newBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  newLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});
