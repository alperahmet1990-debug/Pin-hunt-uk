import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
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
import { PINS } from '@/mock-data/pins';
import { PinCard } from '@/components/PinCard';
import type { CollectionStatus, Pin } from '@/types/pin';

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

const COUNTRY_CONFIG: Record<EbayCountry, { label: string; flag: string; symbol: string; rate: number; siteName: string }> = {
  UK: { label: 'UK', flag: '🇬🇧', symbol: '£', rate: 1.0,  siteName: 'ebay.co.uk' },
  US: { label: 'US', flag: '🇺🇸', symbol: '$', rate: 1.27, siteName: 'ebay.com' },
  FR: { label: 'France', flag: '🇫🇷', symbol: '€', rate: 1.17, siteName: 'ebay.fr' },
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
  condition: string;
  seller: string;
  type: 'auction' | 'buy_it_now';
  bids?: number;
  daysLeft?: number;
  hoursLeft?: number;
}

function generateListings(pin: Pin, country: EbayCountry): EbayListing[] {
  const cfg = COUNTRY_CONFIG[country];
  const seed = pin.id + country;

  return Array.from({ length: 5 }, (_, i): EbayListing => {
    const r = (off: number) => seededHash(seed, i * 11 + off);

    const variance = 0.72 + r(0) * 0.75; // 0.72× – 1.47× base
    const rawPrice = pin.estimatedValueGBP * cfg.rate * variance;
    const price = rawPrice < 10
      ? rawPrice.toFixed(2)
      : (Math.round(rawPrice * 2) / 2).toFixed(2);

    const conditionIndex = Math.floor(r(1) * CONDITIONS.length);
    const sellerA = SELLER_PARTS_A[Math.floor(r(2) * SELLER_PARTS_A.length)];
    const sellerB = SELLER_PARTS_B[Math.floor(r(3) * SELLER_PARTS_B.length)];
    const isAuction = r(4) < 0.38;

    const titleSuffixes = [
      '',
      ' Disney Enamel Pin',
      ' Collectible Pin',
      ' Hard Enamel',
      ' — HTF',
    ];
    const suffix = titleSuffixes[Math.floor(r(5) * titleSuffixes.length)];
    const daysLeft = Math.floor(r(6) * 6) + 1;
    const hoursLeft = Math.floor(r(7) * 23);

    return {
      id: `${seed}-${i}`,
      title: `${pin.title}${suffix}`,
      price: `${cfg.symbol}${price}`,
      condition: CONDITIONS[conditionIndex],
      seller: sellerA + sellerB,
      type: isAuction ? 'auction' : 'buy_it_now',
      bids: isAuction ? Math.floor(r(8) * 14) : undefined,
      daysLeft: isAuction ? daysLeft : undefined,
      hoursLeft: isAuction && daysLeft === 1 ? hoursLeft : undefined,
    };
  });
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function PinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getEntry, setStatus, setNotes, markViewed } = useCollection();

  const pin = PINS.find(p => p.id === id);
  const entry = pin ? getEntry(pin.id) : undefined;
  const [notesText, setNotesText] = useState(entry?.notes ?? '');
  const [showBack, setShowBack] = useState(false);
  const [ebayCountry, setEbayCountry] = useState<EbayCountry>('UK');
  const notesSaved = useRef(false);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 20;

  useEffect(() => {
    if (pin) markViewed(pin.id);
  }, [pin?.id]);

  useEffect(() => {
    return () => {
      if (pin && !notesSaved.current) setNotes(pin.id, notesText);
    };
  }, [notesText, pin?.id]);

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

  const handleSaveNotes = () => {
    setNotes(pin.id, notesText);
    notesSaved.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const statusColor = (s: CollectionStatus) =>
    s === 'owned' ? colors.owned : s === 'wanted' ? colors.wanted : colors.forTrade;

  // Pins in the same collection, excluding current
  const setmates = PINS.filter(p => p.collection === pin.collection && p.id !== pin.id);

  // eBay listings for selected country
  const listings = useMemo(
    () => generateListings(pin, ebayCountry),
    [pin.id, ebayCountry],
  );

  const ebayLink = COUNTRY_CONFIG[ebayCountry].siteName;

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
            source={showBack && pin.backImage ? pin.backImage : pin.image}
            style={styles.mainImage}
          />
          {pin.backImage && (
            <TouchableOpacity
              onPress={() => setShowBack(b => !b)}
              style={[styles.flipBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <Feather name="refresh-cw" size={14} color={colors.foreground} />
              <Text style={[styles.flipLabel, { color: colors.foreground }]}>
                {showBack ? 'Front' : 'Back'}
              </Text>
            </TouchableOpacity>
          )}
          {pin.limitedEditionSize && (
            <View style={[styles.leBadge, { backgroundColor: colors.gold }]}>
              <Text style={styles.leLabel}>LE {pin.limitedEditionSize.toLocaleString()}</Text>
            </View>
          )}
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
            <MetaRow label="Release Date" value={formatDate(pin.releaseDate)} colors={colors} />
            <MetaRow label="Retail Price" value={`£${pin.retailPrice.toFixed(2)}`} colors={colors} />
            {pin.limitedEditionSize && (
              <MetaRow label="Edition Size" value={pin.limitedEditionSize.toLocaleString()} colors={colors} last />
            )}
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

          {/* ── eBay Listings ── */}
          <View>
            <SectionTitle
              title="Recent eBay Listings"
              subtitle={`Showing mock listings from ${ebayLink}`}
              colors={colors}
            />

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
                  <Image source={pin.image} style={[styles.listingThumb, { borderRadius: 6 }]} />
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
                  <Text style={[styles.listingPrice, { color: colors.foreground }]}>
                    {listing.price}
                  </Text>
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

          {/* ── Description ── */}
          <View style={styles.descSection}>
            <Text style={[styles.descTitle, { color: colors.foreground }]}>About this Pin</Text>
            <Text style={[styles.descText, { color: colors.mutedForeground }]}>{pin.description}</Text>
          </View>

          {/* ── Notes ── */}
          <View
            style={[
              styles.notesCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <Text style={[styles.notesTitle, { color: colors.foreground }]}>My Notes</Text>
            <TextInput
              value={notesText}
              onChangeText={setNotesText}
              multiline
              placeholder="Add your own notes here…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.notesInput, { color: colors.foreground, borderColor: colors.border }]}
            />
            <TouchableOpacity
              onPress={handleSaveNotes}
              style={[styles.saveBtn, { backgroundColor: colors.primary, borderRadius: colors.radius - 4 }]}
              activeOpacity={0.85}
            >
              <Text style={[styles.saveBtnLabel, { color: colors.primaryForeground }]}>Save Notes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
  // Metadata card
  metaCard: { borderWidth: 1, overflow: 'hidden' },
  // Section title
  sectionTitleWrap: { gap: 2, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  sectionSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  // Pins in this set
  setmatesScroll: { gap: 12, paddingRight: 4 },
  setmateCard: { width: 155 },
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
  listingPrice: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  ebayFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ebayFooterText: { flex: 1, fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 14 },
  // Description
  descSection: { gap: 8 },
  descTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  descText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  // Notes
  notesCard: { borderWidth: 1, padding: 14, gap: 10 },
  notesTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  notesInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
  saveBtn: { alignItems: 'center', paddingVertical: 10 },
  saveBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
