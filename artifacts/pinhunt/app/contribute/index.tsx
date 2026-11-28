/**
 * Contribute pictures (was "Help build the catalogue") — contributor screen.
 *
 * Browses the catalogue grouped by set, showing
 * each pin's photo status, so contributors can photograph pins they own.
 * Tapping a pin opens the existing contribution flow
 * (/contribute-image/[pinId]) in catalogue mode.
 *
 * Covers the whole verified catalogue (#396, migration 048), with filters for
 * year, park, character and set, and for what's needed: a photo, a back
 * photo, or missing information.
 *
 * Gated by the 'catalogue_contributions' feature flag (migration 039) —
 * starts admin-only; widened to contributors / public by editing its row.
 * The data is gated again server-side in get_catalogue_image_coverage().
 *
 * Opens on "Needs photo". Route params (all optional): `filter` (a chip value),
 * `sort=newest` (Home "New to the catalogue" → See all; migration 088 — the
 * toggle hides itself while the database can't sort that way) and `set` (a set
 * name, from a set page).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { CatalogueImageCoverage } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useFeature } from '@/hooks/useFeature';
import { useCoveragePage } from '@/hooks/useCatalogueCoverage';
import { useCollection } from '@/context/CollectionContext';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { PLACEHOLDER_IMAGE } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import { PinImage } from '@/components/ui/PinImage';
import { FilterSheet } from '@/components/ui/FilterSheet';
import {
  FACET_TITLES, NO_FACETS, missingLabel,
  type FacetFilters, type FacetKey,
} from '@/utils/contributeFilters';

type PhotoFilter = 'all' | 'needs' | 'reference' | 'pending' | 'community' | 'info' | 'back';

const PHOTO_FILTERS: PhotoFilter[] = ['all', 'needs', 'reference', 'pending', 'community', 'info', 'back'];
type SortOrder = 'set' | 'newest';
const SCREEN_TITLE = 'Contribute pictures';

const COLUMNS = 3;
const SEARCH_DEBOUNCE_MS = 300;

function isPending(row: CatalogueImageCoverage) {
  return row.myStatus === 'pending' || row.pendingCount > 0;
}

export default function ContributeCatalogueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { enabled, loading: featureLoading } = useFeature('catalogue_contributions');
  const { collection } = useCollection();
  const params = useLocalSearchParams<{ filter?: string; sort?: string; set?: string }>();
  const initialFilter: PhotoFilter = PHOTO_FILTERS.includes(params.filter as PhotoFilter)
    ? (params.filter as PhotoFilter)
    : 'needs';

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PhotoFilter>(initialFilter);
  const [sortOrder, setSortOrder] = useState<SortOrder>(params.sort === 'newest' ? 'newest' : 'set');
  // False once the database answered a "newest" page in set order (088 not applied).
  const [newestAvailable, setNewestAvailable] = useState(true);
  const [mineOnly, setMineOnly] = useState(false);
  const [facets, setFacets] = useState<FacetFilters>(() => (params.set ? { ...NO_FACETS, set: params.set } : NO_FACETS));
  const [openFacet, setOpenFacet] = useState<FacetKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 24;

  const ownedList = useMemo(() => Object.entries(collection)
    .filter(([, e]) => e.status === 'owned' || e.status === 'for_trade')
    .map(([id]) => id)
    .sort(), [collection]);
  const ownedIds = useMemo(() => new Set(ownedList), [ownedList]);

  // Search runs in the database (migration 077), so wait for a pause in typing.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Filtering, counting and paging happen in the database; the catalogue is too big to load here.
  const view = useMemo(() => ({
    query: debouncedQuery,
    filter,
    mineOnly,
    sort: sortOrder,
    facets: {
      year: facets.year ? Number(facets.year) : null,
      origin: facets.origin,
      character: facets.character,
      set: facets.set,
    },
  }), [debouncedQuery, filter, mineOnly, facets, sortOrder]);
  const {
    rows, stats, setTotals, sort: appliedSort, sortUnavailable, loading, loadingMore, hasMore, error, loadMore, refresh, loadFacet,
  } = useCoveragePage(enabled, view, ownedList);

  // Only a page that was asked for newest and came back in set order hides the toggle
  // (not the previous set-order page still on screen right after tapping Newest).
  useEffect(() => {
    if (sortUnavailable) {
      setNewestAvailable(false);
      setSortOrder('set');
    }
  }, [sortUnavailable]);
  const showNewest = sortOrder === 'newest' && appliedSort === 'newest';

  // Pages arrive ordered by set, so a set can continue on the next page: group what's loaded.
  // Newest first: one list, each tile still shows its set.
  type Section = { title: string; totals: { total: number; withPhoto: number } | null; data: CatalogueImageCoverage[][] };
  const sections = useMemo((): Section[] => {
    if (showNewest) {
      const chunks: CatalogueImageCoverage[][] = [];
      for (let i = 0; i < rows.length; i += COLUMNS) chunks.push(rows.slice(i, i + COLUMNS));
      return chunks.length ? [{ title: 'Newest first', totals: null, data: chunks }] : [];
    }
    const bySet = new Map<string, CatalogueImageCoverage[]>();
    for (const r of rows) {
      const list = bySet.get(r.setName) ?? [];
      list.push(r);
      bySet.set(r.setName, list);
    }
    return [...bySet.entries()].map(([setName, pins]) => {
      const chunks: CatalogueImageCoverage[][] = [];
      for (let i = 0; i < pins.length; i += COLUMNS) chunks.push(pins.slice(i, i + COLUMNS));
      return { title: setName, totals: setTotals[setName] ?? null, data: chunks };
    });
  }, [rows, setTotals, showNewest]);

  // Facet choices (with counts) load when a facet sheet opens.
  const [facetItems, setFacetItems] = useState<Array<{ value: string; label: string }>>([]);
  const loadFacetRef = useRef(loadFacet);
  loadFacetRef.current = loadFacet;
  const facetsKey = JSON.stringify(view.facets);
  useEffect(() => {
    if (!openFacet) { setFacetItems(prev => (prev.length ? [] : prev)); return; }
    let cancelled = false;
    loadFacetRef.current(openFacet)
      .then(options => {
        if (!cancelled) setFacetItems(options.map(o => ({ value: o.value, label: `${o.value} (${o.count})` })));
      })
      .catch(() => { if (!cancelled) setFacetItems([]); });
    return () => { cancelled = true; };
  }, [openFacet, facetsKey]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const openPin = (pinhuntId: string) => {
    router.push({ pathname: '/contribute-image/[pinId]', params: { pinId: pinhuntId, from: 'catalogue' } });
  };

  const anyFilter = Boolean(query.trim() || filter !== initialFilter || sortOrder !== 'set' || mineOnly || Object.values(facets).some(Boolean));
  // Full-screen spinner only on first open; while filtering the header stays and the list shows it.
  if (featureLoading || (enabled && loading && rows.length === 0 && !anyFilter)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
        <Stack.Screen options={{ title: SCREEN_TITLE }} />
        <ActivityIndicator color={colors.homeCoral} />
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
        <Stack.Screen options={{ title: SCREEN_TITLE }} />
        <EmptyState icon="lock" title="Not available yet" subtitle="This feature isn't open to your account yet." />
      </View>
    );
  }

  const coverage = stats.total ? stats.withPhoto / stats.total : 0;
  const chips: Array<{ value: PhotoFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: stats.total },
    { value: 'needs', label: 'Needs photo', count: stats.needs },
    { value: 'pending', label: 'In review', count: stats.pending },
    { value: 'reference', label: 'Reference photo', count: stats.reference },
    { value: 'community', label: 'Community photo', count: stats.community },
    { value: 'info', label: 'Missing info', count: stats.info },
    { value: 'back', label: 'Needs back photo', count: stats.back },
  ];

  const header = (
    <View style={styles.header}>
      <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: colors.homeInk }]}>Catalogue photos</Text>
          <View style={[styles.betaPill, { backgroundColor: colors.homeWarmSurface }]}>
            <Text style={[styles.betaLabel, { color: colors.homeSandInk }]}>BETA</Text>
          </View>
        </View>
        <View style={[styles.bar, { backgroundColor: colors.homeAqua }]}>
          <View style={[styles.barFill, { backgroundColor: colors.homeCoral, width: `${Math.round(coverage * 100)}%` }]} />
        </View>
        <Text style={[styles.cardMeta, { color: colors.homeMuted }]}>
          {stats.withPhoto.toLocaleString()} of {stats.total.toLocaleString()} pins have a photo
          {stats.community > 0 ? ` · ${stats.community} from the community` : ''}
        </Text>
      </View>

      {stats.mine > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setMineOnly(v => !v)}
          style={[styles.mineCta, {
            backgroundColor: mineOnly ? colors.homeCoral : colors.homeCoral + '14',
            borderColor: colors.homeCoral,
          }]}
        >
          <Feather name={mineOnly ? 'check-circle' : 'camera'} size={18} color={mineOnly ? colors.homeHeroText : colors.homeCoral} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.mineTitle, { color: mineOnly ? colors.homeHeroText : colors.homeCoralDeep }]}>
              You own {stats.mine} {stats.mine === 1 ? 'pin' : 'pins'} in this catalogue
            </Text>
            <Text style={[styles.mineSub, { color: mineOnly ? colors.homeHeroMuted : colors.homeMuted }]}>
              {mineOnly ? 'Showing only your pins — tap to show all' : 'Show only pins you can photograph'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <SearchBar value={query} onChangeText={setQuery} placeholder="Search pins, sets or PHUK IDs" />

      <TouchableOpacity
        onPress={() => router.push({ pathname: '/add-pin', params: { name: query.trim() } })}
        activeOpacity={0.8}
        style={styles.addPinLink}
      >
        <Feather name="plus-circle" size={15} color={colors.homeCoral} />
        <Text style={[styles.addPinLinkLabel, { color: colors.homeCoral }]}>Pin not in the catalogue? Add it</Text>
      </TouchableOpacity>

      {newestAvailable && (
        <View style={styles.sortRow} accessibilityRole="radiogroup" accessibilityLabel="Order">
          {([['set', 'By set'], ['newest', 'Newest']] as const).map(([value, label]) => {
            const active = sortOrder === value;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => setSortOrder(value)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={value === 'newest' ? 'Newest pins first' : 'Grouped by set'}
                style={[styles.sortOption, {
                  backgroundColor: active ? colors.homeSurface : 'transparent',
                  borderColor: active ? colors.homeLine : 'transparent',
                }]}
              >
                <Feather name={value === 'newest' ? 'clock' : 'layers'} size={13} color={active ? colors.homeCoralDeep : colors.homeMuted} />
                <Text style={[styles.chipLabel, { color: active ? colors.homeInk : colors.homeMuted }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.chips}>
        {chips.map(c => {
          const active = filter === c.value;
          return (
            <TouchableOpacity
              key={c.value}
              onPress={() => setFilter(c.value)}
              activeOpacity={0.8}
              style={[styles.chip, {
                backgroundColor: active ? colors.homeInk : colors.homeSurface,
                borderColor: active ? colors.homeInk : colors.homeLine,
              }]}
            >
              <Text style={[styles.chipLabel, { color: active ? colors.homeSurface : colors.homeInk }]}>
                {c.label} <Text style={{ color: active ? colors.homeSurface : colors.homeMuted }}>{c.count}</Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Year / park / character / set (#396) */}
      <View style={styles.chips}>
        {(Object.keys(FACET_TITLES) as FacetKey[]).map(key => {
          const value = facets[key];
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setOpenFacet(key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${FACET_TITLES[key]}: ${value ?? 'any'}`}
              style={[styles.facet, {
                backgroundColor: value ? colors.homeCoral + '18' : colors.homeSurface,
                borderColor: value ? colors.homeCoral : colors.homeLine,
              }]}
            >
              <Text style={[styles.chipLabel, { color: colors.homeInk }]} numberOfLines={1}>
                {value ?? FACET_TITLES[key]}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.homeMuted} />
            </TouchableOpacity>
          );
        })}
      </View>

      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      <Stack.Screen options={{ title: SCREEN_TITLE }} />
      <SectionList
        sections={sections}
        keyExtractor={(chunk, i) => `${chunk[0]?.pinhuntId ?? 'row'}-${i}`}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: botPad }}
        initialNumToRender={8}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        // 240 pins a page, loaded as the list nears the end.
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.6}
        ListFooterComponent={loadingMore ? (
          <View style={styles.footer} accessibilityLabel="Loading more pins">
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : null}
        ListEmptyComponent={loading ? (
          <View style={styles.footer} accessibilityLabel="Loading pins">
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : (
          <EmptyState
            icon="image"
            title="No pins match"
            subtitle={mineOnly ? 'None of your pins match these filters.' : 'Try a different filter or search.'}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.homeInk }]} numberOfLines={1}>{section.title}</Text>
            {section.totals && (
              <Text style={[styles.sectionMeta, { color: colors.homeMuted }]}>
                {section.totals.withPhoto}/{section.totals.total}
              </Text>
            )}
          </View>
        )}
        renderItem={({ item: chunk }) => (
          <View style={styles.gridRow}>
            {chunk.map(row => (
              <Tile key={row.pinhuntId} row={row} owned={ownedIds.has(row.pinhuntId)} showMissing={filter === 'info'} showSet={showNewest} onPress={() => openPin(row.pinhuntId)} />
            ))}
            {Array.from({ length: COLUMNS - chunk.length }).map((_, i) => <View key={`pad-${i}`} style={styles.tile} />)}
          </View>
        )}
      />
      <FilterSheet
        visible={openFacet !== null}
        title={openFacet ? FACET_TITLES[openFacet] : ''}
        searchable={openFacet === 'character' || openFacet === 'set'}
        items={facetItems}
        value={openFacet ? facets[openFacet] : null}
        onSelect={v => { if (openFacet) setFacets(f => ({ ...f, [openFacet]: v })); setOpenFacet(null); }}
        onClose={() => setOpenFacet(null)}
      />
    </View>
  );
}

function Tile({ row, owned, showMissing, showSet, onPress }: { row: CatalogueImageCoverage; owned: boolean; showMissing?: boolean; showSet?: boolean; onPress(): void }) {
  const colors = useColors();
  const pending = isPending(row);
  const needs = row.imageSource === null;

  let badge: { icon: keyof typeof Feather.glyphMap; label: string; bg: string; fg: string } | null = null;
  if (row.myStatus === 'pending') badge = { icon: 'clock', label: 'Your photo', bg: colors.homeWarmSurface, fg: colors.homeSandInk };
  else if (pending) badge = { icon: 'clock', label: 'In review', bg: colors.homeWarmSurface, fg: colors.homeSandInk };
  else if (needs) badge = { icon: 'camera', label: 'Needs photo', bg: colors.homeCoral, fg: colors.homeHeroText };
  else if (row.imageSource === 'community') badge = { icon: 'check', label: 'Community', bg: colors.homeAqua, fg: colors.homeInk };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.tile}>
      <View style={[
        styles.tileImageWrap,
        { backgroundColor: colors.homeSurface, borderColor: needs && !pending ? colors.homeCoral : colors.homeLine },
        needs && !pending && styles.tileDashed,
      ]}>
        {needs ? (
          <View style={styles.tileEmpty}>
            <Feather name="camera" size={22} color={pending ? colors.homeMuted : colors.homeCoral} />
          </View>
        ) : (
          <PinImage source={row.imageUrl ? { uri: row.imageUrl } : PLACEHOLDER_IMAGE} style={styles.tileImage} contentFit="contain" />
        )}
        {owned && (
          <View style={[styles.ownedDot, { backgroundColor: colors.homeTeal }]}>
            <Feather name="user-check" size={10} color={colors.homeHeroText} />
          </View>
        )}
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Feather name={badge.icon} size={9} color={badge.fg} />
            <Text style={[styles.badgeLabel, { color: badge.fg }]} numberOfLines={1}>{badge.label}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tileTitle, { color: colors.homeInk }]} numberOfLines={2}>{row.title}</Text>
      {showSet && (
        <Text style={[styles.tileMissing, { color: colors.homeMuted }]} numberOfLines={1}>{row.setName}</Text>
      )}
      {showMissing && missingLabel(row) && (
        <Text style={[styles.tileMissing, { color: colors.homeMuted }]} numberOfLines={2}>{missingLabel(row)}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.lg, gap: spacing.md },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  betaPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  betaLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  bar: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  cardMeta: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  mineCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  mineTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  mineSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  sortRow: { flexDirection: 'row', alignSelf: 'flex-start', gap: 4 },
  sortOption: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 36 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  error: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  addPinLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  addPinLinkLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  sectionTitle: { flex: 1, fontSize: 15, fontFamily: 'Inter_700Bold' },
  sectionMeta: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  gridRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  tile: { flex: 1, gap: 6 },
  tileImageWrap: { aspectRatio: 1, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileDashed: { borderStyle: 'dashed', borderWidth: 1.5 },
  tileEmpty: { alignItems: 'center', justifyContent: 'center' },
  tileImage: { width: '88%', height: '88%' },
  ownedDot: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 6, bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 6 },
  badgeLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  tileTitle: { fontSize: 11, fontFamily: 'Inter_500Medium', lineHeight: 14 },
  tileMissing: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 13 },
  facet: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, minHeight: 36, maxWidth: 170 },
});
