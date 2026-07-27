import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { getPinImageSource } from '@/utils/pinImage';
import type { CataloguePin } from '@workspace/pin-repository';

type Colors = ReturnType<typeof useColors>;

// ─── Mode ───────────────────────────────────────────────────────────────────

type Mode = 'organise' | 'trade';
type TradeFilter = 'for_trade' | 'duplicates' | 'iso';

// ─── Derived set shape ────────────────────────────────────────────────────────

interface SetInfo {
  collectionName: string;
  /** Every catalogue pin belonging to the set. */
  pins: CataloguePin[];
  totalInCatalogue: number;
  ownedCount: number;
  /** Owned pins first, then the pins still missing. */
  ownedPins: CataloguePin[];
  missingPins: CataloguePin[];
}

// ─── Progress ring ─────────────────────────────────────────────────────────

function ProgressRing({
  pct,
  size,
  stroke,
  track,
  color,
}: {
  pct: number;
  size: number;
  stroke: number;
  track: string;
  color: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${c}`}
        strokeDashoffset={c * (1 - pct / 100)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

// ─── Small pin tile used across shelves ───────────────────────────────────────

function PinTile({
  pin,
  colors,
  onPress,
  badge,
  complete,
}: {
  pin: CataloguePin;
  colors: Colors;
  onPress: () => void;
  badge?: 'trade' | 'iso' | null;
  complete?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        s.pinTile,
        {
          backgroundColor: colors.card,
          borderColor: complete ? colors.owned : colors.border,
          borderWidth: complete ? 3 : 2,
        },
      ]}
    >
      <Image
        source={getPinImageSource(pin)}
        style={[s.pinTileImg, { backgroundColor: complete ? '#E8F5E9' : colors.background }]}
      />
      {badge === 'trade' && (
        <View style={[s.tileBadge, { backgroundColor: colors.forTrade }]}>
          <Feather name="repeat" size={13} color="#FFFFFF" />
        </View>
      )}
      {badge === 'iso' && (
        <View style={[s.tileBadge, { backgroundColor: colors.wanted }]}>
          <Feather name="bookmark" size={13} color="#FFFFFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Ghost (missing) tile ─────────────────────────────────────────────────────

function GhostTile({ colors, onPress }: { colors: Colors; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[s.ghostTile, { borderColor: colors.border, backgroundColor: colors.background }]}
    >
      <View style={[s.ghostSearch, { backgroundColor: colors.secondary }]}>
        <Feather name="search" size={16} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  colors,
  onPress,
  chevron = true,
  complete,
}: {
  title: string;
  subtitle?: string;
  colors: Colors;
  onPress?: () => void;
  chevron?: boolean;
  complete?: boolean;
}) {
  return (
    <View style={s.sectionHeader}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]} numberOfLines={1}>
            {title}
          </Text>
          {complete && <Feather name="check-circle" size={18} color={colors.owned} />}
        </View>
        {subtitle ? (
          <Text style={[s.sectionSub, { color: complete ? colors.owned : colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onPress && (
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.75}
          style={[s.sectionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather
            name={chevron ? 'chevron-right' : 'more-horizontal'}
            size={16}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { collection, counts } = useCollection();
  const { pins: catalogue, ensureCollections } = usePinCatalogue();
  const { customBoards, createBoard, getBoardPins } = useBoards();

  const [mode, setMode] = useState<Mode>('organise');
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>('for_trade');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const nameInputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 40) : insets.top;
  const botPad = Platform.OS === 'web' ? 120 : insets.bottom + 120;

  // ── Status id sets ─────────────────────────────────────────────────────────
  const ownedIds = useMemo(
    () => new Set(Object.values(collection).filter(e => e.status === 'owned').map(e => e.pinId)),
    [collection],
  );
  const forTradeIds = useMemo(
    () => new Set(Object.values(collection).filter(e => e.status === 'for_trade').map(e => e.pinId)),
    [collection],
  );
  const wantedIds = useMemo(
    () => new Set(Object.values(collection).filter(e => e.status === 'wanted').map(e => e.pinId)),
    [collection],
  );

  // Load the full sets for any collection the user owns pins from, so
  // completion totals and ghost slots reflect the whole set — the cached
  // catalogue slice may only contain the owned pins themselves.
  useEffect(() => {
    const names = new Set<string>();
    for (const pin of catalogue) {
      if (ownedIds.has(pin.id) && pin.collection) names.add(pin.collection);
    }
    if (names.size > 0) void ensureCollections([...names]);
  }, [catalogue, ownedIds, ensureCollections]);

  // ── Official sets grouped by pin.collection ─────────────────────────────────
  const officialSets = useMemo<SetInfo[]>(() => {
    const byCollection = new Map<string, CataloguePin[]>();
    for (const pin of catalogue) {
      const list = byCollection.get(pin.collection) ?? [];
      list.push(pin);
      byCollection.set(pin.collection, list);
    }
    return Array.from(byCollection.entries())
      .filter(([, pins]) => pins.some(p => ownedIds.has(p.id)))
      .map(([collectionName, pins]) => {
        const ownedPins = pins.filter(p => ownedIds.has(p.id));
        const missingPins = pins.filter(p => !ownedIds.has(p.id));
        return {
          collectionName,
          pins,
          totalInCatalogue: pins.length,
          ownedCount: ownedPins.length,
          ownedPins,
          missingPins,
        };
      })
      .sort((a, b) => b.ownedCount - a.ownedCount);
  }, [catalogue, ownedIds]);

  // Multi-pin sets (real "sets") vs singles (owned pins in a 1-pin collection)
  const setSections = useMemo(
    () => officialSets.filter(s => s.totalInCatalogue > 1),
    [officialSets],
  );

  const singlePins = useMemo(() => {
    const ids: string[] = [];
    for (const s of officialSets) {
      if (s.totalInCatalogue <= 1) ids.push(...s.ownedPins.map(p => p.id));
    }
    return catalogue.filter(p => ids.includes(p.id));
  }, [officialSets, catalogue]);

  // Hero: the set closest to completion (owned but not finished)
  const heroSet = useMemo(() => {
    const candidates = setSections
      .filter(s => s.ownedCount > 0 && s.ownedCount < s.totalInCatalogue)
      .sort(
        (a, b) => b.ownedCount / b.totalInCatalogue - a.ownedCount / a.totalInCatalogue,
      );
    return candidates[0] ?? null;
  }, [setSections]);

  // ── Trade-mode data ──────────────────────────────────────────────────────────
  const forTradePins = useMemo(() => catalogue.filter(p => forTradeIds.has(p.id)), [catalogue, forTradeIds]);
  const wantedPins = useMemo(() => catalogue.filter(p => wantedIds.has(p.id)), [catalogue, wantedIds]);

  // Duplicates: the app has no quantity tracking yet, so this is genuinely 0.
  // TODO: back with real quantity data once the collection model tracks counts.
  const duplicateCount = 0;
  const duplicatePins = useMemo<CataloguePin[]>(() => [], []);

  const tradeVisiblePins = useMemo(() => {
    if (tradeFilter === 'for_trade') return forTradePins;
    if (tradeFilter === 'iso') return wantedPins;
    return duplicatePins;
  }, [tradeFilter, forTradePins, wantedPins, duplicatePins]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const goPin = (id: string) => router.push({ pathname: '/pin/[id]', params: { id } });
  const goSet = (collectionName: string) =>
    router.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: '/set/[collection]' as any,
      params: { collection: collectionName },
    });
  const goBoard = (id: string) => router.push({ pathname: '/board/[id]', params: { id } });
  const goSearch = () => router.push('/search');
  const goScan = () => router.push('/(tabs)/scan');
  const shareTradeList = () => {
    // Trading & discovery live on the Community tab.
    router.push('/(tabs)/community');
  };

  const switchMode = (m: Mode) => {
    Haptics.selectionAsync();
    setMode(m);
  };

  const handleCreateBoard = () => {
    const name = newBoardName.trim();
    if (!name) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const board = createBoard(name);
    setNewBoardName('');
    setCreateModalVisible(false);
    goBoard(board.id);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderShelf = (set: SetInfo) => {
    const pct = Math.round((set.ownedCount / set.totalInCatalogue) * 100);
    const complete = set.ownedCount === set.totalInCatalogue;
    return (
      <View key={set.collectionName} style={s.shelf}>
        <SectionHeader
          title={set.collectionName}
          subtitle={
            complete
              ? 'COMPLETE SET'
              : `${set.ownedCount} of ${set.totalInCatalogue} • ${pct}%`
          }
          colors={colors}
          onPress={() => goSet(set.collectionName)}
          complete={complete}
        />
        {/* Progress bar */}
        <View style={[s.progressTrack, { backgroundColor: colors.secondary }]}>
          <LinearGradient
            colors={
              complete
                ? [colors.owned, colors.owned]
                : [colors.primaryGradientStart, colors.primaryGradientEnd]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[s.progressFill, { width: `${Math.max(pct, 4)}%` as any }]}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelfRow}>
          {set.ownedPins.map(p => (
            <PinTile
              key={p.id}
              pin={p}
              colors={colors}
              onPress={() => goPin(p.id)}
              badge={forTradeIds.has(p.id) ? 'trade' : null}
              complete={complete}
            />
          ))}
          {set.missingPins.map(p => (
            <GhostTile key={p.id} colors={colors} onPress={() => goPin(p.id)} />
          ))}
        </ScrollView>
      </View>
    );
  };

  // ── Empty portfolio ──────────────────────────────────────────────────────────
  const portfolioEmpty = ownedIds.size === 0 && setSections.length === 0 && singlePins.length === 0;

  // ── Trade stat tiles ─────────────────────────────────────────────────────────
  const statTiles: Array<{
    key: TradeFilter;
    label: string;
    value: number;
    color: string;
    bg: string;
    icon: keyof typeof Feather.glyphMap;
    wide?: boolean;
  }> = [
    {
      key: 'for_trade',
      label: 'For Trade',
      value: counts.forTrade,
      color: colors.forTrade,
      bg: colors.forTrade + '1F',
      icon: 'repeat',
    },
    {
      key: 'duplicates',
      label: 'Duplicates',
      value: duplicateCount,
      color: colors.accent,
      bg: colors.accent + '1F',
      icon: 'copy',
    },
    {
      key: 'iso',
      label: 'In Search Of (ISO)',
      value: counts.wanted,
      color: colors.wanted,
      bg: colors.wanted + '1F',
      icon: 'bookmark',
      wide: true,
    },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.card, borderColor: colors.border, paddingTop: topPad + 14 }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>My Collection</Text>
            <Text style={[s.headerSub, { color: colors.mutedForeground }]}>
              {counts.owned} owned • {counts.wanted} ISO • {counts.forTrade} trade
            </Text>
          </View>
          <TouchableOpacity
            onPress={goSearch}
            activeOpacity={0.8}
            style={[s.searchBtn, { backgroundColor: colors.secondary }]}
          >
            <Feather name="search" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Mode switch ── */}
        <View style={[s.switch, { backgroundColor: colors.secondary }]}>
          {(['organise', 'trade'] as const).map(m => {
            const active = mode === m;
            const label = m === 'organise' ? 'My Portfolio' : 'My Showcase';
            if (active) {
              return (
                <LinearGradient
                  key={m}
                  colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.switchPill}
                >
                  <TouchableOpacity
                    onPress={() => switchMode(m)}
                    activeOpacity={0.9}
                    style={s.switchTap}
                  >
                    <Text style={[s.switchLabel, { color: '#FFFFFF' }]}>{label}</Text>
                  </TouchableOpacity>
                </LinearGradient>
              );
            }
            return (
              <TouchableOpacity
                key={m}
                onPress={() => switchMode(m)}
                activeOpacity={0.75}
                style={[s.switchPill, s.switchTap]}
              >
                <Text style={[s.switchLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: botPad }}
      >
        {mode === 'organise' ? (
          <>
            {portfolioEmpty ? (
              <View style={s.emptyWrap}>
                <View style={[s.emptyIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name="grid" size={30} color={colors.primary} />
                </View>
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>Your collection is empty</Text>
                <Text style={[s.emptySub, { color: colors.mutedForeground }]}>
                  Scan a pin or search the catalogue to start marking pins as Owned, ISO, or For Trade.
                </Text>
                <View style={s.emptyGhostRow}>
                  {[0, 1, 2].map(i => (
                    <View
                      key={i}
                      style={[s.ghostTile, { borderColor: colors.border, backgroundColor: colors.card }]}
                    >
                      <View style={[s.ghostSearch, { backgroundColor: colors.secondary }]}>
                        <Feather name="plus" size={16} color={colors.primary} />
                      </View>
                    </View>
                  ))}
                </View>
                <TouchableOpacity onPress={goScan} activeOpacity={0.9} style={s.emptyCtaWrap}>
                  <LinearGradient
                    colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.emptyCta}
                  >
                    <Feather name="camera" size={16} color="#FFFFFF" />
                    <Text style={s.emptyCtaLabel}>Scan a Pin</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* ── My Boards (top) ── */}
                <View style={[s.shelf, { paddingTop: 20 }]}>
                  <SectionHeader
                    title="My Boards"
                    subtitle={
                      customBoards.length > 0
                        ? `${customBoards.length} custom ${customBoards.length === 1 ? 'board' : 'boards'}`
                        : 'Organise pins your way'
                    }
                    colors={colors}
                    onPress={() => {
                      setNewBoardName('');
                      setCreateModalVisible(true);
                    }}
                    chevron={false}
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.shelfRow}
                  >
                    {customBoards.map(b => {
                      const boardPins = getBoardPins(b);
                      const thumbPin =
                        (b.thumbnailPinId && boardPins.find(p => p.id === b.thumbnailPinId)) ||
                        boardPins[0];
                      return (
                        <TouchableOpacity
                          key={b.id}
                          activeOpacity={0.85}
                          onPress={() => goBoard(b.id)}
                          style={[s.boardTile, { backgroundColor: colors.card, borderColor: colors.border }]}
                        >
                          {thumbPin ? (
                            <Image source={getPinImageSource(thumbPin)} style={s.boardTileImg} />
                          ) : (
                            <View style={[s.boardTileEmpty, { backgroundColor: colors.secondary }]}>
                              <Feather name="grid" size={22} color={colors.primary} />
                            </View>
                          )}
                          <Text
                            style={[s.boardTileName, { color: colors.foreground }]}
                            numberOfLines={1}
                          >
                            {b.name}
                          </Text>
                          <Text style={[s.boardTileCount, { color: colors.mutedForeground }]}>
                            {boardPins.length} {boardPins.length === 1 ? 'pin' : 'pins'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setNewBoardName('');
                        setCreateModalVisible(true);
                      }}
                      style={[s.boardTile, s.boardTileNew, { borderColor: colors.border }]}
                    >
                      <View style={[s.boardTileEmpty, { backgroundColor: colors.secondary }]}>
                        <Feather name="plus" size={22} color={colors.primary} />
                      </View>
                      <Text style={[s.boardTileName, { color: colors.primary }]}>New Board</Text>
                      <Text style={[s.boardTileCount, { color: colors.mutedForeground }]}> </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>

                {/* ── Hero: Nearly Complete ── */}
                {heroSet && (
                  <View style={s.heroWrap}>
                    <View style={s.heroLabelRow}>
                      <Feather name="target" size={15} color={colors.primary} />
                      <Text style={[s.heroLabel, { color: colors.primary }]}>NEARLY COMPLETE</Text>
                    </View>
                    <TouchableOpacity activeOpacity={0.9} onPress={() => goSet(heroSet.collectionName)}>
                      <LinearGradient
                        colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.heroCard}
                      >
                        <View style={s.heroTopRow}>
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={s.heroSetName} numberOfLines={2}>
                              {heroSet.collectionName}
                            </Text>
                            <Text style={s.heroSetSub}>
                              {heroSet.ownedCount} of {heroSet.totalInCatalogue} pins collected
                            </Text>
                          </View>
                          <View style={s.heroRing}>
                            <ProgressRing
                              pct={Math.round((heroSet.ownedCount / heroSet.totalInCatalogue) * 100)}
                              size={54}
                              stroke={5}
                              track="rgba(255,255,255,0.3)"
                              color="#FFFFFF"
                            />
                            <View style={s.heroRingLabel}>
                              <Text style={s.heroRingPct}>
                                {Math.round((heroSet.ownedCount / heroSet.totalInCatalogue) * 100)}%
                              </Text>
                            </View>
                          </View>
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={s.heroPinRow}
                        >
                          {heroSet.ownedPins.map(p => (
                            <TouchableOpacity
                              key={p.id}
                              activeOpacity={0.85}
                              onPress={() => goPin(p.id)}
                              style={s.heroPin}
                            >
                              <Image source={getPinImageSource(p)} style={s.heroPinImg} />
                            </TouchableOpacity>
                          ))}
                          {heroSet.missingPins.slice(0, 4).map(p => (
                            <TouchableOpacity
                              key={p.id}
                              activeOpacity={0.7}
                              onPress={() => goPin(p.id)}
                              style={s.heroGhost}
                            >
                              <Text style={s.heroGhostMark}>?</Text>
                              <Text style={s.heroGhostLabel}>ISO</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ── Set shelves ── */}
                {setSections.map(renderShelf)}

                {/* ── Singles ── */}
                {singlePins.length > 0 && (
                  <View style={s.shelf}>
                    <SectionHeader
                      title="Singles"
                      subtitle={`${singlePins.length} loose ${singlePins.length === 1 ? 'pin' : 'pins'}`}
                      colors={colors}
                      chevron={false}
                    />
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={s.shelfRow}
                    >
                      {singlePins.map(p => (
                        <PinTile
                          key={p.id}
                          pin={p}
                          colors={colors}
                          onPress={() => goPin(p.id)}
                          badge={forTradeIds.has(p.id) ? 'trade' : null}
                        />
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* ── TRADE MODE ── */}
            <View style={s.tradeHead}>
              <View style={s.tradeBigRow}>
                <Text style={[s.tradeBigNum, { color: colors.foreground }]}>{counts.forTrade}</Text>
                <Text style={[s.tradeBigLabel, { color: colors.mutedForeground }]}>pins for trade</Text>
              </View>

              {/* Stat tiles as filters */}
              <View style={s.statGrid}>
                {statTiles.map(t => {
                  const active = tradeFilter === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setTradeFilter(t.key);
                      }}
                      style={[
                        s.statTile,
                        t.wide && s.statTileWide,
                        {
                          backgroundColor: t.bg,
                          borderColor: t.color,
                          borderWidth: active ? 3 : 2,
                          opacity: active ? 1 : 0.65,
                        },
                      ]}
                    >
                      <View style={s.statTileTop}>
                        <View style={[s.statIcon, { backgroundColor: colors.card, borderColor: t.color }]}>
                          <Feather name={t.icon} size={16} color={t.color} />
                        </View>
                        <Text style={[s.statValue, { color: t.color }]}>{t.value}</Text>
                      </View>
                      <Text style={[s.statLabel, { color: t.color }]}>{t.label.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Trade pile / selected filter grid */}
            <View style={s.tradeSection}>
              <SectionHeader
                title={
                  tradeFilter === 'for_trade'
                    ? 'Your Trade Pile'
                    : tradeFilter === 'iso'
                      ? 'In Search Of'
                      : 'Duplicates'
                }
                subtitle={`${tradeVisiblePins.length} ${
                  tradeVisiblePins.length === 1 ? 'pin' : 'pins'
                }`}
                colors={colors}
              />
              {tradeVisiblePins.length === 0 ? (
                <View style={[s.tradeEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather
                    name={
                      tradeFilter === 'for_trade' ? 'repeat' : tradeFilter === 'iso' ? 'bookmark' : 'copy'
                    }
                    size={24}
                    color={colors.mutedForeground}
                  />
                  <Text style={[s.tradeEmptyText, { color: colors.mutedForeground }]}>
                    {tradeFilter === 'for_trade'
                      ? 'Mark pins as For Trade to build your trade pile.'
                      : tradeFilter === 'iso'
                        ? "Mark pins as ISO to track what you're hunting."
                        : 'Duplicate tracking arrives once quantities are supported.'}
                  </Text>
                </View>
              ) : (
                <View style={s.photoGrid}>
                  {tradeVisiblePins.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.85}
                      onPress={() => goPin(p.id)}
                      style={[
                        s.photoTile,
                        {
                          backgroundColor: colors.card,
                          borderColor:
                            tradeFilter === 'iso'
                              ? colors.wanted
                              : tradeFilter === 'duplicates'
                                ? colors.accent
                                : colors.forTrade,
                        },
                      ]}
                    >
                      <Image source={getPinImageSource(p)} style={s.photoImg} />
                      <View
                        style={[
                          s.photoTag,
                          {
                            backgroundColor: colors.card,
                            borderColor:
                              tradeFilter === 'iso'
                                ? colors.wanted + '40'
                                : tradeFilter === 'duplicates'
                                  ? colors.accent + '40'
                                  : colors.forTrade + '40',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            s.photoTagText,
                            {
                              color:
                                tradeFilter === 'iso'
                                  ? colors.wanted
                                  : tradeFilter === 'duplicates'
                                    ? colors.accent
                                    : colors.forTrade,
                            },
                          ]}
                        >
                          {tradeFilter === 'iso' ? 'ISO' : tradeFilter === 'duplicates' ? 'DUPE' : 'FOR TRADE'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Share CTA */}
            <View style={s.tradeSection}>
              <LinearGradient
                colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.ctaCard}
              >
                <View style={s.ctaTop}>
                  <View style={s.ctaIcon}>
                    <Feather name="share-2" size={22} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.ctaTitle}>Share Your Trade List</Text>
                    <Text style={s.ctaSub}>Find collectors nearby</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={shareTradeList}
                  activeOpacity={0.9}
                  style={[s.ctaButton, { backgroundColor: colors.card }]}
                >
                  <Feather name="share-2" size={16} color={colors.primary} />
                  <Text style={[s.ctaButtonText, { color: colors.primary }]}>Share Trade Pile</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Floating add button ── */}
      <TouchableOpacity
        onPress={goScan}
        activeOpacity={0.9}
        style={[s.fab, { bottom: botPad - 60 }]}
      >
        <LinearGradient
          colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.fabInner}
        >
          <Feather name="plus" size={30} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Create Board Modal ── */}
      <Modal
        visible={createModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCreateModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[s.createModal, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}
          >
            <Text style={[s.createModalTitle, { color: colors.foreground }]}>New Board</Text>
            <Text style={[s.createModalSub, { color: colors.mutedForeground }]}>
              Give your board a name, such as "2026 Wave A Hidden Mickeys" or "Tiana Collection".
            </Text>
            <TextInput
              ref={nameInputRef}
              value={newBoardName}
              onChangeText={setNewBoardName}
              placeholder="Board name…"
              placeholderTextColor={colors.mutedForeground}
              style={[
                s.createInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateBoard}
              maxLength={60}
            />
            <View style={s.createActions}>
              <TouchableOpacity
                onPress={() => setCreateModalVisible(false)}
                style={[s.createCancelBtn, { borderColor: colors.border, borderRadius: colors.radius - 4 }]}
                activeOpacity={0.75}
              >
                <Text style={[s.createCancelLabel, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateBoard}
                style={[
                  s.createConfirmBtn,
                  { backgroundColor: newBoardName.trim() ? colors.primary : colors.muted, borderRadius: colors.radius - 4 },
                ]}
                activeOpacity={0.85}
                disabled={!newBoardName.trim()}
              >
                <Text
                  style={[
                    s.createConfirmLabel,
                    { color: newBoardName.trim() ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  Create
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    zIndex: 20,
    shadowColor: '#E07800',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switch: {
    flexDirection: 'row',
    borderRadius: 28,
    padding: 5,
    gap: 4,
  },
  switchPill: { flex: 1, borderRadius: 24 },
  switchTap: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  switchLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  // Board tiles
  boardTile: {
    width: 118,
    borderRadius: 20,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  boardTileNew: { borderStyle: 'dashed', backgroundColor: 'transparent', justifyContent: 'center' },
  boardTileImg: { width: 88, height: 88, borderRadius: 16, resizeMode: 'cover', marginBottom: 8 },
  boardTileEmpty: {
    width: 88,
    height: 88,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  boardTileName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', maxWidth: 98 },
  boardTileCount: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 2 },

  // Hero
  heroWrap: { paddingHorizontal: 20, paddingTop: 20 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  heroLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  heroCard: {
    borderRadius: 32,
    padding: 22,
    shadowColor: '#E07800',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  heroSetName: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFFFFF', lineHeight: 24 },
  heroSetSub: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFF0D0', marginTop: 4 },
  heroRing: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  heroRingLabel: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  heroRingPct: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  heroPinRow: { gap: 12, paddingRight: 4 },
  heroPin: {
    width: 76,
    height: 76,
    borderRadius: 24,
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroPinImg: { width: '100%', height: '100%', borderRadius: 18, resizeMode: 'cover' },
  heroGhost: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGhostMark: { fontSize: 22, fontFamily: 'Inter_700Bold', color: 'rgba(255,255,255,0.8)' },
  heroGhostLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1.5,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  sectionSub: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  sectionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shelf
  shelf: { paddingLeft: 20, paddingRight: 20, marginTop: 24 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 14 },
  progressFill: { height: '100%', borderRadius: 4 },
  shelfRow: { gap: 12, paddingRight: 20, paddingVertical: 2 },

  // Pin tile
  pinTile: {
    width: 92,
    height: 92,
    borderRadius: 24,
    padding: 8,
    shadowColor: '#E07800',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pinTileImg: { width: '100%', height: '100%', borderRadius: 18, resizeMode: 'cover' },
  tileBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },

  // Ghost tile
  ghostTile: {
    width: 92,
    height: 92,
    borderRadius: 24,
    borderWidth: 3,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostSearch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // New board button
  newBoardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 24,
  },
  newBoardLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  // Empty portfolio
  emptyWrap: { paddingHorizontal: 32, paddingTop: 48, alignItems: 'center' },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 19, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyGhostRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  emptyCtaWrap: { marginTop: 24 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 20,
  },
  emptyCtaLabel: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },

  // Trade head
  tradeHead: { paddingHorizontal: 20, paddingTop: 24 },
  tradeBigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 22 },
  tradeBigNum: { fontSize: 58, fontFamily: 'Inter_700Bold', letterSpacing: -2, lineHeight: 60 },
  tradeBigLabel: { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 24,
    padding: 16,
    gap: 10,
  },
  statTileWide: { flexBasis: '100%' },
  statTileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },

  // Trade sections
  tradeSection: { paddingHorizontal: 20, marginTop: 28 },
  tradeEmpty: {
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  tradeEmptyText: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center', lineHeight: 19 },

  // Photo grid
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoTile: {
    flexBasis: '30%',
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 3,
    padding: 8,
    overflow: 'hidden',
  },
  photoImg: { width: '100%', height: '100%', borderRadius: 16, resizeMode: 'cover' },
  photoTag: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 4,
    alignItems: 'center',
  },
  photoTagText: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1 },

  // CTA
  ctaCard: {
    borderRadius: 32,
    padding: 22,
    shadowColor: '#E07800',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  ctaTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  ctaIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  ctaSub: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FFF0D0', marginTop: 2 },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 20,
  },
  ctaButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  // FAB
  fab: {
    position: 'absolute',
    right: 22,
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: '#E07800',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    zIndex: 30,
  },
  fabInner: {
    flex: 1,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },

  // Create modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  createModal: { width: '100%', padding: 20, gap: 14, borderWidth: 1 },
  createModalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  createModalSub: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  createInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  createActions: { flexDirection: 'row', gap: 10 },
  createCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderWidth: 1 },
  createCancelLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  createConfirmBtn: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  createConfirmLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
