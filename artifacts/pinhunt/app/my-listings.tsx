/**
 * My Listings — manage the current user's external marketplace listings.
 * Sellers can mark listings as sold or remove them entirely.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { PLATFORM_CONFIG, CURRENCY_SYMBOLS } from '@/utils/marketplaceUrl';
import { radius, spacing } from '@/constants/theme';
import type { ExternalSaleListing, ExternalSaleListingStatus } from '@workspace/pin-repository';

const STATUS_LABEL: Record<ExternalSaleListingStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  sold: 'Sold',
  expired: 'Expired',
  removed: 'Removed',
};

function statusColor(status: ExternalSaleListingStatus, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case 'active': return colors.owned;
    case 'draft': return colors.forTrade;
    case 'sold': return colors.homeMuted;
    case 'expired': return colors.homeMuted;
    case 'removed': return colors.destructive;
  }
}

export default function MyListingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { repo, userId } = useMarketplace();

  const [listings, setListings] = useState<ExternalSaleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!repo || !userId) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const data = await repo.getSellerExternalListings(userId);
      setListings(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load listings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, userId]);

  useEffect(() => { load(); }, [load]);

  const handleMarkSold = (listing: ExternalSaleListing) => {
    Alert.alert(
      'Mark as Sold',
      `Mark "${listing.pinTitle ?? 'this pin'}" as sold on ${PLATFORM_CONFIG[listing.platform].label}? It will be hidden from public searches.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Sold',
          onPress: async () => {
            try {
              await repo?.markExternalListingSold(listing.id);
              load();
            } catch {
              Alert.alert('Error', 'Could not update listing. Try again.');
            }
          },
        },
      ],
    );
  };

  const handleRemove = (listing: ExternalSaleListing) => {
    Alert.alert(
      'Remove Listing',
      'This will permanently delete the listing from PinHunt. The marketplace listing is not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await repo?.removeExternalSaleListing(listing.id);
              load();
            } catch {
              Alert.alert('Error', 'Could not remove listing. Try again.');
            }
          },
        },
      ],
    );
  };

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  return (
    <>
      <Stack.Screen options={{ title: 'My Listings' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.homeBackground }]}
        contentContainerStyle={{ paddingBottom: botPad, paddingTop: spacing.lg, paddingHorizontal: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.homeCoral} />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
              <Text style={{ color: colors.homeCoral, fontFamily: 'Inter_500Medium' }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : listings.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="shopping-bag" size={40} color={colors.homeMuted} />
            <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>No listings yet</Text>
            <Text style={[styles.emptySub, { color: colors.homeMuted }]}>
              Open a pin in your collection and tap "List for Sale" to get started.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.countLabel, { color: colors.homeMuted }]}>
              {listings.length} listing{listings.length !== 1 ? 's' : ''}
            </Text>
            {listings.map(listing => {
              const pcfg = PLATFORM_CONFIG[listing.platform];
              const sColor = statusColor(listing.status, colors);
              const isActive = listing.status === 'active';

              return (
                <View
                  key={listing.id}
                  style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
                >
                  {/* Top row: platform + status */}
                  <View style={styles.cardHeader}>
                    <View style={[styles.platformBadge, { backgroundColor: pcfg.color + '18' }]}>
                      <Feather name={pcfg.icon as keyof typeof Feather.glyphMap} size={13} color={pcfg.color} />
                      <Text style={[styles.platformBadgeLabel, { color: pcfg.color }]}>{pcfg.label}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sColor + '18' }]}>
                      <Text style={[styles.statusLabel, { color: sColor }]}>
                        {STATUS_LABEL[listing.status]}
                      </Text>
                    </View>
                  </View>

                  {/* Pin title */}
                  <Text style={[styles.pinTitle, { color: colors.homeInk }]} numberOfLines={2}>
                    {listing.pinTitle ?? listing.pinPinhuntId ?? 'Unknown Pin'}
                  </Text>

                  {/* Price */}
                  {listing.askingPrice != null && (
                    <Text style={[styles.price, { color: colors.homeCoral }]}>
                      {CURRENCY_SYMBOLS[(listing.currency as keyof typeof CURRENCY_SYMBOLS) ?? 'GBP'] ?? listing.currency}{' '}
                      {listing.askingPrice.toFixed(2)}
                    </Text>
                  )}

                  {/* URL */}
                  <TouchableOpacity
                    onPress={() => Linking.openURL(listing.listingUrl)}
                    style={styles.urlRow}
                    activeOpacity={0.7}
                  >
                    <Feather name="external-link" size={12} color={colors.homeCoral} />
                    <Text style={[styles.urlText, { color: colors.homeCoral }]} numberOfLines={1}>
                      {listing.listingUrl.replace(/^https?:\/\/(www\.)?/, '')}
                    </Text>
                  </TouchableOpacity>

                  {/* Actions */}
                  <View style={[styles.cardActions, { borderTopColor: colors.homeLine }]}>
                    {isActive && (
                      <TouchableOpacity
                        onPress={() => handleMarkSold(listing)}
                        activeOpacity={0.8}
                        style={[styles.actionBtn, { borderColor: colors.homeLine }]}
                      >
                        <Feather name="check-circle" size={14} color={colors.owned} />
                        <Text style={[styles.actionLabel, { color: colors.owned }]}>Mark Sold</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => handleRemove(listing)}
                      activeOpacity={0.8}
                      style={[styles.actionBtn, { borderColor: colors.homeLine }]}
                    >
                      <Feather name="trash-2" size={14} color={colors.destructive} />
                      <Text style={[styles.actionLabel, { color: colors.destructive }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  retryBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  countLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: spacing.md },
  card: {
    borderWidth: 1,
    padding: spacing.lg - 2,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  platformBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm - 4 },
  platformBadgeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm - 4 },
  statusLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  pinTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  price: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  urlText: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm + 2,
    gap: spacing.sm + 2,
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  actionLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
