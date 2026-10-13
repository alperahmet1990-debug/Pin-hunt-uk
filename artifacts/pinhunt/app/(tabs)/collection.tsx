import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
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
import { setSummariesFromPins } from '@/utils/setSummariesFromPins';
import { ADD_PINS_ROUTE } from '@/utils/addPinsOnboarding';
import { PhotoGapsCard } from '@/components/PhotoGapsCard';
import { getPinImageSource } from '@/utils/pinImage';
import { EmptyState } from '@/components/EmptyState';
import { usePinActions } from '@/components/PinActionsSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { BulkSelectBar, BULK_BAR_HEIGHT, tabBarOffset } from '@/components/BulkSelectBar';
import { usePinSelection } from '@/hooks/usePinSelection';
import { SegmentedControl, Sheet, PinTile, pinGridColumns, pinTileSize, PIN_GRID_GUTTER } from '@/components/ui';
import { spacing } from '@/constants/theme';
import type { SegmentedControlOption } from '@/components/ui';
import {
  type CataloguePin,
  type PinSetSummary,
} from '@workspace/pin-repository';

// All is the default (B-P1-03): owned pins first, with Boards as a row on it.
type Tab = 'all' | 'sets' | 'traders' | 'iso';
// No icons here — at 4-up and ~375px, the icon + gap is exactly the width
// "For Trade" needs to render without shrinking type or squeezing the pill.
const TAB_OPTIONS: SegmentedControlOption<Tab>[] = [
  { value: 'all', label: 'All', tone: 'coral' },
  { value: 'sets', label: 'Sets', tone: 'coral' },
  { value: 'traders', label: 'For Trade', tone: 'coral' },
  { value: 'iso', label: 'ISO', tone: 'coral' },
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
  isSet?: boolean;
  setId?: string;
  progress?: number;
  complete?: boolean;
}

type PinFilterType = 'all' | 'le' | 'open';
// No value sort: estimates aren't reliable enough to order by (B-P1-19).
type PinSortType = 'recent' | 'name' | 'year';

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
    const dateA = collectionMap[a.id]?.dateAdded || '';
    const dateB = collectionMap[b.id]?.dateAdded || '';
    return dateB.localeCompare(dateA);
  });
  return res;
}

/** A full-width row that links out of the grid: icon, label, one-line detail, chevron. */
function LinkRow({ icon, label, detail, onPress, colors }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  detail: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={[s.linkRow, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={[s.linkRowIcon, { backgroundColor: colors.homeAqua }]}>
        <Feather name={icon} size={16} color={colors.homeCoralDeep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.linkRowLabel, { color: colors.homeInk }]}>{label}</Text>
        <Text style={[s.linkRowDetail, { color: colors.homeMuted }]} numberOfLines={1}>{detail}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.homeMuted} />
    </TouchableOpacity>
  );
}

