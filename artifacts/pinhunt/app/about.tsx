import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useColors } from '@/hooks/useColors';

export default function AboutScreen() {
  const colors = useColors();
  const name = Constants.expoConfig?.name ?? 'PinHunt';
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <ScrollView
      style={{ backgroundColor: colors.homeBackground }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
        <Text style={[styles.name, { color: colors.homeInk }]}>{name}</Text>
        <Text style={[styles.version, { color: colors.homeMuted }]}>Version {version}</Text>
        <Text style={[styles.body, { color: colors.homeMuted }]}>
          Catalogue, collect and trade Disney pins.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  card: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'center', gap: 6 },
  name: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  version: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
