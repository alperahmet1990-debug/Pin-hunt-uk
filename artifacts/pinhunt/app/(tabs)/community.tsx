/**
 * Community tab — entry point for collector community features.
 */
import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

const COMING_SOON = [
  { icon: 'rss' as const, label: 'Community feed — see what collectors are trading' },
  { icon: 'message-circle' as const, label: 'Direct messages — chat privately with traders' },
  { icon: 'award' as const, label: 'Events & meets — local Disney pin trading events' },
];

export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Find collectors and trade pins near you
          </Text>
        </View>

        {/* ── Collectors Nearby card ── */}
        <View style={[styles.sectionPad]}>
          <TouchableOpacity
            onPress={() => router.push('/nearby')}
            activeOpacity={0.85}
            style={[
              styles.nearbyCard,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
              },
            ]}
          >
            <View style={styles.nearbyCardInner}>
              <View style={[styles.nearbyIconWrap, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Feather name="map-pin" size={26} color="#fff" />
              </View>
              <View style={styles.nearbyText}>
                <Text style={styles.nearbyTitle}>Collectors Nearby</Text>
                <Text style={styles.nearbySub}>
                  Discover pin collectors in your area and find great trade matches
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Trade requests (existing entry) ── */}
        <View style={[styles.sectionPad]}>
          <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>
            TRADING
          </Text>
          <View
            style={[
              styles.actionCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <TouchableOpacity
              style={styles.actionRow}
              activeOpacity={0.7}
              onPress={() => router.push('/find-collectors')}
            >
              <View style={[styles.actionIcon, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                <Feather name="users" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: colors.foreground }]}>Find Collectors</Text>
                <Text style={[styles.actionDesc, { color: colors.mutedForeground }]}>Search by username or region</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Coming soon ── */}
        <View style={[styles.sectionPad]}>
          <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>
            COMING SOON
          </Text>
          <View
            style={[
              styles.actionCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            {COMING_SOON.map((f, i) => (
              <View
                key={f.label}
                style={[
                  styles.actionRow,
                  i < COMING_SOON.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.actionIcon, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                  <Feather name={f.icon} size={16} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.mutedForeground, flex: 1 }]}>
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
  header: { paddingHorizontal: 16, marginBottom: 24, gap: 4 },
  title: { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular' },

  sectionPad: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeading: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  nearbyCard: { overflow: 'hidden' },
  nearbyCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  nearbyIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyText: { flex: 1 },
  nearbyTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    marginBottom: 3,
  },
  nearbySub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 16,
  },

  actionCard: { borderWidth: 1, overflow: 'hidden' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  actionIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  actionDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
});
