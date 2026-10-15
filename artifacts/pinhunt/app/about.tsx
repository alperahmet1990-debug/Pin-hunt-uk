import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useColors } from '@/hooks/useColors';
import { buildInfoLines } from '@/utils/buildInfo';

export default function AboutScreen() {
  const colors = useColors();
  const name = Constants.expoConfig?.name ?? 'PinHunt';
  // Which version and over-the-air update is running (#286), so a tester can
  // tell whether the latest `ota-update` has arrived.
  const [versionLine, ...updateLines] = buildInfoLines({
    version: Constants.expoConfig?.version ?? '1.0.0',
    updatesEnabled: Updates.isEnabled,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    updateId: Updates.updateId,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    createdAt: Updates.createdAt,
  });
  return (
    <ScrollView
      style={{ backgroundColor: colors.homeBackground }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
        <Text style={[styles.name, { color: colors.homeInk }]}>{name}</Text>
        <Text style={[styles.version, { color: colors.homeMuted }]}>{versionLine}</Text>
        <Text style={[styles.body, { color: colors.homeMuted }]}>
          Catalogue, collect and trade Disney pins.
        </Text>
        {updateLines.length > 0 && (
          <View style={[styles.build, { borderTopColor: colors.homeLine }]}>
            {updateLines.map(line => (
              <Text key={line} selectable style={[styles.buildLine, { color: colors.homeMuted }]}>{line}</Text>
            ))}
          </View>
        )}
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
  build: { alignSelf: 'stretch', alignItems: 'center', gap: 2, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  buildLine: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
