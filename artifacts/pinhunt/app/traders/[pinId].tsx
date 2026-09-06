/**
 * Traders screen — lists collectors who have a specific pin marked as "for
 * trade". Leads toward the Potential Trade Match (View Match) when one
 * exists; otherwise offers a single plain Message action.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { formatMatchSummary, isReciprocalMatch } from '@/utils/tradeMatch';
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

function TraderCard({ trader, match, onViewMatch, onMessage, isMe, colors }: {
  trader: TraderProfile;
  /** Reciprocal potential-trade counts for this pin's collector, when known. */
  match?: { theyHave: number; iHave: number };
  onViewMatch: () => void;
  onMessage: () => void;
  isMe: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();
  const summary = match ? formatMatchSummary(match.theyHave, match.iHave) : null;
  const hasMatch = !!match && isReciprocalMatch(match.theyHave, match.iHave);

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/collector/[username]', params: { username: trader.username } })}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
    >
      <View style={styles.cardTop}>
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
      </View>

      {/* One clear primary action — lead toward the match when there is one,
          otherwise a plain message. Never both at once. */}
      {!isMe && (
        <>
          {hasMatch && summary && (
            <View style={[styles.matchRow, { backgroundColor: colors.homeCoral + '10' }]}>
              <Feather name="repeat" size={12} color={colors.homeCoral} />
              <Text style={[styles.matchText, { color: colors.homeCoral }]}>{summary}</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={hasMatch ? onViewMatch : onMessage}
            activeOpacity={0.85}
            style={[styles.primaryBtn, { backgroundColor: colors.homeCoral, borderRadius: radius.sm }]}
          >
            <Feather name={hasMatch ? 'repeat' : 'mail'} size={13} color={colors.homeSurface} />
            <Text style={[styles.primaryBtnLabel, { color: colors.homeSurface }]}>
              {hasMatch ? 'View Match' : 'Message'}
            </Text>
          </TouchableOpacity>
        </>
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
  // Real getPotentialTrades() counts per trader — never fabricated, and
  // simply absent (no card) for anyone we couldn't resolve a match for.
  const [matches, setMatches] = useState<Map<string, { theyHave: number; iHave: number }>>(new Map());

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

  useEffect(() => {
    if (!repo || !userId || traders.length === 0) { setMatches(new Map()); return; }
    let cancelled = false;
    Promise.all(
      traders
        .filter(trader => trader.id !== userId)
        .map(trader =>
          repo.getPotentialTrades({ viewerId: userId, collectorId: trader.id })
            .then(rows => [trader.id, {
              theyHave: rows.filter(r => r.direction === 'they_have_i_want').length,
              iHave: rows.filter(r => r.direction === 'i_have_they_want').length,
            }] as const)
            .catch(() => null),
        ),
    ).then(results => {
      if (cancelled) return;
      const next = new Map<string, { theyHave: number; iHave: number }>();
      for (const r of results) if (r) next.set(r[0], r[1]);
      setMatches(next);
    });
    return () => { cancelled = true; };
  }, [repo, userId, traders]);

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
            {traders.map(trader => {
              const match = matches.get(trader.id);
              return (
                <TraderCard
                  key={trader.id}
                  trader={trader}
                  match={match}
                  isMe={trader.id === userId}
                  onViewMatch={() => router.push({ pathname: '/collector/[username]', params: { username: trader.username } })}
                  onMessage={() =>
                    router.push({
                      pathname: '/community/start-conversation' as any,
                      params: {
                        recipientId: trader.id,
                        recipientName: trader.username,
                        contextPinId: pin?.id,
                        contextPinTitle: pin?.title,
                        matchTheyHave: String(match?.theyHave ?? 0),
                        matchIHave: String(match?.iHave ?? 0),
                      },
                    })
                  }
                  colors={colors}
                />
              );
            })}
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
    padding: spacing.lg - 2,
    marginBottom: spacing.sm + 2, borderWidth: 1, gap: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardInfo: { flex: 1, gap: 3 },
  displayName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  meTag: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  regionText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm - 4, borderWidth: 1, marginTop: 2 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, padding: spacing.sm + 2, borderRadius: radius.sm },
  matchText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 16 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm + 2 },
  primaryBtnLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
