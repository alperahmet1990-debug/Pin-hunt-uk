import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { getPinImageSource } from '@/utils/pinImage';
import { PinCard } from '@/components/PinCard';
import { BoardCard } from '@/components/BoardCard';
import { EmptyState } from '@/components/EmptyState';
import { SegmentedControl } from '@/components/ui';
import type { SegmentedControlOption } from '@/components/ui';
import {
  type CataloguePin,
  type PinSetSummary,
} from '@workspace/pin-repository';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 12) / 2;

type Tab = 'boards' | 'sets' | 'traders' | 'iso';
const TAB_OPTIONS: SegmentedControlOption<Tab>[] = [
  { value: 'boards', label: 'Boards', icon: 'grid', tone: 'coral' },
  { value: 'sets', label: 'Sets', icon: 'package', tone: 'coral' },
  { value: 'traders', label: 'Traders', icon: 'repeat', tone: 'coral' },
  { value: 'iso', label: 'ISO', icon: 'bookmark', tone: 'coral' },
];
type SetProgressFilter = 'all' | 'progress' | 'complete';
type MetadataFilterKey = 'character' | 'series' | 'location' | 'year' | 'brand' | 'edition';
type MetadataFilters = Partial<Record<MetadataFilterKey, string>>;
interface GroupData {
  isGroup: true;
  id: string;
  title: string;
  subtitle: string;
  pins: CataloguePin[];
  isBoard?: boolean;
  isSet?: boolean;
  setId?: string;
  progress?: number;
  complete?: boolean;
}

type PinFilterType = 'all' | 'le' | 'open';
type PinSortType = 'recent' | 'name' | 'year' | 'value';

