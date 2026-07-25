/**
 * Discover screen — the primary entry point of PinHunt.
 *
 * Layout (top → bottom):
 *   1. Search bar (with inline results)
 *   2. Scan a Pin — compact CTA
 *   3. New to the Catalogue — horizontal strip of new releases
 *   4. Browse by Brand — colourful 2-column grid cards
 *   5. Browse by Collection — horizontal pill strip
 *   6. Recently Viewed — horizontal strip (shown only when populated)
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
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { getPinImageSource } from '@/utils/pinImage';
import { SectionHeader } from '@/components/SectionHeader';
import { SearchBar } from '@/components/SearchBar';
import type { CataloguePin } from '@workspace/pin-repository';

// ─── Brand definitions ────────────────────────────────────────────────────────

const BRAND_CARDS = [
  {
    key: 'Disney Parks',
    label: 'Disney Parks',
    subtitle: 'Official park exclusives',
    gradientStart: '#1B4FA8',
    gradientEnd: '#0D2D6E',
    icon: 'star' as const,
  },
  {
    key: 'Loungefly',
    label: 'Loungefly',
    subtitle: 'Fashion-forward designs',
    gradientStart: '#C0457A',
    gradientEnd: '#7A1A4A',
    icon: 'heart' as const,
  },
  {
    key: 'BoxLunch',
    label: 'BoxLunch',
    subtitle: 'Pop-culture favourites',
    gradientStart: '#1A8A50',
    gradientEnd: '#0D5530',
    icon: 'gift' as const,
  },
] as const;

// ─── Colourful brand grid card ────────────────────────────────────────────────

function BrandCard({
  brand,
  count,
  onPress,
}: {
  brand: (typeof BRAND_CARDS)[number];
  count: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={styles.brandCard}>
      <LinearGradient
        colors={[brand.gradientStart, brand.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.brandGradient}
      >
        {/* Decorative large icon in corner */}
        <View style={styles.brandIconDecor} pointerEvents="none">
          <Feather name={brand.icon} size={64} color="rgba(255,255,255,0.12)" />
        </View>

        <View style={styles.brandContent}>
          <View style={[styles.brandIconBadge, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Feather name={brand.icon} size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.brandLabel}>{brand.label}</Text>
          <Text style={styles.brandSubtitle}>{brand.subtitle}</Text>
          {count > 0 && (
            <Text style={styles.brandCount}>{count} pin{count !== 1 ? 's' : ''}</Text>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

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

// ─── New-release card ─────────────────────────────────────────────────────────

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

// ─── Collection pill ──────────────────────────────────────────────────────────

function CollectionPill({
  name,
  count,
  onPress,
}: {
  name: string;
  count: number;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.collectionPill,
        {
          backgroundColor: colors.secondary,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <Text style={[styles.collectionPillName, { color: colors.foreground }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.collectionPillCount, { color: colors.mutedForeground }]}>{count}</Text>
    </TouchableOpacity>
  );
}

// ─── Inline search results panel ─────────────────────────────────────────────

function SearchResults({
  query,
  pins,
  onPinPress,
}: {
  query: string;
  pins: CataloguePin[];
  onPinPress: (id: string) => void;
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
          <TouchableOpacity onPress={() => onPinPress('__catalogue')} activeOpacity={0.7}>
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

  // Count pins per brand
  const brandCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const pin of pins) {
      map.set(pin.brand, (map.get(pin.brand) ?? 0) + 1);
    }
    return map;
  }, [pins]);

  // Derive unique collections with counts (top 12)
  const collections = useMemo(() => {
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 12, paddingBottom: botPad }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Search ── */}
        <View style={styles.searchWrap}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search pins, characters, sets…"
          />
          <SearchResults query={searchQuery} pins={pins} onPinPress={handlePinResult} />
        </View>

        {/* ── Compact Scan CTA ── */}
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
          <View style={[styles.scanCtaIconBg, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Feather name="camera" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.scanCtaLabel}>Scan a Pin</Text>
          <Text style={[styles.scanCtaDot, { color: 'rgba(255,255,255,0.5)' }]}>·</Text>
          <Text style={styles.scanCtaSub}>AI-powered identification</Text>
          <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* ── New to the Catalogue ── */}
        {newReleases.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="New to the Catalogue"
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
                  onPress={() => router.push({ pathname: '/pin/[id]', params: { id: item.id } })}
                />
              )}
            />
          </View>
        )}

        {/* ── Browse by Brand ── */}
        <View style={styles.section}>
          <SectionHeader
            title="Browse by Brand"
            actionLabel="Full Catalogue"
            onAction={() => router.push('/catalogue')}
          />
          <View style={styles.brandGrid}>
            {BRAND_CARDS.map(brand => (
              <BrandCard
                key={brand.key}
                brand={brand}
                count={brandCounts.get(brand.key) ?? 0}
                onPress={() => router.push('/catalogue')}
              />
            ))}
          </View>
        </View>

        {/* ── Browse by Collection ── */}
        {collections.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Browse by Collection"
              actionLabel={`${collections.length} sets`}
              onAction={() => router.push('/catalogue')}
            />
            <FlatList
              data={collections}
              keyExtractor={c => c.name}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              renderItem={({ item }) => (
                <CollectionPill
                  name={item.name}
                  count={item.count}
                  onPress={() => router.push('/catalogue')}
                />
              )}
            />
          </View>
        )}

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
                  onPress={() => router.push({ pathname: '/pin/[id]', params: { id: item.id } })}
                />
              )}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Search
  searchWrap: {
    marginBottom: 12,
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

  // Compact scan CTA
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 28,
  },
  scanCtaIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCtaLabel: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  scanCtaDot: {
    fontSize: 14,
  },
  scanCtaSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.8)',
  },

  // Sections
  section: { marginBottom: 28 },
  hList: { paddingHorizontal: 16, gap: 12 },

  // Brand grid — two columns
  brandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  brandCard: {
    // Each card takes ~half the row minus gap
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 130,
  },
  brandGradient: {
    flex: 1,
    padding: 16,
    minHeight: 130,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  brandIconDecor: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  brandContent: { gap: 4 },
  brandIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  brandLabel: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  brandSubtitle: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.75)',
  },
  brandCount: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },

  // Collection pills
  collectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    gap: 8,
    borderWidth: 1,
  },
  collectionPillName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', maxWidth: 180 },
  collectionPillCount: { fontSize: 11, fontFamily: 'Inter_400Regular' },

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
});
