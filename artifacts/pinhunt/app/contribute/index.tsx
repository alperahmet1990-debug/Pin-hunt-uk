/**
 * Help build the catalogue — beta contributor screen.
 *
 * Browses the full Collectible PinTrader catalogue grouped by set, showing
 * each pin's photo status, so contributors can photograph pins they own.
 * Tapping a pin opens the existing contribution flow
 * (/contribute-image/[pinId]) in catalogue mode.
 *
 * Gated by the 'catalogue_contributions' feature flag (migration 039) —
 * starts admin-only; widened to contributors / public by editing its row.
 * The data is gated again server-side in get_catalogue_image_coverage().
 */
import React, { useMemo, useState } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { CatalogueImageCoverage } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useFeature } from '@/hooks/useFeature';
import { useCatalogueCoverage } from '@/hooks/useCatalogueCoverage';
import { useCollection } from '@/context/CollectionContext';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { PLACEHOLDER_IMAGE } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import { PinImage } from '@/components/ui/PinImage';

type PhotoFilter = 'all' | 'needs' | 'reference' | 'pending' | 'community';

const COLUMNS = 3;

function isPending(row: CatalogueImageCoverage) {
  return row.myStatus === 'pending' || row.pendingCount > 0;
}

function matchesFilter(row: CatalogueImageCoverage, filter: PhotoFilter) {
  switch (filter) {
    case 'needs': return row.imageSource === null && !isPending(row);
    case 'reference': return row.imageSource === 'reference';
    case 'pending': return isPending(row);
    case 'community': return row.imageSource === 'community';
    default: return true;
  }
}

export default function ContributeCatalogueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { enabled, loading: featureLoading } = useFeature('catalogue_contributions');
  const { rows, loading, error, refresh } = useCatalogueCoverage(enabled);
  const { collection } = useCollection();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PhotoFilter>('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 24;

  const ownedIds = useMemo(() => new Set(
    Object.entries(collection)
      .filter(([, e]) => e.status === 'owned' || e.status === 'for_trade')
      .map(([id]) => id),
  ), [collection]);

  const stats = useMemo(() => {
    let withPhoto = 0, community = 0, needs = 0, reference = 0, pending = 0, mine = 0;
    for (const r of rows) {
      if (r.imageSource) withPhoto++;
      if (r.imageSource === 'community') community++;
      if (r.imageSource === 'reference') reference++;
      if (matchesFilter(r, 'needs')) needs++;
      if (isPending(r)) pending++;
      if (ownedIds.has(r.pinhuntId)) mine++;
    }
    return { total: rows.length, withPhoto, community, needs, reference, pending, mine };
  }, [rows, ownedIds]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySet = new Map<string, CatalogueImageCoverage[]>();
    const setTotals = new Map<string, { total: number; withPhoto: number }>();
    for (const r of rows) {
      const t = setTotals.get(r.setName) ?? { total: 0, withPhoto: 0 };
      t.total++;
      if (r.imageSource) t.withPhoto++;
      setTotals.set(r.setName, t);

      if (mineOnly && !ownedIds.has(r.pinhuntId)) continue;
      if (!matchesFilter(r, filter)) continue;
      if (q && !r.title.toLowerCase().includes(q) && !r.setName.toLowerCase().includes(q)
        && !r.pinhuntId.toLowerCase().includes(q)) continue;
      const list = bySet.get(r.setName) ?? [];
      list.push(r);
      bySet.set(r.setName, list);
    }
    return [...bySet.entries()].map(([setName, pins]) => {
      const chunks: CatalogueImageCoverage[][] = [];
      for (let i = 0; i < pins.length; i += COLUMNS) chunks.push(pins.slice(i, i + COLUMNS));
      return { title: setName, totals: setTotals.get(setName)!, data: chunks };
    });
  }, [rows, query, filter, mineOnly, ownedIds]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const openPin = (pinhuntId: string) => {
    router.push({ pathname: '/contribute-image/[pinId]', params: { pinId: pinhuntId, from: 'catalogue' } });
  };

  if (featureLoading || (enabled && loading && rows.length === 0)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
        <Stack.Screen options={{ title: 'Help Build the Catalogue' }} />
        <ActivityIndicator color={colors.homeCoral} />
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
        <Stack.Screen options={{ title: 'Help Build the Catalogue' }} />
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

      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      <Stack.Screen options={{ title: 'Help Build the Catalogue' }} />
      <SectionList
        sections={sections}
        keyExtractor={(chunk, i) => `${chunk[0]?.pinhuntId ?? 'row'}-${i}`}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: botPad }}
        initialNumToRender={8}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon="image"
            title="No pins match"
            subtitle={mineOnly ? 'None of your pins match these filters.' : 'Try a different filter or search.'}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.homeInk }]} numberOfLines={1}>{section.title}</Text>
            <Text style={[styles.sectionMeta, { color: colors.homeMuted }]}>
              {section.totals.withPhoto}/{section.totals.total}
            </Text>
          </View>
        )}
        renderItem={({ item: chunk }) => (
          <View style={styles.gridRow}>
            {chunk.map(row => (
              <Tile key={row.pinhuntId} row={row} owned={ownedIds.has(row.pinhuntId)} onPress={() => openPin(row.pinhuntId)} />
            ))}
            {Array.from({ length: COLUMNS - chunk.length }).map((_, i) => <View key={`pad-${i}`} style={styles.tile} />)}
          </View>
        )}
      />
    </View>
  );
}

function Tile({ row, owned, onPress }: { row: CatalogueImageCoverage; owned: boolean; onPress(): void }) {
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  error: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  addPinLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  addPinLinkLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
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
});
