import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useMarketplace } from '@/hooks/useMarketplace';
import { getPinImageSource } from '@/utils/pinImage';
import { PinCard } from '@/components/PinCard';
import { PLATFORM_CONFIG, CURRENCY_SYMBOLS } from '@/utils/marketplaceUrl';
import type { CollectionStatus } from '@/types/pin';
import type { CataloguePin, ExternalSaleListing } from '@workspace/pin-repository';

// ─── Status config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Array<{
  status: CollectionStatus;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}> = [
  { status: 'owned', label: 'Owned', icon: 'check-circle' },
  { status: 'wanted', label: 'ISO', icon: 'bookmark' },
  { status: 'for_trade', label: 'For Trade', icon: 'repeat' },
];

// ─── eBay mock data ───────────────────────────────────────────────────────────

type EbayCountry = 'UK' | 'US' | 'FR';

const COUNTRY_CONFIG: Record<
  EbayCountry,
  { label: string; flag: string; symbol: string; rate: number; siteName: string; searchBase: string }
> = {
  UK: { label: 'UK',     flag: '🇬🇧', symbol: '£', rate: 1.0,  siteName: 'ebay.co.uk', searchBase: 'https://www.ebay.co.uk/sch/i.html?_nkw=' },
  US: { label: 'US',     flag: '🇺🇸', symbol: '$', rate: 1.27, siteName: 'ebay.com',    searchBase: 'https://www.ebay.com/sch/i.html?_nkw=' },
  FR: { label: 'France', flag: '🇫🇷', symbol: '€', rate: 1.17, siteName: 'ebay.fr',     searchBase: 'https://www.ebay.fr/sch/i.html?_nkw=' },
};

const CONDITIONS = ['Brand New', 'Like New', 'Very Good', 'Good', 'Used'] as const;
const SELLER_PARTS_A = ['disney_pins', 'uk_collector', 'pin_trader', 'magic_pins', 'enamel_world', 'pins4you', 'collectpin'];
const SELLER_PARTS_B = ['_uk', '_shop', '_hq', '2024', '_official', '_pins', '88', '_eu'];

function seededHash(seed: string, index: number): number {
  let h = index * 2654435761;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 1664525 + 1013904223) & 0xffffffff;
  }
  return (Math.abs(h) % 100000) / 100000;
}

interface EbayListing {
  id: string;
  title: string;
  price: string;
  priceNum: number;
  condition: string;
  seller: string;
  type: 'auction' | 'buy_it_now';
  bids?: number;
  daysLeft?: number;
  hoursLeft?: number;
}

function generateListings(pin: CataloguePin, country: EbayCountry): EbayListing[] {
  const cfg = COUNTRY_CONFIG[country];
  const seed = pin.id + country;

  return Array.from({ length: 5 }, (_, i): EbayListing => {
    const r = (off: number) => seededHash(seed, i * 11 + off);

    const variance = 0.72 + r(0) * 0.75;
    const rawPrice = (pin.estimatedValueGBP ?? 0) * cfg.rate * variance;
    const priceNum = rawPrice < 10
      ? Math.round(rawPrice * 100) / 100
      : Math.round(rawPrice * 2) / 2;
    const price = priceNum < 10 ? priceNum.toFixed(2) : priceNum.toFixed(2);

    const conditionIndex = Math.floor(r(1) * CONDITIONS.length);
    const sellerA = SELLER_PARTS_A[Math.floor(r(2) * SELLER_PARTS_A.length)];
    const sellerB = SELLER_PARTS_B[Math.floor(r(3) * SELLER_PARTS_B.length)];
    const isAuction = r(4) < 0.38;

    const titleSuffixes = ['', ' Disney Enamel Pin', ' Collectible Pin', ' Hard Enamel', ' — HTF'];
    const suffix = titleSuffixes[Math.floor(r(5) * titleSuffixes.length)];
    const daysLeft = Math.floor(r(6) * 6) + 1;
    const hoursLeft = Math.floor(r(7) * 23);

    return {
      id: `${seed}-${i}`,
      title: `${pin.title}${suffix}`,
      price: `${cfg.symbol}${price}`,
      priceNum,
      condition: CONDITIONS[conditionIndex],
      seller: sellerA + sellerB,
      type: isAuction ? 'auction' : 'buy_it_now',
      bids: isAuction ? Math.floor(r(8) * 14) : undefined,
      daysLeft: isAuction ? daysLeft : undefined,
      hoursLeft: isAuction && daysLeft === 1 ? hoursLeft : undefined,
    };
  });
}