/** One-tap route from the For Trade and ISO tabs to Find Trades (UX-001). */
function FindTradesRow({ detail, onPress, colors }: {
  detail: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return <LinkRow icon="compass" label="Find trades for these" detail={detail} onPress={onPress} colors={colors} />;
}

/** Boards stay one tap away on All (B-P1-03): "+ New board" first, then each board. */
function BoardsRow({ boards, onNewBoard, onOpenBoard, colors }: {
  boards: { id: string; title: string; count: number }[];
  onNewBoard: () => void;
  onOpenBoard: (id: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={s.boardsRow}>
      <Text style={[s.boardsRowTitle, { color: colors.homeMuted }]}>Boards</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.boardsRowContent}>
        <TouchableOpacity
          onPress={onNewBoard}
          accessibilityRole="button"
          accessibilityLabel="New board"
          style={[s.boardChip, { backgroundColor: colors.homeAqua, borderColor: colors.homeCoral }]}
        >
          <Feather name="plus" size={14} color={colors.homeCoralDeep} />
          <Text style={[s.boardChipText, { color: colors.homeCoralDeep }]}>New board</Text>
        </TouchableOpacity>
        {boards.map(board => (
          <TouchableOpacity
            key={board.id}
            onPress={() => onOpenBoard(board.id)}
            accessibilityRole="button"
            accessibilityLabel={`${board.title}, ${board.count} pin${board.count === 1 ? '' : 's'}`}
            style={[s.boardChip, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
          >
            <Feather name="folder" size={14} color={colors.homeMuted} />
            <Text style={[s.boardChipText, { color: colors.homeInk }]} numberOfLines={1}>{board.title}</Text>
            <Text style={[s.boardChipCount, { color: colors.homeMuted }]}>{board.count}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function CollectionScreen() {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const gridCardWidth = (screenWidth - 16 * 2 - 12) / 2;
  const pinColumns = pinGridColumns(screenWidth);
  const tileSize = pinTileSize(screenWidth, pinColumns, spacing.lg);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pinActions = usePinActions();
  // Bulk edits on All / For Trade / ISO (UX-017).
  const selection = usePinSelection();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { collection } = useCollection();
  const { pins: catalogue, ensurePins, ensureCollections, repository } = usePinCatalogue();
  const { customBoards, createBoard, getBoardPins } = useBoards();

  const [activeTab, setActiveTab] = useState<Tab>('all');
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
  const [filterSheetTab, setFilterSheetTab] = useState<'traders' | 'iso' | 'sets' | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [repoSetSummaries, setSetSummaries] = useState<PinSetSummary[]>([]);
  const [createBoardVisible, setCreateBoardVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  useEffect(() => {
    // 'boards' is the old default tab; its links now land on All, where the Boards row is.
    const tab = params.tab === 'boards' ? 'all' : params.tab;
    if (tab && ['all', 'sets', 'traders', 'iso'].includes(tab)) {
      setActiveTab(tab as Tab);
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
  // Mock mode has no set summaries endpoint, so derive them from the catalogue.
  const setSummaries = useMemo(
    () => (repository ? repoSetSummaries : setSummariesFromPins(catalogue)),
    [repository, repoSetSummaries, catalogue],
  );

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

  const boardRowItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return customBoards
      .map(b => ({ id: b.id, title: b.name, pins: getBoardPins(b) }))
      .filter(board => !query || board.title.toLowerCase().includes(query) || board.pins.some(pin => pinMatchesSearch(pin, query)))
      .map(board => ({ id: board.id, title: board.title, count: board.pins.length }));
  }, [customBoards, getBoardPins, searchQuery]);

  const filteredTraderPins = useMemo(() => {
    return processPins(forTradePins, traderFilter, traderSort, searchQuery, collection);
  }, [forTradePins, traderFilter, traderSort, searchQuery, collection]);

  const filteredIsoPins = useMemo(() => {
    return processPins(wantedPins, isoFilter, isoSort, searchQuery, collection);
  }, [wantedPins, isoFilter, isoSort, searchQuery, collection]);

  const gridData = useMemo(() => {
    if (activeTab === 'all') return filteredOwnedPins;
    if (activeTab === 'sets') return setGroups;
    if (activeTab === 'traders') return filteredTraderPins;
    if (activeTab === 'iso') return filteredIsoPins;
    return [];
  }, [activeTab, filteredOwnedPins, setGroups, filteredTraderPins, filteredIsoPins]);
  // Pin tabs use the shared 3-column PinTile grid (B-P1-04); Sets keep 2-up cards.
  const pinGrid = activeTab !== 'sets';
  const visiblePinIds = useMemo(
    () => (pinGrid ? (gridData as CataloguePin[]).map(p => p.id) : []),
    [pinGrid, gridData],
  );
  // Selected ids in the order they appear, for the bulk bar.
  const selectedIds = useMemo(() => [...selection.selected], [selection.selected]);
  const allPinsFiltered = Object.keys(pinFilters).length > 0 || allPinsSort !== 'recent';

  const handleGroupPress = (item: GroupData) => {
    if (item.isSet) {
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
          <IconButton
            icon="search"
            iconSize={24}
            accessibilityLabel={searchActive ? 'Close search' : 'Search my collection'}
            active={searchActive}
            onPress={() => {
              setSearchActive(!searchActive);
              if (searchActive) setSearchQuery('');
            }}
          />
          <IconButton icon="plus" iconSize={24} accessibilityLabel="Add pins" onPress={() => setAddModalVisible(true)} />
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
            selection.stop();
          }}
        />
      </View>

      {/* Contributors: owned pins with no catalogue photo yet (UX-056). */}
      <PhotoGapsCard style={s.photoGapsCard} />

      {/* Contextual Stats & Search */}
      <View style={s.contextualArea}>
        {activeTab === 'all' && (
          <>
          <BoardsRow
            boards={boardRowItems}
            onNewBoard={() => setCreateBoardVisible(true)}
            onOpenBoard={id => router.push({ pathname: '/board/[id]', params: { id } })}
            colors={colors}
          />
          <View style={[s.statsRow, { justifyContent: 'space-between' }]}>
            <Text style={[s.statText, { color: colors.homeInk }]}>
              {ownedIds.size} <Text style={{ color: colors.homeMuted }}>Owned</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {!selection.active && filteredOwnedPins.length > 0 && (
                <TouchableOpacity onPress={selection.start} style={s.iconStatBtn} accessibilityRole="button" accessibilityLabel="Select pins">
                  <Feather name="check-square" size={16} color={colors.homeInk} />
                  <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Select</Text>
                </TouchableOpacity>
              )}
              {!searchActive && ownedIds.size > 0 && (
              <TouchableOpacity onPress={() => setAllPinsFilterVisible(true)} style={s.iconStatBtn} accessibilityRole="button" accessibilityLabel="Filter and sort pins">
                <Feather name="sliders" size={16} color={allPinsFiltered ? colors.homeCoral : colors.homeInk} />
                <Text style={[s.iconStatBtnText, { color: allPinsFiltered ? colors.homeCoral : colors.homeInk }]}>Filter</Text>
              </TouchableOpacity>
            )}
            </View>
          </View>
          </>
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
          <>
          <View style={[s.statsRow, { justifyContent: 'space-between' }]}>
            <Text style={[s.statText, { color: colors.homeInk }]}>
              {forTradePins.length} <Text style={{ color: colors.homeMuted }}>For Trade</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {!selection.active && filteredTraderPins.length > 0 && (
                <TouchableOpacity onPress={selection.start} style={s.iconStatBtn} accessibilityRole="button" accessibilityLabel="Select pins">
                  <Feather name="check-square" size={16} color={colors.homeInk} />
                  <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Select</Text>
                </TouchableOpacity>
              )}
              {!searchActive && (
                <TouchableOpacity onPress={() => setFilterSheetTab('traders')} style={s.iconStatBtn}>
                  <Feather name="sliders" size={16} color={colors.homeInk} />
                  <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Sort</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {forTradePins.length > 0 && !searchActive && (
            <FindTradesRow
              detail="See who wants your For Trade pins"
              onPress={() => router.push('/find-trades')}
              colors={colors}
            />
          )}
          </>
        )}
        {activeTab === 'iso' && (
          <>
          <View style={[s.statsRow, { justifyContent: 'space-between' }]}>
            <Text style={[s.statText, { color: colors.homeInk }]}>
              {wantedPins.length} <Text style={{ color: colors.homeMuted }}>ISO</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {!selection.active && filteredIsoPins.length > 0 && (
                <TouchableOpacity onPress={selection.start} style={s.iconStatBtn} accessibilityRole="button" accessibilityLabel="Select pins">
                  <Feather name="check-square" size={16} color={colors.homeInk} />
                  <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Select</Text>
                </TouchableOpacity>
              )}
              {!searchActive && (
                <TouchableOpacity onPress={() => setFilterSheetTab('iso')} style={s.iconStatBtn}>
                  <Feather name="sliders" size={16} color={colors.homeInk} />
                  <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Sort</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {wantedPins.length > 0 && !searchActive && (
            <FindTradesRow
              detail="See who has your ISO pins"
              onPress={() => router.push('/find-trades')}
              colors={colors}
            />
          )}
          </>
        )}

        {pinGrid && selection.active && (
          <View style={[s.selectionRow, { backgroundColor: colors.homeAqua }]}>
            <Text accessibilityLiveRegion="polite" style={[s.statText, { color: colors.homeInk, flex: 1 }]}>
              {selection.count} selected
            </Text>
            {/* Select all respects the current search and filters. */}
            <TouchableOpacity onPress={() => selection.toggleAll(visiblePinIds)} accessibilityRole="button" style={s.iconStatBtn}>
              <Text style={[s.iconStatBtnText, { color: colors.homeCoralDeep }]}>
                {selection.allSelected(visiblePinIds) ? 'Clear' : `Select all ${visiblePinIds.length}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={selection.stop} accessibilityRole="button" accessibilityLabel="Cancel selecting" style={s.iconStatBtn}>
              <Text style={[s.iconStatBtnText, { color: colors.homeInk }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {searchActive && (
          <View style={s.controlsRow}>
            <View style={[s.searchBox, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
              <Feather name="search" size={16} color={colors.homeMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={activeTab === 'all' ? 'Search pins & boards' : activeTab === 'traders' ? 'Search For Trade' : activeTab === 'iso' ? 'Search ISO' : 'Search sets'}
                placeholderTextColor={colors.homeMuted}
                style={[s.searchInput, { color: colors.homeInk }]}
                returnKeyType="search"
                autoFocus
              />
              {searchQuery ? (
                <IconButton icon="x-circle" iconSize={16} color={colors.homeMuted} accessibilityLabel="Clear search" onPress={() => setSearchQuery('')} style={s.inputClear} />
              ) : null}
            </View>
            <TouchableOpacity
              style={[s.utilBtn, {
                backgroundColor: colors.homeSurface,
                borderColor: activeTab === 'all' && allPinsFiltered ? colors.homeCoral : colors.homeLine,
              }]}
              accessibilityRole="button"
              accessibilityLabel="Filter and sort"
              onPress={() => {
                if (activeTab === 'all') setAllPinsFilterVisible(true);
                else setFilterSheetTab(activeTab);
              }}
            >
              <Feather name="sliders" size={18} color={activeTab === 'all' && allPinsFiltered ? colors.homeCoral : colors.homeInk} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (activeTab === 'all') {
      if (searchActive && searchQuery || Object.keys(pinFilters).length > 0) {
        return <EmptyState icon="search" title="No pins found" subtitle="Try changing your search or filters." />;
      }
      return (
        <View>
          <EmptyState icon="camera" title="No pins yet" subtitle="Scan a pin, or search the catalogue and add the ones you own." actionLabel="Scan a pin" onAction={() => router.push('/(tabs)/scan')} />
          <View style={{ marginHorizontal: -16 }}>
            <LinkRow icon="search" label="Search for a pin" detail="Find one pin in the catalogue" onPress={() => router.push('/search')} colors={colors} />
            <LinkRow icon="grid" label="Add pins you own" detail="Select many from the catalogue" onPress={() => router.push(ADD_PINS_ROUTE)} colors={colors} />
          </View>
        </View>
      );
    }
    if (activeTab === 'sets') {
      if (searchActive && searchQuery) return <EmptyState icon="search" title="No results found" subtitle="Try a different search term." />;
      if (setProgressFilter !== 'all') {
        return <EmptyState icon="bookmark" title="No sets found" subtitle="No sets match this progress filter." actionLabel="Show all sets" onAction={() => setSetProgressFilter('all')} />;
      }
      return <EmptyState icon="bookmark" title="No sets started" subtitle="Sets appear here automatically once you own a pin from one." actionLabel="Add pins you own" onAction={() => router.push(ADD_PINS_ROUTE)} />;
    }
    if (activeTab === 'traders') {
      if (searchActive && searchQuery || traderFilter !== 'all') return <EmptyState icon="search" title="No pins found" subtitle="Try changing your search or filters." />;
      return <EmptyState icon="repeat" title="No pins for trade yet" subtitle="Mark pins you own as For Trade and they'll show up here." actionLabel="Choose pins to trade" onAction={() => router.push('/search')} />;
    }
    if (activeTab === 'iso') {
      if (searchActive && searchQuery || isoFilter !== 'all') return <EmptyState icon="search" title="No pins found" subtitle="Try changing your search or filters." />;
      return <EmptyState icon="bookmark" title="No ISO pins yet" subtitle="Add the pins you're looking for to your ISO to keep track of them." actionLabel="Find a pin to add" onAction={() => router.push('/search')} />;
    }
    return null;
  };

  return (
    <View style={[s.root, { backgroundColor: colors.homeBackground, paddingTop: topPad }]}>
      <FlatList<CataloguePin | GroupData>
        data={gridData}
        keyExtractor={item => ('isGroup' in item ? item.id : item.id)}
        numColumns={pinGrid ? pinColumns : 2}
        key={pinGrid ? `pin-grid-${pinColumns}` : 'grid-2'}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          activeTab === 'sets' && gridData.length > 0 ? (
            // Sets only lists sets you've started; this reaches the rest (UX-025).
            <View style={s.listFooter}>
              <LinkRow
                icon="grid"
                label="Browse all sets"
                detail="Find new sets to start"
                onPress={() => router.push('/browse-catalogue')}
                colors={colors}
              />
            </View>
          ) : null
        }
        columnWrapperStyle={pinGrid ? s.pinGridRow : s.gridRow}
        contentContainerStyle={[s.flatListContent, { paddingBottom: botPad + (selection.active ? BULK_BAR_HEIGHT : 0) }]}
        extraData={selection.selected}
        renderItem={({ item }) => {
          if ('isGroup' in item) {
            const group = item as GroupData;

            // Sets use the visual group card
            const preview = group.pins.slice(0, 4);
            return (
              <TouchableOpacity onPress={() => handleGroupPress(group)} activeOpacity={0.8} style={[s.groupCard, { width: gridCardWidth, backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                <View style={[s.groupPreviewArea, { height: gridCardWidth * 0.8, backgroundColor: colors.homeAqua }]}>
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
          const entry = collection[pin.id];
          return (
            <View style={{ width: tileSize }}>
              <PinTile
                title={pin.title}
                imageUrl={pin.imageUrl}
                size={tileSize}
                // For Trade and ISO tabs already say the status; All marks only For Trade.
                status={activeTab === 'all' && entry?.status === 'for_trade' ? 'for_trade' : undefined}
                copies={entry?.quantity}
                selected={selection.active ? selection.has(pin.id) : undefined}
                onPress={() => (selection.active
                  ? selection.toggle(pin.id)
                  : router.push({ pathname: '/pin/[id]', params: { id: pin.id } }))}
                onLongPress={selection.active ? undefined : () => pinActions.open(pin)}
                {...(selection.active ? {} : pinActions.a11y(pin))}
              />
            </View>
          );
        }}
      />

      {/* Add Menu Modal */}
      <Sheet visible={addModalVisible} onClose={() => setAddModalVisible(false)} title="Add to Collection">
        {/* Building a collection: many at once first, then one at a time (UX-055). */}
        <TouchableOpacity
          style={[s.addMenuItem, { borderBottomColor: colors.homeLine }]}
          accessibilityRole="button"
          onPress={() => { setAddModalVisible(false); router.push(ADD_PINS_ROUTE); }}
        >
          <Feather name="grid" size={24} color={colors.homeInk} />
          <View style={{ flex: 1 }}>
            <Text style={[s.addMenuText, { color: colors.homeInk }]}>Add pins you own</Text>
            <Text style={[s.addMenuSub, { color: colors.homeMuted }]}>Select many from the catalogue</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.addMenuItem, { borderBottomColor: colors.homeLine }]}
          accessibilityRole="button"
          onPress={() => { setAddModalVisible(false); router.push('/(tabs)/scan'); }}
        >
          <Feather name="camera" size={24} color={colors.homeInk} />
          <Text style={[s.addMenuText, { color: colors.homeInk }]}>Scan a pin</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.addMenuItem, { borderBottomColor: colors.homeLine }]}
          accessibilityRole="button"
          onPress={() => { setAddModalVisible(false); router.push('/search'); }}
        >
          <Feather name="search" size={24} color={colors.homeInk} />
          <Text style={[s.addMenuText, { color: colors.homeInk }]}>Search for a pin</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.addMenuItem, { borderBottomWidth: 0 }]}
          accessibilityRole="button"
          onPress={() => { setAddModalVisible(false); setCreateBoardVisible(true); }}
        >
          <Feather name="folder-plus" size={24} color={colors.homeInk} />
          <Text style={[s.addMenuText, { color: colors.homeInk }]}>Create Board</Text>
        </TouchableOpacity>
      </Sheet>

      {/* Create Board: input at the top of a Sheet so it stays above the keyboard (UX-041). */}
      <Sheet
        visible={createBoardVisible}
        onClose={() => setCreateBoardVisible(false)}
        title="New board"
        footer={
          <Button label="Create" disabled={!newBoardName.trim()} onPress={handleCreateBoard} />
        }
      >
        <TextInput
          value={newBoardName}
          onChangeText={setNewBoardName}
          placeholder="Board name"
          placeholderTextColor={colors.homeMuted}
          accessibilityLabel="Board name"
          style={[s.modalInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleCreateBoard}
        />
      </Sheet>

      {pinActions.sheet}
      {pinGrid && selection.active && (
        <BulkSelectBar ids={selectedIds} onDone={selection.stop} bottomOffset={tabBarOffset(insets.bottom)} />
      )}

      {/* Secondary owned-pin metadata filter and sort */}
      <Modal visible={allPinsFilterVisible} transparent animationType="slide" onRequestClose={() => setAllPinsFilterVisible(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.filterSheet, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={s.filterSheetHeader}>
              <Text style={[s.modalTitle, { color: colors.homeInk, marginBottom: 0 }]}>Filter Pins</Text>
              <View style={s.filterHeaderActions}>
                {(Object.keys(pinFilters).length > 0 || allPinsSort !== 'recent') && (
                  <Button variant="text" label="Clear" accessibilityLabel="Clear filters and sort" onPress={() => { setPinFilters({}); setAllPinsSort('recent'); }} />
                )}
                <IconButton icon="x" accessibilityLabel="Close" onPress={() => setAllPinsFilterVisible(false)} />
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
                  {(['recent', 'name', 'year'] as const).map(option => {
                    const active = allPinsSort === option;
                    const label = option === 'recent' ? 'Recently Added' : option === 'name' ? 'Name' : 'Release date';
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
            <Button
              label={`Show ${filteredOwnedPins.length} pin${filteredOwnedPins.length === 1 ? '' : 's'}`}
              onPress={() => setAllPinsFilterVisible(false)}
              style={s.applyBtn}
            />
          </View>
        </View>
      </Modal>

      {/* Filter / Sort Modal */}
      <Sheet
        visible={filterSheetTab !== null}
        onClose={() => setFilterSheetTab(null)}
        title={`${filterSheetTab === 'traders' ? 'For Trade' : filterSheetTab === 'iso' ? 'ISO' : filterSheetTab === 'sets' ? 'Sets' : 'Pins'} View Options`}
      >
        <View>
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
                {(['recent', 'name', 'year'] as const).map(sOpt => {
                  const active = filterSheetTab === 'traders' ? traderSort === sOpt : isoSort === sOpt;
                  const label = sOpt === 'recent' ? 'Recently Added' : sOpt === 'name' ? 'Name (A-Z)' : 'Year (Newest)';
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
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  headerContent: { paddingBottom: 8 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  pageTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contextualArea: { paddingBottom: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  statText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  photoGapsCard: { marginTop: 0, marginBottom: 12, marginHorizontal: 16 },
  listFooter: { marginTop: 8, marginHorizontal: -16 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  linkRowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  linkRowLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  linkRowDetail: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  tabsRow: { paddingHorizontal: 16, marginBottom: 14 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15 },
  tabHeader: { paddingBottom: 4 },
  tabHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  tabCount: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  iconStatBtn: { minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'transparent' },
  iconStatBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  selectionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 16, marginBottom: 8, paddingLeft: 12, borderRadius: 12 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', height: '100%' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 14 },
  addBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  utilBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  flatListContent: { paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'flex-start' },
  pinGridRow: { gap: PIN_GRID_GUTTER, marginBottom: spacing.lg, justifyContent: 'flex-start' },
  boardsRow: { marginBottom: 4 },
  boardsRowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 16, marginBottom: 8 },
  boardsRowContent: { paddingHorizontal: 16, gap: 8 },
  boardChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, maxWidth: 200, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1 },
  boardChipText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  boardChipCount: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  groupCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 12 },
  groupPreviewArea: {},
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
  addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  addMenuText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  addMenuSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginBottom: 16 },
  modalInput: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  sheetSectionTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sheetRow: { flexDirection: 'row', gap: 8 },
  sheetRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, borderWidth: 1 },
  sheetChipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  filterSheet: { maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  filterSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  filterHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterScrollContent: { paddingBottom: 12 },
  filterSection: { marginTop: 14 },
  compactChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, borderWidth: 1 },
  compactChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  applyBtn: { marginTop: 6 },
  // 44 pt target that overhangs the 44 pt search box rather than growing it.
  inputClear: { marginRight: -spacing.md },
});
