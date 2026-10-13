/**
 * Home card for collectors with an empty collection (UX-055, #207): the fast
 * way to build a collection is picking pins from the catalogue, not scanning
 * each one. Hidden once anything is collected.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { ADD_PINS_ROUTE } from '@/utils/addPinsOnboarding';

export function AddPinsCard() {
  const colors = useColors();
  const router = useRouter();
  const { collection } = useCollection();
  if (Object.keys(collection).length > 0) return null;
  return (
    <TouchableOpacity
      onPress={() => router.push(ADD_PINS_ROUTE)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Add the pins you own. Pick from the catalogue, no scanning needed."
      style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
        <Feather name="grid" size={18} color={colors.homeCoralDeep} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.homeInk }]}>Add the pins you own</Text>
        <Text style={[styles.detail, { color: colors.homeMuted }]}>Pick from the catalogue, no scanning needed</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.homeMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 20, padding: 11, marginTop: 14 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  detail: { fontSize: 11.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
});
