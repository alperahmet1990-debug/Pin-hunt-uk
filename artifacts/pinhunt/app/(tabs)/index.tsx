import React from 'react';
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
import { MOCK_USER } from '@/mock-data/user';
import { SectionHeader } from '@/components/SectionHeader';
import { SearchBar } from '@/components/SearchBar';
import { CollectionBadge } from '@/components/CollectionBadge';
import type { CataloguePin } from '@workspace/pin-repository';

function SmallPinCard({ pinId, onPress }: { pinId: string; onPress: () => void }) {
  const colors = useColors();
  const { getEntry } = useCollection();
  const { pins } = usePinCatalogue();
  const pin = pins.find(p => p.id === pinId);
  if (!pin) return null;
  const entry = getEntry(pin.id);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.smallCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      <Image source={getPinImageSource(pin)} style={styles.smallImage} />
      <View style={styles.smallInfo}>
        <Text style={[styles.smallTitle, { color: colors.foreground }]} numberOfLines={2}>{pin.title}</Text>
        {entry && <CollectionBadge status={entry.status} size="sm" />}
      </View>
    </TouchableOpacity>
  );
}

function NewReleaseCard({ pin, onPress }: { pin: CataloguePin; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.newCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      <Image source={getPinImageSource(pin)} style={styles.newImage} />
      <View style={styles.newInfo}>
        <Text style={[styles.newTitle, { color: colors.foreground }]} numberOfLines={2}>{pin.title}</Text>
        <Text style={[styles.newBrand, { color: colors.mutedForeground }]}>{pin.brand}</Text>
        <Text style={[styles.newPrice, { color: colors.gold }]}>Est. £{pin.estimatedValueGBP ?? '—'}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { counts, recentlyViewed } = useCollection();
  const { pins, newReleases } = usePinCatalogue();

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Welcome back,</Text>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{MOCK_USER.displayName}</Text>
          </View>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
            <Feather name="user" size={20} color="#fff" />
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <SearchBar
            value=""
            onChangeText={() => {}}
            editable={false}
            onPress={() => router.push('/(tabs)/catalogue')}
          />
        </View>

        {/* Collection Summary */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, marginHorizontal: 16 }]}>
          <Text style={[styles.summaryTitle, { color: colors.foreground }]}>My Collection</Text>
          {/* pins.length available for catalogue size display */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: colors.owned }]}>{counts.owned}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Owned</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: colors.wanted }]}>{counts.wanted}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>ISO</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: colors.forTrade }]}>{counts.forTrade}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>For Trade</Text>
            </View>
          </View>
        </View>

        {/* Recently Viewed */}
        {recentlyViewed.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Recently Viewed"
              actionLabel="See All"
              onAction={() => router.push('/(tabs)/collection')}
            />
            <FlatList
              data={recentlyViewed}
              keyExtractor={id => id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              renderItem={({ item }) => (
                <SmallPinCard
                  pinId={item}
                  onPress={() => router.push({ pathname: '/pin/[id]', params: { id: item } })}
                />
              )}
            />
          </View>
        )}

        {/* New Releases */}
        <View style={styles.section}>
          <SectionHeader
            title="New Releases"
            actionLabel="See All"
            onAction={() => router.push('/(tabs)/catalogue')}
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

        {/* All Pins teaser */}
        <View style={styles.section}>
          <SectionHeader
            title="Browse Catalogue"
            actionLabel={`${pins.length} Pins`}
            onAction={() => router.push('/(tabs)/catalogue')}
          />
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/catalogue')}
            activeOpacity={0.85}
            style={[styles.catalogueBanner, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, marginHorizontal: 16 }]}
          >
            <Feather name="grid" size={28} color={colors.primary} />
            <View style={styles.catalogueBannerText}>
              <Text style={[styles.catalogueBannerTitle, { color: colors.foreground }]}>Full Pin Catalogue</Text>
              <Text style={[styles.catalogueBannerSub, { color: colors.mutedForeground }]}>Disney Parks · Loungefly · BoxLunch</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  greeting: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  displayName: { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 2 },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: { marginBottom: 16 },
  summaryCard: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryCount: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 40,
  },
  section: { marginBottom: 24 },
  hList: { paddingHorizontal: 16, gap: 12 },
  // Small recently-viewed card
  smallCard: {
    width: 120,
    overflow: 'hidden',
    borderWidth: 1,
  },
  smallImage: {
    width: 120,
    height: 100,
    resizeMode: 'cover',
  },
  smallInfo: {
    padding: 8,
    gap: 4,
  },
  smallTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 14,
  },
  // New release card
  newCard: {
    width: 160,
    overflow: 'hidden',
    borderWidth: 1,
  },
  newImage: {
    width: 160,
    height: 130,
    resizeMode: 'cover',
  },
  newInfo: { padding: 10, gap: 4 },
  newTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 17,
  },
  newBrand: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  newPrice: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  // Catalogue banner
  catalogueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  catalogueBannerText: { flex: 1 },
  catalogueBannerTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  catalogueBannerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
