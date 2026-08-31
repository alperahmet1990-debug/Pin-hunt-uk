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
import { Avatar } from '@/components/Avatar';
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
  badge?: number;
}

function SettingsRow({ icon, label, value, onPress, destructive, last, badge }: SettingsRowProps) {
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
      {badge != null && badge > 0 ? (
        <View style={styles.badgePill}>
          <Text style={styles.badgePillText}>{badge}</Text>
        </View>
      ) : null}
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

// ─── Location status banner ───────────────────────────────────────────────────

interface LocationStatusBannerProps {
  hasLocationSet: boolean;
  nearbyEnabled: boolean;
  radiusMiles: number;
  onPress: () => void;
}

function LocationStatusBanner({ hasLocationSet, nearbyEnabled, radiusMiles, onPress }: LocationStatusBannerProps) {
  const colors = useColors();

  const active   = hasLocationSet && nearbyEnabled;
  const setOnly  = hasLocationSet && !nearbyEnabled;
  // not set = neither flag

  const iconName: keyof typeof Feather.glyphMap = active ? 'map-pin' : setOnly ? 'map-pin' : 'map-pin';
  const iconColor  = active ? colors.owned : setOnly ? '#F59E0B' : colors.mutedForeground;
  const borderColor = active ? colors.owned + '40' : setOnly ? '#F59E0B40' : colors.border;
  const bgColor    = active ? colors.owned + '12' : setOnly ? '#F59E0B12' : colors.secondary;

  const headline = active
    ? `Discoverable · Within ${radiusMiles} miles`
    : setOnly
    ? 'Set location'
    : 'Set location';

  const detail = active
    ? 'You appear in Collectors Nearby searches'
    : setOnly
    ? 'Turn on "Appear in Collectors Nearby" in Edit Profile'
    : 'Add your postcode in Edit Profile to appear in nearby searches';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.locationBanner,
        { backgroundColor: bgColor, borderColor, marginHorizontal: 16 },
      ]}
    >
      <View style={[styles.locationIconWrap, { backgroundColor: iconColor + '20' }]}>
        <Feather name={iconName} size={16} color={iconColor} />
      </View>
      <View style={styles.locationText}>
        <Text style={[styles.locationHeadline, { color: iconColor }]}>{headline}</Text>
        <Text style={[styles.locationDetail, { color: colors.mutedForeground }]}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
//
// Reached by tapping the avatar on Home. Previously a tab-bar root; now a
// pushed Stack screen (registered in app/_layout.tsx) so it gets a proper
// native header + back button like every other detail screen, instead of
// living inside the tab navigator with no way back except the tab bar.

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, loading } = useProfile();
  const { signOut } = useAuth();
  const isAdmin = profile?.isAdmin === true;

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  // Avatar initials from display name, username, or email
  const { user } = useAuth();
  const nameForInitials = profile?.username || user?.email || '?';

  const joinYear = profile?.createdAt ? new Date(profile.createdAt).getFullYear() : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: botPad }}
      >
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Profile card */}
            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, marginHorizontal: 16 }]}>
              <Avatar uri={profile?.avatarUrl} name={nameForInitials} size={80} />

              <Text style={[styles.displayName, { color: colors.foreground }]}>
                {profile?.username ? `@${profile.username}` : 'Your Profile'}
              </Text>

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

            </View>

            {/* Location / Nearby status */}
            <LocationStatusBanner
              hasLocationSet={profile?.hasLocationSet ?? false}
              nearbyEnabled={profile?.nearbyDiscoveryEnabled ?? false}
              radiusMiles={profile?.preferredRadiusMiles ?? 25}
              onPress={() =>
                profile?.hasLocationSet && profile?.nearbyDiscoveryEnabled
                  ? router.push('/nearby')
                  : router.push({ pathname: '/edit-profile', params: { section: 'location' } })
              }
            />

            {/* Account */}
            <Section title="Account">
              <SettingsRow
                icon="edit-2"
                label="Edit Profile"
                onPress={() => router.push('/edit-profile')}
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
              <SettingsRow icon="download" label="Export Collection" last />
            </Section>

            {/* Support */}
            <Section title="Support">
              <SettingsRow icon="info" label="About PinHunt UK" />
              <SettingsRow icon="message-circle" label="Send Feedback" />
              <SettingsRow icon="star" label="Rate the App" last />
            </Section>

            {/* Admin */}
            {isAdmin && (
              <Section title="Admin">
                <SettingsRow
                  icon="settings"
                  label="Admin Area"
                  onPress={() => router.push('/admin' as any)}
                  last
                />
              </Section>
            )}

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
  displayName: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  region: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  bio: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  memberSince: { fontSize: 12, fontFamily: 'Inter_400Regular' },
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
  badgePill: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePillText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  footer: { alignItems: 'center', paddingTop: 8, gap: 4 },
  footerText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  // Location status banner
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  locationIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  locationText: { flex: 1 },
  locationHeadline: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  locationDetail: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1, lineHeight: 16 },
});
