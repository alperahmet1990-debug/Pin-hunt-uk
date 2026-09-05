/**
 * Traders screen — lists users who have a specific pin marked as "for trade",
 * with their rating badge and a "Request Trade" button.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { Avatar } from '@/components/Avatar';
import { radius, spacing } from '@/constants/theme';
import type { TraderProfile } from '@workspace/pin-repository';

// ─── Rating badge ─────────────────────────────────────────────────────────────

function RatingBadge({ positive, total, colors }: {
  positive: number; total: number; colors: ReturnType<typeof useColors>;
}) {
  if (total === 0) {
    return (
      <View style={[styles.badge, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
        <Text style={[styles.badgeText, { color: colors.homeMuted }]}>No ratings yet</Text>
      </View>
    );
  }
  const pct = Math.round((positive / total) * 100);
  const color = pct >= 80 ? colors.owned : pct >= 50 ? colors.homeSandInk : colors.destructive;
  return (
    <View style={[styles.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
      <Text style={{ fontSize: 12 }}>👍</Text>
      <Text style={[styles.badgeText, { color }]}>{positive}/{total} ({pct}%)</Text>
    </View>
  );
}

// ─── Trader card ──────────────────────────────────────────────────────────────

function TraderCard({ trader, onRequestTrade, onMessage, isMe, colors }: {
  trader: TraderProfile;
  onRequestTrade: () => void;
  onMessage: () => void;
  isMe: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/collector/[username]', params: { username: trader.username } })}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
    >
      {/* Avatar */}
      <Avatar uri={trader.avatarUrl} name={trader.username} size={44} />

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={[styles.displayName, { color: colors.homeInk }]}>
          @{trader.username}
          {isMe && <Text style={[styles.meTag, { color: colors.homeMuted }]}> (you)</Text>}
        </Text>
        {trader.tradingRegion ? (
          <View style={styles.regionRow}>
            <Feather name="map-pin" size={11} color={colors.homeMuted} />
            <Text style={[styles.regionText, { color: colors.homeMuted }]}>{trader.tradingRegion}</Text>
          </View>
        ) : null}
        <RatingBadge positive={trader.positiveRatings} total={trader.totalRatings} colors={colors} />
      </View>

      {/* Actions — messaging first; a formal trade can start from the chat */}
      {!isMe && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={onMessage}
            activeOpacity={0.85}
            style={[styles.tradeBtn, { backgroundColor: colors.homeCoral, borderRadius: radius.sm }]}
          >
            <Feather name="mail" size={13} color={colors.homeSurface} />
            <Text style={[styles.tradeBtnLabel, { color: colors.homeSurface }]}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRequestTrade}
            activeOpacity={0.85}
            accessibilityLabel="Request trade"
            style={[styles.tradeBtn, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine, borderRadius: radius.sm, borderWidth: 1 }]}
          >
            <Feather name="repeat" size={13} color={colors.homeInk} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TradersScreen() {
  const { pinId } = useLocalSearchParams<{ pinId: string }>();
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const { repo, userId } = useMarketplace();
  const { pins } = usePinCatalogue();

  const pin = pins.find(p => p.id === pinId);

  const [traders,    setTraders]    = useState<TraderProfile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null); // trader id being requested

  const load = useCallback(async (isRefresh = false) => {
    if (!repo || !pinId) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const data = await repo.getUsersWithPinForTrade(pinId);
      setTraders(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load traders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, pinId]);

  useEffect(() => { load(); }, [load]);

  const handleRequestTrade = async (trader: TraderProfile) => {
    if (!repo || !userId) return;
    if (requesting) return; // prevent double-tap
    try {
      setRequesting(trader.id);
      const trade = await repo.createTrade(
        userId,
        trader.id,
        pin ? `Interested in trading for: ${pin.title}` : undefined,
      );
      router.push({ pathname: '/trade/[id]', params: { id: trade.id } });
    } catch (e) {
      Alert.alert('Could not start trade', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setRequesting(null);
    }
  };

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  return (
    <>
      <Stack.Screen options={{ title: pin ? `Traders — ${pin.title}` : 'Traders' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.homeBackground }]}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: botPad }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.homeCoral} />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={{ padding: spacing.sm }}>
              <Text style={{ color: colors.homeCoral, fontFamily: 'Inter_500Medium' }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : traders.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={36} color={colors.homeMuted} />
            <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>No traders yet</Text>
            <Text style={[styles.emptySub, { color: colors.homeMuted }]}>
              No one has this pin marked for trade at the moment.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.countLabel, { color: colors.homeMuted }]}>
              {traders.length} collector{traders.length !== 1 ? 's' : ''} offering this for trade
            </Text>
            {traders.map(trader => (
              <TraderCard
                key={trader.id}
                trader={trader}
                isMe={trader.id === userId}
                onRequestTrade={() => handleRequestTrade(trader)}
                onMessage={() =>
                  router.push({
                    pathname: '/community/start-conversation' as any,
                    params: {
                      recipientId: trader.id,
                      recipientName: trader.username,
                      contextPinId: pin?.id,
                      contextPinTitle: pin?.title,
                    },
                  })
                }
                colors={colors}
              />
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  countLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.lg - 2,
    marginBottom: spacing.sm + 2, borderWidth: 1, gap: spacing.md,
  },
  cardInfo: { flex: 1, gap: 3 },
  displayName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  meTag: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  regionText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm - 4, borderWidth: 1, marginTop: 2 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  cardActions: { flexDirection: 'row', gap: spacing.xs + 2 },
  tradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tradeBtnLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
