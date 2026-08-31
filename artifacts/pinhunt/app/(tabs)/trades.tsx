/**
 * Trades tab — the collector's trading home.
 *
 * V1 scope (Step 1 — architecture/wiring only): a Discover section pointing
 * at the existing Find Collectors / Collectors Nearby screens, and an Active
 * Trades list built directly on the existing `getUserTrades()` repository
 * method (previously called from nowhere in the app). No new matching or
 * aggregation logic — that's Step 4.
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
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import type { Trade, TradeStatus } from '@workspace/pin-repository';

const STATUS_LABEL: Record<TradeStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Declined',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const STATUS_COLOR: Record<TradeStatus, string> = {
  pending: '#F59E0B',
  accepted: '#3B82F6',
  rejected: '#EF4444',
  completed: '#16A34A',
  cancelled: '#6B7280',
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Discover card ─────────────────────────────────────────────────────────────

function DiscoverCard({
  icon, title, subtitle, onPress, colors,
}: {
  icon: keyof typeof Feather.glyphMap; title: string; subtitle: string; onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.discoverCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      <View style={[styles.discoverIcon, { backgroundColor: colors.primary + '18' }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.discoverTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.discoverSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── Trade row ──────────────────────────────────────────────────────────────────

function TradeRow({ trade, userId, onPress, colors }: {
  trade: Trade; userId: string | null; onPress: () => void; colors: ReturnType<typeof useColors>;
}) {
  const isInitiator = trade.initiatorId === userId;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.tradeRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      <View style={[styles.tradeIcon, { backgroundColor: colors.forTrade + '18' }]}>
        <Feather name="repeat" size={16} color={colors.forTrade} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tradeTitle, { color: colors.foreground }]}>
          {isInitiator ? 'You proposed a trade' : 'They proposed a trade'}
        </Text>
        <Text style={[styles.tradeMeta, { color: colors.mutedForeground }]}>
          {formatDate(trade.updatedAt)}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[trade.status] + '18' }]}>
        <Text style={[styles.statusPillLabel, { color: STATUS_COLOR[trade.status] }]}>
          {STATUS_LABEL[trade.status]}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function TradesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { repo, userId } = useMarketplace();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo || !userId) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const data = await repo.getUserTrades(userId);
      setTrades(data);
    } catch {
      // Non-critical — the list just stays empty
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, userId]);

  useEffect(() => { load(); }, [load]);

  const activeTrades = trades.filter(t => t.status === 'pending' || t.status === 'accepted');
  const pastTrades = trades.filter(t => t.status !== 'pending' && t.status !== 'accepted');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad }}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Trades</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Discover collectors and manage your active trades
          </Text>
        </View>

        {/* ── Discover ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DISCOVER</Text>
          <View style={{ gap: 10 }}>
            <DiscoverCard
              icon="users"
              title="Find Collectors"
              subtitle="Search collectors and see what you could trade"
              onPress={() => router.push('/find-collectors')}
              colors={colors}
            />
            <DiscoverCard
              icon="map-pin"
              title="Collectors Nearby"
              subtitle="Find collectors near you for in-person trades"
              onPress={() => router.push('/nearby')}
              colors={colors}
            />
          </View>
        </View>

        {/* ── Active trades ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACTIVE TRADES</Text>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : activeTrades.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Feather name="repeat" size={22} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No active trades yet. Start one from a collector's profile or a pin's trade list.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {activeTrades.map(trade => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  userId={userId}
                  onPress={() => router.push({ pathname: '/trade/[id]', params: { id: trade.id } })}
                  colors={colors}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Trade history ── */}
        {pastTrades.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TRADE HISTORY</Text>
            <View style={{ gap: 8 }}>
              {pastTrades.map(trade => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  userId={userId}
                  onPress={() => router.push({ pathname: '/trade/[id]', params: { id: trade.id } })}
                  colors={colors}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { paddingHorizontal: 16, marginBottom: 20 },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 10 },
  discoverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  discoverIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  discoverTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  discoverSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  loadingRow: { paddingVertical: 24, alignItems: 'center' },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
    borderWidth: 1,
  },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
  },
  tradeIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tradeTitle: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
  tradeMeta: { fontSize: 11.5, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statusPillLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
