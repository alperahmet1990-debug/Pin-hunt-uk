import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { PinCard } from '@/components/PinCard';
import { EmptyState } from '@/components/EmptyState';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import type { CataloguePin, PinSetSummary } from '@workspace/pin-repository';

type PinFilter = 'all' | 'owned' | 'missing';

export default function SetDetailScreen() {
  const { collection: collectionParam } = useLocalSearchParams<{ collection: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { collection: userCollection, getEntry } = useCollection();
  const { pins: catalogue, repository } = usePinCatalogue();

  const [filter, setFilter] = useState<PinFilter>('all');

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
  const pct = total > 0 ? Math.round((ownedCount / total) * 100) : 0;
  const isComplete = ownedCount === total && total > 0;

  if (setPins.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: collectionParam ?? 'Set' }} />
        <EmptyState
          icon="package"
          title="Set not found"
          subtitle="This set is not in the catalogue yet."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </>
    );
  }

  const FILTERS: Array<{ key: PinFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: total },
    { key: 'owned', label: 'Owned', count: ownedCount },
    { key: 'missing', label: 'Missing', count: missingPins.length },
  ];

  return (
    <>
      <Stack.Screen options={{ title: collectionParam ?? 'Set' }} />
      <View style={[styles.root, { backgroundColor: colors.background }]}>

        {/* ── Set header ── */}
        <View
          style={[
            styles.headerBar,
            { backgroundColor: colors.card, borderBottomColor: colors.border },
          ]}
        >
          {/* Completion summary */}
          <View style={styles.completionRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.collectionName, { color: colors.foreground }]} numberOfLines={2}>
                {collectionParam}
              </Text>
              <Text style={[styles.completionText, { color: colors.mutedForeground }]}>
                {ownedCount} of {total} pins owned · {pct}% complete
              </Text>
              {setSummary?.expectedPinCount != null &&
                setSummary.expectedPinCount > setSummary.releasedPinCount && (
                  <Text style={[styles.completionText, { color: colors.mutedForeground }]}>
                    Ongoing set — {setSummary.releasedPinCount} of {setSummary.expectedPinCount} pins released so far
                  </Text>
                )}
            </View>
            {isComplete && (
              <View style={[styles.completeBadge, { backgroundColor: colors.owned + '20' }]}>
                <Feather name="award" size={14} color={colors.owned} />
                <Text style={[styles.completeBadgeLabel, { color: colors.owned }]}>Complete!</Text>
              </View>
            )}
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: isComplete ? colors.owned : colors.primary,
                  width: `${pct}%` as any,
                },
              ]}
            />
          </View>

          {/* Filter tabs */}
          <View style={[styles.filterRow, { borderTopColor: colors.border }]}>
            {FILTERS.map(f => {
              const isActive = f.key === filter;
              const activeColor =
                f.key === 'owned' ? colors.owned
                : f.key === 'missing' ? colors.destructive
                : colors.primary;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[
                    styles.filterTab,
                    isActive && { borderBottomColor: activeColor, borderBottomWidth: 2 },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.filterLabel, { color: isActive ? activeColor : colors.mutedForeground }]}>
                    {f.label}
                  </Text>
                  <View
                    style={[
                      styles.filterBadge,
                      { backgroundColor: isActive ? activeColor : colors.secondary },
                    ]}
                  >
                    <Text style={[styles.filterBadgeLabel, { color: isActive ? '#fff' : colors.mutedForeground }]}>
                      {f.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
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
            numColumns={2}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.grid, { paddingBottom: botPad }]}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => {
              const isMissing = !ownedIds.has(item.id);
              return (
                <View style={[styles.pinWrap, isMissing && styles.pinMissing]}>
                  <PinCard
                    pin={item}
                    mode="grid"
                    onPress={() =>
                      router.push({ pathname: '/pin/[id]', params: { id: item.id } })
                    }
                    onQuickAdd={() => setQuickAddPin(item)}
                  />
                  {isMissing && (
                    <View
                      style={[
                        styles.missingOverlay,
                        { borderRadius: colors.radius },
                      ]}
                      pointerEvents="none"
                    >
                      <View style={[styles.missingBadge, { backgroundColor: colors.destructive }]}>
                        <Text style={styles.missingBadgeLabel}>Missing</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        <QuickAddSheet pin={quickAddPin} onClose={() => setQuickAddPin(null)} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  collectionName: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    lineHeight: 24,
    marginBottom: 4,
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  completionText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  completeBadgeLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  filterRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  filterBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  filterBadgeLabel: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  // Grid
  grid: { paddingTop: 12, paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'space-between' },
  pinWrap: { flex: 1, position: 'relative' },
  pinMissing: { opacity: 0.55 },
  missingOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  missingBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  missingBadgeLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  destructive: { color: '#EF4444' },
});
