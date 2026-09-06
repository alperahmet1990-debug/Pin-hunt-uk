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
  Modal,
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
import { radius, spacing } from '@/constants/theme';
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

function CollectorCard({ item, onPress, onMessage }: {
  item: NearbyCollector; onPress(): void; onMessage(): void;
}) {
  const colors = useColors();
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
        { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg },
      ]}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <Avatar uri={item.avatarUrl} name={item.username} size={48} />

        <View style={styles.cardInfo}>
          <Text style={[styles.cardUsername, { color: colors.homeInk }]}>
            @{item.username}
          </Text>
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={11} color={colors.homeMuted} />
            <Text style={[styles.metaText, { color: colors.homeMuted }]}>{areaLabel}</Text>
          </View>
          <Text style={[styles.distanceBand, { color: colors.homeCoral }]}>
            {item.distanceBand}
          </Text>
        </View>

        {isRecentlyActive && (
          <View style={[styles.activeDot, { backgroundColor: colors.owned }]} />
        )}
      </View>

      {/* Trade preference badges */}
      <View style={styles.badgeRow}>
        {item.openToLocalTrades && (
          <View style={[styles.badge, { backgroundColor: colors.homeCoral + '18' }]}>
            <Feather name="map-pin" size={10} color={colors.homeCoral} />
            <Text style={[styles.badgeText, { color: colors.homeCoral }]}>Local trades</Text>
          </View>
        )}
        {item.openToPostalTrades && (
          <View style={[styles.badge, { backgroundColor: colors.homeAqua }]}>
            <Feather name="package" size={10} color={colors.homeMuted} />
            <Text style={[styles.badgeText, { color: colors.homeMuted }]}>Postal</Text>
          </View>
        )}
        {item.happyToTravel && (
          <View style={[styles.badge, { backgroundColor: colors.homeAqua }]}>
            <Feather name="navigation" size={10} color={colors.homeMuted} />
            <Text style={[styles.badgeText, { color: colors.homeMuted }]}>Happy to travel</Text>
          </View>
        )}
      </View>

      {/* Pin counts */}
      <View style={[styles.pinCounts, { borderTopColor: colors.homeLine }]}>
        <View style={styles.pinCountItem}>
          <Text style={[styles.pinCountNum, { color: colors.forTrade }]}>{item.forTradeCount}</Text>
          <Text style={[styles.pinCountLabel, { color: colors.homeMuted }]}>For Trade</Text>
        </View>
        <View style={[styles.pinCountDivider, { backgroundColor: colors.homeLine }]} />
        <View style={styles.pinCountItem}>
          <Text style={[styles.pinCountNum, { color: colors.wanted }]}>{item.wantedCount}</Text>
          <Text style={[styles.pinCountLabel, { color: colors.homeMuted }]}>ISO</Text>
        </View>
        {item.totalRatings > 0 && (
          <>
            <View style={[styles.pinCountDivider, { backgroundColor: colors.homeLine }]} />
            <View style={styles.pinCountItem}>
              <Text style={[styles.pinCountNum, { color: colors.owned }]}>
                {Math.round((item.positiveRatings / item.totalRatings) * 100)}%
              </Text>
              <Text style={[styles.pinCountLabel, { color: colors.homeMuted }]}>Positive</Text>
            </View>
          </>
        )}
      </View>

      {/* Trade match summary */}
      {summary && (
        <View style={[styles.matchRow, { backgroundColor: colors.homeCoral + '10' }]}>
          <Feather name="repeat" size={12} color={colors.homeCoral} />
          <Text style={[styles.matchText, { color: colors.homeCoral }]}>{summary}</Text>
        </View>
      )}

      {/* Footer actions */}
      <View style={[styles.cardFooter, { borderTopColor: colors.homeLine }]}>
        <TouchableOpacity
          onPress={onMessage}
          activeOpacity={0.85}
          style={[styles.messageBtn, { backgroundColor: colors.homeCoral }]}
        >
          <Feather name="mail" size={13} color={colors.homeSurface} />
          <Text style={[styles.messageBtnLabel, { color: colors.homeSurface }]}>Message</Text>
        </TouchableOpacity>
        <Text style={[styles.viewProfile, { color: colors.homeCoral }]}>View profile →</Text>
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
          backgroundColor: active ? colors.homeCoral : colors.homeAqua,
          borderColor: active ? colors.homeCoral : colors.homeLine,
        },
      ]}
    >
      <Text style={[styles.pillText, { color: active ? colors.homeSurface : colors.homeInk }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Active (non-default) filter chip, removable ──────────────────────────────

function ActiveFilterChip({ label, onClear }: { label: string; onClear(): void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onClear}
      activeOpacity={0.75}
      style={[styles.activeChip, { backgroundColor: colors.homeCoral + '15', borderColor: colors.homeCoral }]}
    >
      <Text style={[styles.activeChipText, { color: colors.homeCoral }]}>{label}</Text>
      <Feather name="x" size={12} color={colors.homeCoral} />
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

  const defaultRadius = (profile?.preferredRadiusMiles as RadiusMiles | undefined) ?? 25;
  const [radius, setRadius] = useState<RadiusMiles>(defaultRadius);
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('any');
  const [sortBy, setSortBy] = useState<SortMode>('match');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [results, setResults] = useState<NearbyCollector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFilters: Array<{ key: string; label: string; onClear(): void }> = [];
  if (radius !== defaultRadius) activeFilters.push({ key: 'radius', label: `${radius}mi`, onClear: () => setRadius(defaultRadius) });
  if (tradeFilter !== 'any') activeFilters.push({ key: 'trade', label: tradeFilter === 'local' ? 'Local trades' : 'Postal trades', onClear: () => setTradeFilter('any') });
  if (sortBy !== 'match') activeFilters.push({ key: 'sort', label: sortBy === 'nearest' ? 'Nearest' : 'Recently active', onClear: () => setSortBy('match') });

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
      <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
        <View style={[styles.centred, { paddingTop: topPad + spacing.xxxl }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.homeAqua }]}>
            <Feather name="map-pin" size={32} color={colors.homeCoral} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>Enable discovery first</Text>
          <Text style={[styles.emptyBody, { color: colors.homeMuted }]}>
            Add your town or city in Profile Settings, then turn on "Appear in Collectors Nearby" to start finding collectors near you.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/edit-profile')}
            style={[styles.ctaBtn, { backgroundColor: colors.homeCoral, shadowColor: colors.homeShadow }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaBtnText, { color: colors.homeSurface }]}>Go to Profile Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: topPad + spacing.md, backgroundColor: colors.homeSurface, borderBottomColor: colors.homeLine }]}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.headerSub, { color: colors.homeMuted, flex: 1 }]}>
            Your exact location is never shown to other collectors
          </Text>
          <TouchableOpacity
            onPress={() => setFiltersOpen(true)}
            activeOpacity={0.8}
            style={[styles.filtersBtn, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}
          >
            <Feather name="sliders" size={15} color={colors.homeInk} />
            <Text style={[styles.filtersBtnText, { color: colors.homeInk }]}>Filters</Text>
            {activeFilters.length > 0 && (
              <View style={[styles.filtersBadge, { backgroundColor: colors.homeCoral }]}>
                <Text style={[styles.filtersBadgeText, { color: colors.homeSurface }]}>{activeFilters.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {activeFilters.length > 0 && (
          <View style={styles.activeChipsRow}>
            {activeFilters.map(f => (
              <ActiveFilterChip key={f.key} label={f.label} onClear={f.onClear} />
            ))}
          </View>
        )}
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator color={colors.homeCoral} size="large" />
          <Text style={[styles.emptyBody, { color: colors.homeMuted, marginTop: spacing.md }]}>
            Finding collectors near you…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Feather name="alert-circle" size={36} color={colors.destructive} />
          <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>Something went wrong</Text>
          <Text style={[styles.emptyBody, { color: colors.homeMuted }]}>{error}</Text>
          <TouchableOpacity onPress={load} style={[styles.ctaBtn, { backgroundColor: colors.homeCoral, shadowColor: colors.homeShadow }]} activeOpacity={0.85}>
            <Text style={[styles.ctaBtnText, { color: colors.homeSurface }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.centred}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.homeAqua }]}>
            <Feather name="users" size={32} color={colors.homeMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>No collectors found</Text>
          <Text style={[styles.emptyBody, { color: colors.homeMuted }]}>
            {results.length === 0
              ? `No collectors have opted in within ${radius} miles yet. Try a larger radius or check back later.`
              : 'No collectors match your current filters. Try changing the trade type filter.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl + spacing.xxl, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.homeMuted }]}>
              {sorted.length} collector{sorted.length !== 1 ? 's' : ''} within {radius} miles
            </Text>
          }
          renderItem={({ item }) => (
            <CollectorCard
              item={item}
              onPress={() => router.push({ pathname: '/collector/[username]', params: { username: item.username } })}
              onMessage={() =>
                router.push({
                  pathname: '/community/start-conversation' as any,
                  params: { recipientId: item.id, recipientName: item.username },
                })
              }
            />
          )}
        />
      )}

      {/* Filters sheet — Radius, Trade preference, Sort, all in one place */}
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFiltersOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.filterSheet, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={styles.filterSheetHeader}>
              <Text style={[styles.filterSheetTitle, { color: colors.homeInk }]}>Filters</Text>
              {activeFilters.length > 0 && (
                <TouchableOpacity onPress={() => { setRadius(defaultRadius); setTradeFilter('any'); setSortBy('match'); }}>
                  <Text style={[styles.clearText, { color: colors.homeCoral }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.filterLabel, { color: colors.homeMuted }]}>Radius</Text>
            <View style={styles.pills}>
              {RADIUS_OPTIONS.map(r => (
                <Pill key={r} active={radius === r} label={`${r}mi`} onPress={() => setRadius(r)} />
              ))}
            </View>

            <Text style={[styles.filterLabel, { color: colors.homeMuted, marginTop: spacing.lg }]}>Trade preference</Text>
            <View style={styles.pills}>
              <Pill active={tradeFilter === 'any'} label="Any" onPress={() => setTradeFilter('any')} />
              <Pill active={tradeFilter === 'local'} label="Local" onPress={() => setTradeFilter('local')} />
              <Pill active={tradeFilter === 'postal'} label="Postal" onPress={() => setTradeFilter('postal')} />
            </View>

            <Text style={[styles.filterLabel, { color: colors.homeMuted, marginTop: spacing.lg }]}>Sort by</Text>
            <View style={styles.pills}>
              <Pill active={sortBy === 'match'} label="Best match" onPress={() => setSortBy('match')} />
              <Pill active={sortBy === 'nearest'} label="Nearest" onPress={() => setSortBy('nearest')} />
              <Pill active={sortBy === 'recent'} label="Recently active" onPress={() => setSortBy('recent')} />
            </View>

            <TouchableOpacity
              onPress={() => setFiltersOpen(false)}
              activeOpacity={0.85}
              style={[styles.doneBtn, { backgroundColor: colors.homeCoral }]}
            >
              <Text style={[styles.doneBtnText, { color: colors.homeSurface }]}>
                Show {sorted.length} collector{sorted.length !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  headerBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  filtersBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1,
  },
  filtersBtnText: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  filtersBadge: { minWidth: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filtersBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  activeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  activeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 5,
    borderRadius: radius.pill, borderWidth: 1,
  },
  activeChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  filterSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  filterSheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  clearText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  filterLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  doneBtn: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  doneBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emptyBody: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  ctaBtn: {
    borderRadius: radius.md, paddingVertical: spacing.lg - 2, paddingHorizontal: spacing.xxl, marginTop: spacing.xs,
    shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  ctaBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  resultCount: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: spacing.xs },

  // Card
  card: { borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md + 2, gap: spacing.md },
  cardInfo: { flex: 1, gap: 2 },
  cardUsername: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  distanceBand: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4, marginTop: spacing.xs },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md + 2, paddingBottom: spacing.sm + 2, gap: spacing.xs + 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  pinCounts: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
  },
  pinCountItem: { flex: 1, alignItems: 'center' },
  pinCountNum: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  pinCountLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  pinCountDivider: { width: StyleSheet.hairlineWidth, height: 32 },

  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginHorizontal: spacing.md + 2,
    marginBottom: spacing.sm + 2,
    padding: spacing.sm + 2,
    borderRadius: radius.sm,
  },
  matchText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 16 },

  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm - 2,
  },
  messageBtnLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  viewProfile: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
