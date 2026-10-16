/**
 * Trading safely (UX-032, #144): a short guide reached from collector
 * profiles and the agreed-trade card in chat. Copy lives in
 * utils/tradingSafely.ts. Advice only: nothing here buys postage, takes
 * payment or tracks parcels.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { TRADING_SAFELY_INTRO, TRADING_SAFELY_SECTIONS } from '@/utils/tradingSafely';

export default function TradingSafelyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: colors.homeBackground }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={[styles.hero, { backgroundColor: colors.homeAqua }]}>
        <Feather name="shield" size={22} color={colors.homeCoral} />
        <Text style={[styles.intro, { color: colors.homeInk }]}>{TRADING_SAFELY_INTRO}</Text>
      </View>
      {TRADING_SAFELY_SECTIONS.map(section => (
        <View
          key={section.title}
          style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }, section.comingLater && styles.later]}
        >
          <View style={styles.cardHead}>
            <Feather name={section.icon} size={17} color={section.comingLater ? colors.homeMuted : colors.homeCoral} />
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.homeInk }]}>{section.title}</Text>
            {section.comingLater && (
              <View style={[styles.laterPill, { backgroundColor: colors.homeAqua }]}>
                <Text style={[styles.laterText, { color: colors.homeMuted }]}>NOT AVAILABLE YET</Text>
              </View>
            )}
          </View>
          {section.points.map(point => (
            <View key={point} style={styles.point}>
              <Text style={[styles.bullet, { color: colors.homeMuted }]}>•</Text>
              <Text style={[styles.pointText, { color: section.comingLater ? colors.homeMuted : colors.homeInk }]}>{point}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', borderRadius: radius.lg, padding: spacing.lg },
  intro: { flex: 1, fontSize: 14.5, lineHeight: 20, fontFamily: 'Inter_600SemiBold' },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  later: { borderStyle: 'dashed' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginBottom: 2 },
  cardTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  laterPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  laterText: { fontSize: 9.5, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  point: { flexDirection: 'row', gap: spacing.sm },
  bullet: { fontSize: 14, lineHeight: 20 },
  pointText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
});
