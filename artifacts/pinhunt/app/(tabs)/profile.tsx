import React from 'react';
import {
  ActivityIndicator,
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
import { useCollection } from '@/context/CollectionContext';
import { useProfile } from '@/context/ProfileContext';
import { useAuth } from '@/context/AuthContext';

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SettingsRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
}

function SettingsRow({ icon, label, value, onPress, destructive, last }: SettingsRowProps) {
  const colors = useColors();
  const fg = destructive ? colors.destructive : colors.foreground;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: destructive ? colors.destructive + '18' : colors.secondary, borderRadius: 8 }]}>
        <Feather name={icon} size={16} color={fg} />
      </View>
      <Text style={[styles.rowLabel, { color: fg }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>
      ) : null}
      <Feather name="chevron-right" size={16} color={destructive ? colors.destructive + '88' : colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
        {children}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { counts } = useCollection();
  const { profile, loading } = useProfile();
  const { signOut, user } = useAuth();

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  // Avatar initials from display name, username, or email
  const nameForInitials = profile?.displayName || profile?.username || user?.email || '?';
  const avatarInitials = nameForInitials
    .split(/[\s@]/)
    .map((n: string) => n[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  const joinYear = profile?.createdAt ? new Date(profile.createdAt).getFullYear() : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad }}
      >
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Profile card */}
            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, marginHorizontal: 16 }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarInitials}>{avatarInitials}</Text>
              </View>

              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {profile?.displayName || (profile?.username ? `@${profile.username}` : 'Your Profile')}
              </Text>

              {profile?.username && (
                <Text style={[styles.usernameLabel, { color: colors.mutedForeground }]}>
                  @{profile.username}
                </Text>
              )}

              {profile?.tradingRegion && (
                <View style={styles.regionRow}>
                  <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.region, { color: colors.mutedForeground }]}>{profile.tradingRegion}</Text>
                </View>
              )}

              {profile?.bio ? (
                <Text style={[styles.bio, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {profile.bio}
                </Text>
              ) : null}

              {joinYear && (
                <Text style={[styles.memberSince, { color: colors.mutedForeground }]}>
                  Member since {joinYear}
                </Text>
              )}

              {/* Collection stats */}
              <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                <View style={styles.statItem}>
                  <Text style={[styles.statCount, { color: colors.owned }]}>{counts.owned}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Owned</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statCount, { color: colors.wanted }]}>{counts.wanted}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>ISO</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statCount, { color: colors.forTrade }]}>{counts.forTrade}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>For Trade</Text>
                </View>
              </View>
            </View>

            {/* Account */}
            <Section title="Account">
              <SettingsRow
                icon="edit-2"
                label="Edit Profile"
                onPress={() => router.push('/edit-profile')}
              />
              <SettingsRow
                icon="users"
                label="Find Collectors"
                onPress={() => router.push('/find-collectors')}
              />
              <SettingsRow
                icon="shopping-bag"
                label="My Marketplace Listings"
                onPress={() => router.push('/my-listings')}
                last
              />
            </Section>

            {/* App Settings */}
            <Section title="App">
              <SettingsRow icon="moon" label="Appearance" value="System" />
              <SettingsRow icon="download" label="Export Collection" last />
            </Section>

            {/* Support */}
            <Section title="Support">
              <SettingsRow icon="info" label="About PinHunt UK" />
              <SettingsRow icon="message-circle" label="Send Feedback" />
              <SettingsRow icon="star" label="Rate the App" last />
            </Section>

            {/* Sign out */}
            <Section title="Account">
              <SettingsRow
                icon="log-out"
                label="Sign Out"
                destructive
                onPress={() => signOut()}
                last
              />
            </Section>

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
                PinHunt UK · v0.1
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  profileCard: {
    alignItems: 'center',
    padding: 24,
    borderWidth: 1,
    marginBottom: 24,
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarInitials: { fontSize: 24, fontFamily: 'Inter_700Bold', color: '#fff' },
  displayName: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  usernameLabel: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: -2 },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  region: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  bio: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  memberSince: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingTop: 16,
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statCount: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  statDivider: { width: StyleSheet.hairlineWidth, height: 36 },
  section: { marginBottom: 20, marginHorizontal: 16 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 8, letterSpacing: 0.8 },
  sectionCard: { overflow: 'hidden', borderWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rowIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  rowValue: { fontSize: 13, fontFamily: 'Inter_400Regular', marginRight: 4 },
  footer: { alignItems: 'center', paddingTop: 8, gap: 4 },
  footerText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
});
