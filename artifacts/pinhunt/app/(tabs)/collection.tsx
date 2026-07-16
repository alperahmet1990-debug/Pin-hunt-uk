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
import { PINS } from '@/mock-data/pins';
import { PinCard } from '@/components/PinCard';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import type { CollectionStatus } from '@/types/pin';

type Section = 'owned' | 'wanted' | 'for_trade';
type ViewMode = 'grid' | 'list';

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'owned', label: 'Owned' },
  { key: 'wanted', label: 'Wanted' },
  { key: 'for_trade', label: 'For Trade' },
];

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { collection, counts } = useCollection();

  const [section, setSection] = useState<Section>('owned');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  const filtered = useMemo(() => {
    const pinIds = Object.values(collection)
      .filter(e => e.status === section)
      .map(e => e.pinId);
    const pins = pinIds
      .map(id => PINS.find(p => p.id === id))
      .filter((p): p is (typeof PINS)[0] => p !== undefined);

    if (!query) return pins;
    const q = query.toLowerCase();
    return pins.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        p.collection.toLowerCase().includes(q) ||
        p.characters.some(c => c.toLowerCase().includes(q)),
    );
  }, [collection, section, query]);

  const estimatedValue = useMemo(() => {
    const owned = Object.values(collection)
      .filter(e => e.status === 'owned')
      .map(e => PINS.find(p => p.id === e.pinId))
      .filter(Boolean);
    return owned.reduce((sum, p) => sum + (p?.estimatedValueGBP ?? 0), 0);
  }, [collection]);

  const sectionCount = (s: Section) =>
    s === 'owned' ? counts.owned : s === 'wanted' ? counts.wanted : counts.forTrade;

  const activeColor = (s: Section) =>
    s === 'owned' ? colors.owned : s === 'wanted' ? colors.wanted : colors.forTrade;

  const emptyMessages: Record<Section, { title: string; subtitle: string }> = {
    owned: { title: 'No pins owned yet', subtitle: 'Mark pins as Owned from the Catalogue or Scan tabs.' },
    wanted: { title: 'Wish list is empty', subtitle: 'Mark pins as Wanted to build your wish list.' },
    for_trade: { title: 'Nothing up for trade', subtitle: "Mark pins as For Trade to let others know you're open to swaps." },
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.headerBar,
          { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Collection</Text>
          <TouchableOpacity
            onPress={() => setViewMode(v => (v === 'grid' ? 'list' : 'grid'))}
            style={[styles.toggleBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}
            activeOpacity={0.75}
          >
            <Feather name={viewMode === 'grid' ? 'list' : 'grid'} size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Summary row */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.owned }]}>{counts.owned}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Owned</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.wanted }]}>{counts.wanted}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Wanted</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.forTrade }]}>{counts.forTrade}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>For Trade</Text>
          </View>
          <View style={[styles.valueDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.gold }]}>£{estimatedValue}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Est. Value*</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          {SECTIONS.map(s => {
            const isActive = s.key === section;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSection(s.key)}
                style={[
                  styles.tab,
                  isActive && { borderBottomColor: activeColor(s.key), borderBottomWidth: 2 },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? activeColor(s.key) : colors.mutedForeground },
                  ]}
                >
                  {s.label}
                </Text>
                <View
                  style={[
                    styles.tabBadge,
                    { backgroundColor: isActive ? activeColor(s.key) : colors.secondary },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeLabel,
                      { color: isActive ? '#fff' : colors.mutedForeground },
                    ]}
                  >
                    {sectionCount(s.key)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ paddingBottom: 8 }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search this section…" />
        </View>
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon={section === 'owned' ? 'heart' : section === 'wanted' ? 'bookmark' : 'repeat'}
          title={emptyMessages[section].title}
          subtitle={emptyMessages[section].subtitle}
          actionLabel="Browse Catalogue"
          onAction={() => router.push('/(tabs)/catalogue')}
        />
      ) : (
        <FlatList
          key={viewMode}
          data={filtered}
          keyExtractor={p => p.id}
          numColumns={viewMode === 'grid' ? 2 : 1}
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
            />
          )}
        />
      )}

      {/* Estimated value disclaimer */}
      <View style={[styles.disclaimer, { backgroundColor: colors.muted, borderTopColor: colors.border }]}>
        <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
          * Estimated values are sample data only and do not reflect real market prices.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  toggleBtn: { padding: 8 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 4,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  valueDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  tabBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeLabel: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  listContent: { paddingTop: 12 },
  gridPadding: { paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'space-between' },
  disclaimer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  disclaimerText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
});
