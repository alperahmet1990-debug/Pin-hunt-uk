import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
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
import { PinCard } from '@/components/PinCard';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { BoardCardHorizontal } from '@/components/BoardCard';
import { getPinImageSource } from '@/utils/pinImage';
import type { CataloguePin } from '@workspace/pin-repository';

// ─── View types ───────────────────────────────────────────────────────────────

type CollectionView =
  | 'all'
  | 'sets'
  | 'collections'
  | 'duplicates'
  | 'for_trade'
  | 'for_sale'
  | 'iso';

type ViewMode = 'grid' | 'list';

const VIEWS: Array<{ key: CollectionView; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'all', label: 'All Pins', icon: 'layers' },
  { key: 'sets', label: 'Official Sets', icon: 'package' },
  { key: 'collections', label: 'My Boards', icon: 'grid' },
  { key: 'duplicates', label: 'Duplicates', icon: 'copy' },
  { key: 'for_trade', label: 'For Trade', icon: 'repeat' },
  { key: 'for_sale', label: 'For Sale', icon: 'tag' },
  { key: 'iso', label: 'ISO', icon: 'bookmark' },
];

// ─── Set card for Official Sets view ──────────────────────────────────────────

interface SetInfo {
  collectionName: string;
  totalInCatalogue: number;
  ownedCount: number;
  samplePins: CataloguePin[];
}

