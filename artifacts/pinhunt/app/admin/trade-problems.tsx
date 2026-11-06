/**
 * Trade Problems — admin queue of open problem reports on trades, oldest
 * first. An admin reads the report and tracking, then closes it as completed
 * or cancelled. Closing is what lets a held account deletion go ahead.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import type { ProblemTrade } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';

type Outcome = 'completed' | 'cancelled';

const name = (username?: string) => (username ? `@${username}` : 'Deleted user');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB') : 'No');

function sideLine(username: string | undefined, posted?: string, received?: string, carrier?: string, tracking?: string) {
  const parcel = [carrier, tracking].filter(Boolean).join(' · ');
  return `${name(username)}: posted ${day(posted)}${parcel ? ` (${parcel})` : ''}, received ${day(received)}`;
}

export default function TradeProblemsScreen() {
  const colors = useColors();
  const { repo } = useMarketplace();
  const [items, setItems] = useState<ProblemTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; outcome: Outcome } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!repo) return;
    try {
      setError(null);
      setItems(await repo.getProblemTrades());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load problem reports.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => { void load(); }, [load]);

  const close = async () => {
    if (!repo || !confirming) return;
    try {
      setSaving(true);
      setError(null);
      await repo.resolveTradeProblem(confirming.id, confirming.outcome, note.trim() || undefined);
      setConfirming(null);
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not close this report.');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: ProblemTrade }) => {
    const open = confirming?.id === item.id;
    const reporter = item.reportedBy === item.initiatorId ? item.initiatorUsername : item.recipientUsername;
    return (
      <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
        <Text style={[styles.title, { color: colors.homeInk }]}>
          {name(item.initiatorUsername)} and {name(item.recipientUsername)}
        </Text>
        <Text style={[styles.meta, { color: colors.homeMuted }]}>
          Reported by {name(reporter)} on {day(item.reportedAt)}
        </Text>
        <Text style={[styles.reason, { color: colors.homeInk }]}>{item.reason ?? 'No reason given.'}</Text>
        <Text selectable style={[styles.meta, { color: colors.homeMuted }]}>
          {sideLine(item.initiatorUsername, item.initiatorPostedAt, item.initiatorReceivedAt, item.initiatorCarrier, item.initiatorTracking)}
        </Text>
        <Text selectable style={[styles.meta, { color: colors.homeMuted }]}>
          {sideLine(item.recipientUsername, item.recipientPostedAt, item.recipientReceivedAt, item.recipientCarrier, item.recipientTracking)}
        </Text>

        {open ? (
          <>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note for both collectors (optional)"
              placeholderTextColor={colors.homeMuted}
              accessibilityLabel="Note for both collectors"
              multiline
              maxLength={500}
              style={[styles.input, { color: colors.homeInk, borderColor: colors.homeLine }]}
            />
            <View style={styles.row}>
              <TouchableOpacity
                disabled={saving}
                onPress={() => setConfirming(null)}
                accessibilityRole="button"
                style={[styles.button, { borderColor: colors.homeLine }]}
              >
                <Text style={[styles.buttonText, { color: colors.homeMuted }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={saving}
                onPress={() => void close()}
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral }]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.homeSurface} />
                ) : (
                  <Text style={[styles.buttonText, { color: colors.homeSurface }]}>
                    Confirm {confirming.outcome === 'completed' ? 'Completed' : 'Cancelled'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => { setNote(''); setConfirming({ id: item.id, outcome: 'cancelled' }); }}
              accessibilityRole="button"
              style={[styles.button, { borderColor: colors.homeLine }]}
            >
              <Text style={[styles.buttonText, { color: colors.homeInk }]}>Close as Cancelled</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setNote(''); setConfirming({ id: item.id, outcome: 'completed' }); }}
              accessibilityRole="button"
              style={[styles.button, { borderColor: colors.homeLine }]}
            >
              <Text style={[styles.buttonText, { color: colors.homeInk }]}>Close as Completed</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.homeBackground }]}>
      <Stack.Screen options={{ title: 'Trade Problems' }} />
      {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.homeCoral} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.homeMuted }]}>No open problem reports.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { marginTop: 40 },
  list: { padding: 16, gap: 12 },
  card: { padding: 14, borderWidth: 1, borderRadius: 12, gap: 6 },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  meta: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  reason: { fontSize: 14, fontFamily: 'Inter_500Medium', marginVertical: 4 },
  input: { minHeight: 60, padding: 10, borderWidth: 1, borderRadius: 8, fontSize: 14, fontFamily: 'Inter_400Regular', textAlignVertical: 'top', marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  button: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8 },
  buttonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  error: { padding: 12, fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  empty: { padding: 40, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
