import React, { useMemo, useState } from 'react';
import {
  FlatList,
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
import { FilterBar, StatusFilter } from '@/components/FilterBar';
import { EmptyState } from '@/components/EmptyState';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import type { Brand } from '@/types/pin';
import type { CataloguePin } from '@workspace/pin-repository';

type ViewMode = 'grid' | 'list';

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

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

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
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.headerBar,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Catalogue</Text>
          <TouchableOpacity
            onPress={() => setViewMode(v => (v === 'grid' ? 'list' : 'grid'))}
            style={[styles.toggleBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}
            activeOpacity={0.75}
          >
            <Feather name={viewMode === 'grid' ? 'list' : 'grid'} size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={styles.searchWrap}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search pins, characters…" />
        </View>
        <FilterBar
          selectedBrand={brand}
          onBrandChange={setBrand}
          selectedStatus={status}
          onStatusChange={setStatus}
        />
      </View>

      {/* Results count */}
      <View style={[styles.countRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.countText, { color: colors.mutedForeground }]}>
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
              onPress={() =>
                router.push({ pathname: '/pin/[id]', params: { id: item.id } })
              }
              onQuickAdd={() => setQuickAddPin(item)}
            />
          )}
        />
      )}

      <QuickAddSheet pin={quickAddPin} onClose={() => setQuickAddPin(null)} />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  toggleBtn: {
    padding: 8,
  },
  searchWrap: { marginBottom: 4 },
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
});
