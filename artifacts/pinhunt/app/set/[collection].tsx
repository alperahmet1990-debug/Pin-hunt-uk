import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { ScreenContainer, SegmentedControl, SetProgressBar, CompactPinTile, PinGrid, SkeletonGrid } from '@/components/ui';
import type { SegmentedControlOption } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import type { CataloguePin, PinSetSummary } from '@workspace/pin-repository';
import { useSetTraders } from '@/hooks/useSetTraders';
import { useAddMissingToIso } from '@/hooks/useAddMissingToIso';
import { usePinSelection } from '@/hooks/usePinSelection';
import { useToast } from '@/components/ui/Toast';
import { pinsToAddToIso } from '@/utils/setTraders';
import { usePinActions } from '@/components/PinActionsSheet';
import { Button, IconButton } from '@/components/ui/Button';

type PinFilter = 'all' | 'owned' | 'missing';

// Room for the missing-pins footer so the last row isn't hidden behind it.
const FOOTER_SPACE = 130;

export default function SetDetailScreen() {
  const { collection: collectionParam } = useLocalSearchParams<{ collection: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pinActions = usePinActions();
  // Placeholder tiles match the real grid (PinGrid): same columns and size.
  const { collection: userCollection, getEntry, setStatuses } = useCollection();
  const toast = useToast();
  // Undo runs after later renders, so it reads the latest setter (collection-mutation-ordering.md).
  const setStatusesRef = useRef(setStatuses);
  setStatusesRef.current = setStatuses;
  const selection = usePinSelection();
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
  const showFooter = !loading && missingIds.length > 0 && !selection.active;
  const toIsoCount = showFooter ? pendingIso(missingIds).length : 0;

  // Select mode (UX-022): tick off many missing pins, then Owned or ISO in one batch.
  const selectedIds = useMemo(
    () => missingIds.filter(id => selection.selected.has(id)),
    [missingIds, selection.selected],
  );
  const markSelectedOwned = () => {
    const ids = selectedIds;
    if (ids.length === 0) return;
    // Missing pins have no status or are on the ISO; Undo puts each back exactly.
    const wasIso = ids.filter(id => userCollection[id]?.status === 'wanted');
    const wasNone = ids.filter(id => userCollection[id]?.status !== 'wanted');
    setStatuses(ids, 'owned');
    selection.stop();
    toast.show({
      message: `Added ${ids.length} · Set ${ownedCount + ids.length}/${total}`,
      action: {
        label: 'Undo',
        onPress: () => {
          if (wasNone.length) setStatusesRef.current(wasNone, 'none');
          if (wasIso.length) setStatusesRef.current(wasIso, 'wanted');
        },
      },
    });
  };
  const addSelectedToIso = () => {
    const ids = pinsToAddToIso(selectedIds, id => userCollection[id]?.status);
    selection.stop();
    if (ids.length === 0) {
      toast.show({ message: 'Those pins are already on your ISO' });
      return;
    }
    setStatuses(ids, 'wanted');
    toast.show({
      message: `Added ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'} to your ISO`,
      action: { label: 'Undo', onPress: () => setStatusesRef.current(ids, 'none') },
    });
  };

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
        <IconButton icon="chevron-left" accessibilityLabel="Back" variant="tinted" onPress={() => router.back()} style={{ top: topInset + 10 }} />
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
          <IconButton icon="chevron-left" accessibilityLabel="Back" variant="tinted" onPress={() => router.back()} />
          {!loading && isComplete && (
            <View style={[styles.completeBadge, { backgroundColor: colors.owned + '1E' }]}>
              <Feather name="award" size={13} color={colors.owned} />
              <Text style={[styles.completeBadgeLabel, { color: colors.owned }]}>Complete!</Text>
            </View>
          )}
          {!loading && missingIds.length > 0 && (
            <Button
              variant="secondary"
              size="compact"
              fullWidth={false}
              label={selection.active ? 'Cancel' : 'Select'}
              accessibilityLabel={selection.active ? 'Cancel selecting' : 'Select pins'}
              onPress={selection.active ? selection.stop : selection.start}
              style={styles.selectBtn}
            />
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
        {selection.active && (
          <View style={styles.selectRow}>
            <Text style={[styles.selectCount, { color: colors.homeInk }]}>
              {selectedIds.length === 0 ? 'Tap the pins you have' : `${selectedIds.length} selected`}
            </Text>
            <Button
              variant="text"
              label={selection.allSelected(missingIds) ? 'Clear' : 'Select all missing'}
              onPress={() => selection.toggleAll(missingIds)}
            />
          </View>
        )}
      </View>

      {/* ── Pin grid ── */}
      {loading ? (
        <SkeletonGrid label="Loading pins in this set" style={styles.skeletonGrid} />
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
        <PinGrid
          data={displayPins}
          keyExtractor={p => p.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.grid, { paddingBottom: botPad + (showFooter || selection.active ? FOOTER_SPACE : 0) }]}
          extraData={selection.selected}
          renderTile={(item, size) => {
            const isOwned = ownedIds.has(item.id);
            const entry = getEntry(item.id);
            return (
              <CompactPinTile
                pin={item}
                owned={isOwned}
                status={entry?.status}
                copies={isOwned ? entry?.quantity : undefined}
                size={size}
                // In select mode only missing pins can be ticked; owned ones stay put.
                selected={selection.active && !isOwned ? selection.has(item.id) : undefined}
                onPress={() => {
                  if (!selection.active) router.push({ pathname: '/pin/[id]', params: { id: item.id } });
                  else if (!isOwned) selection.toggle(item.id);
                }}
                onQuickAdd={!isOwned && !selection.active ? () => setQuickAddPin(item) : undefined}
                onLongPress={selection.active ? undefined : () => pinActions.open(item)}
                {...(selection.active ? {} : pinActions.a11y(item))}
              />
            );
          }}
        />
      )}

      {showFooter && (
        <View style={[styles.footer, { backgroundColor: colors.homeSurface, borderTopColor: colors.homeLine, paddingBottom: botPad }]}>
          <Button
            label={`Find the ${missingIds.length} missing`}
            subtitle={available != null && !tradersLoading
              ? (available > 0 ? `${available} available from collectors` : 'None for trade yet')
              : undefined}
            onPress={() => router.push({ pathname: '/set-traders/[collection]', params: { collection: collectionParam } })}
          />
          {toIsoCount > 0 && (
            <Button variant="text" fullWidth label="Add missing to ISO" onPress={() => addMissingToIso(missingIds)} />
          )}
        </View>
      )}

      {selection.active && (
        <View style={[styles.footer, { backgroundColor: colors.homeSurface, borderTopColor: colors.homeLine, paddingBottom: botPad }]}>
          <Button
            label={selectedIds.length === 0 ? 'Mark as Owned' : `Mark ${selectedIds.length} as Owned`}
            disabled={selectedIds.length === 0}
            onPress={markSelectedOwned}
          />
          <Button variant="text" fullWidth label="Add to ISO" disabled={selectedIds.length === 0} onPress={addSelectedToIso} />
        </View>
      )}

      <QuickAddSheet pin={quickAddPin} onClose={() => setQuickAddPin(null)} seaGlass />
      {pinActions.sheet}
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
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  selectBtn: { marginLeft: 'auto' },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  selectCount: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
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
  // Loading placeholder sits where the grid's first row will.
  skeletonGrid: { paddingTop: spacing.lg },
  // Missing-pins footer
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 2 },
});
