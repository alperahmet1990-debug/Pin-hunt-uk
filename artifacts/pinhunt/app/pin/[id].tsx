import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useMarketplace } from '@/hooks/useMarketplace';
import { getPinImageSource } from '@/utils/pinImage';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { ScreenContainer, Chip, MetaRow, ValueDisplay, PrimaryActionBar, SetProgressBar, CompactPinTile } from '@/components/ui';
import type { PrimaryActionBarAction } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { PLATFORM_CONFIG, CURRENCY_SYMBOLS } from '@/utils/marketplaceUrl';
import type { CataloguePin, ExternalSaleListing } from '@workspace/pin-repository';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HERO_HEIGHT = Math.min(SCREEN_WIDTH * 1.05, 440);
const IMAGE_CARD = SCREEN_WIDTH - 40;
const SET_TILE = 78;

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { collection, getEntry, markViewed } = useCollection();
  const { customBoards } = useBoards();
  const { pins, repository } = usePinCatalogue();

  const { repo: marketplaceRepo } = useMarketplace();

  const cachedPin = pins.find(p => p.id === id);
  const [fetchedPin, setFetchedPin] = useState<CataloguePin | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  // The cached catalogue holds a subset of the full database. When the pin
  // isn't cached (e.g. reached from search), fetch it by id directly.
  useEffect(() => {
    if (cachedPin || !id || !repository) { setFetchedPin(null); return; }
    let cancelled = false;
    setPinLoading(true);
    repository.getPinById(id)
      .then(p => { if (!cancelled) setFetchedPin(p); })
      .catch(() => { if (!cancelled) setFetchedPin(null); })
      .finally(() => { if (!cancelled) setPinLoading(false); });
    return () => { cancelled = true; };
  }, [id, cachedPin, repository]);

  const pin = cachedPin ?? fetchedPin ?? undefined;
  const entry = pin ? getEntry(pin.id) : undefined;
  const [manageSheetPin, setManageSheetPin] = useState<CataloguePin | null>(null);
  const [marketplaceListings, setMarketplaceListings] = useState<ExternalSaleListing[]>([]);
  const [traderCount, setTraderCount] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  const [marketplaceExpanded, setMarketplaceExpanded] = useState(false);
  const [sourceDisplayName, setSourceDisplayName] = useState<string | null>(null);

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

  // Subtle catalogue-data attribution — resolved from the pin's actual
  // provenance (catalogueSource), never hard-coded. Stays null (no line
  // shown) for pins with no registered source.
  useEffect(() => {
    setSourceDisplayName(null);
    if (!pin?.catalogueSource || !repository) return;
    repository.getCatalogueSourceDisplayName(pin.catalogueSource)
      .then(setSourceDisplayName)
      .catch(() => setSourceDisplayName(null));
  }, [pin?.catalogueSource, repository]);

  if (!pin) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ title: 'Pin Detail' }} />
        <View style={styles.notFound}>
          {pinLoading ? (
            <ActivityIndicator color={colors.homeCoral} />
          ) : (
            <>
              <Text style={[styles.notFoundText, { color: colors.homeInk }]}>Pin not found.</Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={[styles.backLink, { color: colors.homeCoral }]}>Go Back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const currentStatus = entry?.status ?? 'none';
  const quantity = entry?.quantity ?? 1;
  // Owned and For Trade are mutually exclusive in the current data model (one
  // status + one quantity per pin) — see the data-model note in the final report.
  const ownedQty = currentStatus === 'owned' ? quantity : 0;
  const tradeQty = currentStatus === 'for_trade' ? quantity : 0;

  // Pins in the same collection, excluding current
  const setmates = pins.filter(p => p.collection === pin.collection && p.id !== pin.id);
  const setTotal = pin.collection ? setmates.length + 1 : 0;
  const setOwnedCount =
    setmates.filter(p => ['owned', 'for_trade'].includes(collection[p.id]?.status ?? '')).length +
    (currentStatus === 'owned' || currentStatus === 'for_trade' ? 1 : 0);

  // Boards that already contain this pin — custom boards only. Auto-suggested
  // "boards" (one per owned collection) aren't boards the collector created,
  // so counting them here would contradict the Add to Collection sheet, which
  // only ever shows/toggles customBoards.
  const pinBoardIds = useMemo(
    () => new Set(customBoards.filter(b => b.pinIds.includes(pin.id)).map(b => b.id)),
    [customBoards, pin.id],
  );

  const images = [getPinImageSource(pin), ...(pin.backImageUrl ? [{ uri: pin.backImageUrl }] : [])];

  const openManageSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setManageSheetPin(pin);
  };

  const primaryActions: PrimaryActionBarAction[] = [
    {
      key: 'trades',
      label: 'Find Trades',
      icon: 'compass',
      variant: 'primary',
      onPress: () => router.push({ pathname: '/traders/[pinId]', params: { pinId: pin.id } }),
    },
  ];

  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 24) : insets.top;

  const manageIcon: React.ComponentProps<typeof Feather>['name'] =
    currentStatus === 'none' ? 'plus'
      : currentStatus === 'owned' ? 'check-circle'
      : currentStatus === 'for_trade' ? 'repeat'
      : 'bookmark';
  const manageTone =
    currentStatus === 'owned' ? colors.owned
      : currentStatus === 'for_trade' ? colors.forTrade
      : currentStatus === 'wanted' ? colors.wanted
      : colors.homeCoral;

  return (
    <ScreenContainer edges={{ top: false, bottom: false }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ── 1. Image-dominant hero ── */}
        <LinearGradient
          colors={[colors.homeCoralDeep, colors.homeCoral, colors.homeSand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { height: HERO_HEIGHT }]}
        >
          <TouchableOpacity
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={[styles.backBtn, { top: topInset + 10, backgroundColor: colors.homeSurface + 'E6' }]}
          >
            <Feather name="chevron-left" size={20} color={colors.homeInk} />
          </TouchableOpacity>

          {pin.limitedEditionSize != null && pin.limitedEditionSize > 0 && (
            <View style={[styles.leBadgeWrap, { top: topInset + 10 }]}>
              <Chip variant="solid" tone="sand" size="sm" icon="star" label={`LE ${pin.limitedEditionSize.toLocaleString()}`} />
            </View>
          )}

          {images.length > 1 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={e => setActiveImage(Math.round(e.nativeEvent.contentOffset.x / IMAGE_CARD))}
                style={{ width: IMAGE_CARD, flexGrow: 0 }}
              >
                {images.map((src, i) => (
                  <View key={i} style={[styles.imagePage, { width: IMAGE_CARD, height: IMAGE_CARD }]}>
                    <Image source={src} style={[styles.image, { shadowColor: colors.homeShadow }]} resizeMode="contain" />
                  </View>
                ))}
              </ScrollView>
              <View style={styles.dots}>
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, { backgroundColor: i === activeImage ? colors.homeSurface : colors.homeSurface + '60' }]}
                  />
                ))}
              </View>
            </>
          ) : (
            <Image
              source={images[0]}
              style={[styles.image, { width: IMAGE_CARD, height: IMAGE_CARD, shadowColor: colors.homeShadow }]}
              resizeMode="contain"
            />
          )}
        </LinearGradient>

        <View style={styles.content}>
          {/* ── 2. Title / series ── */}
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.homeInk }]}>{pin.title}</Text>
              {pin.catalogueStatus === 'trusted' && (
                <Feather name="check-circle" size={15} color={colors.owned} style={styles.verifiedIcon} />
              )}
            </View>
            {(pin.collection || pin.brand) && (
              <Text style={[styles.subtitle, { color: colors.homeMuted }]}>{pin.collection || pin.brand}</Text>
            )}
          </View>

          {pin.isSeedRecord && (
            <View style={[styles.seedBanner, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine }]}>
              <Feather name="alert-circle" size={13} color={colors.homeSandInk} />
              <Text style={[styles.seedBannerText, { color: colors.homeSandInk }]}>
                Community verification needed — details may be incomplete
              </Text>
            </View>
          )}

          {pin.description ? (
            <Text style={[styles.description, { color: colors.homeMuted }]}>{pin.description}</Text>
          ) : null}

          {/* ── 3. Collection management ── */}
          <View style={styles.collectionSection}>
            <TouchableOpacity
              onPress={openManageSheet}
              activeOpacity={0.88}
              style={[
                styles.manageBtn,
                currentStatus === 'none'
                  ? { backgroundColor: colors.homeCoral, shadowColor: colors.homeShadow }
                  : { backgroundColor: colors.homeSurface, borderWidth: 1, borderColor: colors.homeLine },
              ]}
            >
              <Feather name={manageIcon} size={17} color={currentStatus === 'none' ? colors.homeSurface : manageTone} />
              <Text style={[styles.manageBtnLabel, { color: currentStatus === 'none' ? colors.homeSurface : colors.homeInk }]}>
                {currentStatus === 'none' ? 'Add to Collection' : 'Manage Collection'}
              </Text>
              <Feather name="chevron-right" size={16} color={currentStatus === 'none' ? colors.homeSurface : colors.homeMuted} />
            </TouchableOpacity>

            <View style={styles.collectionCounters}>
              <TouchableOpacity onPress={openManageSheet} activeOpacity={0.85} style={[styles.counterPill, { backgroundColor: colors.homeAqua }]}>
                <Text style={[styles.counterLabel, { color: colors.homeMuted }]}>In Collection</Text>
                <Text style={[styles.counterValue, { color: colors.homeInk }]}>{ownedQty}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openManageSheet} activeOpacity={0.85} style={[styles.counterPill, { backgroundColor: colors.homeAqua }]}>
                <Text style={[styles.counterLabel, { color: colors.homeMuted }]}>For Trade</Text>
                <Text style={[styles.counterValue, { color: colors.homeInk }]}>{tradeQty}</Text>
              </TouchableOpacity>
            </View>

            {(currentStatus === 'wanted' || pinBoardIds.size > 0) && (
              <View style={styles.collectionHints}>
                {currentStatus === 'wanted' && (
                  <View style={[styles.isoPill, { backgroundColor: colors.wanted + '18' }]}>
                    <Feather name="bookmark" size={10} color={colors.wanted} />
                    <Text style={[styles.isoPillLabel, { color: colors.wanted }]}>On your ISO list</Text>
                  </View>
                )}
                {pinBoardIds.size > 0 && (
                  <Text style={[styles.boardHint, { color: colors.homeMuted }]}>
                    In {pinBoardIds.size} board{pinBoardIds.size !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* ── 4. Details ── */}
          <View style={[styles.detailsCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <Text style={[styles.detailsHeading, { color: colors.homeMuted }]}>DETAILS</Text>
            <View>
              {pin.characters.length > 0 && <MetaRow label="Characters" value={pin.characters.join(', ')} />}
              {pin.origin ? <MetaRow label="Release Location" value={pin.origin} /> : null}
              {pin.edition ? <MetaRow label="Edition Type" value={pin.edition} /> : null}
              {pin.releaseDate ? <MetaRow label="Release Date" value={formatDate(pin.releaseDate)} /> : pin.releaseYear ? <MetaRow label="Release Year" value={String(pin.releaseYear)} /> : null}
              {pin.retailPriceGBP != null ? <MetaRow label="Retail Price" value={`£${pin.retailPriceGBP.toFixed(2)}`} /> : null}
              {pin.externalIdentifiers?.pinpicsId ? <MetaRow label="Pinpics ID" value={pin.externalIdentifiers.pinpicsId} /> : null}
              {pin.externalIdentifiers?.sku ? <MetaRow label="SKU / Ref" value={pin.externalIdentifiers.sku} /> : null}
              <MetaRow
                label="Edition Size"
                value={pin.limitedEditionSize ? pin.limitedEditionSize.toLocaleString() : 'Open Edition'}
                last
              />
            </View>
          </View>

          {/* ── 5. Value ── */}
          <ValueDisplay pinId={pin.id} catalogueEstimateGBP={pin.estimatedValueGBP ?? null} />

          {/* ── 6. Trading content — can I find another collector for this pin? ── */}
          <View>
            <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>TRADING</Text>
            <View style={[styles.tradingCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/traders/[pinId]', params: { pinId: pin.id } })}
                activeOpacity={0.85}
                style={[styles.tradingRow, { borderBottomColor: colors.homeLine }]}
              >
                <View style={[styles.tradingIcon, { backgroundColor: colors.forTrade + '20' }]}>
                  <Feather name="repeat" size={15} color={colors.forTrade} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tradingLabel, { color: colors.homeInk }]}>Other Collectors</Text>
                  <Text style={[styles.tradingMeta, { color: colors.homeMuted }]}>
                    {traderCount > 0 ? `${traderCount} collector${traderCount !== 1 ? 's' : ''} offering this for trade` : 'No traders yet — be the first'}
                  </Text>
                </View>
                <Feather name="chevron-right" size={15} color={colors.homeMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setMarketplaceExpanded(e => !e)}
                activeOpacity={0.85}
                style={styles.tradingRowLast}
              >
                <View style={[styles.tradingIcon, { backgroundColor: colors.homeCoral + '20' }]}>
                  <Feather name="tag" size={15} color={colors.homeCoral} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tradingLabel, { color: colors.homeInk }]}>For Sale</Text>
                  <Text style={[styles.tradingMeta, { color: colors.homeMuted }]}>
                    {marketplaceListings.length > 0 ? `${marketplaceListings.length} active listing${marketplaceListings.length !== 1 ? 's' : ''}` : 'No listings yet'}
                  </Text>
                </View>
                <Feather name={marketplaceExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.homeMuted} />
              </TouchableOpacity>

              {marketplaceExpanded && (
                <View style={[styles.marketplacePanel, { borderTopColor: colors.homeLine }]}>
                  <View style={[styles.mktWarning, { backgroundColor: colors.homeWarmSurface }]}>
                    <Feather name="shield" size={12} color={colors.homeSandInk} />
                    <Text style={[styles.mktWarningText, { color: colors.homeSandInk }]}>
                      Complete payment only through the marketplace&apos;s official checkout.
                    </Text>
                  </View>

                  {marketplaceListings.map(listing => {
                    const pcfg = PLATFORM_CONFIG[listing.platform];
                    const currSym = CURRENCY_SYMBOLS[(listing.currency as keyof typeof CURRENCY_SYMBOLS)] ?? listing.currency ?? '';
                    return (
                      <View key={listing.id} style={[styles.mktRow, { borderColor: colors.homeLine }]}>
                        <View style={[styles.mktPlatformBadge, { backgroundColor: pcfg.color + '18' }]}>
                          <Feather name={pcfg.icon as keyof typeof Feather.glyphMap} size={12} color={pcfg.color} />
                          <Text style={[styles.mktPlatformLabel, { color: pcfg.color }]}>{pcfg.label}</Text>
                        </View>
                        <View style={styles.mktMeta}>
                          {listing.sellerUsername && <Text style={[styles.mktSeller, { color: colors.homeMuted }]}>@{listing.sellerUsername}</Text>}
                          {listing.askingPrice != null && <Text style={[styles.mktPrice, { color: colors.homeInk }]}>{currSym}{listing.askingPrice.toFixed(2)}</Text>}
                        </View>
                        <TouchableOpacity
                          onPress={() => Linking.openURL(listing.listingUrl)}
                          activeOpacity={0.75}
                          style={[styles.mktViewBtn, { borderColor: colors.homeCoral + '40' }]}
                        >
                          <Text style={[styles.mktViewBtnLabel, { color: colors.homeCoral }]}>View</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  {currentStatus === 'for_trade' && (
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/sell/[pinId]', params: { pinId: pin.id } })}
                      activeOpacity={0.8}
                      style={styles.mktAddRow}
                    >
                      <Feather name="plus" size={13} color={colors.homeCoral} />
                      <Text style={[styles.mktAddLabel, { color: colors.homeCoral }]}>
                        {marketplaceListings.length > 0 ? 'Add your listing' : 'List this pin for sale'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* ── 7. Set / collection progress + other pins — ONE combined section ── */}
          {setTotal > 1 && (
            <View>
              <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>MORE FROM THIS SET</Text>
              <View style={[styles.setCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                <View style={styles.setHeadRow}>
                  <Text numberOfLines={1} style={[styles.setName, { color: colors.homeInk }]}>{pin.collection}</Text>
                  <Text style={[styles.setCount, { color: colors.homeCoralDeep }]}>{setOwnedCount}/{setTotal}</Text>
                </View>
                <SetProgressBar
                  progress={setOwnedCount / setTotal}
                  trackColor={colors.homeLine}
                  fillColor={colors.homeCoral}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.setTiles}>
                  {setmates.slice(0, 12).map(p => (
                    <CompactPinTile
                      key={p.id}
                      pin={p}
                      size={SET_TILE}
                      owned={['owned', 'for_trade'].includes(collection[p.id]?.status ?? '')}
                      onPress={() => router.push({ pathname: '/pin/[id]', params: { id: p.id } })}
                    />
                  ))}
                </ScrollView>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/set/[collection]', params: { collection: pin.collection } })}
                  activeOpacity={0.8}
                  style={styles.seeAllRow}
                >
                  <Text style={[styles.seeAllLabel, { color: colors.homeCoralDeep }]}>See all {setTotal}</Text>
                  <Feather name="chevron-right" size={15} color={colors.homeCoralDeep} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {sourceDisplayName && (
            <Text style={[styles.attribution, { color: colors.homeMuted }]}>
              Pin data · {sourceDisplayName}
            </Text>
          )}
        </View>
      </ScrollView>

      <PrimaryActionBar actions={primaryActions} />

      <QuickAddSheet pin={manageSheetPin} onClose={() => setManageSheetPin(null)} seaGlass />
    </ScreenContainer>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  backLink: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxxl },
  // Hero
  hero: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  backBtn: {
    position: 'absolute',
    left: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  leBadgeWrap: { position: 'absolute', right: spacing.lg, zIndex: 2 },
  imagePage: { alignItems: 'center', justifyContent: 'center' },
  image: {
    borderRadius: radius.xl,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  dots: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3 },
  // Content
  content: { padding: spacing.lg, gap: spacing.lg },
  titleBlock: { gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 24, lineHeight: 29, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, flexShrink: 1 },
  verifiedIcon: { marginTop: 2 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  seedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  seedBannerText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1, lineHeight: 17 },
  description: { fontSize: 13.5, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  // Collection management
  collectionSection: { gap: spacing.sm },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  manageBtnLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter_700Bold' },
  collectionCounters: { flexDirection: 'row', gap: spacing.sm },
  counterPill: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  counterLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  counterValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  collectionHints: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  isoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  isoPillLabel: { fontSize: 10.5, fontFamily: 'Inter_700Bold' },
  boardHint: { fontSize: 11.5, fontFamily: 'Inter_500Medium' },
  // Section label
  sectionLabel: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: spacing.sm },
  // Details (always visible)
  detailsCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  detailsHeading: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 2 },
  // Trading
  tradingCard: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  tradingRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  tradingRowLast: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  tradingIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tradingLabel: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
  tradingMeta: { fontSize: 11.5, fontFamily: 'Inter_400Regular', marginTop: 2 },
  marketplacePanel: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.sm },
  mktWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  mktWarningText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  mktRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm },
  mktPlatformBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  mktPlatformLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  mktMeta: { flex: 1, gap: 2 },
  mktSeller: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  mktPrice: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  mktViewBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  mktViewBtnLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  mktAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  mktAddLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  // Set section
  setCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  setHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  setName: { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold' },
  setCount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  setTiles: { gap: spacing.md, paddingTop: spacing.md, paddingRight: spacing.xs },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing.md, paddingTop: spacing.sm },
  seeAllLabel: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  attribution: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: -spacing.sm },
});
