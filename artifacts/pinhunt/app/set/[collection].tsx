import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { EmptyState } from '@/components/EmptyState';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { ScreenContainer, SegmentedControl, SetProgressBar, CompactPinTile } from '@/components/ui';
import type { SegmentedControlOption } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import type { CataloguePin, PinSetSummary } from '@workspace/pin-repository';
import { useSetTraders } from '@/hooks/useSetTraders';
import { useAddMissingToIso } from '@/hooks/useAddMissingToIso';

type PinFilter = 'all' | 'owned' | 'missing';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLS = 3;
const GRID_GAP = spacing.md;
const TILE = (SCREEN_WIDTH - spacing.lg * 2 - GRID_GAP * (COLS - 1)) / COLS;
// Room for the missing-pins footer so the last row isn't hidden behind it.
const FOOTER_SPACE = 130;

export default function SetDetailScreen() {
  const { collection: collectionParam } = useLocalSearchParams<{ collection: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { collection: userCollection, getEntry } = useCollection();
  const { pins: catalogue, loading: catalogueLoading, repository, ensureCollections } = usePinCatalogue();

  const [filter, setFilter] = useState<PinFilter>('all');
  const [setLoading, setSetLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSetLoading(true);
    if (!collectionParam) {
      setSetLoading(false);
      return;
    }
    ensureCollections([collectionParam])
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSetLoading(false);
      });
    return () => { cancelled = true; };
  }, [collectionParam, ensureCollections]);

  // Validated set summary (expected totals for ongoing sets, e.g. monthly series)
  const [setSummary, setSetSummary] = useState<PinSetSummary | null>(null);
  useEffect(() => {
    if (!repository || !collectionParam) return;
    let cancelled = false;
    repository
      .getSetSummaries()
      .then(sets => {
        if (cancelled) return;
        setSetSummary(sets.find(s => s.setName === collectionParam) ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [repository, collectionParam]);

  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 24) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 20;

  // All catalogue pins in this set
  const setPins = useMemo(
    () => catalogue.filter(p => p.collection === collectionParam),
    [catalogue, collectionParam],
  );

  // Placeholders while this set (or, before it exists, the catalogue) is still
  // loading. Once pins are showing, a catalogue refresh doesn't hide them.
  const loading = setLoading || (catalogueLoading && setPins.length === 0);

  const [quickAddPin, setQuickAddPin] = useState<CataloguePin | null>(null);

  const ownedIds = useMemo(
    () => new Set(
      Object.values(userCollection)
        .filter(e => e.status === 'owned' || e.status === 'for_trade')
        .map(e => e.pinId),
    ),
    [userCollection],
  );

  const ownedPins = useMemo(() => setPins.filter(p => ownedIds.has(p.id)), [setPins, ownedIds]);
  const missingPins = useMemo(() => setPins.filter(p => !ownedIds.has(p.id)), [setPins, ownedIds]);

  const displayPins = useMemo(() => {
    if (filter === 'owned') return ownedPins;
    if (filter === 'missing') return missingPins;
    // "all" — owned first, then missing
    return [...ownedPins, ...missingPins];
  }, [filter, ownedPins, missingPins]);

  // Footer actions for the missing pins (UX-021): who has them, and ISO in one go.
  const missingIds = useMemo(() => missingPins.map(p => p.id), [missingPins]);
  const { available, loading: tradersLoading } = useSetTraders(loading ? [] : missingIds);
  const { add: addMissingToIso, pending: pendingIso } = useAddMissingToIso();
  const showFooter = !loading && missingIds.length > 0;
  const toIsoCount = showFooter ? pendingIso(missingIds).length : 0;

  const total = setPins.length;
  const ownedCount = ownedPins.length;
  const pct = total > 0 ? ownedCount / total : 0;
  const isComplete = ownedCount === total && total > 0;

  const FILTERS: SegmentedControlOption<PinFilter>[] = loading
    ? [
        { value: 'all', label: 'All', tone: 'neutral' },
        { value: 'owned', label: 'Owned', tone: 'owned' },
        { value: 'missing', label: 'Missing', tone: 'coral' },
      ]
    : [
        { value: 'all', label: `All · ${total}`, tone: 'neutral' },
        { value: 'owned', label: `Owned · ${ownedCount}`, tone: 'owned' },
        { value: 'missing', label: `Missing · ${missingPins.length}`, tone: 'coral' },
      ];

  if (!loading && setPins.length === 0) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <TouchableOpacity
          accessibilityLabel="Back"
          onPress={() => router.back()}
          activeOpacity={0.85}
          style={[styles.backBtn, { top: topInset + 10, backgroundColor: colors.homeAqua }]}
        >
          <Feather name="chevron-left" size={20} color={colors.homeInk} />
        </TouchableOpacity>
        <EmptyState
          icon="package"
          title="Set not found"
          subtitle="This set is not in the catalogue yet."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={{ top: false, bottom: false }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Top: back + set name + completion ── */}
      <View style={[styles.header, { paddingTop: topInset + 10, borderBottomColor: colors.homeLine }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            accessibilityLabel="Back"
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={[styles.backBtn, { backgroundColor: colors.homeAqua }]}
          >
            <Feather name="chevron-left" size={20} color={colors.homeInk} />
          </TouchableOpacity>
          {!loading && isComplete && (
            <View style={[styles.completeBadge, { backgroundColor: colors.owned + '1E' }]}>
              <Feather name="award" size={13} color={colors.owned} />
              <Text style={[styles.completeBadgeLabel, { color: colors.owned }]}>Complete!</Text>
            </View>
          )}
        </View>

        <Text style={[styles.setTitle, { color: colors.homeInk }]} numberOfLines={2}>
          {collectionParam}
        </Text>

        <View style={styles.progressRow}>
          <Text style={[styles.progressText, { color: colors.homeMuted }]}>
            {loading ? 'Loading set…' : `${ownedCount} of ${total} collected`}
          </Text>
          {!loading && (
            <Text style={[styles.progressCount, { color: colors.homeCoralDeep }]}>{ownedCount}/{total}</Text>
          )}
        </View>
        <SetProgressBar
          progress={pct}
          trackColor={colors.homeLine}
          fillColor={isComplete ? colors.owned : colors.homeCoral}
          height={7}
        />
        {setSummary?.expectedPinCount != null && setSummary.expectedPinCount > setSummary.releasedPinCount && (
          <Text style={[styles.ongoingText, { color: colors.homeMuted }]}>
            Ongoing set — {setSummary.releasedPinCount} of {setSummary.expectedPinCount} pins released so far
          </Text>
        )}

        <View style={styles.filterWrap}>
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
        </View>
      </View>

      {/* ── Pin grid ── */}
      {loading ? (
        <View
          style={[styles.grid, styles.skeletonGrid]}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading pins in this set"
        >
          {Array.from({ length: COLS * 3 }, (_, i) => (
            <View key={i} style={{ width: TILE }}>
              <View style={[styles.skeletonImage, { width: TILE, height: TILE, backgroundColor: colors.homeAqua }]} />
              <View style={[styles.skeletonLabel, { backgroundColor: colors.homeLine }]} />
            </View>
          ))}
        </View>
      ) : displayPins.length === 0 ? (
        <EmptyState
          icon={filter === 'owned' ? 'check-circle' : 'search'}
          title={filter === 'owned' ? 'No owned pins in this set' : 'No missing pins — set complete!'}
          subtitle={
            filter === 'owned'
              ? 'Tap a pin and mark it as Owned to track your progress.'
              : 'You own every pin in this set.'
          }
        />
      ) : (
        <FlatList
          data={displayPins}
          keyExtractor={p => p.id}
          numColumns={COLS}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.grid, { paddingBottom: botPad + (showFooter ? FOOTER_SPACE : 0) }]}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => {
            const isOwned = ownedIds.has(item.id);
            const entry = getEntry(item.id);
            return (
              <View style={{ width: TILE }}>
                <CompactPinTile
                  pin={item}
                  owned={isOwned}
                  status={entry?.status}
                  copies={isOwned ? entry?.quantity : undefined}
                  size={TILE}
                  onPress={() => router.push({ pathname: '/pin/[id]', params: { id: item.id } })}
                  onQuickAdd={!isOwned ? () => setQuickAddPin(item) : undefined}
                />
              </View>
            );
          }}
        />
      )}

      {showFooter && (
        <View style={[styles.footer, { backgroundColor: colors.homeSurface, borderTopColor: colors.homeLine, paddingBottom: botPad }]}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/set-traders/[collection]', params: { collection: collectionParam } })}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={[styles.footerPrimary, { backgroundColor: colors.homeCoral }]}
          >
            <Text style={[styles.footerPrimaryLabel, { color: colors.homeSurface }]}>
              Find the {missingIds.length} missing
            </Text>
            {available != null && !tradersLoading && (
              <Text style={[styles.footerPrimarySub, { color: colors.homeSurface }]}>
                {available > 0 ? `${available} available from collectors` : 'None for trade yet'}
              </Text>
            )}
          </TouchableOpacity>
          {toIsoCount > 0 && (
            <TouchableOpacity
              onPress={() => addMissingToIso(missingIds)}
              activeOpacity={0.7}
              accessibilityRole="button"
              style={styles.footerSecondary}
            >
              <Text style={[styles.footerSecondaryLabel, { color: colors.homeCoralDeep }]}>Add missing to ISO</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <QuickAddSheet pin={quickAddPin} onClose={() => setQuickAddPin(null)} seaGlass />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  completeBadgeLabel: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  setTitle: { fontSize: 21, lineHeight: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.4, marginTop: spacing.sm },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressText: { fontSize: 12.5, fontFamily: 'Inter_500Medium' },
  progressCount: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  ongoingText: { fontSize: 11.5, fontFamily: 'Inter_400Regular' },
  filterWrap: { marginTop: spacing.xs },
  // Grid
  grid: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg },
  gridRow: { gap: GRID_GAP, justifyContent: 'flex-start', marginBottom: spacing.lg },
  // Loading placeholders, sized like CompactPinTile (square image + one label line)
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GRID_GAP, rowGap: spacing.lg },
  skeletonImage: { borderRadius: radius.md },
  // Missing-pins footer
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 2 },
  footerPrimary: { minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  footerPrimaryLabel: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  footerPrimarySub: { fontSize: 11.5, fontFamily: 'Inter_500Medium', opacity: 0.9 },
  footerSecondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  footerSecondaryLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  skeletonLabel: { height: 9, width: '70%', alignSelf: 'center', borderRadius: 5, marginTop: 9, marginBottom: 2 },
});
