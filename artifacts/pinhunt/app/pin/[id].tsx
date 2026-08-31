import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { MarketValueSection } from '@/components/MarketValueSection';
import { PLATFORM_CONFIG, CURRENCY_SYMBOLS } from '@/utils/marketplaceUrl';
import type { CollectionStatus } from '@/types/pin';
import type { CataloguePin, ExternalSaleListing } from '@workspace/pin-repository';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Array<{
  status: CollectionStatus;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}> = [
  { status: 'owned', label: 'Owned', icon: 'check-circle' },
  { status: 'wanted', label: 'ISO', icon: 'bookmark' },
  { status: 'for_trade', label: 'For Trade', icon: 'repeat' },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getEntry, setStatus, markViewed } = useCollection();
  const { allBoards, customBoards, createBoard, addPinToBoard, removePinFromBoard } = useBoards();
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
    if (pinLoading) {
      return (
        <View style={[styles.notFound, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
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
          {pin.limitedEditionSize != null && pin.limitedEditionSize > 0 ? (
            <View style={[styles.leBadge, { backgroundColor: colors.gold }]}>
              <Text style={styles.leLabel}>LE {pin.limitedEditionSize.toLocaleString()}</Text>
            </View>
          ) : null}
        </View>

        {/* ── About this Pin (directly under image) ── */}
        {pin.description ? (
          <View style={[styles.aboutBanner, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.aboutTitle, { color: colors.foreground }]}>About this Pin</Text>
            <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>{pin.description}</Text>
          </View>
        ) : null}

        <View style={styles.content}>
          {/* ── Title & Brand ── */}
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.foreground }]}>{pin.title}</Text>
              <View style={styles.chipRow}>
                <View style={[styles.brandChip, { backgroundColor: colors.accent }]}>
                  <Text style={styles.brandChipLabel}>{pin.brand}</Text>
                </View>
                {pin.catalogueStatus === 'trusted' && (
                  <View style={[styles.verifiedChip, { backgroundColor: colors.owned + '16', borderColor: colors.owned + '50' }]}>
                    <Feather name="check-circle" size={11} color={colors.owned} />
                    <Text style={[styles.verifiedChipLabel, { color: colors.owned }]}>Verified catalogue pin</Text>
                  </View>
                )}
              </View>
            </View>
            {pin.isNewRelease && (
              <View style={[styles.newChip, { backgroundColor: colors.primary }]}>
                <Text style={styles.newChipLabel}>NEW</Text>
              </View>
            )}
          </View>

          {/* ── Seed record notice ── */}
          {pin.isSeedRecord && (
            <View style={[styles.seedBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
              <Feather name="alert-circle" size={13} color="#92400E" />
              <Text style={[styles.seedBannerText, { color: '#92400E' }]}>
                Community verification needed — details may be incomplete
              </Text>
            </View>
          )}

          {/* ── Inventory Status Buttons ── */}
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

          {/* ── Add to Board / Collection ── */}
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
              Add to Collection
              {pinBoardIds.size > 0 && (
                <Text style={{ color: colors.mutedForeground }}>
                  {` · ${pinBoardIds.size} board${pinBoardIds.size !== 1 ? 's' : ''}`}
                </Text>
              )}
            </Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={styles.addBoardChevron} />
          </TouchableOpacity>

          {/* ── Identity / Catalogue Metadata ── */}
          <View
            style={[
              styles.metaCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <MetaRow label="Series / Set" value={pin.collection} colors={colors} />
            {pin.characters.length > 0 && (
              <MetaRow label="Characters" value={pin.characters.join(', ')} colors={colors} />
            )}
            {pin.origin ? (
              <MetaRow label="Release Location" value={pin.origin} colors={colors} />
            ) : null}
            {pin.edition ? (
              <MetaRow label="Edition Type" value={pin.edition} colors={colors} />
            ) : null}
            {pin.releaseDate ? (
              <MetaRow label="Release Date" value={formatDate(pin.releaseDate)} colors={colors} />
            ) : pin.releaseYear ? (
              <MetaRow label="Release Year" value={String(pin.releaseYear)} colors={colors} />
            ) : null}
            {pin.retailPriceGBP != null ? (
              <MetaRow label="Retail Price" value={`£${pin.retailPriceGBP.toFixed(2)}`} colors={colors} />
            ) : null}
            {pin.externalIdentifiers?.pinpicsId ? (
              <MetaRow label="Pinpics ID" value={pin.externalIdentifiers.pinpicsId} colors={colors} />
            ) : null}
            {pin.externalIdentifiers?.sku ? (
              <MetaRow label="SKU / Ref" value={pin.externalIdentifiers.sku} colors={colors} />
            ) : null}
            {pin.limitedEditionSize ? (
              <MetaRow label="Edition Size" value={pin.limitedEditionSize.toLocaleString()} colors={colors} last />
            ) : (
              <MetaRow label="Edition Size" value="Open Edition" colors={colors} last />
            )}
          </View>

          {/* ── Valuation ── */}
          <View>
            <SectionTitle title="Market Valuation" colors={colors} />
            {pin.estimatedValueGBP != null ? (
              <View
                style={[
                  styles.valueCard,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <View style={styles.valueMain}>
                  <Text style={[styles.valueAmount, { color: colors.foreground }]}>
                    £{pin.estimatedValueGBP.toFixed(2)}
                  </Text>
                  <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>
                    catalogue estimate · GBP
                  </Text>
                </View>
                <View style={[styles.valueDivider, { backgroundColor: colors.border }]} />
                <View style={[styles.valueNote, { gap: 6 }]}>
                  <Feather name="info" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.valueDisclaimer, { color: colors.mutedForeground }]}>
                    This is a catalogue estimate, not a live market price. Actual sale prices vary with condition, seller, and demand.
                  </Text>
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.valuationEmpty,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Feather name="bar-chart-2" size={24} color={colors.mutedForeground} />
                <Text style={[styles.valuationEmptyTitle, { color: colors.foreground }]}>
                  Market data not available yet
                </Text>
                <Text style={[styles.valuationEmptyText, { color: colors.mutedForeground }]}>
                  We don't have pricing data for this pin yet. Check eBay, Vinted, or PinPics for recent sales.
                </Text>
              </View>
            )}
          </View>

          {/* ── eBay market value ── */}
          <View>
            <SectionTitle title="Estimated Market Value" colors={colors} />
            <MarketValueSection pinId={pin.id} />
          </View>

          {/* ── Pins in this Set ── */}
          {setmates.length > 0 && (
            <View>
              <SectionTitle
                title={`More from ${pin.collection}`}
                subtitle={`${setmates.length} other ${setmates.length === 1 ? 'pin' : 'pins'} in this set`}
                colors={colors}
                actionLabel="View Set"
                onAction={() =>
                  router.push({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    pathname: '/set/[collection]' as any,
                    params: { collection: pin.collection },
                  })
                }
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.setmatesScroll}
              >
                {setmates.slice(0, 10).map(p => (
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

          {/* ── Community Availability ── */}
          <View>
            <SectionTitle
              title="Community"
              colors={colors}
            />
            <View
              style={[
                styles.communityCard,
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              {/* For Trade count */}
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/traders/[pinId]', params: { pinId: pin.id } })}
                activeOpacity={0.85}
                style={[styles.communityRow, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.communityIconWrap, { backgroundColor: colors.forTrade + '20' }]}>
                  <Feather name="repeat" size={16} color={colors.forTrade} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.communityLabel, { color: colors.foreground }]}>For Trade</Text>
                  <Text style={[styles.communityMeta, { color: colors.mutedForeground }]}>
                    {traderCount > 0
                      ? `${traderCount} collector${traderCount !== 1 ? 's' : ''} offering this`
                      : 'No traders yet — be the first'}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Marketplace listings count */}
              <View style={styles.communityRowLast}>
                <View style={[styles.communityIconWrap, { backgroundColor: colors.primary + '20' }]}>
                  <Feather name="tag" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.communityLabel, { color: colors.foreground }]}>For Sale</Text>
                  <Text style={[styles.communityMeta, { color: colors.mutedForeground }]}>
                    {marketplaceListings.length > 0
                      ? `${marketplaceListings.length} active listing${marketplaceListings.length !== 1 ? 's' : ''}`
                      : 'No listings yet'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── Marketplace Listings ──
              De-emphasised for V1: trading is the primary action for a
              for_trade pin, so this section no longer prompts an empty
              "list it for sale" state, and the create-listing entry points
              have moved to Profile → My Listings. It still shows existing
              listings (if any) as read-only pricing context. */}
          {marketplaceListings.length > 0 && (
            <View>
              <SectionTitle
                title="Marketplace Listings"
                subtitle={`${marketplaceListings.length} active listing${marketplaceListings.length !== 1 ? 's' : ''}`}
                colors={colors}
              />

              {/* Safety notice */}
              <View style={[styles.mktWarning, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <Feather name="shield" size={12} color="#92400E" />
                <Text style={styles.mktWarningText}>
                  Complete payment only through the marketplace's official checkout. Payments arranged outside the marketplace may not be protected.
                </Text>
              </View>

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
              </View>
            </View>
          )}

          {/* Selling is secondary to trading for V1 — a small, muted link
              rather than a prominent CTA. Still fully functional. */}
          {currentStatus === 'for_trade' && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/sell/[pinId]', params: { pinId: pin.id } })}
              activeOpacity={0.7}
              style={styles.sellSecondaryLink}
            >
              <Text style={[styles.sellSecondaryLinkText, { color: colors.mutedForeground }]}>
                Prefer to sell instead? List this pin for sale
              </Text>
            </TouchableOpacity>
          )}
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

          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add to Collection</Text>
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
                      {board.isCustom ? 'Custom board' : 'Official set'} · {board.pinIds.length} pin{board.pinIds.length !== 1 ? 's' : ''}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  colors: ColorsType;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={[styles.sectionTitleWrap, actionLabel ? { flexDirection: 'row', alignItems: 'center' } : {}]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        )}
      </View>
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={[styles.sectionAction, { color: colors.primary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verifiedChipLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  brandChipLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  newChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 2 },
  newChipLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },
  seedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  seedBannerText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1, lineHeight: 17 },
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
  sectionAction: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  // Valuation card
  valueCard: {
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
    gap: 12,
  },
  valueMain: { alignItems: 'center', gap: 4 },
  valueAmount: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  valueLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  valueDivider: { height: StyleSheet.hairlineWidth },
  valueNote: { flexDirection: 'row', alignItems: 'flex-start' },
  valueDisclaimer: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  // Valuation empty state
  valuationEmpty: {
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  valuationEmptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  valuationEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center' },
  // Community card
  communityCard: { borderWidth: 1, overflow: 'hidden' },
  communityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  communityRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  communityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  communityMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  // Pins in this set
  setmatesScroll: { gap: 12, paddingRight: 4 },
  setmateCard: { width: 155 },
  // Marketplace listings section
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
  sellSecondaryLink: { alignItems: 'center', paddingVertical: 16 },
  sellSecondaryLinkText: { fontSize: 12.5, fontFamily: 'Inter_400Regular' },
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
  mktMeta: { flex: 1, gap: 2 },
  mktSeller: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  mktPrice: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  mktViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  mktViewBtnLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  mktAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mktAddLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
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
});
