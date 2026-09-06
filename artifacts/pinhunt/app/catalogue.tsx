import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { PinCard } from '@/components/PinCard';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { radius, spacing } from '@/constants/theme';
import type { Brand, CollectionStatus } from '@/types/pin';
import type { CataloguePin } from '@workspace/pin-repository';

type ViewMode = 'grid' | 'list';
type StatusFilter = CollectionStatus | 'any';

const BRANDS: Array<Brand | 'All'> = ['All', 'Disney Parks', 'Loungefly', 'BoxLunch'];
const STATUSES: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'any' },
  { label: 'Owned', value: 'owned' },
  { label: 'ISO', value: 'wanted' },
  { label: 'For Trade', value: 'for_trade' },
  { label: 'Not in Collection', value: 'none' },
];
const STATUS_LABEL: Record<StatusFilter, string> = Object.fromEntries(
  STATUSES.map(s => [s.value, s.label]),
) as Record<StatusFilter, string>;

export default function CatalogueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getEntry } = useCollection();

  const { pins } = usePinCatalogue();
  const [query, setQuery] = useState('');
  const [quickAddPin, setQuickAddPin] = useState<CataloguePin | null>(null);
  const [brand, setBrand] = useState<Brand | 'All'>('All');
  const [status, setStatus] = useState<StatusFilter>('any');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  const activeFilters: Array<{ key: string; label: string; onClear(): void }> = [];
  if (brand !== 'All') activeFilters.push({ key: 'brand', label: brand, onClear: () => setBrand('All') });
  if (status !== 'any') activeFilters.push({ key: 'status', label: STATUS_LABEL[status], onClear: () => setStatus('any') });

  const filtered = useMemo(() => {
    return pins.filter(pin => {
      if (query) {
        const q = query.toLowerCase();
        const match =
          pin.title.toLowerCase().includes(q) ||
          pin.characters.some(c => c.toLowerCase().includes(q)) ||
          pin.collection.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (brand !== 'All' && pin.brand !== brand) return false;
      if (status !== 'any') {
        const entry = getEntry(pin.id);
        const pinStatus = entry?.status ?? 'none';
        if (pinStatus !== status) return false;
      }
      return true;
    });
  }, [pins, query, brand, status, getEntry]);

  const numCols = viewMode === 'grid' ? 2 : 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      {/* Header */}
      <View
        style={[
          styles.headerBar,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.homeSurface,
            borderBottomColor: colors.homeLine,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search pins, characters…" />
          </View>
          <TouchableOpacity
            onPress={() => setFiltersOpen(true)}
            style={[styles.filtersBtn, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}
            activeOpacity={0.75}
          >
            <Feather name="sliders" size={16} color={colors.homeInk} />
            {activeFilters.length > 0 && (
              <View style={[styles.filtersBadge, { backgroundColor: colors.homeCoral }]}>
                <Text style={[styles.filtersBadgeText, { color: colors.homeSurface }]}>{activeFilters.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode(v => (v === 'grid' ? 'list' : 'grid'))}
            style={[styles.toggleBtn, { backgroundColor: colors.homeAqua, borderRadius: radius.sm }]}
            activeOpacity={0.75}
          >
            <Feather name={viewMode === 'grid' ? 'list' : 'grid'} size={18} color={colors.homeInk} />
          </TouchableOpacity>
        </View>

        {activeFilters.length > 0 && (
          <View style={styles.activeChipsRow}>
            {activeFilters.map(f => (
              <TouchableOpacity
                key={f.key}
                onPress={f.onClear}
                activeOpacity={0.75}
                style={[styles.activeChip, { backgroundColor: colors.homeCoral + '15', borderColor: colors.homeCoral }]}
              >
                <Text style={[styles.activeChipText, { color: colors.homeCoral }]}>{f.label}</Text>
                <Feather name="x" size={12} color={colors.homeCoral} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Results count */}
      <View style={[styles.countRow, { borderBottomColor: colors.homeLine }]}>
        <Text style={[styles.countText, { color: colors.homeMuted }]}>
          {filtered.length} {filtered.length === 1 ? 'pin' : 'pins'}
        </Text>
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title="No pins found"
          subtitle="Try adjusting your search or filters."
          actionLabel="Clear Filters"
          onAction={() => {
            setQuery('');
            setBrand('All');
            setStatus('any');
          }}
        />
      ) : (
        <FlatList
          key={viewMode}
          data={filtered}
          keyExtractor={p => p.id}
          numColumns={numCols}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: botPad },
            viewMode === 'grid' && styles.gridPadding,
          ]}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          renderItem={({ item }) => (
            <PinCard
              pin={item}
              mode={viewMode}
              seaGlass
              onPress={() =>
                router.push({ pathname: '/pin/[id]', params: { id: item.id } })
              }
              onQuickAdd={() => setQuickAddPin(item)}
            />
          )}
        />
      )}

      <QuickAddSheet pin={quickAddPin} onClose={() => setQuickAddPin(null)} seaGlass />

      {/* Filters sheet — Brand and Collection Status, in one clean place */}
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFiltersOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.filterSheet, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={styles.filterSheetHeader}>
              <Text style={[styles.filterSheetTitle, { color: colors.homeInk }]}>Filters</Text>
              {activeFilters.length > 0 && (
                <TouchableOpacity onPress={() => { setBrand('All'); setStatus('any'); }}>
                  <Text style={[styles.clearText, { color: colors.homeCoral }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.filterSectionTitle, { color: colors.homeMuted }]}>Brand</Text>
            <View style={styles.chipRow}>
              {BRANDS.map(b => {
                const active = brand === b;
                return (
                  <TouchableOpacity
                    key={b}
                    onPress={() => setBrand(b)}
                    style={[styles.chip, { backgroundColor: active ? colors.homeCoral : colors.homeAqua, borderColor: active ? colors.homeCoral : colors.homeLine }]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.homeSurface : colors.homeInk }]}>{b}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.filterSectionTitle, { color: colors.homeMuted, marginTop: spacing.lg }]}>Collection Status</Text>
            <View style={styles.chipRow}>
              {STATUSES.map(s => {
                const active = status === s.value;
                return (
                  <TouchableOpacity
                    key={s.value}
                    onPress={() => setStatus(s.value)}
                    style={[styles.chip, { backgroundColor: active ? colors.homeCoral : colors.homeAqua, borderColor: active ? colors.homeCoral : colors.homeLine }]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.homeSurface : colors.homeInk }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setFiltersOpen(false)}
              activeOpacity={0.85}
              style={[styles.doneBtn, { backgroundColor: colors.homeCoral }]}
            >
              <Text style={[styles.doneBtnText, { color: colors.homeSurface }]}>
                Show {filtered.length} pin{filtered.length === 1 ? '' : 's'}
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
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  filtersBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  filtersBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filtersBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  toggleBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  activeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  activeChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  countRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  listContent: {
    paddingTop: 12,
  },
  gridPadding: {
    paddingHorizontal: 16,
  },
  gridRow: {
    gap: 12,
    justifyContent: 'space-between',
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterSheet: { maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  filterSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  filterSheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  clearText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  filterSectionTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  doneBtn: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  doneBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
