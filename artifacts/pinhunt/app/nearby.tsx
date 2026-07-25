/**
 * Collectors Nearby screen
 *
 * Privacy-first: shows collectors who have opted in to discovery.
 * Exact coordinates are NEVER shown — only approximate distance bands.
 * The viewer's own coords are read server-side via the get_collectors_nearby RPC.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
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
import { useMarketplace } from '@/hooks/useMarketplace';
import type { NearbyCollector } from '@workspace/pin-repository';

type SortMode = 'match' | 'nearest' | 'recent';
type TradeFilter = 'any' | 'local' | 'postal';

const RADIUS_OPTIONS = [10, 25, 50, 100] as const;
type RadiusMiles = typeof RADIUS_OPTIONS[number];

// ─── Match summary text ────────────────────────────────────────────────────────

function matchSummary(c: NearbyCollector): string | null {
  const theyHave = c.pinsTheyHaveIWant;
  const iHave = c.pinsIHaveTheyWant;
  if (theyHave > 0 && iHave > 0) {
    return `Strong two-way match — they have ${theyHave} you want, you have ${iHave} they want`;
  }
  if (theyHave > 0) {
    return `They have ${theyHave} pin${theyHave > 1 ? 's' : ''} you want`;
  }
  if (iHave > 0) {
    return `You have ${iHave} pin${iHave > 1 ? 's' : ''} they want`;
  }
  return null;
}

// ─── Collector card ────────────────────────────────────────────────────────────

function CollectorCard({ item, onPress }: { item: NearbyCollector; onPress(): void }) {
  const colors = useColors();
  const initials = item.username.slice(0, 2).toUpperCase();
  const summary = matchSummary(item);
  const areaLabel = [item.town, item.county].filter(Boolean).join(', ') || 'Near you';

  const isRecentlyActive = item.lastActiveAt
    ? new Date(item.lastActiveAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    : false;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <Avatar uri={item.avatarUrl} name={item.username} size={48} />

        <View style={styles.cardInfo}>
          <Text style={[styles.cardUsername, { color: colors.foreground }]}>
            @{item.username}
          </Text>
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={11} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{areaLabel}</Text>
          </View>
          <Text style={[styles.distanceBand, { color: colors.primary }]}>
            {item.distanceBand}
          </Text>
        </View>

        {isRecentlyActive && (
          <View style={[styles.activeDot, { backgroundColor: '#22C55E' }]} />
        )}
      </View>

      {/* Trade preference badges */}
      <View style={styles.badgeRow}>
        {item.openToLocalTrades && (
          <View style={[styles.badge, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="map-pin" size={10} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>Local trades</Text>
          </View>
        )}
        {item.openToPostalTrades && (
          <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
            <Feather name="package" size={10} color={colors.mutedForeground} />
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Postal</Text>
          </View>
        )}
        {item.happyToTravel && (
          <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
            <Feather name="navigation" size={10} color={colors.mutedForeground} />
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Happy to travel</Text>
          </View>
        )}
      </View>

      {/* Pin counts */}
      <View style={[styles.pinCounts, { borderTopColor: colors.border }]}>
        <View style={styles.pinCountItem}>
          <Text style={[styles.pinCountNum, { color: colors.forTrade }]}>{item.forTradeCount}</Text>
          <Text style={[styles.pinCountLabel, { color: colors.mutedForeground }]}>For Trade</Text>
        </View>
        <View style={[styles.pinCountDivider, { backgroundColor: colors.border }]} />
        <View style={styles.pinCountItem}>
          <Text style={[styles.pinCountNum, { color: colors.wanted }]}>{item.wantedCount}</Text>
          <Text style={[styles.pinCountLabel, { color: colors.mutedForeground }]}>ISO</Text>
        </View>
        {item.totalRatings > 0 && (
          <>
            <View style={[styles.pinCountDivider, { backgroundColor: colors.border }]} />
            <View style={styles.pinCountItem}>
              <Text style={[styles.pinCountNum, { color: colors.owned }]}>
                {Math.round((item.positiveRatings / item.totalRatings) * 100)}%
              </Text>
              <Text style={[styles.pinCountLabel, { color: colors.mutedForeground }]}>Positive</Text>
            </View>
          </>
        )}
      </View>

      {/* Trade match summary */}
      {summary && (
        <View style={[styles.matchRow, { backgroundColor: colors.primary + '10', borderRadius: 8 }]}>
          <Feather name="repeat" size={12} color={colors.primary} />
          <Text style={[styles.matchText, { color: colors.primary }]}>{summary}</Text>
        </View>
      )}

      {/* View profile button */}
      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <Text style={[styles.viewProfile, { color: colors.primary }]}>View profile →</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Filter / sort pill ────────────────────────────────────────────────────────

function Pill({
  active, label, onPress,
}: { active: boolean; label: string; onPress(): void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.pill,
        {
          backgroundColor: active ? colors.primary : colors.secondary,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.pillText, { color: active ? '#fff' : colors.foreground }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NearbyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useProfile();
  const { repo, userId } = useMarketplace();

  const [radius, setRadius] = useState<RadiusMiles>(
    (profile?.preferredRadiusMiles as RadiusMiles | undefined) ?? 25,
  );
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('any');
  const [sortBy, setSortBy] = useState<SortMode>('match');

  const [results, setResults] = useState<NearbyCollector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gate on discovery being enabled (coords may be added later by admin/geocoding).
  // Users who have enabled discovery can always enter the screen; if their coords
  // aren't set yet the RPC simply returns an empty result set.
  const discoveryEnabled = profile?.nearbyDiscoveryEnabled ?? false;

  const load = useCallback(async () => {
    if (!repo || !userId || !discoveryEnabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await repo.getNearbyCollectors({ viewerId: userId, radiusMiles: radius });
      setResults(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load nearby collectors');
    } finally {
      setLoading(false);
    }
  }, [repo, userId, discoveryEnabled, radius]);

  useEffect(() => { load(); }, [load]);

  // ── Client-side filtering + sorting ──────────────────────────────────────────

  const filtered = results.filter(c => {
    if (tradeFilter === 'local' && !c.openToLocalTrades) return false;
    if (tradeFilter === 'postal' && !c.openToPostalTrades) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'match') return b.matchScore - a.matchScore;
    if (sortBy === 'nearest') return a.distanceSortKey - b.distanceSortKey;
    // recent: last active at, most recent first
    const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
    const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
    return tb - ta;
  });

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;

  // ── Discovery not enabled ─────────────────────────────────────────────────────

  if (!discoveryEnabled) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.headerBar, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Collectors Nearby</Text>
        </View>
        <View style={styles.centred}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="map-pin" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Enable discovery first</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            Add your town or city in Profile Settings, then turn on "Appear in Collectors Nearby" to start finding collectors near you.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/edit-profile')}
            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Go to Profile Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Collectors Nearby</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          Your exact location is never shown to other collectors
        </Text>

        {/* Radius filter */}
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Radius</Text>
          <View style={styles.pills}>
            {RADIUS_OPTIONS.map(r => (
              <Pill key={r} active={radius === r} label={`${r}mi`} onPress={() => setRadius(r)} />
            ))}
          </View>
        </View>

        {/* Trade filter */}
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Trades</Text>
          <View style={styles.pills}>
            <Pill active={tradeFilter === 'any'} label="Any" onPress={() => setTradeFilter('any')} />
            <Pill active={tradeFilter === 'local'} label="Local" onPress={() => setTradeFilter('local')} />
            <Pill active={tradeFilter === 'postal'} label="Postal" onPress={() => setTradeFilter('postal')} />
          </View>
        </View>

        {/* Sort */}
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>Sort</Text>
          <View style={styles.pills}>
            <Pill active={sortBy === 'match'} label="Best match" onPress={() => setSortBy('match')} />
            <Pill active={sortBy === 'nearest'} label="Nearest" onPress={() => setSortBy('nearest')} />
            <Pill active={sortBy === 'recent'} label="Recently active" onPress={() => setSortBy('recent')} />
          </View>
        </View>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.emptyBody, { color: colors.mutedForeground, marginTop: 12 }]}>
            Finding collectors near you…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Feather name="alert-circle" size={36} color={colors.destructive} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Something went wrong</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{error}</Text>
          <TouchableOpacity onPress={load} style={[styles.ctaBtn, { backgroundColor: colors.primary }]} activeOpacity={0.85}>
            <Text style={styles.ctaBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.centred}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="users" size={32} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No collectors found</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {results.length === 0
              ? `No collectors have opted in within ${radius} miles yet. Try a larger radius or check back later.`
              : 'No collectors match your current filters. Try changing the trade type filter.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
              {sorted.length} collector{sorted.length !== 1 ? 's' : ''} within {radius} miles
            </Text>
          }
          renderItem={({ item }) => (
            <CollectorCard
              item={item}
              onPress={() => router.push({ pathname: '/collector/[username]', params: { username: item.username } })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  headerBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  headerTitle: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 4 },

  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', width: 44 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emptyBody: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  ctaBtn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, marginTop: 4 },
  ctaBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  resultCount: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 4 },

  // Card
  card: { borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  cardInfo: { flex: 1, gap: 2 },
  cardUsername: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  distanceBand: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingBottom: 10, gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  pinCounts: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pinCountItem: { flex: 1, alignItems: 'center' },
  pinCountNum: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  pinCountLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  pinCountDivider: { width: StyleSheet.hairlineWidth, height: 32 },

  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 10,
  },
  matchText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 16 },

  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'flex-end',
  },
  viewProfile: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
