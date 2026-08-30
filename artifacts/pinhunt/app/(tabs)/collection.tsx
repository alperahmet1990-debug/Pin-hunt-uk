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
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getPinImageSource } from '@/utils/pinImage';
import { PinCard } from '@/components/PinCard';
import { EmptyState } from '@/components/EmptyState';
import {
  createSupabaseUserRepository,
  type CataloguePin,
  type IUserPinRepository,
  type PinSetSummary,
} from '@workspace/pin-repository';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - 12) / 2;

type Tab = 'collections' | 'traders' | 'iso';
type CollectionView = 'all' | 'boards' | 'sets';
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
  const { user } = useAuth();
  const { collection, counts } = useCollection();
  const { pins: catalogue, ensureCollections, repository } = usePinCatalogue();
  const { customBoards, createBoard, getBoardPins } = useBoards();

  const [activeTab, setActiveTab] = useState<Tab>('collections');
  const [collectionView, setCollectionView] = useState<CollectionView>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pinFilters, setPinFilters] = useState<MetadataFilters>({});
  const [allPinsSort, setAllPinsSort] = useState<PinSortType>('recent');
  const [allPinsFilterVisible, setAllPinsFilterVisible] = useState(false);
  const [setProgressFilter, setSetProgressFilter] = useState<SetProgressFilter>('all');

  const [traderFilter, setTraderFilter] = useState<PinFilterType>('all');
  const [traderSort, setTraderSort] = useState<PinSortType>('recent');
  const [isoFilter, setIsoFilter] = useState<PinFilterType>('all');
  const [isoSort, setIsoSort] = useState<PinSortType>('recent');
  const [filterSheetTab, setFilterSheetTab] = useState<'traders' | 'iso' | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [setPickerVisible, setSetPickerVisible] = useState(false);
  const [setPickerQuery, setSetPickerQuery] = useState('');
  const [setSummaries, setSetSummaries] = useState<PinSetSummary[]>([]);
  const [trackedSetIds, setTrackedSetIds] = useState<Set<string>>(new Set());
  const [trackingSetId, setTrackingSetId] = useState<string | null>(null);
  const [trackError, setTrackError] = useState('');
  const [createBoardVisible, setCreateBoardVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 40) : insets.top;
  const botPad = Platform.OS === 'web' ? 120 : insets.bottom + 120;
  const userRepo = useMemo(
    () => isSupabaseConfigured
      ? createSupabaseUserRepository(supabase as any) as IUserPinRepository
      : null,
    [],
  );

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

  useEffect(() => {
    if (!userRepo || !user?.id) {
      setTrackedSetIds(new Set());
      return;
    }
    let cancelled = false;
    // Tracking is private state. Do not leave a previous account's set cards
    // visible while this account's RLS-scoped request is in flight.
    setTrackedSetIds(new Set());
    setTrackError('');
    userRepo.getTrackedSetIds(user.id)
      .then(ids => {
        if (!cancelled) setTrackedSetIds(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setTrackError('Unable to load tracked sets.');
      });
    return () => { cancelled = true; };
  }, [userRepo, user?.id]);

  useEffect(() => {
    const names = setSummaries
      .filter(summary => trackedSetIds.has(summary.id))
      .map(summary => summary.setName);
    if (names.length > 0) void ensureCollections(names);
  }, [setSummaries, trackedSetIds, ensureCollections]);

  const ownedPins = useMemo(() => catalogue.filter(pin => ownedIds.has(pin.id)), [catalogue, ownedIds]);
  const forTradePins = useMemo(() => catalogue.filter(pin => forTradeIds.has(pin.id)), [catalogue, forTradeIds]);
  const wantedPins = useMemo(() => catalogue.filter(pin => wantedIds.has(pin.id)), [catalogue, wantedIds]);

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

  const setGroups = useMemo<GroupData[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    return setSummaries
      .filter(summary => trackedSetIds.has(summary.id))
      .map(summary => {
        const pins = catalogue.filter(pin => pin.collection === summary.setName);
        const ownedCount = pins.filter(pin => ownedIds.has(pin.id)).length;
        // Use the same catalogue membership that Set Detail renders. The
        // summary's release count is useful metadata, but may include pins
        // not currently available to the client and would make the two
        // progress displays disagree.
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
      })
      .filter(group =>
        (!query || group.title.toLowerCase().includes(query)) &&
        (setProgressFilter === 'all' || (setProgressFilter === 'complete' ? group.complete : !group.complete)),
      );
  }, [setSummaries, trackedSetIds, catalogue, ownedIds, searchQuery, setProgressFilter]);

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

  const filteredTraderPins = useMemo(() => {
    return processPins(forTradePins, traderFilter, traderSort, searchQuery, collection);
  }, [forTradePins, traderFilter, traderSort, searchQuery, collection]);

  const filteredIsoPins = useMemo(() => {
    return processPins(wantedPins, isoFilter, isoSort, searchQuery, collection);
  }, [wantedPins, isoFilter, isoSort, searchQuery, collection]);

  const gridData = useMemo(() => {
    if (activeTab === 'collections') {
      if (collectionView === 'all') return filteredOwnedPins;
      if (collectionView === 'boards') return boardGroups;
      return setGroups;
    }
    if (activeTab === 'traders') return filteredTraderPins;
    if (activeTab === 'iso') return filteredIsoPins;
    return [];
  }, [activeTab, collectionView, filteredOwnedPins, boardGroups, setGroups, filteredTraderPins, filteredIsoPins]);

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

  const trackSet = async (summary: PinSetSummary) => {
    if (trackedSetIds.has(summary.id)) return;
    if (!userRepo || !user?.id) {
      setTrackError('Sign in to track a set.');
      return;
    }
    setTrackingSetId(summary.id);
    setTrackError('');
    setTrackedSetIds(current => new Set(current).add(summary.id));
    try {
      await userRepo.trackSet(user.id, summary.id);
      setSetPickerVisible(false);
      setSetPickerQuery('');
      setCollectionView('sets');
      setSearchQuery('');
      void ensureCollections([summary.setName]);
    } catch {
      setTrackedSetIds(current => {
        const next = new Set(current);
        next.delete(summary.id);
        return next;
      });
      setTrackError('Unable to track this set. Please try again.');
    } finally {
      setTrackingSetId(null);
    }
  };

  const untrackSet = async (setId: string) => {
    if (!userRepo || !user?.id) return;
    setTrackedSetIds(current => {
      const next = new Set(current);
      next.delete(setId);
      return next;
    });
    try {
      await userRepo.untrackSet(user.id, setId);
    } catch {
      setTrackedSetIds(current => new Set(current).add(setId));
      setTrackError('Unable to stop tracking this set.');
    }
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
          const label = tab === 'collections' ? 'Collection' : tab === 'traders' ? 'Traders' : 'ISO';
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                setActiveTab(tab);
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

      {activeTab === 'collections' && (
        <View style={s.tabHeader}>
          <View style={s.controlsRow}>
            <View style={[s.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={collectionView === 'all' ? 'Search my pins' : collectionView === 'boards' ? 'Search boards' : 'Search tracked sets'}
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
          <View style={[s.collectionNavRow, { borderBottomColor: colors.border }]}>
            <View style={s.collectionNavTabs}>
              {([
                { id: 'all', label: 'All Pins' },
                { id: 'boards', label: 'Boards' },
                { id: 'sets', label: 'Sets' },
              ] as const).map(opt => {
                const active = collectionView === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                      setCollectionView(opt.id);
                      setSearchQuery('');
                    }}
                    style={[s.collectionNavTab, active && { borderBottomColor: colors.primary }]}
                  >
                    <Text style={[s.collectionNavText, { color: active ? colors.foreground : colors.mutedForeground }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {collectionView === 'all' && (
              <TouchableOpacity
                style={s.filterTextBtn}
                onPress={() => setAllPinsFilterVisible(true)}
              >
                <Feather name="sliders" size={15} color={Object.keys(pinFilters).length || allPinsSort !== 'recent' ? colors.primary : colors.mutedForeground} />
                <Text style={[s.filterText, { color: Object.keys(pinFilters).length || allPinsSort !== 'recent' ? colors.primary : colors.mutedForeground }]}>Filter</Text>
              </TouchableOpacity>
            )}
          </View>
          {collectionView === 'all' && Object.keys(pinFilters).length > 0 && (
            <View style={s.activeFilters}>
              {Object.entries(pinFilters).map(([key, value]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setPinFilters(current => {
                    const next = { ...current };
                    delete next[key as MetadataFilterKey];
                    return next;
                  })}
                  style={[s.activeFilterChip, { backgroundColor: colors.primary + '12' }]}
                >
                  <Text style={[s.activeFilterText, { color: colors.primary }]} numberOfLines={1}>{value}</Text>
                  <Feather name="x" size={12} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {collectionView === 'sets' && (
            <View style={s.setFilterRow}>
              {(['all', 'progress', 'complete'] as const).map(filter => (
                <TouchableOpacity
                  key={filter}
                  onPress={() => setSetProgressFilter(filter)}
                  style={[s.smallChip, { backgroundColor: setProgressFilter === filter ? colors.primary + '15' : colors.secondary }]}
                >
                  <Text style={[s.smallChipText, { color: setProgressFilter === filter ? colors.primary : colors.mutedForeground }]}>
                    {filter === 'all' ? 'All' : filter === 'progress' ? 'In Progress' : 'Completed'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {trackError ? <Text style={[s.inlineError, { color: colors.destructive }]}>{trackError}</Text> : null}
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
      if (searchQuery) return <EmptyState icon="search" title="No results found" subtitle="Try a different search term." />;
      if (collectionView === 'boards') return <EmptyState icon="folder" title="No boards yet" subtitle="Create a board to organise your pins." actionLabel="Create Board" onAction={() => setCreateBoardVisible(true)} />;
      if (collectionView === 'sets') return <EmptyState icon="bookmark" title={setProgressFilter === 'all' ? 'No tracked sets yet' : 'No sets found'} subtitle={setProgressFilter === 'all' ? 'Choose an official set to follow your progress.' : 'Try another progress filter.'} actionLabel={setProgressFilter === 'all' ? 'Track a Set' : undefined} onAction={setProgressFilter === 'all' ? () => setSetPickerVisible(true) : undefined} />;
      if (Object.keys(pinFilters).length > 0) return <EmptyState icon="search" title="No pins found" subtitle="Try changing your filters." />;
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
                  {group.isSet && group.setId && (
                    <TouchableOpacity
                      accessibilityLabel={`Stop tracking ${group.title}`}
                      hitSlop={10}
                      onPress={event => {
                        event.stopPropagation();
                        void untrackSet(group.setId!);
                      }}
                      style={[s.untrackBtn, { backgroundColor: colors.primary + '12' }]}
                    >
                      <Feather name="bookmark" size={14} color={colors.primary} />
                    </TouchableOpacity>
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
              <Text style={[s.addMenuText, { color: colors.foreground }]}>Track a Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.addMenuItem} onPress={() => { setAddModalVisible(false); setCreateBoardVisible(true); }}>
              <Feather name="folder-plus" size={20} color={colors.foreground} />
              <Text style={[s.addMenuText, { color: colors.foreground }]}>Create Board</Text>
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
                <Text style={[s.modalTitle, { color: colors.foreground, marginBottom: 2 }]}>Track a Set</Text>
                <Text style={[s.setPickerSub, { color: colors.mutedForeground }]}>
                  Choose an official catalogue set to follow your progress.
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
            {trackError ? <Text style={[s.pickerError, { color: colors.destructive }]}>{trackError}</Text> : null}
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
                  onPress={() => void trackSet(item)}
                  disabled={trackedSetIds.has(item.id) || trackingSetId === item.id}
                  style={[s.setPickerRow, { borderBottomColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.setPickerName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.setName}
                    </Text>
                    <Text style={[s.setPickerMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {[
                        item.releaseYear,
                        item.expectedPinCount
                          ? `${item.releasedPinCount} of ${item.expectedPinCount} released`
                          : `${item.releasedPinCount} pins released`,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {trackedSetIds.has(item.id) ? (
                    <Text style={[s.trackedLabel, { color: colors.primary }]}>Tracked</Text>
                  ) : trackingSetId === item.id ? (
                    <Text style={[s.trackedLabel, { color: colors.mutedForeground }]}>Tracking…</Text>
                  ) : (
                    <Feather name="plus-circle" size={18} color={colors.primary} />
                  )}
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
            <Text style={[s.modalTitle, { color: colors.foreground }]}>New Board</Text>
            <TextInput
              value={newBoardName}
              onChangeText={setNewBoardName}
              placeholder="Board name"
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

      {/* All Pins metadata filter and sort */}
      <Modal visible={allPinsFilterVisible} transparent animationType="slide" onRequestClose={() => setAllPinsFilterVisible(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.filterSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.filterSheetHeader}>
              <Text style={[s.modalTitle, { color: colors.foreground, marginBottom: 0 }]}>Filter Pins</Text>
              <View style={s.filterHeaderActions}>
                {(Object.keys(pinFilters).length > 0 || allPinsSort !== 'recent') && (
                  <TouchableOpacity onPress={() => { setPinFilters({}); setAllPinsSort('recent'); }}>
                    <Text style={[s.clearText, { color: colors.primary }]}>Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setAllPinsFilterVisible(false)} style={s.closeBtn}>
                  <Feather name="x" size={20} color={colors.foreground} />
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
                    <Text style={[s.sheetSectionTitle, { color: colors.mutedForeground }]}>{label}</Text>
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
                              backgroundColor: active ? colors.primary + '15' : colors.secondary,
                              borderColor: active ? colors.primary : 'transparent',
                            }]}
                          >
                            <Text style={[s.compactChipText, { color: active ? colors.primary : colors.foreground }]}>{option}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              <View style={s.filterSection}>
                <Text style={[s.sheetSectionTitle, { color: colors.mutedForeground }]}>Sort by</Text>
                <View style={s.sheetRowWrap}>
                  {(['recent', 'name', 'year', 'value'] as const).map(option => {
                    const active = allPinsSort === option;
                    const label = option === 'recent' ? 'Recently Added' : option === 'name' ? 'Name' : option === 'year' ? 'Release date' : 'Estimated value';
                    return (
                      <TouchableOpacity
                        key={option}
                        onPress={() => setAllPinsSort(option)}
                        style={[s.compactChip, {
                          backgroundColor: active ? colors.primary + '15' : colors.secondary,
                          borderColor: active ? colors.primary : 'transparent',
                        }]}
                      >
                        <Text style={[s.compactChipText, { color: active ? colors.primary : colors.foreground }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
            <TouchableOpacity style={[s.applyBtn, { backgroundColor: colors.primary }]} onPress={() => setAllPinsFilterVisible(false)}>
              <Text style={s.applyBtnText}>Show {filteredOwnedPins.length} pin{filteredOwnedPins.length === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
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
  collectionNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  collectionNavTabs: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  collectionNavTab: { minHeight: 42, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  collectionNavText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  filterTextBtn: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 9 },
  activeFilterChip: { maxWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  activeFilterText: { flexShrink: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  setFilterRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingTop: 9 },
  smallChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14 },
  smallChipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  inlineError: { paddingHorizontal: 16, paddingTop: 8, fontSize: 12, fontFamily: 'Inter_500Medium' },
  flatListContent: { paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'flex-start' },
  gridItemWrap: { width: GRID_CARD_WIDTH, marginBottom: 12 },
  groupCard: { width: GRID_CARD_WIDTH, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 12 },
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
  untrackBtn: { position: 'absolute', right: 8, top: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
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
  trackedLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  setPickerEmpty: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  setPickerEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  pickerError: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 6 },
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
  filterSheet: { maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  filterSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  filterHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  filterScrollContent: { paddingBottom: 12 },
  filterSection: { marginTop: 14 },
  compactChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 17, borderWidth: 1 },
  compactChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  applyBtn: { minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  applyBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
