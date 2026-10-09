/**
 * Manage People — App Creator only (migration 040).
 *
 * The only place admin / contributor rights and feature rollouts are
 * changed. Admins can reach /admin but see a locked state here; the
 * database enforces the same rule (set_user_access(), feature_flags RLS,
 * guard_profile_privileges trigger). App Creator itself is only set in the
 * Supabase SQL editor, so it shows as a read-only badge.
 *
 * Changes are confirmed in-app rather than with Alert — native alert
 * callbacks don't reliably fire on Expo web.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  createSupabaseUserRepository,
  type FeatureAudience,
  type FeatureFlag,
  type UserAccess,
} from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useColors } from '@/hooks/useColors';
import { useMyAccess } from '@/hooks/useMyAccess';
import { invalidateFeatureCache } from '@/hooks/useFeature';
import { spacing } from '@/constants/theme';

const AUDIENCES: Array<{ value: FeatureAudience; label: string }> = [
  { value: 'admin', label: 'Admins' },
  { value: 'contributor', label: 'Contributors' },
  { value: 'public', label: 'Everyone' },
];

const FEATURE_LABEL: Record<string, string> = {
  catalogue_contributions: 'Help Build the Catalogue',
};

type PendingChange = { user: UserAccess; isAdmin: boolean; isContributor: boolean };

export default function ManagePeopleScreen() {
  const colors = useColors();
  const { isAppCreator, loading: accessLoading } = useMyAccess();

  const repo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserAccess[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async (q: string) => {
    if (!repo) return;
    setSearching(true);
    try {
      setUsers(await repo.listUserAccess(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load people.');
    } finally {
      setSearching(false);
    }
  }, [repo]);

  useEffect(() => {
    if (!repo || !isAppCreator) return;
    repo.getFeatureFlags().then(setFlags).catch(() => {});
  }, [repo, isAppCreator]);

  // Debounced search; empty query lists everyone with elevated access.
  useEffect(() => {
    if (!isAppCreator) return;
    const t = setTimeout(() => loadUsers(query), 250);
    return () => clearTimeout(t);
  }, [query, isAppCreator, loadUsers]);

  const changeAudience = async (flag: FeatureFlag, audience: FeatureAudience) => {
    if (!repo || flag.audience === audience) return;
    setError(null);
    const previous = flags;
    setFlags(fs => fs.map(f => (f.key === flag.key ? { ...f, audience } : f)));
    try {
      await repo.setFeatureAudience(flag.key, audience);
      invalidateFeatureCache();
    } catch (e) {
      setFlags(previous);
      setError(e instanceof Error ? e.message : 'Could not change rollout.');
    }
  };

  const confirmChange = async () => {
    if (!repo || !pending) return;
    setSaving(true);
    setError(null);
    try {
      await repo.setUserAccess(pending.user.id, {
        isAdmin: pending.isAdmin,
        isContributor: pending.isContributor,
      });
      setUsers(us => us.map(u => (u.id === pending.user.id
        ? { ...u, isAdmin: pending.isAdmin, isContributor: pending.isContributor }
        : u)));
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change access.');
    } finally {
      setSaving(false);
    }
  };

  if (accessLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Manage People' }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!isAppCreator) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <Stack.Screen options={{ title: 'Manage People' }} />
        <Feather name="lock" size={28} color={colors.mutedForeground} />
        <Text style={[styles.lockedText, { color: colors.mutedForeground }]}>
          Only the App Creator can manage people and rollouts.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: 'Manage People' }} />

      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

      {/* ── Feature rollouts ── */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FEATURE ROLLOUTS</Text>
      {flags.map(flag => (
        <View key={flag.key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{FEATURE_LABEL[flag.key] ?? flag.key}</Text>
          {flag.description && (
            <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>{flag.description}</Text>
          )}
          <View style={[styles.segment, { borderColor: colors.border }]}>
            {AUDIENCES.map(a => {
              const active = flag.audience === a.value;
              return (
                <TouchableOpacity
                  key={a.value}
                  onPress={() => changeAudience(flag, a.value)}
                  activeOpacity={0.8}
                  style={[styles.segmentItem, active && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.segmentLabel, { color: active ? '#fff' : colors.foreground }]}>{a.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      {/* ── People ── */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: spacing.md }]}>PEOPLE</Text>
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username or name"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {searching && <ActivityIndicator size="small" color={colors.mutedForeground} />}
      </View>
      {!query.trim() && (
        <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
          Showing everyone with elevated access. Search to find anyone else.
        </Text>
      )}

      {users.map(user => {
        const isPendingRow = pending?.user.id === user.id;
        const shownAdmin = isPendingRow ? pending!.isAdmin : user.isAdmin;
        const shownContributor = isPendingRow ? pending!.isContributor : user.isContributor;
        const name = user.username ? `@${user.username}` : user.displayName ?? 'Unnamed user';
        return (
          <View key={user.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.userTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>{name}</Text>
                {user.username && user.displayName && (
                  <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>{user.displayName}</Text>
                )}
              </View>
              {user.isAppCreator && (
                <View style={[styles.creatorBadge, { backgroundColor: colors.secondary }]}>
                  <Feather name="star" size={11} color={colors.primary} />
                  <Text style={[styles.creatorLabel, { color: colors.primary }]}>App Creator</Text>
                </View>
              )}
            </View>

            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Admin</Text>
              <Switch
                value={shownAdmin}
                disabled={user.isAppCreator || saving}
                onValueChange={v => setPending({ user, isAdmin: v, isContributor: shownContributor })}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Contributor</Text>
              <Switch
                value={shownContributor}
                disabled={saving}
                onValueChange={v => setPending({ user, isAdmin: shownAdmin, isContributor: v })}
              />
            </View>

            {isPendingRow && (pending!.isAdmin !== user.isAdmin || pending!.isContributor !== user.isContributor) && (
              <View style={[styles.confirmBar, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.confirmText, { color: colors.foreground }]}>
                  {describeChange(user, pending!)}
                </Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity onPress={() => setPending(null)} disabled={saving} style={styles.confirmBtn}>
                    <Text style={[styles.confirmBtnLabel, { color: colors.mutedForeground }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={confirmChange}
                    disabled={saving}
                    style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={[styles.confirmBtnLabel, { color: '#fff' }]}>Confirm</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {!searching && users.length === 0 && (
        <Text style={[styles.cardMeta, { color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.lg }]}>
          {query.trim() ? 'No matching users.' : 'Nobody else has elevated access yet.'}
        </Text>
      )}
    </ScrollView>
  );
}

function describeChange(user: UserAccess, next: PendingChange): string {
  const name = user.username ? `@${user.username}` : 'this user';
  const parts: string[] = [];
  if (next.isAdmin !== user.isAdmin) parts.push(next.isAdmin ? 'make admin' : 'remove admin');
  if (next.isContributor !== user.isContributor) parts.push(next.isContributor ? 'make contributor' : 'remove contributor');
  const action = parts.join(' and ');
  return `${action.charAt(0).toUpperCase()}${action.slice(1)} for ${name}?`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  lockedText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  card: { borderWidth: 1, borderRadius: 14, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  cardMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginTop: spacing.xs },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  segmentLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular' },
  userTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  creatorBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  creatorLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  confirmBar: { borderRadius: 10, padding: spacing.md, gap: spacing.sm },
  confirmText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  confirmButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  confirmBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  confirmBtnLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