function computeAvgPrice(listings: EbayListing[]): number {
  const sum = listings.reduce((acc, l) => acc + l.priceNum, 0);
  return Math.round((sum / listings.length) * 100) / 100;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function PinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getEntry, setStatus, markViewed } = useCollection();
  const { allBoards, customBoards, createBoard, addPinToBoard, removePinFromBoard } = useBoards();
  const { pins } = usePinCatalogue();

  const { repo: marketplaceRepo } = useMarketplace();

  const pin = pins.find(p => p.id === id);
  const entry = pin ? getEntry(pin.id) : undefined;
  const [ebayCountry, setEbayCountry] = useState<EbayCountry>('UK');
  const [boardModalVisible, setBoardModalVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [marketplaceListings, setMarketplaceListings] = useState<ExternalSaleListing[]>([]);
  const [traderCount, setTraderCount] = useState(0);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 20;

  useEffect(() => {
    if (pin) markViewed(pin.id);
  }, [pin?.id]);

  useEffect(() => {
    if (!pin || !marketplaceRepo) return;
    marketplaceRepo.getExternalListingsForPin(pin.id)
      .then(setMarketplaceListings)
      .catch(() => { /* non-fatal */ });
  }, [pin?.id, marketplaceRepo]);

  useEffect(() => {
    if (!pin || !marketplaceRepo) return;
    marketplaceRepo.getUsersWithPinForTrade(pin.id)
      .then(traders => setTraderCount(traders.length))
      .catch(() => {});
  }, [pin?.id, marketplaceRepo]);

  if (!pin) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFoundText, { color: colors.foreground }]}>Pin not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: colors.primary }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentStatus = entry?.status ?? 'none';

  const handleStatusPress = (s: CollectionStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatus(pin.id, currentStatus === s ? 'none' : s);
  };

  const statusColor = (s: CollectionStatus) =>
    s === 'owned' ? colors.owned : s === 'wanted' ? colors.wanted : colors.forTrade;

  // Pins in the same collection, excluding current
  const setmates = pins.filter(p => p.collection === pin.collection && p.id !== pin.id);

  // eBay listings for selected country
  const listings = useMemo(() => generateListings(pin, ebayCountry), [pin.id, ebayCountry]);
  const avgPrice = useMemo(() => computeAvgPrice(listings), [listings]);
  const cfg = COUNTRY_CONFIG[ebayCountry];

  // Boards that already contain this pin
  const pinBoardIds = useMemo(
    () => new Set(allBoards.filter(b => b.pinIds.includes(pin.id)).map(b => b.id)),
    [allBoards, pin.id],
  );

  const handleToggleBoard = (boardId: string) => {
    Haptics.selectionAsync();
    if (pinBoardIds.has(boardId)) {
      removePinFromBoard(boardId, pin.id);
    } else {
      addPinToBoard(boardId, pin.id);
    }
  };

  const handleCreateAndAdd = () => {
    const trimmed = newBoardName.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const board = createBoard(trimmed);
    addPinToBoard(board.id, pin.id);
    setNewBoardName('');
    setCreatingBoard(false);
  };

  const openEbay = (listing: EbayListing) => {
    const query = encodeURIComponent(listing.title);
    Linking.openURL(`${cfg.searchBase}${query}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: pin.title }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: botPad }}
      >
        {/* ── Hero Image ── */}
        <View style={styles.imageWrap}>
          <Image
            source={getPinImageSource(pin)}
            style={styles.mainImage}
          />
          {pin.limitedEditionSize && (
            <View style={[styles.leBadge, { backgroundColor: colors.gold }]}>
              <Text style={styles.leLabel}>LE {pin.limitedEditionSize.toLocaleString()}</Text>
            </View>
          )}
        </View>

        {/* ── About this Pin (directly under image) ── */}
        <View style={[styles.aboutBanner, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.aboutTitle, { color: colors.foreground }]}>About this Pin</Text>
          <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>{pin.description}</Text>
        </View>

        <View style={styles.content}>
          {/* ── Title & Brand ── */}
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.foreground }]}>{pin.title}</Text>
              <View style={[styles.brandChip, { backgroundColor: colors.accent }]}>
                <Text style={styles.brandChipLabel}>{pin.brand}</Text>
              </View>
            </View>
            {pin.isNewRelease && (
              <View style={[styles.newChip, { backgroundColor: colors.primary }]}>
                <Text style={styles.newChipLabel}>NEW</Text>
              </View>
            )}
          </View>

          {/* ── Status Buttons ── */}
          <View style={styles.statusRow}>
            {STATUS_CONFIG.map(cfg => {
              const isActive = currentStatus === cfg.status;
              const bg = isActive ? statusColor(cfg.status) : colors.secondary;
              const fg = isActive ? '#fff' : colors.mutedForeground;
              return (
                <TouchableOpacity
                  key={cfg.status}
                  onPress={() => handleStatusPress(cfg.status)}
                  activeOpacity={0.8}
                  style={[
                    styles.statusBtn,
                    {
                      backgroundColor: bg,
                      borderRadius: colors.radius - 2,
                      borderColor: isActive ? 'transparent' : colors.border,
                    },
                  ]}
                >
                  <Feather name={cfg.icon} size={16} color={fg} />
                  <Text style={[styles.statusBtnLabel, { color: fg }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Add to Board ── */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setBoardModalVisible(true);
            }}
            activeOpacity={0.85}
            style={[
              styles.addBoardBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius - 2,
              },
            ]}
          >
            <Feather name="grid" size={16} color={colors.primary} />
            <Text style={[styles.addBoardLabel, { color: colors.primary }]}>
              Add to Board
              {pinBoardIds.size > 0 && (
                <Text style={{ color: colors.mutedForeground }}>
                  {` · ${pinBoardIds.size} board${pinBoardIds.size !== 1 ? 's' : ''}`}
                </Text>
              )}
            </Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={styles.addBoardChevron} />
          </TouchableOpacity>

          {/* ── Metadata ── */}
          <View
            style={[
              styles.metaCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <MetaRow label="Collection" value={pin.collection} colors={colors} />
            {pin.characters.length > 0 && (
              <MetaRow label="Characters" value={pin.characters.join(', ')} colors={colors} />
            )}
            <MetaRow label="Origin" value={pin.origin ?? '—'} colors={colors} />
            <MetaRow label="Edition" value={pin.edition ?? '—'} colors={colors} />
            <MetaRow label="Release Date" value={pin.releaseDate ? formatDate(pin.releaseDate) : '—'} colors={colors} />
            <MetaRow
              label="Retail Price"
              value={pin.retailPriceGBP != null ? `£${pin.retailPriceGBP.toFixed(2)}` : '—'}
              colors={colors}
              last={!pin.limitedEditionSize}
            />
            {pin.limitedEditionSize && (
              <MetaRow
                label="Edition Size"
                value={pin.limitedEditionSize.toLocaleString()}
                colors={colors}
                last
              />
            )}
          </View>

          {/* ── Estimated Value by Country ── */}
          <View>
            <SectionTitle title="Estimated Value" colors={colors} />

            {/* Country toggle */}
            <View style={[styles.countryToggle, { backgroundColor: colors.secondary, borderRadius: 10 }]}>
              {(Object.keys(COUNTRY_CONFIG) as EbayCountry[]).map(c => {
                const isActive = c === ebayCountry;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setEbayCountry(c);
                    }}
                    style={[
                      styles.countryBtn,
                      isActive && {
                        backgroundColor: colors.card,
                        borderRadius: 8,
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: 2,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.countryFlag}>{COUNTRY_CONFIG[c].flag}</Text>
                    <Text
                      style={[
                        styles.countryLabel,
                        { color: isActive ? colors.foreground : colors.mutedForeground },
                      ]}
                    >
                      {COUNTRY_CONFIG[c].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              style={[
                styles.valueCard,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <View style={styles.valueMain}>
                <Text style={[styles.valueAmount, { color: colors.foreground }]}>
                  {cfg.symbol}{avgPrice.toFixed(2)}
                </Text>
                <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>
                  avg. from recent listings
                </Text>
              </View>
              <View style={styles.valueRange}>
                <View style={styles.valueRangeItem}>
                  <Text style={[styles.valueRangeNum, { color: colors.owned }]}>
                    {cfg.symbol}{((pin.estimatedValueGBP ?? 0) * cfg.rate * 0.72).toFixed(2)}
                  </Text>
                  <Text style={[styles.valueRangeLabel, { color: colors.mutedForeground }]}>Low</Text>
                </View>
                <View style={[styles.valueRangeDivider, { backgroundColor: colors.border }]} />
                <View style={styles.valueRangeItem}>
                  <Text style={[styles.valueRangeNum, { color: colors.forTrade }]}>
                    {cfg.symbol}{((pin.estimatedValueGBP ?? 0) * cfg.rate * 1.47).toFixed(2)}
                  </Text>
                  <Text style={[styles.valueRangeLabel, { color: colors.mutedForeground }]}>High</Text>
                </View>
              </View>
              <View style={[styles.valueDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.valueDisclaimer, { color: colors.mutedForeground }]}>
                Based on sample listing data · not real market prices
              </Text>
            </View>
          </View>

          {/* ── Pins in this Set ── */}
          {setmates.length > 0 && (
            <View>
              <SectionTitle
                title={`More from ${pin.collection}`}
                subtitle={`${setmates.length} other ${setmates.length === 1 ? 'pin' : 'pins'} in this set`}
                colors={colors}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.setmatesScroll}
              >
                {setmates.map(p => (
                  <View key={p.id} style={styles.setmateCard}>
                    <PinCard
                      pin={p}
                      mode="grid"
                      onPress={() =>
                        router.push({ pathname: '/pin/[id]', params: { id: p.id } })
                      }
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── For Trade ── */}
          <View>
            <SectionTitle
              title="For Trade"
              subtitle={
                traderCount > 0
                  ? `${traderCount} collector${traderCount !== 1 ? 's' : ''} offering this`
                  : 'No traders yet'
              }
              colors={colors}
            />
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/traders/[pinId]', params: { pinId: pin.id } })}
              activeOpacity={0.85}
              style={[styles.traderBanner, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
            >
              <View style={[styles.traderIconWrap, { backgroundColor: colors.forTrade + '20' }]}>
                <Feather name="repeat" size={18} color={colors.forTrade} />
              </View>
              {traderCount === 0 ? (
                <Text style={[styles.traderEmpty, { color: colors.mutedForeground }]}>
                  No one has this for trade yet — tap to check
                </Text>
              ) : (
                <View style={{ flex: 1 }}>
                  <Text style={[styles.traderCountLabel, { color: colors.foreground }]}>
                    {traderCount} collector{traderCount !== 1 ? 's' : ''} offering this for trade
                  </Text>
                  <Text style={[styles.traderSubLabel, { color: colors.mutedForeground }]}>
                    Tap to view traders and request a swap
                  </Text>
                </View>
              )}
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* ── Marketplace Listings ── */}
          <View>
            <SectionTitle
              title="Marketplace Listings"
              subtitle={
                marketplaceListings.length > 0
                  ? `${marketplaceListings.length} active listing${marketplaceListings.length !== 1 ? 's' : ''}`
                  : 'No active listings'
              }
              colors={colors}
            />

            {/* Safety notice */}
            <View style={[styles.mktWarning, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
              <Feather name="shield" size={12} color="#92400E" />
              <Text style={styles.mktWarningText}>
                Complete payment only through the marketplace's official checkout. Payments arranged outside the marketplace may not be protected.
              </Text>
            </View>

            {marketplaceListings.length === 0 ? (
              <View style={[styles.mktEmpty, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Text style={[styles.mktEmptyText, { color: colors.mutedForeground }]}>
                  No pins listed for sale here yet.
                </Text>
                {currentStatus === 'for_trade' && (
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/sell/[pinId]', params: { pinId: pin.id } })}
                    activeOpacity={0.85}
                    style={[styles.mktSellBtn, { backgroundColor: colors.primary, borderRadius: colors.radius - 2 }]}
                  >
                    <Feather name="tag" size={14} color="#fff" />
                    <Text style={styles.mktSellBtnLabel}>List this pin for sale</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={[styles.mktCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                {marketplaceListings.map((listing, idx) => {
                  const pcfg = PLATFORM_CONFIG[listing.platform];
                  const currSym = CURRENCY_SYMBOLS[(listing.currency as keyof typeof CURRENCY_SYMBOLS)] ?? listing.currency ?? '';
                  return (
                    <View
                      key={listing.id}
                      style={[
                        styles.mktRow,
                        { borderBottomColor: colors.border },
                        idx === marketplaceListings.length - 1 && styles.mktRowLast,
                      ]}
                    >
                      {/* Platform badge */}
                      <View style={[styles.mktPlatformBadge, { backgroundColor: pcfg.color + '18' }]}>
                        <Feather name={pcfg.icon as keyof typeof Feather.glyphMap} size={13} color={pcfg.color} />
                        <Text style={[styles.mktPlatformLabel, { color: pcfg.color }]}>{pcfg.label}</Text>
                      </View>

                      {/* Seller + price */}
                      <View style={styles.mktMeta}>
                        {listing.sellerUsername && (
                          <Text style={[styles.mktSeller, { color: colors.mutedForeground }]}>
                            @{listing.sellerUsername}
                          </Text>
                        )}
                        {listing.askingPrice != null && (
                          <Text style={[styles.mktPrice, { color: colors.foreground }]}>
                            {currSym}{listing.askingPrice.toFixed(2)}
                          </Text>
                        )}
                      </View>

                      {/* View button */}
                      <TouchableOpacity
                        onPress={() => Linking.openURL(listing.listingUrl)}
                        activeOpacity={0.75}
                        style={[styles.mktViewBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}
                      >
                        <Text style={[styles.mktViewBtnLabel, { color: colors.primary }]}>View</Text>
                        <Feather name="external-link" size={10} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* List your own */}
                {currentStatus === 'for_trade' && (
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/sell/[pinId]', params: { pinId: pin.id } })}
                    activeOpacity={0.8}
                    style={[styles.mktAddRow, { borderTopColor: colors.border }]}
                  >
                    <Feather name="plus" size={14} color={colors.primary} />
                    <Text style={[styles.mktAddLabel, { color: colors.primary }]}>Add your listing</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* ── eBay Listings ── */}
          <View>
            <SectionTitle
              title="Recent eBay Listings"
              subtitle={`Showing mock listings from ${cfg.siteName}`}
              colors={colors}
            />

            {/* Country toggle (reuses same ebayCountry state) */}
            <View style={[styles.countryToggle, { backgroundColor: colors.secondary, borderRadius: 10 }]}>
              {(Object.keys(COUNTRY_CONFIG) as EbayCountry[]).map(c => {
                const isActive = c === ebayCountry;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setEbayCountry(c);
                    }}
                    style={[
                      styles.countryBtn,
                      isActive && {
                        backgroundColor: colors.card,
                        borderRadius: 8,
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: 2,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.countryFlag}>{COUNTRY_CONFIG[c].flag}</Text>
                    <Text
                      style={[
                        styles.countryLabel,
                        { color: isActive ? colors.foreground : colors.mutedForeground },
                      ]}
                    >
                      {COUNTRY_CONFIG[c].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Listing rows */}
            <View
              style={[
                styles.listingsCard,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              {listings.map((listing, idx) => (
                <View
                  key={listing.id}
                  style={[
                    styles.listingRow,
                    { borderBottomColor: colors.border },
                    idx === listings.length - 1 && styles.listingRowLast,
                  ]}
                >
                  <Image source={getPinImageSource(pin)} style={[styles.listingThumb, { borderRadius: 6 }]} />
                  <View style={styles.listingInfo}>
                    <Text
                      style={[styles.listingTitle, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {listing.title}
                    </Text>
                    <View style={styles.listingMeta}>
                      <View
                        style={[
                          styles.conditionBadge,
                          { backgroundColor: conditionColor(listing.condition, colors) + '22' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.conditionLabel,
                            { color: conditionColor(listing.condition, colors) },
                          ]}
                        >
                          {listing.condition}
                        </Text>
                      </View>
                      <Text style={[styles.sellerText, { color: colors.mutedForeground }]}>
                        {listing.seller}
                      </Text>
                    </View>
                    {listing.type === 'auction' ? (
                      <View style={styles.auctionRow}>
                        <Feather name="clock" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.auctionMeta, { color: colors.mutedForeground }]}>
                          {listing.bids} bid{listing.bids !== 1 ? 's' : ''} ·{' '}
                          {listing.daysLeft === 1
                            ? `${listing.hoursLeft}h left`
                            : `${listing.daysLeft}d left`}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.auctionRow}>
                        <Feather name="tag" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.auctionMeta, { color: colors.mutedForeground }]}>
                          Buy It Now
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.listingRight}>
                    <Text style={[styles.listingPrice, { color: colors.foreground }]}>
                      {listing.price}
                    </Text>
                    <TouchableOpacity
                      onPress={() => openEbay(listing)}
                      activeOpacity={0.75}
                      style={[
                        styles.viewBtn,
                        { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
                      ]}
                    >
                      <Text style={[styles.viewBtnLabel, { color: colors.primary }]}>View</Text>
                      <Feather name="external-link" size={10} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Footer disclaimer */}
              <View style={[styles.ebayFooter, { borderTopColor: colors.border }]}>
                <Feather name="info" size={11} color={colors.mutedForeground} />
                <Text style={[styles.ebayFooterText, { color: colors.mutedForeground }]}>
                  Sample data only — not real eBay listings. Always check live prices before trading.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Add to Board Modal ── */}
      <Modal
        visible={boardModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setBoardModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setBoardModalVisible(false);
            setCreatingBoard(false);
            setNewBoardName('');
          }}
        />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {/* Handle */}
          <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add to Board</Text>
          <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
            {pin.title}
          </Text>

          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {allBoards.length === 0 && !creatingBoard && (
              <Text style={[styles.emptyBoards, { color: colors.mutedForeground }]}>
                No boards yet. Create one below.
              </Text>
            )}
            {allBoards.map(board => {
              const isIn = pinBoardIds.has(board.id);
              return (
                <TouchableOpacity
                  key={board.id}
                  onPress={() => handleToggleBoard(board.id)}
                  activeOpacity={0.75}
                  style={[
                    styles.boardRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.boardCheck,
                      {
                        backgroundColor: isIn ? colors.primary : 'transparent',
                        borderColor: isIn ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    {isIn && <Feather name="check" size={13} color="#fff" />}
                  </View>
                  <View style={styles.boardRowInfo}>
                    <Text style={[styles.boardRowName, { color: colors.foreground }]}>{board.name}</Text>
                    <Text style={[styles.boardRowMeta, { color: colors.mutedForeground }]}>
                      {board.isCustom ? 'Custom' : 'Suggested'} · {board.pinIds.length} pin{board.pinIds.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* New board form */}
            {creatingBoard ? (
              <View style={[styles.newBoardForm, { borderTopColor: colors.border }]}>
                <TextInput
                  value={newBoardName}
                  onChangeText={setNewBoardName}
                  placeholder="Board name…"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.newBoardInput,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateAndAdd}
                />
                <View style={styles.newBoardActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setCreatingBoard(false);
                      setNewBoardName('');
                    }}
                    style={[styles.newBoardCancel, { borderColor: colors.border }]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.newBoardCancelLabel, { color: colors.mutedForeground }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateAndAdd}
                    style={[
                      styles.newBoardCreate,
                      { backgroundColor: newBoardName.trim() ? colors.primary : colors.secondary },
                    ]}
                    activeOpacity={0.85}
                    disabled={!newBoardName.trim()}
                  >
                    <Text
                      style={[
                        styles.newBoardCreateLabel,
                        { color: newBoardName.trim() ? colors.primaryForeground : colors.mutedForeground },
                      ]}
                    >
                      Create & Add
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setCreatingBoard(true)}
                activeOpacity={0.8}
                style={[styles.newBoardTrigger, { borderTopColor: colors.border }]}
              >
                <Feather name="plus-circle" size={18} color={colors.primary} />
                <Text style={[styles.newBoardTriggerLabel, { color: colors.primary }]}>
                  New Board
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <TouchableOpacity
            onPress={() => {
              setBoardModalVisible(false);
              setCreatingBoard(false);
              setNewBoardName('');
            }}
            style={[styles.modalDone, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            activeOpacity={0.85}
          >
            <Text style={[styles.modalDoneLabel, { color: colors.primaryForeground }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ColorsType = ReturnType<typeof import('@/hooks/useColors').useColors>;

function MetaRow({
  label,
  value,
  colors,
  last,
}: {
  label: string;
  value: string;
  colors: ColorsType;
  last?: boolean;
}) {
  return (
    <View
      style={[
        metaStyles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[metaStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[metaStyles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function SectionTitle({
  title,
  subtitle,
  colors,
}: {
  title: string;
  subtitle?: string;
  colors: ColorsType;
}) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      )}
    </View>
  );
}

function conditionColor(condition: string, colors: ColorsType): string {
  if (condition === 'Brand New' || condition === 'Like New') return colors.owned;
  if (condition === 'Very Good' || condition === 'Good') return colors.wanted;
  return colors.mutedForeground;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const metaStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
  },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  value: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 2, textAlign: 'right' },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  backLink: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  // Image
  imageWrap: { position: 'relative' },
  mainImage: { width: '100%', height: 300, resizeMode: 'cover' },
  flipBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  flipLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  leBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  leLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#1C1C2E' },
  // About banner (under image)
  aboutBanner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  aboutTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  aboutText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  // Layout
  content: { padding: 16, gap: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleBlock: { flex: 1, gap: 6 },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', lineHeight: 28 },
  brandChip: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  brandChipLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  newChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 2 },
  newChipLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },
  // Status
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderWidth: 1,
  },
  statusBtnLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  // Add to Board
  addBoardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  addBoardLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  addBoardChevron: { marginLeft: 'auto' },
  // Metadata card
  metaCard: { borderWidth: 1, overflow: 'hidden' },
  // Section title
  sectionTitleWrap: { gap: 2, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  sectionSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  // Estimated Value card
  valueCard: {
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
    gap: 12,
  },
  valueMain: { alignItems: 'center', gap: 2 },
  valueAmount: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  valueLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  valueRange: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  valueRangeItem: { flex: 1, alignItems: 'center', gap: 2 },
  valueRangeNum: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  valueRangeLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  valueRangeDivider: { width: 1, height: 32, marginHorizontal: 12 },
  valueDivider: { height: StyleSheet.hairlineWidth },
  valueDisclaimer: { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  // Country toggle
  countryToggle: {
    flexDirection: 'row',
    padding: 3,
    marginBottom: 10,
  },
  countryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  countryFlag: { fontSize: 16 },
  countryLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  // Pins in this set
  setmatesScroll: { gap: 12, paddingRight: 4 },
  setmateCard: { width: 155 },
  // eBay listings card
  listingsCard: { borderWidth: 1, overflow: 'hidden' },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listingRowLast: { borderBottomWidth: 0 },
  listingThumb: { width: 52, height: 52, resizeMode: 'cover' },
  listingInfo: { flex: 1, gap: 4 },
  listingTitle: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 17 },
  listingMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  conditionBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  conditionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  sellerText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  auctionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  auctionMeta: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  listingRight: { alignItems: 'flex-end', gap: 6 },
  listingPrice: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  viewBtnLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  ebayFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ebayFooterText: { flex: 1, fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 14 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingHorizontal: 16,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  modalSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 14 },
  modalList: { maxHeight: 340 },
  emptyBoards: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 20 },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  boardCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardRowInfo: { flex: 1, gap: 2 },
  boardRowName: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  boardRowMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  newBoardTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  newBoardTriggerLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  newBoardForm: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  newBoardInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  newBoardActions: { flexDirection: 'row', gap: 10 },
  newBoardCancel: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBoardCancelLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  newBoardCreate: {
    flex: 2,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBoardCreateLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  modalDone: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  modalDoneLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  // ── Marketplace listings section ────────────────────────────────────────────
  mktWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
  },
  mktWarningText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#92400E',
    lineHeight: 15,
  },
  mktEmpty: {
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  mktEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  mktSellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mktSellBtnLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  mktCard: { borderWidth: 1, overflow: 'hidden' },
  mktRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mktRowLast: { borderBottomWidth: 0 },
  mktPlatformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mktPlatformLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  mktMeta: { flex: 1, gap: 1 },
  mktSeller: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  mktPrice: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  mktViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
  },
  mktViewBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  mktAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mktAddLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  // For Trade banner
  traderBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderWidth: 1, marginHorizontal: 16,
  },
  traderIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  traderEmpty: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  traderCountLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  traderSubLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
