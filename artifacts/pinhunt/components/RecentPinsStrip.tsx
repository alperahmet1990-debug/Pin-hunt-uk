/**
 * Home: a strip of the collector's most recently added pins (B-P2-03, #59),
 * so there are pin pictures above the fold. The first tile is Find Trades,
 * which keeps that entry point on Home (maintainer amendment, 12 Oct 2026).
 */
import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { PinImage } from '@/components/ui/PinImage';
import { STATUS_BADGE } from '@/components/ui/StatusBadge';
import { getPinImageSource } from '@/utils/pinImage';
import type { CollectionMap } from '@/types/collection';

export const RECENT_STRIP_SIZE = 12;
const TILE = 72;

/** The most recently added pins on any list (Owned, For Trade, ISO), newest first. */
export function recentEntries(collection: CollectionMap, limit = RECENT_STRIP_SIZE) {
  return Object.values(collection)
    .filter(e => e.status === 'owned' || e.status === 'for_trade' || e.status === 'wanted')
    .sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : a.dateAdded > b.dateAdded ? -1 : 0))
    .slice(0, limit);
}

export function RecentPinsStrip() {
  const colors = useColors();
  const router = useRouter();
  const { collection } = useCollection();
  const { pins, ensurePins } = usePinCatalogue();
  const recent = useMemo(() => recentEntries(collection), [collection]);
  const byId = useMemo(() => new Map(pins.map(p => [p.id, p])), [pins]);

  // Recent pins may sit outside the cached catalogue slice.
  const missing = recent.filter(e => !byId.has(e.pinId)).map(e => e.pinId).join(',');
  useEffect(() => {
    if (missing) ensurePins(missing.split(',')).catch(() => {});
  }, [missing, ensurePins]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Find Trades: see who has your ISO pins and who wants yours"
        onPress={() => router.push('/find-trades')}
        activeOpacity={0.85}
        style={styles.tile}
      >
        <View style={[styles.image, styles.findTrades, { backgroundColor: colors.homeTeal }]}>
          <Feather name="compass" size={26} color={colors.homeSand} />
        </View>
        <Text numberOfLines={1} style={[styles.label, { color: colors.homeInk }]}>Find Trades</Text>
      </TouchableOpacity>

      {recent.map(entry => {
        const pin = byId.get(entry.pinId);
        if (!pin) return null;
        const status = entry.status as keyof typeof STATUS_BADGE;
        return (
          <TouchableOpacity
            key={entry.pinId}
            accessibilityRole="button"
            accessibilityLabel={`${pin.title}, ${STATUS_BADGE[status].label}`}
            onPress={() => router.push({ pathname: '/pin/[id]', params: { id: pin.id } })}
            activeOpacity={0.85}
            style={styles.tile}
          >
            <PinImage
              source={getPinImageSource(pin)}
              style={[styles.image, { backgroundColor: colors.homeAqua }]}
              contentFit="contain"
            />
            <Text numberOfLines={1} style={[styles.label, { color: colors.homeInk }]}>{pin.title}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 10, paddingRight: 16 },
  tile: { width: TILE },
  image: { width: TILE, height: TILE, borderRadius: 16 },
  findTrades: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14, fontFamily: 'Inter_600SemiBold', marginTop: 5 },
});
