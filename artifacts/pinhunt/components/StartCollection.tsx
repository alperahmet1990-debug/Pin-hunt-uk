/**
 * The empty Collection (TestFlight feedback, 11 Nov 2026: "looks quite messy
 * and odd when there's nothing in the collection").
 *
 * One clear starting point instead of zero counters, view toggles and a
 * sort with nothing to sort. Adding from the catalogue leads, because most
 * collectors already own pins and Select all on a set is the quickest way
 * in (UX-055); scanning is the second way.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { ADD_PINS_LABEL } from '@/utils/addPinsOnboarding';

export function StartCollection({ onAddFromCatalogue, onScan }: {
  onAddFromCatalogue: () => void;
  onScan: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.wrap} testID="start-collection">
      <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
        <Feather name="heart" size={26} color={colors.homeCoral} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>Start your collection</Text>
      <Text style={[styles.body, { color: colors.homeMuted }]}>
        Add the pins you own. You can sort them into boards later.
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onAddFromCatalogue}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${ADD_PINS_LABEL}. Pick a set and tap Select all`}
          style={[styles.action, { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral }]}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.homeSurface + '33' }]}>
            <Feather name="grid" size={18} color={colors.homeSurface} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: colors.homeSurface }]}>{ADD_PINS_LABEL}</Text>
            <Text style={[styles.actionDetail, { color: colors.homeSurface }]}>Quickest if you already own pins: pick a set and tap Select all.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.homeSurface} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onScan}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scan a pin. Point your camera at a pin to find it"
          style={[styles.action, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.homeAqua }]}>
            <Feather name="camera" size={18} color={colors.homeCoral} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: colors.homeInk }]}>Scan a pin</Text>
            <Text style={[styles.actionDetail, { color: colors.homeMuted }]}>Point your camera at a pin to find it.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.homeMuted} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.foot, { color: colors.homeMuted }]}>
        Pins you're hunting for go on your ISO. Pins you'd swap go in For Trade.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: spacing.sm, gap: spacing.sm },
  icon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.4, textAlign: 'center' },
  body: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, minHeight: 68 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1, minWidth: 0, gap: 2 },
  actionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  actionDetail: { fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 17, opacity: 0.92 },
  foot: { fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center', marginTop: spacing.md, maxWidth: 320 },
});
