/**
 * Discover screen — the primary entry point of PinHunt.
 *
 * Layout (top → bottom):
 *   1. Scan a Pin — large primary CTA
 *   2. Search the catalogue — inline search with live results
 *   3. Recently Viewed — horizontal strip
 *   4. Official Sets — horizontal strip (browse by collection)
 *   5. Recently Added — horizontal strip (new releases)
 */
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  ScrollView,
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
import { getPinImageSource } from '@/utils/pinImage';
import { SectionHeader } from '@/components/SectionHeader';
import { SearchBar } from '@/components/SearchBar';
import { PinCard } from '@/components/PinCard';
import type { CataloguePin } from '@workspace/pin-repository';

// ─── Small horizontally-scrolling pin card ────────────────────────────────────

function SmallPinCard({ pin, onPress }: { pin: CataloguePin; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.smallCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <Image source={getPinImageSource(pin)} style={styles.smallImage} />
      <View style={styles.smallInfo}>
        <Text style={[styles.smallTitle, { color: colors.foreground }]} numberOfLines={2}>
          {pin.title}
        </Text>
        <Text style={[styles.smallBrand, { color: colors.mutedForeground }]} numberOfLines={1}>
          {pin.brand}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── New-release card (slightly wider) ────────────────────────────────────────

function NewReleaseCard({ pin, onPress }: { pin: CataloguePin; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.newCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <Image source={getPinImageSource(pin)} style={styles.newImage} />
      <View style={styles.newInfo}>
        <Text style={[styles.newTitle, { color: colors.foreground }]} numberOfLines={2}>
          {pin.title}
        </Text>
        <Text style={[styles.newBrand, { color: colors.mutedForeground }]}>{pin.brand}</Text>
        <Text style={[styles.newPrice, { color: colors.gold }]}>
          Est. £{pin.estimatedValueGBP ?? '—'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Official-set pill ────────────────────────────────────────────────────────

function SetPill({ name, count, onPress }: { name: string; count: number; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.setPill,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <Feather name="layers" size={16} color={colors.primary} />
      <Text style={[styles.setPillName, { color: colors.foreground }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.setPillCount, { color: colors.mutedForeground }]}>{count}</Text>
    </TouchableOpacity>
  );
}

// ─── Inline search results panel ─────────────────────────────────────────────

function SearchResults({
  query,
  pins,
  onPinPress,
  onClear,
}: {
  query: string;
  pins: CataloguePin[];
  onPinPress: (id: string) => void;
  onClear: () => void;
}) {
  const colors = useColors();
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return pins
      .filter(
        p =>
          p.title.toLowerCase().includes(q) ||
          p.characters.some(c => c.toLowerCase().includes(q)) ||
          p.collection.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [query, pins]);

  if (!query.trim()) return null;

  return (
    <View
      style={[
        styles.searchResults,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={styles.searchResultsHeader}>
        <Text style={[styles.searchResultsCount, { color: colors.mutedForeground }]}>
          {results.length === 0
            ? 'No pins found'
            : `${results.length} result${results.length !== 1 ? 's' : ''}`}
        </Text>
        {results.length > 0 && (
          <TouchableOpacity
            onPress={() => onPinPress('__catalogue')}
            activeOpacity={0.7}
          >
            <Text style={[styles.searchResultsViewAll, { color: colors.primary }]}>
              View all in Catalogue
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {results.map(pin => (
        <TouchableOpacity
          key={pin.id}
          onPress={() => onPinPress(pin.id)}
          activeOpacity={0.8}
          style={[styles.searchResultRow, { borderTopColor: colors.border }]}
        >
          <Image source={getPinImageSource(pin)} style={styles.searchResultImage} />
          <View style={styles.searchResultInfo}>
            <Text style={[styles.searchResultTitle, { color: colors.foreground }]} numberOfLines={1}>
              {pin.title}
            </Text>
            <Text style={[styles.searchResultMeta, { color: colors.mutedForeground }]}>
              {pin.brand} · {pin.collection}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      ))}
      {results.length === 0 && (
        <View style={styles.noResultsRow}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <Text style={[styles.noResultsText, { color: colors.mutedForeground }]}>
            Try different keywords or browse the full catalogue
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { recentlyViewed } = useCollection();
  const { pins, newReleases } = usePinCatalogue();

  const [searchQuery, setSearchQuery] = useState('');

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  // Derive recently-viewed CataloguePin objects
  const recentPins = useMemo(
    () =>
      recentlyViewed
        .map(id => pins.find(p => p.id === id))
        .filter((p): p is CataloguePin => p !== undefined)
        .slice(0, 10),
    [recentlyViewed, pins],
  );

  // Derive unique official sets with pin counts
  const officialSets = useMemo(() => {
    const map = new Map<string, number>();
    for (const pin of pins) {
      if (pin.collection) {
        map.set(pin.collection, (map.get(pin.collection) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));
  }, [pins]);

  const handlePinResult = (id: string) => {
    if (id === '__catalogue') {
      router.push('/catalogue');
      return;
    }
    router.push({ pathname: '/pin/[id]', params: { id } });
    setSearchQuery('');
  };

  const handleBrowseSet = (setName: string) => {
    // Navigate to catalogue pre-filtered to this set
    // (Catalogue screen currently filters by brand; sets/collections map similarly)
    router.push('/catalogue');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Page title ── */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>Discover</Text>
          <Text style={[styles.pageSubtitle, { color: colors.mutedForeground }]}>
            Scan, search, and explore Disney pins
          </Text>
        </View>

        {/* ── Primary CTA: Scan a Pin ── */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/scan')}
          activeOpacity={0.88}
          style={[
            styles.scanCta,
            {
              backgroundColor: colors.primary,
              borderRadius: colors.radius,
              marginHorizontal: 16,
            },
          ]}
        >
          <View style={styles.scanCtaIconWrap}>
            <View style={[styles.scanCtaIconBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Feather name="camera" size={28} color={colors.primaryForeground} />
            </View>
          </View>
          <View style={styles.scanCtaText}>
            <Text style={[styles.scanCtaTitle, { color: colors.primaryForeground }]}>
              Scan a Pin
            </Text>
            <Text style={[styles.scanCtaSubtitle, { color: colors.primaryForeground + 'cc' }]}>
              AI-powered identification
            </Text>
          </View>
          <Feather name="chevron-right" size={22} color={colors.primaryForeground + 'bb'} />
        </TouchableOpacity>

        {/* ── Search ── */}
        <View style={styles.searchWrap}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search pins, characters, sets…"
          />
          <SearchResults
            query={searchQuery}
            pins={pins}
            onPinPress={handlePinResult}
            onClear={() => setSearchQuery('')}
          />
        </View>

        {/* ── Recently Viewed ── */}
        {recentPins.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Recently Viewed"
              actionLabel="See All"
              onAction={() => router.push('/(tabs)/collection')}
            />
            <FlatList
              data={recentPins}
              keyExtractor={p => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              renderItem={({ item }) => (
                <SmallPinCard
                  pin={item}
                  onPress={() =>
                    router.push({ pathname: '/pin/[id]', params: { id: item.id } })
                  }
                />
              )}
            />
          </View>
        )}

        {/* ── Official Sets ── */}
        {officialSets.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Official Sets"
              actionLabel={`${officialSets.length} sets`}
              onAction={() => router.push('/catalogue')}
            />
            <FlatList
              data={officialSets}
              keyExtractor={s => s.name}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              renderItem={({ item }) => (
                <SetPill
                  name={item.name}
                  count={item.count}
                  onPress={() => handleBrowseSet(item.name)}
                />
              )}
            />
          </View>
        )}

        {/* ── Recently Added ── */}
        {newReleases.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Recently Added"
              actionLabel="See All"
              onAction={() => router.push('/catalogue')}
            />
            <FlatList
              data={newReleases}
              keyExtractor={p => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              renderItem={({ item }) => (
                <NewReleaseCard
                  pin={item}
                  onPress={() =>
                    router.push({ pathname: '/pin/[id]', params: { id: item.id } })
                  }
                />
              )}
            />
          </View>
        )}

        {/* ── Browse full catalogue banner ── */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => router.push('/catalogue')}
            activeOpacity={0.85}
            style={[
              styles.catalogueBanner,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
                marginHorizontal: 16,
              },
            ]}
          >
            <View style={[styles.catalogueBannerIcon, { backgroundColor: colors.secondary, borderRadius: 10 }]}>
              <Feather name="grid" size={22} color={colors.primary} />
            </View>
            <View style={styles.catalogueBannerText}>
              <Text style={[styles.catalogueBannerTitle, { color: colors.foreground }]}>
                Full Pin Catalogue
              </Text>
              <Text style={[styles.catalogueBannerSub, { color: colors.mutedForeground }]}>
                {pins.length} pins · Disney Parks, Loungefly, BoxLunch
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  pageHeader: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },

  // Scan CTA
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    marginBottom: 20,
    gap: 14,
  },
  scanCtaIconWrap: {},
  scanCtaIconBg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCtaText: { flex: 1 },
  scanCtaTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  scanCtaSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },

  // Search
  searchWrap: {
    marginHorizontal: 0,
    marginBottom: 8,
    position: 'relative',
    zIndex: 10,
  },
  searchResults: {
    marginHorizontal: 16,
    marginTop: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchResultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchResultsCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  searchResultsViewAll: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  searchResultImage: { width: 44, height: 44, borderRadius: 6, resizeMode: 'cover' },
  searchResultInfo: { flex: 1 },
  searchResultTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  searchResultMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  noResultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  noResultsText: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },

  // Sections
  section: { marginBottom: 24 },
  hList: { paddingHorizontal: 16, gap: 12 },

  // Small recently-viewed card
  smallCard: {
    width: 120,
    overflow: 'hidden',
    borderWidth: 1,
  },
  smallImage: { width: 120, height: 100, resizeMode: 'cover' },
  smallInfo: { padding: 8, gap: 2 },
  smallTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', lineHeight: 14 },
  smallBrand: { fontSize: 10, fontFamily: 'Inter_400Regular' },

  // New-release card
  newCard: {
    width: 160,
    overflow: 'hidden',
    borderWidth: 1,
  },
  newImage: { width: 160, height: 130, resizeMode: 'cover' },
  newInfo: { padding: 10, gap: 4 },
  newTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 17 },
  newBrand: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  newPrice: { fontSize: 13, fontFamily: 'Inter_700Bold' },

  // Set pill
  setPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
    borderWidth: 1,
    minWidth: 120,
    maxWidth: 200,
  },
  setPillName: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  setPillCount: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  // Catalogue banner
  catalogueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    gap: 14,
  },
  catalogueBannerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  catalogueBannerText: { flex: 1 },
  catalogueBannerTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  catalogueBannerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
