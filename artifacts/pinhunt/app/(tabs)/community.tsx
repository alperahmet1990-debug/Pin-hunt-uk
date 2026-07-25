/**
 * Community tab — placeholder screen.
 *
 * Full community features (feed, messaging, trade requests) are planned
 * in a future task. This screen makes the navigation slot visible without
 * showing fake or misleading UI.
 */
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const PLANNED_FEATURES = [
  { icon: 'rss' as const, label: 'Community feed — see what collectors are trading' },
  { icon: 'repeat' as const, label: 'Trade requests — propose swaps with other members' },
  { icon: 'message-circle' as const, label: 'Direct messages — chat with traders' },
  { icon: 'users' as const, label: 'Find collectors — browse profiles near you' },
  { icon: 'award' as const, label: 'Trading reputation — ratings and badges' },
];

export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: botPad,
          flexGrow: 1,
        }}
      >
        {/* Page title */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Community</Text>
        </View>

        {/* Dev-state notice */}
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
              marginHorizontal: 16,
            },
          ]}
        >
          <View style={[styles.noticeIconWrap, { backgroundColor: colors.secondary, borderRadius: 20 }]}>
            <Feather name="tool" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.noticeTitle, { color: colors.foreground }]}>
            Coming soon
          </Text>
          <Text style={[styles.noticeBody, { color: colors.mutedForeground }]}>
            Community features are in development and will be released in a future update.
            The tab is here so you can see where everything will live.
          </Text>
        </View>

        {/* Planned features list */}
        <View style={styles.featuresSection}>
          <Text style={[styles.featuresHeading, { color: colors.mutedForeground }]}>
            WHAT'S PLANNED
          </Text>
          <View
            style={[
              styles.featuresCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            {PLANNED_FEATURES.map((f, i) => (
              <View
                key={f.label}
                style={[
                  styles.featureRow,
                  i < PLANNED_FEATURES.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.featureIcon,
                    { backgroundColor: colors.secondary, borderRadius: 8 },
                  ]}
                >
                  <Feather name={f.icon} size={16} color={colors.primary} />
                </View>
                <Text style={[styles.featureLabel, { color: colors.foreground }]}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, marginBottom: 20 },
  title: { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },

  noticeCard: {
    alignItems: 'center',
    padding: 28,
    borderWidth: 1,
    gap: 12,
    marginBottom: 32,
  },
  noticeIconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  noticeTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  noticeBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  featuresSection: { marginHorizontal: 16 },
  featuresHeading: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  featuresCard: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
});
