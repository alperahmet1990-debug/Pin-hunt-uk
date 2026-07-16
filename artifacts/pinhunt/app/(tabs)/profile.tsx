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
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { MOCK_USER } from '@/mock-data/user';

interface SettingsRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}

function SettingsRow({ icon, label, value, onPress, destructive }: SettingsRowProps) {
  const colors = useColors();
  const fg = destructive ? colors.destructive : colors.foreground;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
        <Feather name={icon} size={16} color={fg} />
      </View>
      <Text style={[styles.rowLabel, { color: fg }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>
      ) : null}
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
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

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { counts } = useCollection();

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  const joinYear = new Date(MOCK_USER.joinDate).getFullYear();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad }}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, marginHorizontal: 16 }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarInitials}>
              {MOCK_USER.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </Text>
          </View>
          <Text style={[styles.displayName, { color: colors.foreground }]}>{MOCK_USER.displayName}</Text>
          <View style={styles.regionRow}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.region, { color: colors.mutedForeground }]}>{MOCK_USER.region}</Text>
          </View>
          <Text style={[styles.memberSince, { color: colors.mutedForeground }]}>Member since {joinYear}</Text>

          {/* Stats */}
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

        {/* Trading Preferences */}
        <Section title="Trading Preferences">
          <View style={styles.tradingPref}>
            <Text style={[styles.tradingText, { color: colors.foreground }]}>
              {MOCK_USER.tradingPreferences}
            </Text>
            <TouchableOpacity
              style={[styles.editPrefBtn, { borderColor: colors.border, borderRadius: 8 }]}
              activeOpacity={0.75}
            >
              <Feather name="edit-2" size={14} color={colors.primary} />
              <Text style={[styles.editPrefLabel, { color: colors.primary }]}>Edit</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* Account Settings */}
        <Section title="Account">
          <SettingsRow icon="user" label="Edit Profile" />
          <SettingsRow icon="map-pin" label="Region" value={MOCK_USER.region} />
          <SettingsRow icon="bell" label="Notifications" />
          <SettingsRow icon="lock" label="Privacy" />
        </Section>

        {/* App Settings */}
        <Section title="App">
          <SettingsRow icon="moon" label="Appearance" value="System" />
          <SettingsRow icon="download" label="Export Collection" />
        </Section>

        {/* Support */}
        <Section title="Support">
          <SettingsRow icon="info" label="About PinHunt UK" />
          <SettingsRow icon="message-circle" label="Send Feedback" />
          <SettingsRow icon="star" label="Rate the App" />
        </Section>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            PinHunt UK · Prototype v0.1
          </Text>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Pin values are sample data only.
          </Text>
        </View>
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
  avatarInitials: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  displayName: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  region: { fontSize: 13, fontFamily: 'Inter_400Regular' },
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
  // Trading prefs
  section: { marginBottom: 20, marginHorizontal: 16 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 8, letterSpacing: 0.8 },
  sectionCard: { overflow: 'hidden', borderWidth: 1 },
  tradingPref: { padding: 14, gap: 10 },
  tradingText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  editPrefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editPrefLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  rowValue: { fontSize: 13, fontFamily: 'Inter_400Regular', marginRight: 4 },
  footer: { alignItems: 'center', paddingTop: 8, gap: 4 },
  footerText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
});