function pinMatchesSearch(pin: CataloguePin, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  const metadata = [
    pin.title,
    pin.collection,
    pin.brand,
    pin.normalisedSeries,
    pin.origin,
    pin.releaseYear?.toString(),
    pin.releaseDate,
    pin.edition,
    pin.retailer,
    pin.manufacturer,
    ...(pin.characters || []),
    pin.allCharacters
  ].filter(Boolean).join(' ').toLowerCase();
  return metadata.includes(q);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processPins(pins: CataloguePin[], filter: PinFilterType, sort: PinSortType, query: string, collectionMap: Record<string, any>) {
  let res = pins.filter(p => pinMatchesSearch(p, query));

  if (filter === 'le') {
    res = res.filter(p => (p.limitedEditionSize && p.limitedEditionSize > 0) || p.edition?.toLowerCase().includes('limited'));
  } else if (filter === 'open') {
    res = res.filter(p => !p.limitedEditionSize && (!p.edition || p.edition.toLowerCase().includes('open') || p.edition.toLowerCase().includes('core')));
  }

  res = res.sort((a, b) => {
    if (sort === 'name') return (a.title || '').localeCompare(b.title || '');
    if (sort === 'year') {
      const releaseA = a.releaseDate || a.releaseYear?.toString() || '';
      const releaseB = b.releaseDate || b.releaseYear?.toString() || '';
      return releaseB.localeCompare(releaseA);
    }
    if (sort === 'value') return (b.estimatedValueGBP || 0) - (a.estimatedValueGBP || 0);
    const dateA = collectionMap[a.id]?.dateAdded || '';
    const dateB = collectionMap[b.id]?.dateAdded || '';
    return dateB.localeCompare(dateA);
  });
  return res;
}

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { collection } = useCollection();
  const { pins: catalogue, ensurePins, ensureCollections, repository } = usePinCatalogue();
  const { customBoards, createBoard, getBoardPins } = useBoards();

  const [activeTab, setActiveTab] = useState<Tab>('sets');
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinFilters, setPinFilters] = useState<MetadataFilters>({});
  const [allPinsSort, setAllPinsSort] = useState<PinSortType>('recent');
  const [allPinsFilterVisible, setAllPinsFilterVisible] = useState(false);
  const [setProgressFilter, setSetProgressFilter] = useState<SetProgressFilter>('all');

  const [traderFilter, setTraderFilter] = useState<PinFilterType>('all');
  const [traderSort, setTraderSort] = useState<PinSortType>('recent');
  const [isoFilter, setIsoFilter] = useState<PinFilterType>('all');
  const [isoSort, setIsoSort] = useState<PinSortType>('recent');
  const [setsSort, setSetsSort] = useState<'completion' | 'name' | 'year'>('completion');
  const [filterSheetTab, setFilterSheetTab] = useState<'traders' | 'iso' | 'boards' | 'sets' | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [setSummaries, setSetSummaries] = useState<PinSetSummary[]>([]);
  const [createBoardVisible, setCreateBoardVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  useEffect(() => {
    if (params.tab && ['boards', 'sets', 'traders', 'iso'].includes(params.tab)) {
      setActiveTab(params.tab as Tab);
      setSearchQuery('');
      setSearchActive(false);
      setPinFilters({});
      setAllPinsSort('recent');
      setSetProgressFilter('all');
      setSetsSort('completion');
      setTraderFilter('all');
      setTraderSort('recent');
      setIsoFilter('all');
      setIsoSort('recent');
    }
  }, [params.tab]);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 40) : insets.top;
  const botPad = Platform.OS === 'web' ? 120 : insets.bottom + 120;

  const ownedIds = useMemo(() => new Set(Object.values(collection).filter(e => e.status === 'owned' || e.status === 'for_trade').map(e => e.pinId)), [collection]);
  const forTradeIds = useMemo(() => new Set(Object.values(collection).filter(e => e.status === 'for_trade').map(e => e.pinId)), [collection]);
  const wantedIds = useMemo(() => new Set(Object.values(collection).filter(e => e.status === 'wanted').map(e => e.pinId)), [collection]);

  useEffect(() => {
    const pinIds = Object.values(collection).map(entry => entry.pinId);
    if (pinIds.length > 0) void ensurePins(pinIds);
  }, [collection, ensurePins]);

  useEffect(() => {
    const names = new Set<string>();
    for (const pin of catalogue) {
      if (ownedIds.has(pin.id) && pin.collection) names.add(pin.collection);
    }
    if (names.size > 0) void ensureCollections([...names]);
  }, [catalogue, ownedIds, ensureCollections]);

  useEffect(() => {
    if (!repository) return;
    let cancelled = false;
    repository.getSetSummaries()
      .then(summaries => {
        if (!cancelled) setSetSummaries(summaries);
      })
      .catch(() => {
        if (!cancelled) setSetSummaries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const ownedPins = useMemo(() => catalogue.filter(pin => ownedIds.has(pin.id)), [catalogue, ownedIds]);
  const forTradePins = useMemo(() => catalogue.filter(pin => forTradeIds.has(pin.id)), [catalogue, forTradeIds]);
  const wantedPins = useMemo(() => catalogue.filter(pin => wantedIds.has(pin.id)), [catalogue, wantedIds]);

  const automaticSetGroups = useMemo<GroupData[]>(() => {
    const ownedSetNames = new Set(ownedPins.map(p => p.collection).filter(Boolean));

    return setSummaries
      .filter(summary => ownedSetNames.has(summary.setName))
      .map(summary => {
        const pins = catalogue.filter(pin => pin.collection === summary.setName);
        const ownedCount = pins.filter(pin => ownedIds.has(pin.id) || forTradeIds.has(pin.id)).length;
        // Use the same catalogue membership that Set Detail renders.
        const total = pins.length;
        const complete = total > 0 && ownedCount >= total;
        return {
          isGroup: true as const,
          id: summary.id,
          setId: summary.id,
          title: summary.setName,
          subtitle: complete ? `${ownedCount} / ${total} · Complete ✓` : `${ownedCount} / ${total} · ${total ? Math.round((ownedCount / total) * 100) : 0}%`,
          pins,
          isSet: true,
          progress: total > 0 ? Math.min(ownedCount / total, 1) : 0,
          complete,
        };
      });
  }, [setSummaries, catalogue, ownedPins, ownedIds, forTradeIds]);

  const setGroups = useMemo<GroupData[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    return automaticSetGroups
      .filter(group =>
        (!query || group.title.toLowerCase().includes(query)) &&
        (setProgressFilter === 'all' || (setProgressFilter === 'complete' ? group.complete : !group.complete)),
      )
      .sort((a, b) => {
        if (setsSort === 'completion') {
          return (b.progress || 0) - (a.progress || 0);
        }
        if (setsSort === 'name') {
          return a.title.localeCompare(b.title);
        }
        if (setsSort === 'year') {
          const aYear = a.pins[0]?.releaseYear || 0;
          const bYear = b.pins[0]?.releaseYear || 0;
          return bYear - aYear;
        }
        return 0;
      });
  }, [automaticSetGroups, searchQuery, setProgressFilter, setsSort]);

  const metadataOptions = useMemo<Record<MetadataFilterKey, string[]>>(() => {
    const values: Record<MetadataFilterKey, Set<string>> = {
      character: new Set(), series: new Set(), location: new Set(),
      year: new Set(), brand: new Set(), edition: new Set(),
    };
    ownedPins.forEach(pin => {
      (pin.characters.length ? pin.characters : (pin.allCharacters?.split(';') ?? [])).map(v => v.trim()).filter(Boolean).forEach(v => values.character.add(v));
      if (pin.normalisedSeries || pin.collection) values.series.add(pin.normalisedSeries || pin.collection);
      if (pin.origin) values.location.add(pin.origin);
      const year = pin.releaseYear?.toString() || pin.releaseDate?.slice(0, 4);
      if (year) values.year.add(year);
      if (pin.brand) values.brand.add(pin.brand);
      if (pin.edition) values.edition.add(pin.edition);
    });
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, [...value].sort()])) as Record<MetadataFilterKey, string[]>;
  }, [ownedPins]);

  const filteredOwnedPins = useMemo(() => {
    const matchesFilter = (pin: CataloguePin, key: MetadataFilterKey, value: string) => {
      if (key === 'character') return [...pin.characters, ...(pin.allCharacters?.split(';').map(v => v.trim()) ?? [])].includes(value);
      if (key === 'series') return (pin.normalisedSeries || pin.collection) === value;
      if (key === 'location') return pin.origin === value;
      if (key === 'year') return (pin.releaseYear?.toString() || pin.releaseDate?.slice(0, 4)) === value;
      if (key === 'brand') return pin.brand === value;
      return pin.edition === value;
    };
    const filtered = ownedPins.filter(pin =>
      pinMatchesSearch(pin, searchQuery) &&
      Object.entries(pinFilters).every(([key, value]) => !value || matchesFilter(pin, key as MetadataFilterKey, value)),
    );
    return processPins(filtered, 'all', allPinsSort, '', collection);
  }, [ownedPins, searchQuery, pinFilters, allPinsSort, collection]);

  const boardGroups = useMemo<GroupData[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    return customBoards
      .map(b => {
        const pins = getBoardPins(b);
        return {
          isGroup: true as const,
          id: b.id,
          title: b.name,
          subtitle: `${pins.length} pin${pins.length === 1 ? '' : 's'}`,
          pins,
          isBoard: true,
        };
      })
      .filter(group => !query || group.title.toLowerCase().includes(query) || group.pins.some(pin => pinMatchesSearch(pin, query)));
  }, [customBoards, getBoardPins, searchQuery]);

  const filteredTraderPins = useMemo(() => {
    return processPins(forTradePins, traderFilter, traderSort, searchQuery, collection);
  }, [forTradePins, traderFilter, traderSort, searchQuery, collection]);

  const filteredIsoPins = useMemo(() => {
    return processPins(wantedPins, isoFilter, isoSort, searchQuery, collection);
  }, [wantedPins, isoFilter, isoSort, searchQuery, collection]);

  const boardPinFallbackActive =
    activeTab === 'boards' &&
    searchActive &&
    searchQuery.trim().length > 0 &&
    boardGroups.length === 0;

  const gridData = useMemo(() => {
    if (activeTab === 'boards') return boardPinFallbackActive ? filteredOwnedPins : boardGroups;
    if (activeTab === 'sets') return setGroups;
    if (activeTab === 'traders') return filteredTraderPins;
    if (activeTab === 'iso') return filteredIsoPins;
    return [];
  }, [activeTab, boardPinFallbackActive, filteredOwnedPins, boardGroups, setGroups, filteredTraderPins, filteredIsoPins]);

  const handleGroupPress = (item: GroupData) => {
    if (item.isBoard) {
      router.push({ pathname: '/board/[id]', params: { id: item.id } });
    } else if (item.isSet) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push({ pathname: '/set/[collection]' as any, params: { collection: item.title } });
    }
  };

  const handleCreateBoard = () => {
    const name = newBoardName.trim();
    if (!name) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const board = createBoard(name);
    setNewBoardName('');
    setCreateBoardVisible(false);
    router.push({ pathname: '/board/[id]', params: { id: board.id } });
  };

  const renderHeader = () => (
    <View style={s.headerContent}>
      {/* Page Header */}
      <View style={s.pageHeader}>
        <Text style={[s.pageTitle, { color: colors.homeInk }]}>My Collection</Text>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={[s.headerBtn, searchActive && { backgroundColor: colors.homeCoral + '15' }]}
            onPress={() => {
              setSearchActive(!searchActive);
              if (searchActive) setSearchQuery('');
            }}
          >
            <Feather name="search" size={24} color={searchActive ? colors.homeCoral : colors.homeInk} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={() => setAddModalVisible(true)}>
            <Feather name="plus" size={24} color={colors.homeInk} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.tabsRow}>
        <SegmentedControl
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={tab => {
            if (Platform.OS !== 'web') Haptics.selectionAsync();
            setActiveTab(tab);
            setSearchQuery('');
            setSearchActive(false);
          }}
        />
      </View>

      {/* Contextual Stats & Search */}
      <View style={s.contextualArea}>
        {activeTab === 'boards' && (
          <View style={s.statsRow}>
            <Text style={[s.statText, { color: colors.homeInk }]}>
              {ownedIds.size} <Text style={{ color: colors.homeMuted }}>Owned</Text>
            </Text>
            <Text style={[s.statText, { color: colors.homeInk }]}>
              {customBoards.length} <Text style={{ color: colors.homeMuted }}>Boards</Text>
            </Text>
          </View>
        )}
        {activeTab === 'sets' && (
          <View style={[s.statsRow, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Text style={[s.statText, { color: colors.homeInk }]}>
                {ownedIds.size} <Text style={{ color: colors.homeMuted }}>Pins</Text>
              </Text>
              <Text style={[s.statText, { color: colors.homeInk }]}>
                {automaticSetGroups.length} <Text style={{ color: colors.homeMuted }}>Sets</Text>
              </Text>
              <Text style={[s.statText, { color: colors.homeInk }]}>
                {automaticSetGroups.filter(g => g.complete).length} <Text style={{ color: colors.homeMuted }}>Complete</Text>
              </Text>
            </View>
            {!searchActive && (
              <TouchableOpacity onPress={() => setFilterSheetTab('sets')} style={s.iconStatBtn}>
                <Feather name="sliders" size={16} color={colors.homeInk} />
                <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Sort</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {activeTab === 'traders' && (
          <View style={[s.statsRow, { justifyContent: 'space-between' }]}>
            <Text style={[s.statText, { color: colors.homeInk }]}>
              {forTradePins.length} <Text style={{ color: colors.homeMuted }}>Traders</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => router.push('/(tabs)/community')} style={s.iconStatBtn}>
                <Feather name="share" size={16} color={colors.homeCoral} />
                <Text style={[s.iconStatBtnText, { color: colors.homeCoral }]}>Share</Text>
              </TouchableOpacity>
              {!searchActive && (
                <TouchableOpacity onPress={() => setFilterSheetTab('traders')} style={s.iconStatBtn}>
                  <Feather name="sliders" size={16} color={colors.homeInk} />
                  <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Sort</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        {activeTab === 'iso' && (
          <View style={[s.statsRow, { justifyContent: 'space-between' }]}>
            <Text style={[s.statText, { color: colors.homeInk }]}>
              {wantedPins.length} <Text style={{ color: colors.homeMuted }}>ISO</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => router.push('/(tabs)/community')} style={s.iconStatBtn}>
                <Feather name="share" size={16} color={colors.homeCoral} />
                <Text style={[s.iconStatBtnText, { color: colors.homeCoral }]}>Share</Text>
              </TouchableOpacity>
              {!searchActive && (
                <TouchableOpacity onPress={() => setFilterSheetTab('iso')} style={s.iconStatBtn}>
                  <Feather name="sliders" size={16} color={colors.homeInk} />
                  <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Sort</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {searchActive && (
          <View style={s.controlsRow}>
            <View style={[s.searchBox, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
              <Feather name="search" size={16} color={colors.homeMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={activeTab === 'boards' ? 'Search boards & pins' : `Search ${activeTab}`}
                placeholderTextColor={colors.homeMuted}
                style={[s.searchInput, { color: colors.homeInk }]}
                returnKeyType="search"
                autoFocus
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                  <Feather name="x-circle" size={16} color={colors.homeMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
            {(activeTab !== 'boards' || boardPinFallbackActive) && (
              <TouchableOpacity
                style={[s.utilBtn, {
                  backgroundColor: colors.homeSurface,
                  borderColor: activeTab === 'boards' && (Object.keys(pinFilters).length > 0 || allPinsSort !== 'recent')
                    ? colors.homeCoral
                    : colors.homeLine,
                }]}
                onPress={() => {
                  if (activeTab === 'boards') setAllPinsFilterVisible(true);
                  else setFilterSheetTab(activeTab);
                }}
              >
                <Feather name="sliders" size={18} color={activeTab === 'boards' && (Object.keys(pinFilters).length > 0 || allPinsSort !== 'recent') ? colors.homeCoral : colors.homeInk} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* If searching pins in Boards view, allow viewing all owned pins */}
        {boardPinFallbackActive && filteredOwnedPins.length > 0 && (
          <View style={[s.secondarySearchResult, { backgroundColor: colors.homeSurface }]}>
            <Text style={[s.secondarySearchText, { color: colors.homeMuted }]}>
              View All Owned Pins · {filteredOwnedPins.length} result{filteredOwnedPins.length === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (activeTab === 'boards') {
      if (searchActive && searchQuery) return <EmptyState icon="search" title="No results found" subtitle="Try a different search term." />;
      return <EmptyState icon="folder" title="No boards yet" subtitle="Create a board to organise your pins." actionLabel="Create Board" onAction={() => setCreateBoardVisible(true)} />;
    }
    if (activeTab === 'sets') {
      if (searchActive && searchQuery) return <EmptyState icon="search" title="No results found" subtitle="Try a different search term." />;
      return <EmptyState icon="bookmark" title={setProgressFilter === 'all' ? 'No sets started' : 'No sets found'} subtitle={setProgressFilter === 'all' ? 'Sets will appear here automatically when you own pins belonging to them.' : 'Try another progress filter.'} />;
    }
    if (activeTab === 'traders') {
      if (searchActive && searchQuery || traderFilter !== 'all') return <EmptyState icon="search" title="No pins found" subtitle="Try changing your search or filters." />;
      return <EmptyState icon="repeat" title="No traders yet" subtitle="Mark pins as 'For Trade' to see them here." />;
    }
    if (activeTab === 'iso') {
      if (searchActive && searchQuery || isoFilter !== 'all') return <EmptyState icon="search" title="No pins found" subtitle="Try changing your search or filters." />;
      return <EmptyState icon="bookmark" title="No ISO pins yet" subtitle="Mark pins as 'ISO' to track what you're looking for." />;
    }
    return null;
  };

  return (
    <View style={[s.root, { backgroundColor: colors.homeBackground, paddingTop: topPad }]}>
      <FlatList<CataloguePin | GroupData>
        data={gridData}
        keyExtractor={item => ('isGroup' in item ? item.id : item.id)}
        numColumns={2}
        key="grid-2"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        columnWrapperStyle={s.gridRow}
        contentContainerStyle={[s.flatListContent, { paddingBottom: botPad }]}
        renderItem={({ item }) => {
          if ('isGroup' in item) {
            const group = item as GroupData;

            // Boards can just use BoardCard to look identical to other board locations
            if (group.isBoard) {
              return (
                <View style={s.gridItemWrap}>
                  <BoardCard
                    board={{ id: group.id, name: group.title, pinIds: group.pins.map(p => p.id), createdAt: '', isCustom: true }}
                    pins={group.pins}
                    onPress={() => handleGroupPress(group)}
                    seaGlass
                  />
                </View>
              );
            }

            // Sets use the visual group card
            const preview = group.pins.slice(0, 4);
            return (
              <TouchableOpacity onPress={() => handleGroupPress(group)} activeOpacity={0.8} style={[s.groupCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                <View style={[s.groupPreviewArea, { backgroundColor: colors.homeAqua }]}>
                  {preview.length === 0 ? (
                    <View style={s.groupEmpty}>
                      <Feather name="folder" size={24} color={colors.homeMuted} />
                    </View>
                  ) : preview.length === 1 ? (
                    <Image source={getPinImageSource(preview[0])} style={s.groupPreviewSingle} />
                  ) : (
                    <View style={s.groupPreviewGrid}>
                      {preview.map(p => (
                        <Image key={p.id} source={getPinImageSource(p)} style={[s.groupPreviewSmall, { borderColor: colors.homeSurface }]} />
                      ))}
                    </View>
                  )}
                </View>
                <View style={s.groupCardBottom}>
                  <Text style={[s.groupCardTitle, { color: colors.homeInk }]} numberOfLines={1}>{group.title}</Text>
                  <Text style={[s.groupCardSub, { color: colors.homeMuted }]} numberOfLines={1}>{group.subtitle}</Text>
                  {group.progress !== undefined && (
                    <View style={[s.groupProgressTrack, { backgroundColor: colors.homeAqua }]}>
                      <View style={[s.groupProgressFill, { width: `${Math.max(group.progress * 100, 2)}%`, backgroundColor: group.complete ? colors.owned : colors.homeCoral }]} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }
          const pin = item as CataloguePin;
          return (
            <View style={s.gridItemWrap}>
              <PinCard pin={pin} mode="grid" onPress={() => router.push({ pathname: '/pin/[id]', params: { id: pin.id } })} seaGlass />
              {(collection[pin.id]?.quantity ?? 1) > 1 && (
                <View style={[s.quantityBadge, { backgroundColor: colors.homeInk }]}>
                  <Text style={[s.quantityBadgeText, { color: colors.homeBackground }]}>
                    ×{collection[pin.id].quantity}
                  </Text>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Add Menu Modal */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setAddModalVisible(false)}>
          <View style={[s.addMenuSheet, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={s.addMenuHeader}>
              <Text style={[s.addMenuTitle, { color: colors.homeInk }]}>Add to Collection</Text>
            </View>
            <TouchableOpacity
              style={[s.addMenuItem, { borderBottomColor: colors.homeLine }]}
              onPress={() => {
                setAddModalVisible(false);
                router.push('/search');
              }}
            >
              <Feather name="search" size={24} color={colors.homeInk} />
              <Text style={[s.addMenuText, { color: colors.homeInk }]}>Add Pin</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.addMenuItem} onPress={() => { setAddModalVisible(false); setCreateBoardVisible(true); }}>
              <Feather name="folder-plus" size={24} color={colors.homeInk} />
              <Text style={[s.addMenuText, { color: colors.homeInk }]}>Create Board</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create Board Modal */}
      <Modal visible={createBoardVisible} transparent animationType="fade" onRequestClose={() => setCreateBoardVisible(false)}>
        <View style={s.modalBackdropCenter}>
          <View style={[s.createBoardModal, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <Text style={[s.modalTitle, { color: colors.homeInk }]}>New Board</Text>
            <TextInput
              value={newBoardName}
              onChangeText={setNewBoardName}
              placeholder="Board name"
              placeholderTextColor={colors.homeMuted}
              style={[s.modalInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateBoard}
            />
            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setCreateBoardVisible(false)} style={s.modalBtn}>
                <Text style={[s.modalBtnText, { color: colors.homeMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateBoard} disabled={!newBoardName.trim()} style={[s.modalBtn, s.modalBtnPrimary, { backgroundColor: newBoardName.trim() ? colors.homeCoral : colors.homeAqua }]}>
                <Text style={[s.modalBtnText, { color: newBoardName.trim() ? colors.homeSurface : colors.homeMuted }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Secondary owned-pin metadata filter and sort */}
      <Modal visible={allPinsFilterVisible} transparent animationType="slide" onRequestClose={() => setAllPinsFilterVisible(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.filterSheet, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={s.filterSheetHeader}>
              <Text style={[s.modalTitle, { color: colors.homeInk, marginBottom: 0 }]}>Filter Pins</Text>
              <View style={s.filterHeaderActions}>
                {(Object.keys(pinFilters).length > 0 || allPinsSort !== 'recent') && (
                  <TouchableOpacity onPress={() => { setPinFilters({}); setAllPinsSort('recent'); }} style={s.clearBtn}>
                    <Text style={[s.clearText, { color: colors.homeCoral }]}>Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setAllPinsFilterVisible(false)} style={s.closeBtn}>
                  <Feather name="x" size={20} color={colors.homeInk} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.filterScrollContent}>
              {([
                ['character', 'Character'],
                ['series', 'Set / Series'],
                ['location', 'Park / Location'],
                ['year', 'Year'],
                ['brand', 'Brand'],
                ['edition', 'Edition'],
              ] as const).map(([key, label]) => {
                const options = metadataOptions[key];
                if (options.length === 0) return null;
                return (
                  <View key={key} style={s.filterSection}>
                    <Text style={[s.sheetSectionTitle, { color: colors.homeMuted }]}>{label}</Text>
                    <View style={s.sheetRowWrap}>
                      {options.map(option => {
                        const active = pinFilters[key] === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            onPress={() => setPinFilters(current => {
                              const next = { ...current };
                              if (active) delete next[key];
                              else next[key] = option;
                              return next;
                            })}
                            style={[s.compactChip, {
                              backgroundColor: active ? colors.homeCoral + '15' : colors.homeAqua,
                              borderColor: active ? colors.homeCoral : 'transparent',
                            }]}
                          >
                            <Text style={[s.compactChipText, { color: active ? colors.homeCoral : colors.homeInk }]}>{option}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              <View style={s.filterSection}>
                <Text style={[s.sheetSectionTitle, { color: colors.homeMuted }]}>Sort by</Text>
                <View style={s.sheetRowWrap}>
                  {(['recent', 'name', 'year', 'value'] as const).map(option => {
                    const active = allPinsSort === option;
                    const label = option === 'recent' ? 'Recently Added' : option === 'name' ? 'Name' : option === 'year' ? 'Release date' : 'Estimated value';
                    return (
                      <TouchableOpacity
                        key={option}
                        onPress={() => setAllPinsSort(option)}
                        style={[s.compactChip, {
                          backgroundColor: active ? colors.homeCoral + '15' : colors.homeAqua,
                          borderColor: active ? colors.homeCoral : 'transparent',
                        }]}
                      >
                        <Text style={[s.compactChipText, { color: active ? colors.homeCoral : colors.homeInk }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
            <TouchableOpacity style={[s.applyBtn, { backgroundColor: colors.homeCoral }]} onPress={() => setAllPinsFilterVisible(false)}>
              <Text style={[s.applyBtnText, { color: colors.homeSurface }]}>Show {filteredOwnedPins.length} pin{filteredOwnedPins.length === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Filter / Sort Modal */}
      <Modal visible={filterSheetTab !== null} transparent animationType="fade" onRequestClose={() => setFilterSheetTab(null)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setFilterSheetTab(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.addMenuSheet, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={s.addMenuHeader}>
              <Text style={[s.addMenuTitle, { color: colors.homeInk }]}>
                {filterSheetTab === 'traders' ? 'Traders' : filterSheetTab === 'iso' ? 'ISO' : filterSheetTab === 'sets' ? 'Sets' : 'Pins'} View Options
              </Text>
            </View>

            <View style={s.sheetContent}>
              {filterSheetTab === 'sets' ? (
                <>
                  <Text style={[s.sheetSectionTitle, { color: colors.homeMuted }]}>Filter by Progress</Text>
                  <View style={s.sheetRow}>
                    {(['all', 'progress', 'complete'] as const).map(f => {
                      const active = setProgressFilter === f;
                      const label = f === 'all' ? 'All Sets' : f === 'progress' ? 'In Progress' : 'Completed';
                      return (
                        <TouchableOpacity
                          key={f}
                          style={[s.sheetChip, {
                            backgroundColor: active ? colors.homeCoral + '15' : colors.homeAqua,
                            borderColor: active ? colors.homeCoral : 'transparent'
                          }]}
                          onPress={() => setSetProgressFilter(f)}
                        >
                          <Text style={[s.sheetChipText, { color: active ? colors.homeCoral : colors.homeInk }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[s.sheetSectionTitle, { color: colors.homeMuted, marginTop: 20 }]}>Sort by</Text>
                  <View style={s.sheetRowWrap}>
                    {(['completion', 'name', 'year'] as const).map(sOpt => {
                      const active = setsSort === sOpt;
                      const label = sOpt === 'completion' ? 'Completion %' : sOpt === 'name' ? 'Name (A-Z)' : 'Year (Newest)';
                      return (
                        <TouchableOpacity
                          key={sOpt}
                          style={[s.sheetChip, {
                            backgroundColor: active ? colors.homeCoral + '15' : colors.homeAqua,
                            borderColor: active ? colors.homeCoral : 'transparent'
                          }]}
                          onPress={() => setSetsSort(sOpt)}
                        >
                          <Text style={[s.sheetChipText, { color: active ? colors.homeCoral : colors.homeInk }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Text style={[s.sheetSectionTitle, { color: colors.homeMuted }]}>Filter by Edition</Text>
                  <View style={s.sheetRow}>
                    {(['all', 'le', 'open'] as const).map(f => {
                      const active = filterSheetTab === 'traders' ? traderFilter === f : isoFilter === f;
                      const label = f === 'all' ? 'All' : f === 'le' ? 'Limited' : 'Open/Core';
                      return (
                        <TouchableOpacity
                          key={f}
                          style={[s.sheetChip, {
                            backgroundColor: active ? colors.homeCoral + '15' : colors.homeAqua,
                            borderColor: active ? colors.homeCoral : 'transparent'
                          }]}
                          onPress={() => {
                            if (filterSheetTab === 'traders') setTraderFilter(f);
                            else setIsoFilter(f);
                          }}
                        >
                          <Text style={[s.sheetChipText, { color: active ? colors.homeCoral : colors.homeInk }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[s.sheetSectionTitle, { color: colors.homeMuted, marginTop: 20 }]}>Sort by</Text>
                  <View style={s.sheetRowWrap}>
                    {(['recent', 'name', 'year', 'value'] as const).map(sOpt => {
                      const active = filterSheetTab === 'traders' ? traderSort === sOpt : isoSort === sOpt;
                      const label = sOpt === 'recent' ? 'Recently Added' : sOpt === 'name' ? 'Name (A-Z)' : sOpt === 'year' ? 'Year (Newest)' : 'Est. Value';
                      return (
                        <TouchableOpacity
                          key={sOpt}
                          style={[s.sheetChip, {
                            backgroundColor: active ? colors.homeCoral + '15' : colors.homeAqua,
                            borderColor: active ? colors.homeCoral : 'transparent'
                          }]}
                          onPress={() => {
                            if (filterSheetTab === 'traders') setTraderSort(sOpt);
                            else setIsoSort(sOpt);
                          }}
                        >
                          <Text style={[s.sheetChipText, { color: active ? colors.homeCoral : colors.homeInk }]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  headerContent: { paddingBottom: 8 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  pageTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  contextualArea: { paddingBottom: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  statText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  secondarySearchResult: { marginHorizontal: 16, padding: 12, borderRadius: 8, marginTop: 4, marginBottom: 8 },
  secondarySearchText: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  tabsRow: { paddingHorizontal: 16, marginBottom: 14 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15 },
  tabHeader: { paddingBottom: 4 },
  tabHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  tabCount: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  iconStatBtn: { minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'transparent' },
  iconStatBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', height: '100%' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 14 },
  addBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  utilBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  flatListContent: { paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'flex-start' },
  gridItemWrap: { width: GRID_CARD_WIDTH, marginBottom: 12, position: 'relative' },
  quantityBadge: { position: 'absolute', top: 8, right: 8, minWidth: 28, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  quantityBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  groupCard: { width: GRID_CARD_WIDTH, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 12 },
  groupPreviewArea: { height: GRID_CARD_WIDTH * 0.8 },
  groupEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  groupPreviewSingle: { width: '100%', height: '100%', resizeMode: 'cover' },
  groupPreviewGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', height: '100%' },
  groupPreviewSmall: { width: '50%', height: '50%', resizeMode: 'cover', borderWidth: 0.5 },
  groupCardBottom: { padding: 10, position: 'relative' },
  groupCardTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  groupCardSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  groupProgressTrack: { height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  groupProgressFill: { height: '100%', borderRadius: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBackdropCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center' },
  addMenuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, borderTopWidth: StyleSheet.hairlineWidth },
  addMenuHeader: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  addMenuTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  addMenuText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  createBoardModal: { margin: 24, alignSelf: 'stretch', borderRadius: 16, padding: 20, borderWidth: StyleSheet.hairlineWidth },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginBottom: 16 },
  modalInput: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12 },
  modalBtnPrimary: { paddingHorizontal: 20 },
  modalBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sheetContent: { padding: 16 },
  sheetSectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sheetRow: { flexDirection: 'row', gap: 8 },
  sheetRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, borderWidth: 1 },
  sheetChipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  filterSheet: { maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  filterSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  filterHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  clearText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  filterScrollContent: { paddingBottom: 12 },
  filterSection: { marginTop: 14 },
  compactChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, borderWidth: 1 },
  compactChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  applyBtn: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  applyBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
