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
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { getPinImageSource } from '@/utils/pinImage';
import { PinCard } from '@/components/PinCard';
import { EmptyState } from '@/components/EmptyState';
import type { CataloguePin, PinSetSummary } from '@workspace/pin-repository';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 12) / 2;

type Tab = 'collections' | 'traders' | 'iso';
type GroupBy = 'my_collections' | 'set' | 'series' | 'character' | 'location' | 'year' | 'brand';

const GROUP_BY_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'my_collections', label: 'My Collections' },
  { id: 'set', label: 'Set' },
  { id: 'series', label: 'Series' },
  { id: 'character', label: 'Character' },
  { id: 'location', label: 'Location' },
  { id: 'year', label: 'Year' },
  { id: 'brand', label: 'Brand' },
];

interface GroupData {
  isGroup: true;
  id: string;
  title: string;
  subtitle: string;
  pins: CataloguePin[];
  isBoard?: boolean;
  isSet?: boolean;
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
    if (sort === 'year') return (b.releaseYear || 0) - (a.releaseYear || 0);
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
  const { collection, counts } = useCollection();
  const { pins: catalogue, ensureCollections, repository } = usePinCatalogue();
  const { customBoards, createBoard, getBoardPins } = useBoards();

  const [activeTab, setActiveTab] = useState<Tab>('collections');
  const [groupBy, setGroupBy] = useState<GroupBy>('character');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedGroupTitle, setExpandedGroupTitle] = useState('');

  const [traderFilter, setTraderFilter] = useState<PinFilterType>('all');
  const [traderSort, setTraderSort] = useState<PinSortType>('recent');
  const [isoFilter, setIsoFilter] = useState<PinFilterType>('all');
  const [isoSort, setIsoSort] = useState<PinSortType>('recent');
  const [filterSheetTab, setFilterSheetTab] = useState<'traders' | 'iso' | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [setPickerVisible, setSetPickerVisible] = useState(false);
  const [setPickerQuery, setSetPickerQuery] = useState('');
  const [setSummaries, setSetSummaries] = useState<PinSetSummary[]>([]);
  const [createBoardVisible, setCreateBoardVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 40) : insets.top;
  const botPad = Platform.OS === 'web' ? 120 : insets.bottom + 120;

  const ownedIds = useMemo(() => new Set(Object.values(collection).filter(e => e.status === 'owned' || e.status === 'for_trade').map(e => e.pinId)), [collection]);
  const forTradeIds = useMemo(() => new Set(Object.values(collection).filter(e => e.status === 'for_trade').map(e => e.pinId)), [collection]);
  const wantedIds = useMemo(() => new Set(Object.values(collection).filter(e => e.status === 'wanted').map(e => e.pinId)), [collection]);

  useEffect(() => {
    const names = new Set<string>();
    for (const pin of catalogue) {
      if (ownedIds.has(pin.id) && pin.collection) names.add(pin.collection);
    }
    if (names.size > 0) void ensureCollections([...names]);
  }, [catalogue, ownedIds, ensureCollections]);

  useEffect(() => {
    if (!setPickerVisible || !repository || setSummaries.length > 0) return;
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
  }, [repository, setPickerVisible, setSummaries.length]);

  const ownedPins = useMemo(() => catalogue.filter(pin => ownedIds.has(pin.id)), [catalogue, ownedIds]);
  const forTradePins = useMemo(() => catalogue.filter(pin => forTradeIds.has(pin.id)), [catalogue, forTradeIds]);
  const wantedPins = useMemo(() => catalogue.filter(pin => wantedIds.has(pin.id)), [catalogue, wantedIds]);

  const officialSets = useMemo(() => {
    const byCollection = new Map<string, CataloguePin[]>();
    for (const pin of catalogue) {
      if (!pin.collection) continue;
      const list = byCollection.get(pin.collection) ?? [];
      list.push(pin);
      byCollection.set(pin.collection, list);
    }
    return Array.from(byCollection.entries())
      .filter(([, pins]) => pins.some(p => ownedIds.has(p.id)))
      .map(([collectionName, pins]) => {
        const ownedCount = pins.filter(p => ownedIds.has(p.id)).length;
        return {
          collectionName,
          pins: pins.filter(p => ownedIds.has(p.id)),
          totalInCatalogue: pins.length,
          ownedCount,
        };
      })
      .sort((a, b) => b.ownedCount - a.ownedCount);
  }, [catalogue, ownedIds]);

  const groups = useMemo<GroupData[]>(() => {
    if (groupBy === 'my_collections') {
      return customBoards.map(b => {
        const pins = getBoardPins(b);
        return {
          isGroup: true,
          id: b.id,
          title: b.name,
          subtitle: `${pins.length} pin${pins.length === 1 ? '' : 's'}`,
          pins,
          isBoard: true,
        };
      });
    }
    if (groupBy === 'set') {
      return officialSets.map(s => ({
        isGroup: true,
        id: s.collectionName,
        title: s.collectionName,
        subtitle: `${s.ownedCount} / ${s.totalInCatalogue} · ${Math.round((s.ownedCount / s.totalInCatalogue) * 100)}%`,
        pins: s.pins,
        isSet: true,
        progress: s.totalInCatalogue > 0 ? s.ownedCount / s.totalInCatalogue : 0,
        complete: s.ownedCount === s.totalInCatalogue && s.totalInCatalogue > 0,
      }));
    }

    const map = new Map<string, CataloguePin[]>();
    for (const pin of ownedPins) {
      let keys: string[] = [];
      if (groupBy === 'series') keys = [pin.normalisedSeries || pin.collection || 'Unknown'];
      else if (groupBy === 'character') {
        keys = pin.characters.length ? pin.characters : pin.allCharacters?.split(';').map(s => s.trim()).filter(Boolean) || ['Unknown'];
      } else if (groupBy === 'location') keys = [pin.origin || 'Unknown'];
      else if (groupBy === 'year') keys = [pin.releaseYear?.toString() || pin.releaseDate?.slice(0, 4) || 'Unknown'];
      else if (groupBy === 'brand') keys = [pin.brand || 'Unknown'];

      if (keys.length === 0) keys = ['Unknown'];
      for (const k of keys) {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(pin);
      }
    }

    return Array.from(map.entries())
      .map(([k, pins]) => ({
        isGroup: true as const,
        id: k,
        title: k,
        pins,
        subtitle: `${pins.length} pin${pins.length === 1 ? '' : 's'}`,
      }))
      .sort((a, b) => b.pins.length - a.pins.length || a.title.localeCompare(b.title));
  }, [groupBy, customBoards, officialSets, ownedPins, getBoardPins]);

  const visibleSetSummaries = useMemo(() => {
    const query = setPickerQuery.trim().toLowerCase();
    return setSummaries
      .filter(summary => {
        if (!query) return true;
        return [
          summary.setName,
          summary.collectionName,
          summary.programme,
          summary.releaseYear?.toString(),
          summary.collectionType,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 100);
  }, [setPickerQuery, setSummaries]);

  const filteredOwnedPins = useMemo(() => {
    if (!searchQuery) return ownedPins;
    return ownedPins.filter(p => pinMatchesSearch(p, searchQuery));
  }, [ownedPins, searchQuery]);

  const filteredTraderPins = useMemo(() => {
    return processPins(forTradePins, traderFilter, traderSort, searchQuery, collection);
  }, [forTradePins, traderFilter, traderSort, searchQuery, collection]);

  const filteredIsoPins = useMemo(() => {
    return processPins(wantedPins, isoFilter, isoSort, searchQuery, collection);
  }, [wantedPins, isoFilter, isoSort, searchQuery, collection]);

  const gridData = useMemo(() => {
    if (activeTab === 'collections') {
      if (searchQuery) return filteredOwnedPins;
      if (expandedGroup) return groups.find(g => g.id === expandedGroup)?.pins || [];
      return groups;
    }
    if (activeTab === 'traders') return filteredTraderPins;
    if (activeTab === 'iso') return filteredIsoPins;
    return [];
  }, [activeTab, searchQuery, expandedGroup, groups, filteredOwnedPins, filteredTraderPins, filteredIsoPins]);

  const handleGroupPress = (item: GroupData) => {
    if (item.isBoard) {
      router.push({ pathname: '/board/[id]', params: { id: item.id } });
    } else if (item.isSet) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push({ pathname: '/set/[collection]' as any, params: { collection: item.id } });
    } else {
      setExpandedGroup(item.id);
      setExpandedGroupTitle(item.title);
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

  const openSet = async (setName: string) => {
    setSetPickerVisible(false);
    setSetPickerQuery('');
    await ensureCollections([setName]);
    router.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: '/set/[collection]' as any,
      params: { collection: setName },
    });
  };

  const renderHeader = () => (
    <View style={s.headerContent}>
      <View style={s.topSummary}>
        <Text style={[s.summaryText, { color: colors.mutedForeground }]}>
          {ownedIds.size} owned • {counts.forTrade} traders • {counts.wanted} ISO
        </Text>
      </View>

      <View style={[s.tabsRow, { borderBottomColor: colors.border }]}>
        {(['collections', 'traders', 'iso'] as const).map(tab => {
          const active = activeTab === tab;
          const label = tab === 'collections' ? 'Collections' : tab === 'traders' ? 'Traders' : 'ISO';
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                setActiveTab(tab);
                setExpandedGroup(null);
                setSearchQuery('');
              }}
              style={[s.tab, active && { borderBottomColor: colors.primary }]}
            >
              <Text style={[s.tabText, { color: active ? colors.foreground : colors.mutedForeground, fontFamily: active ? 'Inter_600SemiBold' : 'Inter_500Medium' }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'collections' && !expandedGroup && (
        <View style={s.tabHeader}>
          <View style={s.controlsRow}>
            <View style={[s.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search collection"
                placeholderTextColor={colors.mutedForeground}
                style={[s.searchInput, { color: colors.foreground }]}
                returnKeyType="search"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: colors.primary }]} onPress={() => setAddModalVisible(true)} activeOpacity={0.8}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={s.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {!searchQuery && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.groupByScroll}>
              <Text style={[s.groupByLabel, { color: colors.mutedForeground }]}>Group By:</Text>
              {GROUP_BY_OPTIONS.map(opt => {
                const active = groupBy === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                      setGroupBy(opt.id);
                    }}
                    style={[s.groupChip, {
                      backgroundColor: active ? colors.primary + '15' : colors.card,
                      borderColor: active ? colors.primary : colors.border
                    }]}
                  >
                    <Text style={[s.groupChipText, { color: active ? colors.primary : colors.mutedForeground }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {activeTab === 'collections' && expandedGroup && (
        <View style={s.expandedHeader}>
          <TouchableOpacity onPress={() => setExpandedGroup(null)} style={s.backBtn}>
            <Feather name="chevron-left" size={20} color={colors.foreground} />
            <Text style={[s.backBtnText, { color: colors.foreground }]}>{expandedGroupTitle}</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'traders' && (
        <View style={s.tabHeader}>
          <View style={s.tabHeaderRow}>
            <Text style={[s.tabCount, { color: colors.foreground }]}>{forTradePins.length} Trader Pins</Text>
            <TouchableOpacity style={s.shareBtn} onPress={() => router.push('/(tabs)/community')}>
              <Feather name="share" size={14} color={colors.primary} />
              <Text style={[s.shareBtnText, { color: colors.primary }]}>Share</Text>
            </TouchableOpacity>
          </View>
          <View style={s.controlsRow}>
            <View style={[s.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search traders"
                placeholderTextColor={colors.mutedForeground}
                style={[s.searchInput, { color: colors.foreground }]}
                returnKeyType="search"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={[s.utilBtn, { backgroundColor: colors.card, borderColor: (traderFilter !== 'all' || traderSort !== 'recent') ? colors.primary : colors.border }]} onPress={() => setFilterSheetTab('traders')}>
              <Feather name="sliders" size={18} color={(traderFilter !== 'all' || traderSort !== 'recent') ? colors.primary : colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {activeTab === 'iso' && (
        <View style={s.tabHeader}>
          <View style={s.tabHeaderRow}>
            <Text style={[s.tabCount, { color: colors.foreground }]}>{wantedPins.length} ISO Pins</Text>
            <TouchableOpacity style={s.shareBtn} onPress={() => router.push('/(tabs)/community')}>
              <Feather name="share" size={14} color={colors.primary} />
              <Text style={[s.shareBtnText, { color: colors.primary }]}>Share</Text>
            </TouchableOpacity>
          </View>
          <View style={s.controlsRow}>
            <View style={[s.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search ISO"
                placeholderTextColor={colors.mutedForeground}
                style={[s.searchInput, { color: colors.foreground }]}
                returnKeyType="search"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity style={[s.utilBtn, { backgroundColor: colors.card, borderColor: (isoFilter !== 'all' || isoSort !== 'recent') ? colors.primary : colors.border }]} onPress={() => setFilterSheetTab('iso')}>
              <Feather name="sliders" size={18} color={(isoFilter !== 'all' || isoSort !== 'recent') ? colors.primary : colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (activeTab === 'collections') {
      if (searchQuery) return <EmptyState icon="search" title="No pins found" subtitle="Try a different search term." />;
      if (groupBy === 'my_collections' && groups.length === 0) return <EmptyState icon="folder" title="No collections yet" subtitle="Create a collection to organise your pins." actionLabel="Create Collection" onAction={() => setCreateBoardVisible(true)} />;
      return <EmptyState icon="grid" title="Your collection is empty" subtitle="Scan a pin or search the catalogue to start." actionLabel="Scan a Pin" onAction={() => router.push('/(tabs)/scan')} />;
    }
    if (activeTab === 'traders') {
      if (searchQuery || traderFilter !== 'all') return <EmptyState icon="search" title="No pins found" subtitle="Try changing your search or filters." />;
      return <EmptyState icon="repeat" title="No traders yet" subtitle="Mark pins as 'For Trade' to see them here." />;
    }
    if (activeTab === 'iso') {
      if (searchQuery || isoFilter !== 'all') return <EmptyState icon="search" title="No pins found" subtitle="Try changing your search or filters." />;
      return <EmptyState icon="bookmark" title="No ISO pins yet" subtitle="Mark pins as 'ISO' to track what you're looking for." />;
    }
    return null;
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
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
            const preview = group.pins.slice(0, 4);
            return (
              <TouchableOpacity onPress={() => handleGroupPress(group)} activeOpacity={0.8} style={[s.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.groupPreviewArea, { backgroundColor: colors.secondary }]}>
                  {preview.length === 0 ? (
                    <View style={s.groupEmpty}>
                      <Feather name="folder" size={24} color={colors.mutedForeground} />
                    </View>
                  ) : preview.length === 1 ? (
                    <Image source={getPinImageSource(preview[0])} style={s.groupPreviewSingle} />
                  ) : (
                    <View style={s.groupPreviewGrid}>
                      {preview.map(p => (
                        <Image key={p.id} source={getPinImageSource(p)} style={[s.groupPreviewSmall, { borderColor: colors.card }]} />
                      ))}
                    </View>
                  )}
                </View>
                <View style={s.groupCardBottom}>
                  <Text style={[s.groupCardTitle, { color: colors.foreground }]} numberOfLines={1}>{group.title}</Text>
                  <Text style={[s.groupCardSub, { color: colors.mutedForeground }]} numberOfLines={1}>{group.subtitle}</Text>
                  {group.progress !== undefined && (
                    <View style={[s.groupProgressTrack, { backgroundColor: colors.secondary }]}>
                      <View style={[s.groupProgressFill, { width: `${Math.max(group.progress * 100, 2)}%`, backgroundColor: group.complete ? colors.owned : colors.primary }]} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }
          const pin = item as CataloguePin;
          return (
            <View style={s.gridItemWrap}>
              <PinCard pin={pin} mode="grid" onPress={() => router.push({ pathname: '/pin/[id]', params: { id: pin.id } })} />
            </View>
          );
        }}
      />

      {/* Add Menu Modal */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setAddModalVisible(false)}>
          <View style={[s.addMenuSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.addMenuHeader}>
              <Text style={[s.addMenuTitle, { color: colors.foreground }]}>Add to Collection</Text>
            </View>
            <TouchableOpacity
              style={[s.addMenuItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setAddModalVisible(false);
                router.push('/search');
              }}
            >
              <Feather name="search" size={20} color={colors.foreground} />
              <Text style={[s.addMenuText, { color: colors.foreground }]}>Add Pin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.addMenuItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setAddModalVisible(false);
                setSetPickerVisible(true);
              }}
            >
              <Feather name="layers" size={20} color={colors.foreground} />
              <Text style={[s.addMenuText, { color: colors.foreground }]}>Add / Track Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.addMenuItem} onPress={() => { setAddModalVisible(false); setCreateBoardVisible(true); }}>
              <Feather name="folder-plus" size={20} color={colors.foreground} />
              <Text style={[s.addMenuText, { color: colors.foreground }]}>Create Collection</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Set discovery uses trusted catalogue set metadata and existing Set Detail. */}
      <Modal visible={setPickerVisible} transparent animationType="fade" onRequestClose={() => setSetPickerVisible(false)}>
        <View style={s.modalBackdropCenter}>
          <View style={[s.setPickerModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.setPickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[s.modalTitle, { color: colors.foreground, marginBottom: 2 }]}>Add / Track Set</Text>
                <Text style={[s.setPickerSub, { color: colors.mutedForeground }]}>
                  Open a catalogue set to view progress and add missing pins to ISO.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSetPickerVisible(false)} style={s.closeBtn}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={[s.searchBox, s.setPickerSearch, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={setPickerQuery}
                onChangeText={setSetPickerQuery}
                placeholder="Search catalogue sets"
                placeholderTextColor={colors.mutedForeground}
                style={[s.searchInput, { color: colors.foreground }]}
                returnKeyType="search"
              />
            </View>
            <FlatList
              data={visibleSetSummaries}
              keyExtractor={summary => summary.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={s.setPickerEmpty}>
                  <Text style={[s.setPickerEmptyText, { color: colors.mutedForeground }]}>
                    {repository ? 'No catalogue sets found.' : 'Set catalogue is unavailable.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => void openSet(item.setName)}
                  style={[s.setPickerRow, { borderBottomColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.setPickerName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.setName}
                    </Text>
                    <Text style={[s.setPickerMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {[
                        item.releaseYear,
                        `${item.releasedPinCount}${item.expectedPinCount ? ` / ${item.expectedPinCount}` : ''} pins`,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Create Board Modal */}
      <Modal visible={createBoardVisible} transparent animationType="fade" onRequestClose={() => setCreateBoardVisible(false)}>
        <View style={s.modalBackdropCenter}>
          <View style={[s.createBoardModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>New Collection</Text>
            <TextInput
              value={newBoardName}
              onChangeText={setNewBoardName}
              placeholder="Collection Name"
              placeholderTextColor={colors.mutedForeground}
              style={[s.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateBoard}
            />
            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setCreateBoardVisible(false)} style={s.modalBtn}>
                <Text style={[s.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateBoard} disabled={!newBoardName.trim()} style={[s.modalBtn, s.modalBtnPrimary, { backgroundColor: newBoardName.trim() ? colors.primary : colors.secondary }]}>
                <Text style={[s.modalBtnText, { color: newBoardName.trim() ? '#fff' : colors.mutedForeground }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Filter / Sort Modal */}
      <Modal visible={filterSheetTab !== null} transparent animationType="fade" onRequestClose={() => setFilterSheetTab(null)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setFilterSheetTab(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.addMenuSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.addMenuHeader}>
              <Text style={[s.addMenuTitle, { color: colors.foreground }]}>
                {filterSheetTab === 'traders' ? 'Traders' : 'ISO'} View Options
              </Text>
            </View>

            <View style={s.sheetContent}>
              <Text style={[s.sheetSectionTitle, { color: colors.mutedForeground }]}>Filter by Edition</Text>
              <View style={s.sheetRow}>
                {(['all', 'le', 'open'] as const).map(f => {
                  const active = filterSheetTab === 'traders' ? traderFilter === f : isoFilter === f;
                  const label = f === 'all' ? 'All' : f === 'le' ? 'Limited' : 'Open/Core';
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[s.sheetChip, {
                        backgroundColor: active ? colors.primary + '15' : colors.secondary,
                        borderColor: active ? colors.primary : 'transparent'
                      }]}
                      onPress={() => {
                        if (filterSheetTab === 'traders') setTraderFilter(f);
                        else setIsoFilter(f);
                      }}
                    >
                      <Text style={[s.sheetChipText, { color: active ? colors.primary : colors.foreground }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[s.sheetSectionTitle, { color: colors.mutedForeground, marginTop: 20 }]}>Sort by</Text>
              <View style={s.sheetRowWrap}>
                {(['recent', 'name', 'year', 'value'] as const).map(sOpt => {
                  const active = filterSheetTab === 'traders' ? traderSort === sOpt : isoSort === sOpt;
                  const label = sOpt === 'recent' ? 'Recently Added' : sOpt === 'name' ? 'Name (A-Z)' : sOpt === 'year' ? 'Year (Newest)' : 'Est. Value';
                  return (
                    <TouchableOpacity
                      key={sOpt}
                      style={[s.sheetChip, {
                        backgroundColor: active ? colors.primary + '15' : colors.secondary,
                        borderColor: active ? colors.primary : 'transparent'
                      }]}
                      onPress={() => {
                        if (filterSheetTab === 'traders') setTraderSort(sOpt);
                        else setIsoSort(sOpt);
                      }}
                    >
                      <Text style={[s.sheetChipText, { color: active ? colors.primary : colors.foreground }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
  topSummary: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  summaryText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  tab: { marginRight: 24, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15 },
  tabHeader: { paddingBottom: 4 },
  tabHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  tabCount: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  shareBtn: { minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'transparent' },
  shareBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', height: '100%' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  utilBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  groupByScroll: { paddingHorizontal: 16, alignItems: 'center', gap: 8, paddingBottom: 8 },
  groupByLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', marginRight: 4 },
  groupChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, borderWidth: 1 },
  groupChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  expandedHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, marginBottom: 8 },
  backBtn: { minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  flatListContent: { paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'flex-start' },
  gridItemWrap: { width: GRID_CARD_WIDTH, marginBottom: 12 },
  groupCard: { width: GRID_CARD_WIDTH, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 12 },
  groupPreviewArea: { height: GRID_CARD_WIDTH * 0.8 },
  groupEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  groupPreviewSingle: { width: '100%', height: '100%', resizeMode: 'cover' },
  groupPreviewGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', height: '100%' },
  groupPreviewSmall: { width: '50%', height: '50%', resizeMode: 'cover', borderWidth: 0.5 },
  groupCardBottom: { padding: 10 },
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
  setPickerModal: { margin: 18, maxHeight: '78%', alignSelf: 'stretch', borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  setPickerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  setPickerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  setPickerSearch: { flex: 0, marginBottom: 8, paddingHorizontal: 12 },
  setPickerRow: { minHeight: 58, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  setPickerName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  setPickerMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  setPickerEmpty: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  setPickerEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginBottom: 16 },
  modalInput: { height: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 8 },
  modalBtnPrimary: { paddingHorizontal: 20 },
  modalBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sheetContent: { padding: 16 },
  sheetSectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sheetRow: { flexDirection: 'row', gap: 8 },
  sheetRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, borderWidth: 1 },
  sheetChipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
