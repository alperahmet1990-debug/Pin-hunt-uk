/**
 * Collector Profile screen — public profile view.
 * Accessible from Find Collectors or any deep-link to /collector/:username.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useProfile } from '@/context/ProfileContext';
import type { PublicProfile } from '@workspace/pin-repository';

function initials(p: PublicProfile): string {
  const name = p.displayName || p.username;
  return name
    .split(' ')
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export default function CollectorProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { getPublicProfile } = useProfile();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    getPublicProfile(username)
      .then(p => {
        if (!p) setNotFound(true);
        else setProfile(p);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [username, getPublicProfile]);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  return (
    <>
      <Stack.Screen
        options={{
          title: profile?.username ? `@${profile.username}` : 'Collector',
          headerBackTitle: 'Back',
        }}
      />
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {loading ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : notFound || !profile ? (
          <View style={styles.centred}>
            <Feather name="user-x" size={40} color={colors.mutedForeground} />
            <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Profile Not Found</Text>
            <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
              This profile is private or doesn't exist.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          >
            {/* Avatar + identity */}
            <View style={[styles.hero, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>{initials(profile)}</Text>
              </View>
              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {profile.displayName || `@${profile.username}`}
              </Text>
              <Text style={[styles.username, { color: colors.mutedForeground }]}>
                @{profile.username}
              </Text>

              {/* Trading region */}
              {profile.tradingRegion ? (
                <View style={styles.metaRow}>
                  <Feather name="map-pin" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{profile.tradingRegion}</Text>
                </View>
              ) : null}

              {/* International trading badge */}
              {profile.internationalTradingEnabled && (
                <View style={[styles.badge, { backgroundColor: colors.primary + '22' }]}>
                  <Feather name="globe" size={12} color={colors.primary} />
                  <Text style={[styles.badgeText, { color: colors.primary }]}>Open to international trades</Text>
                </View>
              )}
            </View>

            {/* Bio */}
            {profile.bio ? (
              <View style={[styles.section, { marginHorizontal: 16, marginTop: 20 }]}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ABOUT</Text>
                <View style={[styles.bioCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.bioText, { color: colors.foreground }]}>{profile.bio}</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  notFoundText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 32 },
  hero: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#fff' },
  displayName: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  username: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  badgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  bioCard: { borderWidth: 1, borderRadius: 14, padding: 16 },
  bioText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },
});
