/**
 * Profile → Blocked users (B-P0-05b, #17): everyone the collector has
 * blocked, newest first, each with Unblock. Unblocking shows their posts,
 * conversations and trade matches again; a toast offers Undo.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useBlockedUsers } from '@/context/BlockedUsersContext';
import { userErrorLine } from '@/utils/userError';
import type { UserBlock } from '@workspace/pin-repository';

function blockedSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Blocked';
  return `Blocked ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default function BlockedUsersScreen() {
  const colors = useColors();
  const toast = useToast();
  const { blockedUsers, loading, refresh, unblock, block } = useBlockedUsers();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleUnblock = async (row: UserBlock) => {
    const handle = row.username ? `@${row.username}` : 'collector';
    setBusyId(row.blockedUserId);
    setError(null);
    try {
      await unblock(row.blockedUserId);
      toast.show({
        message: `Unblocked ${handle}`,
        action: {
          label: 'Undo',
          onPress: () => {
            void block({ id: row.blockedUserId, username: row.username, avatarUrl: row.avatarUrl }).catch(() => {});
          },
        },
      });
    } catch (e) {
      setError(userErrorLine(e, 'block'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Blocked users' }} />
      <ScrollView style={{ backgroundColor: colors.homeBackground }} contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.homeMuted }]}>
          Blocked collectors can't message you or propose trades, and you won't see their posts,
          conversations or trade matches. They aren't told.
        </Text>

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        ) : null}

        {loading && blockedUsers.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.homeCoral} accessibilityLabel="Loading blocked users" />
          </View>
        ) : blockedUsers.length === 0 ? (
          <EmptyState
            icon="user-check"
            title="No blocked collectors"
            subtitle="To block someone, open their profile and tap More options, or press and hold one of their messages."
          />
        ) : (
          <View
            testID="blocked-users-list"
            style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
          >
            {blockedUsers.map((row, index) => {
              const name = row.username ? `@${row.username}` : 'Collector';
              return (
                <View
                  key={row.blockedUserId}
                  style={[
                    styles.row,
                    index < blockedUsers.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.homeLine },
                  ]}
                >
                  <Avatar uri={row.avatarUrl} name={row.username ?? '?'} size={40} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={[styles.name, { color: colors.homeInk }]}>{name}</Text>
                    <Text numberOfLines={1} style={[styles.since, { color: colors.homeMuted }]}>{blockedSince(row.createdAt)}</Text>
                  </View>
                  <Button
                    label="Unblock"
                    variant="secondary"
                    size="compact"
                    fullWidth={false}
                    loading={busyId === row.blockedUserId}
                    onPress={() => { void handleUnblock(row); }}
                    accessibilityLabel={`Unblock ${name}`}
                  />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  intro: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  center: { paddingTop: spacing.xxxl, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  since: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