function SetCard({ info, colors, onPress }: { info: SetInfo; colors: ReturnType<typeof import('@/hooks/useColors').useColors>; onPress: () => void }) {
  const pct = info.totalInCatalogue > 0
    ? Math.round((info.ownedCount / info.totalInCatalogue) * 100)
    : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        setStyles.card,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      {/* Thumbnail strip */}
      <View style={setStyles.thumbRow}>
        {info.samplePins.slice(0, 4).map(p => (
          <Image
            key={p.id}
            source={getPinImageSource(p)}
            style={[setStyles.thumb, { borderRadius: colors.radius - 4 }]}
          />
        ))}
        {info.samplePins.length === 0 && (
          <View style={[setStyles.thumbEmpty, { backgroundColor: colors.secondary, borderRadius: colors.radius - 4 }]}>
            <Feather name="image" size={18} color={colors.mutedForeground} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={setStyles.info}>
        <Text style={[setStyles.name, { color: colors.foreground }]} numberOfLines={2}>
          {info.collectionName}
        </Text>
        <Text style={[setStyles.owned, { color: colors.mutedForeground }]}>
          {info.ownedCount} / {info.totalInCatalogue} owned
        </Text>

        {/* Progress bar */}
        <View style={[setStyles.progressTrack, { backgroundColor: colors.secondary }]}>
          <View
            style={[
              setStyles.progressFill,
              {
                backgroundColor: pct === 100 ? colors.owned : colors.primary,
                width: `${pct}%` as any,
              },
            ]}
          />
        </View>
        <Text style={[setStyles.pct, { color: pct === 100 ? colors.owned : colors.mutedForeground }]}>
          {pct}% complete{pct === 100 ? ' ✓' : ''}
        </Text>
      </View>

      <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

// ─── Progress ring for Nearly Complete cards ─────────────────────────────────

function ProgressRing({ pct, size, stroke, track, color }: { pct: number; size: number; stroke: number; track: string; color: string }) {
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

// ─── Gallery tile for the pin grid ────────────────────────────────────────────

function GalleryTile({
  pin,
  statusColor,
  colors,
  onPress,
}: {
  pin: CataloguePin;
  statusColor: string | null;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={galleryStyles.tile}>
      <Image source={getPinImageSource(pin)} style={galleryStyles.image} />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.62)']}
        style={galleryStyles.scrim}
      />
      {statusColor && (
        <View style={[galleryStyles.dot, { backgroundColor: statusColor }]} />
      )}
      <View style={galleryStyles.caption}>
        <Text style={galleryStyles.captionSet} numberOfLines={1}>
          {pin.collection.toUpperCase()}
        </Text>
        <Text style={galleryStyles.captionTitle} numberOfLines={1}>
          {pin.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const galleryStyles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#00000010',
  },
  image: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, resizeMode: 'cover' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  caption: { position: 'absolute', left: 10, right: 10, bottom: 8 },
  captionSet: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 8,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginBottom: 1,
  },
  captionTitle: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});

const setStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    gap: 12,
  },
  thumbRow: { flexDirection: 'row', gap: 4 },
  thumb: { width: 44, height: 44, resizeMode: 'cover' },
  thumbEmpty: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  owned: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  pct: { fontSize: 11, fontFamily: 'Inter_500Medium' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { collection, counts } = useCollection();
  // `pins` already includes any collection pins pulled in via ensurePins
  // (see CollectionContext), so owned pins render even when they fall
  // outside the cached catalogue slice.
  const { pins: catalogue } = usePinCatalogue();
  const { allBoards, customBoards, createBoard, getBoardPins, suggestedBoards } = useBoards();

  const [view, setView] = useState<CollectionView>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const nameInputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  // ── Derived collection data ──────────────────────────────────────────────────

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

  // All pins with any status
  const allStatusPins = useMemo(() => {
    const ids = new Set([...ownedIds, ...forTradeIds, ...wantedIds]);
    return catalogue.filter(p => ids.has(p.id));
  }, [catalogue, ownedIds, forTradeIds, wantedIds]);

  // Estimated value — only sum pins that actually have estimatedValueGBP set
  const estimatedValue = useMemo(() => {
    let sum = 0;
    let hasAny = false;
    for (const id of ownedIds) {
      const pin = catalogue.find(p => p.id === id);
      if (pin?.estimatedValueGBP != null) {
        sum += pin.estimatedValueGBP;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }, [ownedIds, catalogue]);

  // Official sets — grouped by pin.collection, from catalogue (all pins in set, not just owned)
  const officialSets = useMemo<SetInfo[]>(() => {
    const byCollection = new Map<string, CataloguePin[]>();
    for (const pin of catalogue) {
      const list = byCollection.get(pin.collection) ?? [];
      list.push(pin);
      byCollection.set(pin.collection, list);
    }
    // Only show sets where the user owns at least one pin
    return Array.from(byCollection.entries())
      .filter(([, pins]) => pins.some(p => ownedIds.has(p.id)))
      .map(([collectionName, pins]) => ({
        collectionName,
        totalInCatalogue: pins.length,
        ownedCount: pins.filter(p => ownedIds.has(p.id)).length,
        samplePins: pins.filter(p => ownedIds.has(p.id)).slice(0, 4),
      }))
      .sort((a, b) => b.ownedCount - a.ownedCount);
  }, [catalogue, ownedIds]);

  // Nearly-complete sets for the hero carousel
  const nearlyComplete = useMemo(
    () =>
      officialSets
        .filter(s => s.ownedCount > 0 && s.ownedCount < s.totalInCatalogue)
        .sort(
          (a, b) =>
            b.ownedCount / b.totalInCatalogue - a.ownedCount / a.totalInCatalogue,
        )
        .slice(0, 6),
    [officialSets],
  );

  // ── Filtered pins for list views ──────────────────────────────────────────────

  const filtered = useMemo(() => {
    let base: CataloguePin[];
    if (view === 'all') base = allStatusPins;
    else if (view === 'for_trade') base = catalogue.filter(p => forTradeIds.has(p.id));
    else if (view === 'iso') base = catalogue.filter(p => wantedIds.has(p.id));
    else base = [];

    if (!query) return base;
    const q = query.toLowerCase();
    return base.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        p.collection.toLowerCase().includes(q) ||
        p.characters.some(c => c.toLowerCase().includes(q)),
    );
  }, [view, allStatusPins, catalogue, forTradeIds, wantedIds, query]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleCreateBoard = () => {
    const name = newBoardName.trim();
    if (!name) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const board = createBoard(name);
    setNewBoardName('');
    setCreateModalVisible(false);
    router.push({ pathname: '/board/[id]', params: { id: board.id } });
  };

  const handleViewChange = (v: CollectionView) => {
    Haptics.selectionAsync();
    setView(v);
    setQuery('');
  };

  // ── Empty messages ─────────────────────────────────────────────────────────────

  const emptyConfig: Record<CollectionView, { icon: keyof typeof Feather.glyphMap; title: string; subtitle: string; actionLabel?: string }> = {
    all: { icon: 'layers', title: 'No pins in your collection', subtitle: 'Browse the catalogue in Discover to mark pins as Owned, ISO, or For Trade.' },
    sets: { icon: 'package', title: 'No official sets yet', subtitle: 'When you mark pins as Owned, their sets will appear here with completion tracking.' },
    collections: { icon: 'grid', title: 'No boards yet', subtitle: 'Create a board to organise your pins into custom collections.', actionLabel: 'Create Board' },
    duplicates: { icon: 'copy', title: 'Duplicate tracking coming soon', subtitle: 'Once quantity tracking is added, your duplicate pins will appear here.' },
    for_trade: { icon: 'repeat', title: 'Nothing up for trade', subtitle: "Mark pins as For Trade to let others know you're open to swaps." },
    for_sale: { icon: 'tag', title: 'No listings yet', subtitle: 'List pins for sale on Vinted or eBay and link them here from a pin detail page.' },
    iso: { icon: 'bookmark', title: 'No ISO pins yet', subtitle: 'Mark pins as ISO from Discover to track what you are searching for.' },
  };

  // ── Render content by view ─────────────────────────────────────────────────────

  const renderContent = () => {
    // Views with special layouts
    if (view === 'sets') {
      if (officialSets.length === 0) {
        return (
          <EmptyState
            icon={emptyConfig.sets.icon}
            title={emptyConfig.sets.title}
            subtitle={emptyConfig.sets.subtitle}
            actionLabel="Browse Catalogue"
            onAction={() => router.push('/(tabs)/index' as any)}
          />
        );
      }
      return (
        <FlatList
          data={officialSets}
          keyExtractor={s => s.collectionName}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: botPad }}
          renderItem={({ item }) => (
            <SetCard
              info={item}
              colors={colors}
              onPress={() =>
                router.push({
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    pathname: '/set/[collection]' as any,
                  params: { collection: item.collectionName },
                })
              }
            />
          )}
        />
      );
    }

    if (view === 'collections') {
      if (customBoards.length === 0) {
        return (
          <EmptyState
            icon={emptyConfig.collections.icon}
            title={emptyConfig.collections.title}
            subtitle={emptyConfig.collections.subtitle}
            actionLabel="Create Board"
            onAction={() => {
              setNewBoardName('');
              setCreateModalVisible(true);
            }}
          />
        );
      }
      return (
        <FlatList
          data={customBoards}
          keyExtractor={b => b.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: botPad }}
          renderItem={({ item }) => {
            const pins = getBoardPins(item);
            return (
              <View style={{ marginHorizontal: 0 }}>
                <BoardCardHorizontal
                  board={item}
                  pins={pins}
                  onPress={() =>
                    router.push({ pathname: '/board/[id]', params: { id: item.id } })
                  }
                />
              </View>
            );
          }}
          ListFooterComponent={() => (
            <TouchableOpacity
              onPress={() => { setNewBoardName(''); setCreateModalVisible(true); }}
              activeOpacity={0.8}
              style={[
                styles.newBoardFooterBtn,
                { borderColor: colors.border, borderRadius: colors.radius, marginHorizontal: 16, marginTop: 8 },
              ]}
            >
              <Feather name="plus" size={16} color={colors.primary} />
              <Text style={[styles.newBoardFooterLabel, { color: colors.primary }]}>New Board</Text>
            </TouchableOpacity>
          )}
        />
      );
    }

    if (view === 'duplicates') {
      return (
        <EmptyState
          icon="copy"
          title={emptyConfig.duplicates.title}
          subtitle={emptyConfig.duplicates.subtitle}
        />
      );
    }

    if (view === 'for_sale') {
      return (
        <EmptyState
          icon="tag"
          title={emptyConfig.for_sale.title}
          subtitle={emptyConfig.for_sale.subtitle}
          actionLabel="Browse Catalogue"
          onAction={() => router.push('/(tabs)/index' as any)}
        />
      );
    }

    // Pin list views: all, for_trade, iso
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon={emptyConfig[view].icon}
          title={emptyConfig[view].title}
          subtitle={emptyConfig[view].subtitle}
          actionLabel="Browse Catalogue"
          onAction={() => router.push('/(tabs)/index' as any)}
        />
      );
    }

    return (
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
        renderItem={({ item }) =>
          viewMode === 'grid' ? (
            <GalleryTile
              pin={item}
              statusColor={
                ownedIds.has(item.id)
                  ? colors.owned
                  : forTradeIds.has(item.id)
                    ? colors.forTrade
                    : wantedIds.has(item.id)
                      ? colors.wanted
                      : null
              }
              colors={colors}
              onPress={() =>
                router.push({ pathname: '/pin/[id]', params: { id: item.id } })
              }
            />
          ) : (
            <PinCard
              pin={item}
              mode="list"
              onPress={() =>
                router.push({ pathname: '/pin/[id]', params: { id: item.id } })
              }
            />
          )
        }
      />
    );
  };

  const showSearchAndToggle = ['all', 'for_trade', 'iso'].includes(view);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Gold hero header ── */}
      <LinearGradient
        colors={[colors.primaryGradientStart, colors.primaryGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: topPad + 14 }]}
      >
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>My Collection</Text>
            <Text style={styles.heroSub}>
              {counts.owned} {counts.owned === 1 ? 'pin' : 'pins'}
              {estimatedValue !== null ? ` · est £${estimatedValue.toFixed(0)}` : ''}
            </Text>
          </View>
          {showSearchAndToggle && (
            <TouchableOpacity
              onPress={() => setViewMode(v => (v === 'grid' ? 'list' : 'grid'))}
              style={styles.heroToggleBtn}
              activeOpacity={0.75}
            >
              <Feather name={viewMode === 'grid' ? 'list' : 'grid'} size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* ── Stat medallions overlapping the hero ── */}
      <View style={styles.medalRow}>
        {(
          [
            { label: 'OWNED', value: counts.owned, color: colors.owned },
            { label: 'TRADING', value: counts.forTrade, color: colors.forTrade },
            { label: 'ISO', value: counts.wanted, color: colors.wanted },
          ] as const
        ).map(m => (
          <View
            key={m.label}
            style={[styles.medal, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.medalLabel, { color: m.color }]}>{m.label}</Text>
            <Text style={[styles.medalValue, { color: colors.foreground }]}>{m.value}</Text>
            <View style={[styles.medalBar, { backgroundColor: m.color }]} />
          </View>
        ))}
      </View>

      <View>
      {/* ── Nearly complete carousel ── */}
      {view === 'all' && nearlyComplete.length > 0 && (
        <View style={styles.nearlyWrap}>
          <View style={styles.nearlyHeader}>
            <Text style={[styles.nearlyTitle, { color: colors.mutedForeground }]}>
              NEARLY COMPLETE
            </Text>
            <TouchableOpacity onPress={() => handleViewChange('sets')} activeOpacity={0.7}>
              <Text style={[styles.nearlyViewAll, { color: colors.primary }]}>View All ›</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.nearlyScroll}
          >
            {nearlyComplete.map(s => {
              const pct = Math.round((s.ownedCount / s.totalInCatalogue) * 100);
              const toGo = s.totalInCatalogue - s.ownedCount;
              return (
                <TouchableOpacity
                  key={s.collectionName}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      pathname: '/set/[collection]' as any,
                      params: { collection: s.collectionName },
                    })
                  }
                  style={[styles.nearlyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.ringWrap}>
                    <ProgressRing
                      pct={pct}
                      size={46}
                      stroke={4}
                      track={colors.secondary}
                      color={colors.primary}
                    />
                    <View style={styles.ringLabelWrap}>
                      <Text style={[styles.ringLabel, { color: colors.foreground }]}>
                        {s.ownedCount}
                        <Text style={[styles.ringLabelSub, { color: colors.mutedForeground }]}>
                          /{s.totalInCatalogue}
                        </Text>
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.nearlyName, { color: colors.foreground }]} numberOfLines={1}>
                      {s.collectionName}
                    </Text>
                    <View style={[styles.toGoChip, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.toGoLabel, { color: colors.secondaryForeground }]}>
                        {toGo} {toGo === 1 ? 'PIN' : 'PINS'} TO GO
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

        {/* ── View tabs ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {VIEWS.map(v => {
            const isActive = v.key === view;
            const activeColor =
              v.key === 'for_trade' ? colors.forTrade
              : v.key === 'iso' ? colors.wanted
              : colors.primary;
            return (
              <TouchableOpacity
                key={v.key}
                onPress={() => handleViewChange(v.key)}
                style={[
                  styles.tab,
                  isActive && {
                    backgroundColor: activeColor + '18',
                    borderColor: activeColor,
                  },
                  !isActive && { borderColor: colors.border },
                  { borderRadius: 20 },
                ]}
                activeOpacity={0.75}
              >
                <Feather
                  name={v.icon}
                  size={13}
                  color={isActive ? activeColor : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? activeColor : colors.mutedForeground },
                  ]}
                >
                  {v.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Search bar (only for pin-list views) ── */}
        {showSearchAndToggle && (
          <View style={{ paddingBottom: 8 }}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search pins…" />
          </View>
        )}
      </View>

      {/* ── Content ── */}
      {renderContent()}

      {/* ── Create Board Modal ── */}
      <Modal
        visible={createModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCreateModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.createModal, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}
          >
            <Text style={[styles.createModalTitle, { color: colors.foreground }]}>New Board</Text>
            <Text style={[styles.createModalSub, { color: colors.mutedForeground }]}>
              Give your board a name, such as "2026 Wave A Hidden Mickeys" or "Tiana Collection".
            </Text>
            <TextInput
              ref={nameInputRef}
              value={newBoardName}
              onChangeText={setNewBoardName}
              placeholder="Board name…"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.createInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateBoard}
              maxLength={60}
            />
            <View style={styles.createActions}>
              <TouchableOpacity
                onPress={() => setCreateModalVisible(false)}
                style={[styles.createCancelBtn, { borderColor: colors.border, borderRadius: colors.radius - 4 }]}
                activeOpacity={0.75}
              >
                <Text style={[styles.createCancelLabel, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateBoard}
                style={[
                  styles.createConfirmBtn,
                  { backgroundColor: newBoardName.trim() ? colors.primary : colors.muted, borderRadius: colors.radius - 4 },
                ]}
                activeOpacity={0.85}
                disabled={!newBoardName.trim()}
              >
                <Text style={[styles.createConfirmLabel, { color: newBoardName.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Gold hero
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 42,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroTitle: { fontSize: 27, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  heroSub: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  heroToggleBtn: {
    padding: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  // Stat medallions
  medalRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: -28,
    marginBottom: 12,
  },
  medal: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingTop: 10,
    overflow: 'hidden',
    shadowColor: '#2D1800',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  medalLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  medalValue: { fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 2, marginBottom: 8 },
  medalBar: { height: 3, alignSelf: 'stretch' },
  // Nearly complete carousel
  nearlyWrap: { marginBottom: 4 },
  nearlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  nearlyTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  nearlyViewAll: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  nearlyScroll: { paddingHorizontal: 16, gap: 10, paddingBottom: 12 },
  nearlyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    width: 210,
  },
  ringWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  ringLabelWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  ringLabelSub: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  nearlyName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  toGoChip: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  toGoLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  // Tabs
  tabScroll: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  tabLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  // List
  listContent: { paddingTop: 12 },
  gridPadding: { paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'space-between' },
  // New board footer button
  newBoardFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  newBoardFooterLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  // Create modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  createModal: {
    width: '100%',
    padding: 20,
    gap: 14,
    borderWidth: 1,
  },
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
  createCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderWidth: 1,
  },
  createCancelLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  createConfirmBtn: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  createConfirmLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
