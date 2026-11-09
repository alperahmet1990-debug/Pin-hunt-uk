/**
 * "Where your pins live" link on the Collection screen (#547): how many pins
 * still have no place, and the way into Find them a home / your places.
 * Render only when getPinLocationService() is set.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { usePinLocations } from '@/hooks/usePinLocations';
import { radius, spacing } from '@/constants/theme';

const pinsWord = (n: number) => `${n} ${n === 1 ? 'pin' : 'pins'}`;

export function PlacesLinkRow({ ownedIds, onPress }: { ownedIds: string[]; onPress: () => void }) {
  const colors = useColors();
  const loc = usePinLocations();
  if (loc.status === 'off' || ownedIds.length === 0) return null;
  const unplaced = ownedIds.filter(id => !loc.locations[id]).length;
  const detail = loc.places.length === 0
    ? 'Track which book, page or frame each pin is in'
    : unplaced > 0 ? `${pinsWord(unplaced)} without a place` : 'Every pin has a place';

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Where your pins live: ${detail}`}
      style={[styles.row, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
        <Feather name="book-open" size={16} color={colors.homeCoralDeep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.homeInk }]}>Where your pins live</Text>
        <Text style={[styles.detail, { color: colors.homeMuted }]} numberOfLines={1}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.homeMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  detail: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 },
});
