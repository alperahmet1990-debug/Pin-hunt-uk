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

type PinFilter = 'all' | 'owned' | 'missing';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLS = 3;
const GRID_GAP = spacing.md;
const TILE = (SCREEN_WIDTH - spacing.lg * 2 - GRID_GAP * (COLS - 1)) / COLS;

export default function SetDetailScreen() {
  const { collection: collectionParam } = useLocalSearchParams<{ collection: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { collection: userCollection, getEntry } = useCollection();
  const { pins: catalogue, repository, ensureCollections } = usePinCatalogue();

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

  const total = setPins.length;
  const ownedCount = ownedPins.length;
  const pct = total > 0 ? ownedCount / total : 0;
  const isComplete = ownedCount === total && total > 0;

  const FILTERS: SegmentedControlOption<PinFilter>[] = [
    { value: 'all', label: `All · ${total}`, tone: 'neutral' },
    { value: 'owned', label: `Owned · ${ownedCount}`, tone: 'owned' },
    { value: 'missing', label: `Missing · ${missingPins.length}`, tone: 'coral' },
  ];

  if (setLoading) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
      </ScreenContainer>
    );
  }

  if (setPins.length === 0) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <TouchableOpacity
          accessibilityLabel="Go back"
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
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={[styles.backBtn, { backgroundColor: colors.homeAqua }]}
          >
            <Feather name="chevron-left" size={20} color={colors.homeInk} />
          </TouchableOpacity>
          {isComplete && (
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
            {ownedCount} of {total} collected
          </Text>
          <Text style={[styles.progressCount, { color: colors.homeCoralDeep }]}>{ownedCount}/{total}</Text>
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
      {displayPins.length === 0 ? (
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
          contentContainerStyle={[styles.grid, { paddingBottom: botPad }]}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => {
            const isOwned = ownedIds.has(item.id);
            const qty = getEntry(item.id)?.quantity ?? 1;
            return (
              <View style={{ width: TILE }}>
                <CompactPinTile
                  pin={item}
                  owned={isOwned}
                  size={TILE}
                  onPress={() => router.push({ pathname: '/pin/[id]', params: { id: item.id } })}
                  onQuickAdd={!isOwned ? () => setQuickAddPin(item) : undefined}
                />
                {isOwned && qty > 1 && (
                  <View style={[styles.qtyBadge, { backgroundColor: colors.homeInk }]}>
                    <Text style={[styles.qtyBadgeLabel, { color: colors.homeSurface }]}>×{qty}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
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
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
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
  qtyBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 24,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBadgeLabel: { fontSize: 10, fontFamily: 'Inter_700Bold' },
});
