/**
 * Privacy Policy and Terms of Use (/legal/privacy, /legal/terms). Copy lives
 * in utils/legal.ts. Open to signed-out visitors too (utils/recoveryLink.ts
 * resolveGuardTarget), so the documents can be read before signing up.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { LEGAL_DOCS, LAST_UPDATED, companyLine, legalDraft } from '@/utils/legal';

export default function LegalDocScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { doc: slug } = useLocalSearchParams<{ doc: string }>();
  const doc = slug === 'terms' ? LEGAL_DOCS.terms : LEGAL_DOCS.privacy;

  return (
    <ScrollView
      style={{ backgroundColor: colors.homeBackground }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <Stack.Screen options={{ title: doc.title }} />
      {legalDraft() && (
        <View style={[styles.draft, { backgroundColor: colors.homeAqua }]} accessibilityRole="alert">
          <Feather name="edit-3" size={16} color={colors.homeCoral} />
          <Text style={[styles.draftText, { color: colors.homeInk }]}>
            Draft. Some company details are still to be confirmed.
          </Text>
        </View>
      )}
      <Text style={[styles.intro, { color: colors.homeInk }]}>{doc.intro}</Text>
      {doc.sections.map(section => (
        <View key={section.title} style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.homeInk }]}>{section.title}</Text>
          {section.body.map((block, i) =>
            Array.isArray(block) ? (
              <View key={i} style={styles.list}>
                {block.map(item => (
                  <View key={item} style={styles.point}>
                    <Text style={[styles.bullet, { color: colors.homeMuted }]}>•</Text>
                    <Text selectable style={[styles.text, { color: colors.homeInk }]}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text key={i} selectable style={[styles.text, { color: colors.homeInk }]}>{block}</Text>
            ),
          )}
        </View>
      ))}
      <Text style={[styles.footer, { color: colors.homeMuted }]}>
        {companyLine()}{'\n'}Last updated {LAST_UPDATED}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  draft: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', borderRadius: radius.lg, padding: spacing.md },
  draftText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
  intro: { fontSize: 14.5, lineHeight: 21, fontFamily: 'Inter_500Medium' },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  list: { gap: 6 },
  point: { flexDirection: 'row', gap: spacing.sm },
  bullet: { fontSize: 14, lineHeight: 20 },
  text: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  footer: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: spacing.sm },
});
