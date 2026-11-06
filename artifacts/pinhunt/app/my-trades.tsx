/**
 * Trades — every trade the collector is part of, active first, then past.
 * It doesn't depend on a chat, so a trade stays reachable after a block or a
 * deleted conversation. The delete account screen links here, because open
 * trades hold deletion.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Trade } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { radius, spacing } from '@/constants/theme';
import { groupTrades, tradeStatusLabel } from '@/utils/tradeActions';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

export default function MyTradesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { repo, userId } = useMarketplace();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repo || !userId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setTrades(await repo.getUserTrades(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your trades.');
    } finally {
      setLoading(false);
    }
  }, [repo, userId]);

  // On focus, so a trade just cancelled or finished moves straight away.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const { active, past } = groupTrades(trades);
  const sections = [
    ...(active.length ? [{ title: 'Active', data: active }] : []),
    ...(past.length ? [{ title: 'Past', data: past }] : []),
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.homeBackground }]}>
      <Stack.Screen options={{ title: 'Trades' }} />
      {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.homeCoral} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.homeMuted }]}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/trade/${item.id}`)}
              accessibilityRole="link"
              style={[styles.row, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.name, { color: colors.homeInk }]}>
                  {item.otherUsername ? `@${item.otherUsername}` : 'Another collector'}
                </Text>
                <Text style={[styles.meta, { color: colors.homeMuted }]}>
                  {tradeStatusLabel(item.status)} · {day(item.updatedAt)}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.homeMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            error ? null : <Text style={[styles.empty, { color: colors.homeMuted }]}>No trades yet.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { marginTop: 40 },
  list: { padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, padding: spacing.md, borderWidth: 1, borderRadius: radius.sm, marginBottom: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  meta: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  error: { padding: spacing.md, fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  empty: { padding: 40, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
