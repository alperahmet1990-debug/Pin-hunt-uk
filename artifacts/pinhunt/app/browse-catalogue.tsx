/**
 * Browse Entire Catalogue — multi-select add for collectors.
 *
 * Lists every publicly browsable catalogue pin grouped by set, with search
 * and filters (set, year, edition, hide pins I have). Collectors tap pins
 * to select them — or "Select all" on a set — then add the whole selection
 * to their collection (owned) or ISO (wanted) in one go, or onto an existing
 * or new board (which also marks them owned — boards only hold pins the
 * collector has, see BoardsContext.addPinToBoard).
 *
 * Reached from Search ("Browse entire catalogue"), which is where
 * Collection → + → Add Pin lands. Writes go through CollectionContext's
 * setStatuses (one batched sync), with the same retry behaviour as single adds.
 *
 * Pins already owned or for trade are shown but can't be selected; ISO
 * pins can be selected so "Add to Collection" moves them to owned.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { CatalogueBrowsePin } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useToast } from '@/components/ui/Toast';
import { useCatalogueBrowseIndex } from '@/hooks/useCatalogueBrowseIndex';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { PLACEHOLDER_IMAGE } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';

const COLUMNS = 3;

const EDITION_LABELS: Record<string, string> = {
  open_edition: 'Open Edition',
  limited_edition: 'Limited Edition',
  limited_release: 'Limited Release',
  mystery: 'Mystery',
  hidden_disney: 'Hidden Disney',
  unknown: 'Unknown',
};

type FilterKey = 'set' | 'year' | 'edition';

function matchesQuery(pin: CatalogueBrowsePin, tokens: string[]) {
  if (tokens.length === 0) return true;
  const haystack = [
    pin.title, pin.setName, pin.brand, pin.mainCharacter, pin.allCharacters, pin.id,
    pin.releaseYear ? String(pin.releaseYear) : '',
  ].join(' ').toLowerCase();
  // Every word must match somewhere — same tokenised behaviour as Search.
  return tokens.every(t => haystack.includes(t));
}

export default function BrowseCatalogueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rows, loading, error, refresh } = useCatalogueBrowseIndex();
  const { collection, setStatuses } = useCollection();
  const { customBoards, createBoard, addPinsToBoard } = useBoards();

  const [query, setQuery] = useState('');
  const [setFilter, setSetFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [editionFilter, setEditionFilter] = useState<string | null>(null);
  const [hideHave, setHideHave] = useState(false);
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  // Undo can run after later renders; use the latest setStatuses.
  const setStatusesRef = useRef(setStatuses);
  setStatusesRef.current = setStatuses;
  const [boardSheetOpen, setBoardSheetOpen] = useState(false);
  // Board adds wait until the pins are Owned in the collection (setStatuses
  // commits on the next render) — same pattern as QuickAddSheet.
  const [pendingBoard, setPendingBoard] = useState<{ boardId: string; boardName: string; pinIds: string[]; added: number } | null>(null);

  useEffect(() => {
    if (!pendingBoard) return;
    const ready = pendingBoard.pinIds.every(id => {
      const s = collection[id]?.status;
      return s === 'owned' || s === 'for_trade';
    });
    if (!ready) return;
    addPinsToBoard(pendingBoard.boardId, pendingBoard.pinIds);
    const { boardId, boardName, added } = pendingBoard;
    toast.show({
      message: `Added to ${boardName}${added > 0 ? ` · ${added} new to your collection` : ''}`,
      action: { label: 'View board', onPress: () => router.push({ pathname: '/board/[id]', params: { id: boardId } }) },
    });
    setPendingBoard(null);
  }, [pendingBoard, collection, addPinsToBoard, toast, router]);

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const statusOf = (id: string) => collection[id]?.status;
  const isLocked = (id: string) => {
    const s = statusOf(id);
    return s === 'owned' || s === 'for_trade';
  };

  // Filter options come from the whole catalogue, not the filtered view.
  const options = useMemo(() => {
    const sets = new Set<string>();
    const years = new Set<number>();
    const editions = new Set<string>();
    for (const r of rows) {
      sets.add(r.setName);
      if (r.releaseYear) years.add(r.releaseYear);
      if (r.edition) editions.add(r.edition);
    }
    return {
      set: [...sets].sort((a, b) => a.localeCompare(b)),
      year: [...years].sort((a, b) => b - a),
      edition: [...editions].sort((a, b) => (EDITION_LABELS[a] ?? a).localeCompare(EDITION_LABELS[b] ?? b)),
    };
  }, [rows]);

  const { sections, matchCount } = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const bySet = new Map<string, CatalogueBrowsePin[]>();
    let count = 0;
    for (const r of rows) {
      if (setFilter && r.setName !== setFilter) continue;
      if (yearFilter && r.releaseYear !== yearFilter) continue;
      if (editionFilter && r.edition !== editionFilter) continue;
      if (hideHave && isLocked(r.id)) continue;
      if (!matchesQuery(r, tokens)) continue;
      const list = bySet.get(r.setName) ?? [];
      list.push(r);
      bySet.set(r.setName, list);
      count++;
    }
    const out = [...bySet.entries()].map(([setName, pins]) => {
      const chunks: CatalogueBrowsePin[][] = [];
      for (let i = 0; i < pins.length; i += COLUMNS) chunks.push(pins.slice(i, i + COLUMNS));
      return { title: setName, pins, data: chunks };
    });
    return { sections: out, matchCount: count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, setFilter, yearFilter, editionFilter, hideHave, collection]);

  const toggle = (id: string) => {
    if (isLocked(id)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSet = (pins: CatalogueBrowsePin[]) => {
    const selectable = pins.filter(p => !isLocked(p.id));
    const allSelected = selectable.length > 0 && selectable.every(p => selected.has(p.id));
    setSelected(prev => {
      const next = new Set(prev);
      for (const p of selectable) {
        if (allSelected) next.delete(p.id); else next.add(p.id);
      }
      return next;
    });
  };

  const addSelected = (status: 'owned' | 'wanted', { confirm = true } = {}) => {
    // Never downgrade: owned/for-trade pins stay put, ISO pins already in ISO are a no-op.
    const ids = [...selected].filter(id => {
      const current = statusOf(id);
      if (current === 'owned' || current === 'for_trade') return false;
      return !(status === 'wanted' && current === 'wanted');
    });
    // Only pins with no status or ISO can be added, so undo restores them exactly.
    const wasIso = ids.filter(id => statusOf(id) === 'wanted');
    const wasNone = ids.filter(id => statusOf(id) !== 'wanted');
    // One state update and one batched sync, however many pins.
    setStatuses(ids, status);
    setSelected(new Set());
    if (confirm) {
      toast.show(ids.length === 0
        ? { message: 'Those pins were already in place' }
        : {
            message: `Added ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'} to your ${status === 'owned' ? 'collection' : 'ISO'}`,
            action: {
              label: 'Undo',
              onPress: () => {
                if (wasNone.length) setStatusesRef.current(wasNone, 'none');
                if (wasIso.length) setStatusesRef.current(wasIso, 'wanted');
              },
            },
          });
    }
    return ids.length;
  };

  const addSelectedToBoard = (boardId: string, boardName: string) => {
    const pinIds = [...selected];
    const added = addSelected('owned', { confirm: false });
    setBoardSheetOpen(false);
    setPendingBoard({ boardId, boardName, pinIds, added });
  };

  const addSelectedToNewBoard = (name: string) => {
    const board = createBoard(name);
    addSelectedToBoard(board.id, board.name);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const clearFilters = () => {
    setSetFilter(null);
    setYearFilter(null);
    setEditionFilter(null);
    setHideHave(false);
    setQuery('');
  };

  const anyFilter = !!(setFilter || yearFilter || editionFilter || hideHave || query.trim());

  if (loading && rows.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
        <Stack.Screen options={{ title: 'Entire Catalogue' }} />
        <ActivityIndicator color={colors.homeCoral} />
        <Text style={[styles.loadingText, { color: colors.homeMuted }]}>Loading the catalogue…</Text>
      </View>
    );
  }

  const chip = (label: string, active: boolean, onPress: () => void, caret = true) => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, {
        backgroundColor: active ? colors.homeInk : colors.homeSurface,
        borderColor: active ? colors.homeInk : colors.homeLine,
      }]}
    >
      <Text style={[styles.chipLabel, { color: active ? colors.homeSurface : colors.homeInk }]} numberOfLines={1}>
        {label}
      </Text>
      {caret && <Feather name="chevron-down" size={13} color={active ? colors.homeSurface : colors.homeMuted} />}
    </TouchableOpacity>
  );

  const header = (
    <View style={styles.header}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search pins, characters, sets or years" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {chip(hideHave ? 'Hiding pins I have' : 'Hide pins I have', hideHave, () => setHideHave(v => !v), false)}
        {chip(setFilter ?? 'Set', !!setFilter, () => setOpenFilter('set'))}
        {chip(yearFilter ? String(yearFilter) : 'Year', !!yearFilter, () => setOpenFilter('year'))}
        {chip(editionFilter ? (EDITION_LABELS[editionFilter] ?? editionFilter) : 'Edition', !!editionFilter, () => setOpenFilter('edition'))}
      </ScrollView>
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: colors.homeMuted }]}>
          {matchCount.toLocaleString()} {matchCount === 1 ? 'pin' : 'pins'}
          {anyFilter ? ` of ${rows.length.toLocaleString()}` : ''}
        </Text>
        {anyFilter && (
          <TouchableOpacity onPress={clearFilters} hitSlop={8}>
            <Text style={[styles.metaLink, { color: colors.homeCoral }]}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
    </View>
  );

  const filterSheetItems: Array<{ value: string; label: string }> =
    openFilter === 'set' ? options.set.map(v => ({ value: v, label: v }))
      : openFilter === 'year' ? options.year.map(v => ({ value: String(v), label: String(v) }))
        : openFilter === 'edition' ? options.edition.map(v => ({ value: v, label: EDITION_LABELS[v] ?? v }))
          : [];
  const filterSheetValue =
    openFilter === 'set' ? setFilter
      : openFilter === 'year' ? (yearFilter ? String(yearFilter) : null)
        : editionFilter;
  const applyFilter = (value: string | null) => {
    if (openFilter === 'set') setSetFilter(value);
    else if (openFilter === 'year') setYearFilter(value ? Number(value) : null);
    else if (openFilter === 'edition') setEditionFilter(value);
    setOpenFilter(null);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      <Stack.Screen options={{ title: 'Entire Catalogue' }} />
      <SectionList
        sections={sections}
        keyExtractor={(chunk, i) => `${chunk[0]?.id ?? 'row'}-${i}`}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: botPad + (selected.size > 0 ? 120 : 24) }}
        initialNumToRender={8}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <EmptyState icon="search" title="No pins match" subtitle="Try a different search or clear your filters." />
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/add-pin', params: { name: query.trim() } })}
              activeOpacity={0.85}
              style={[styles.addPinLink, { borderColor: colors.homeCoral, backgroundColor: colors.homeCoral + '12' }]}
            >
              <Feather name="plus-circle" size={15} color={colors.homeCoral} />
              <Text style={[styles.addPinLinkLabel, { color: colors.homeCoral }]}>
                Can&apos;t find it? Add this pin to the catalogue
              </Text>
            </TouchableOpacity>
          </View>
        }
        renderSectionHeader={({ section }) => {
          const selectable = section.pins.filter(p => !isLocked(p.id));
          const allSelected = selectable.length > 0 && selectable.every(p => selected.has(p.id));
          const have = section.pins.length - selectable.length;
          return (
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.homeInk }]} numberOfLines={2}>{section.title}</Text>
                <Text style={[styles.sectionMeta, { color: colors.homeMuted }]}>
                  {section.pins.length} {section.pins.length === 1 ? 'pin' : 'pins'}
                  {have > 0 ? ` · you have ${have}` : ''}
                </Text>
              </View>
              {selectable.length > 0 && (
                <TouchableOpacity onPress={() => toggleSet(section.pins)} hitSlop={8}>
                  <Text style={[styles.selectAll, { color: colors.homeCoral }]}>
                    {allSelected ? 'Deselect' : 'Select all'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        renderItem={({ item: chunk }) => (
          <View style={styles.gridRow}>
            {chunk.map(pin => (
              <Tile
                key={pin.id}
                pin={pin}
                status={statusOf(pin.id)}
                selected={selected.has(pin.id)}
                onPress={() => toggle(pin.id)}
                onLongPress={() => router.push({ pathname: '/pin/[id]', params: { id: pin.id } })}
              />
            ))}
            {Array.from({ length: COLUMNS - chunk.length }).map((_, i) => <View key={`pad-${i}`} style={styles.tile} />)}
          </View>
        )}
      />

      {selected.size > 0 && (
        <View style={[styles.bottomBar, {
          backgroundColor: colors.homeSurface,
          borderTopColor: colors.homeLine,
          paddingBottom: botPad + spacing.md,
        }]}>
          <>
            <View style={styles.bottomMeta}>
              <Text style={[styles.bottomCount, { color: colors.homeInk }]}>
                {selected.size} selected
              </Text>
              <TouchableOpacity onPress={() => setSelected(new Set())} hitSlop={8}>
                <Text style={[styles.metaLink, { color: colors.homeMuted }]}>Clear</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bottomActions}>
              <TouchableOpacity
                onPress={() => addSelected('wanted')}
                activeOpacity={0.85}
                style={[styles.secondaryBtn, { borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
              >
                <Feather name="heart" size={15} color={colors.homeInk} />
                <Text style={[styles.secondaryLabel, { color: colors.homeInk }]}>ISO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setBoardSheetOpen(true)}
                activeOpacity={0.85}
                style={[styles.secondaryBtn, { borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
              >
                <Feather name="folder-plus" size={15} color={colors.homeInk} />
                <Text style={[styles.secondaryLabel, { color: colors.homeInk }]}>Board</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => addSelected('owned')}
                activeOpacity={0.85}
                style={[styles.primaryBtn, { backgroundColor: colors.homeCoral }]}
              >
                <Feather name="plus" size={16} color={colors.homeHeroText} />
                <Text style={[styles.primaryLabel, { color: colors.homeHeroText }]}>Add to Collection</Text>
              </TouchableOpacity>
            </View>
          </>
        </View>
      )}

      <BoardSheet
        visible={boardSheetOpen}
        count={selected.size}
        boards={customBoards.map(b => ({ id: b.id, name: b.name, count: b.pinIds.length }))}
        onPickBoard={addSelectedToBoard}
        onCreateBoard={addSelectedToNewBoard}
        onClose={() => setBoardSheetOpen(false)}
      />

      <FilterSheet
        visible={openFilter !== null}
        title={openFilter === 'set' ? 'Set' : openFilter === 'year' ? 'Year' : 'Edition'}
        searchable={openFilter === 'set'}
        items={filterSheetItems}
        value={filterSheetValue}
        onSelect={applyFilter}
        onClose={() => setOpenFilter(null)}
      />
    </View>
  );
}

function Tile({ pin, status, selected, onPress, onLongPress }: {
  pin: CatalogueBrowsePin;
  status?: string;
  selected: boolean;
  onPress(): void;
  onLongPress(): void;
}) {
  const colors = useColors();
  const locked = status === 'owned' || status === 'for_trade';

  let badge: { label: string; bg: string } | null = null;
  if (status === 'owned') badge = { label: 'Owned', bg: colors.owned };
  else if (status === 'for_trade') badge = { label: 'For Trade', bg: colors.forTrade };
  else if (status === 'wanted') badge = { label: 'ISO', bg: colors.wanted };

  return (
    <TouchableOpacity
      activeOpacity={locked ? 1 : 0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: locked }}
      accessibilityLabel={pin.title}
      style={styles.tile}
    >
      <View style={[
        styles.tileImageWrap,
        {
          backgroundColor: colors.homeSurface,
          borderColor: selected ? colors.homeCoral : colors.homeLine,
          borderWidth: selected ? 2 : 1,
        },
      ]}>
        <Image
          source={pin.imageUrl ? { uri: pin.imageUrl } : PLACEHOLDER_IMAGE}
          style={[styles.tileImage, locked && { opacity: 0.45 }]}
          resizeMode="contain"
        />
        {!locked && (
          <View style={[styles.checkCircle, {
            backgroundColor: selected ? colors.homeCoral : colors.homeSurface + 'E6',
            borderColor: selected ? colors.homeCoral : colors.homeLine,
          }]}>
            {selected && <Feather name="check" size={12} color={colors.homeHeroText} />}
          </View>
        )}
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            {locked && <Feather name="check" size={9} color={colors.homeHeroText} />}
            <Text style={[styles.badgeLabel, { color: colors.homeHeroText }]} numberOfLines={1}>{badge.label}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tileTitle, { color: locked ? colors.homeMuted : colors.homeInk }]} numberOfLines={2}>
        {pin.title}
      </Text>
    </TouchableOpacity>
  );
}

function BoardSheet({ visible, count, boards, onPickBoard, onCreateBoard, onClose }: {
  visible: boolean;
  count: number;
  boards: Array<{ id: string; name: string; count: number }>;
  onPickBoard(boardId: string, name: string): void;
  onCreateBoard(name: string): void;
  onClose(): void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [newName, setNewName] = useState('');

  const close = () => { setNewName(''); onClose(); };
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    onCreateBoard(name);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.sheetBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
        <View style={[styles.sheet, {
          backgroundColor: colors.homeSurface,
          borderColor: colors.homeLine,
          paddingBottom: insets.bottom + spacing.md,
        }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.homeInk }]}>
              Add {count} {count === 1 ? 'pin' : 'pins'} to a board
            </Text>
            <TouchableOpacity onPress={close} hitSlop={8}>
              <Feather name="x" size={20} color={colors.homeMuted} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.sheetHint, { color: colors.homeMuted }]}>
            Boards hold pins you have, so these will be marked Owned too.
          </Text>
          <View style={styles.newBoardRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="New board name"
              placeholderTextColor={colors.homeMuted}
              returnKeyType="done"
              onSubmitEditing={create}
              style={[styles.sheetSearch, styles.newBoardInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeAqua }]}
            />
            <TouchableOpacity
              onPress={create}
              disabled={!newName.trim()}
              activeOpacity={0.85}
              style={[styles.newBoardBtn, { backgroundColor: newName.trim() ? colors.homeCoral : colors.homeAqua }]}
            >
              <Text style={[styles.newBoardBtnLabel, { color: newName.trim() ? colors.homeHeroText : colors.homeMuted }]}>Create</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={boards}
            keyExtractor={b => b.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.sheetHint, { color: colors.homeMuted, paddingVertical: spacing.md }]}>
                No boards yet — name one above to create it.
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onPickBoard(item.id, item.name)}
                style={[styles.sheetRow, { borderBottomColor: colors.homeLine }]}
              >
                <Feather name="folder" size={16} color={colors.homeMuted} />
                <Text style={[styles.sheetRowLabel, { color: colors.homeInk }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.sectionMeta, { color: colors.homeMuted }]}>{item.count}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

function FilterSheet({ visible, title, searchable, items, value, onSelect, onClose }: {
  visible: boolean;
  title: string;
  searchable: boolean;
  items: Array<{ value: string; label: string }>;
  value: string | null;
  onSelect(value: string | null): void;
  onClose(): void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return lower ? items.filter(i => i.label.toLowerCase().includes(lower)) : items;
  }, [items, q]);

  const close = () => { setQ(''); onClose(); };
  const pick = (v: string | null) => { setQ(''); onSelect(v); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.sheetBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
        <View style={[styles.sheet, {
          backgroundColor: colors.homeSurface,
          borderColor: colors.homeLine,
          paddingBottom: insets.bottom + spacing.md,
        }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.homeInk }]}>{title}</Text>
            <TouchableOpacity onPress={close} hitSlop={8}>
              <Feather name="x" size={20} color={colors.homeMuted} />
            </TouchableOpacity>
          </View>
          {searchable && (
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={`Search ${title.toLowerCase()}s`}
              placeholderTextColor={colors.homeMuted}
              autoCorrect={false}
              style={[styles.sheetSearch, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeAqua }]}
            />
          )}
          <FlatList
            data={[{ value: '', label: `All ${title.toLowerCase()}s` }, ...shown]}
            keyExtractor={item => item.value || '__all'}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item.value ? item.value === value : value === null;
              return (
                <TouchableOpacity
                  onPress={() => pick(item.value || null)}
                  style={[styles.sheetRow, { borderBottomColor: colors.homeLine }]}
                >
                  <Text style={[styles.sheetRowLabel, { color: colors.homeInk }]} numberOfLines={2}>{item.label}</Text>
                  {active && <Feather name="check" size={16} color={colors.homeCoral} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  header: { padding: spacing.lg, gap: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 220 },
  chipLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  metaLink: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  error: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  empty: { paddingHorizontal: spacing.lg, gap: spacing.md },
  addPinLink: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  addPinLinkLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  sectionMeta: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 },
  selectAll: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  gridRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  tile: { flex: 1, gap: 6 },
  tileImageWrap: { aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileImage: { width: '86%', height: '86%' },
  checkCircle: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 7 },
  badgeLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  tileTitle: { fontSize: 11, fontFamily: 'Inter_500Medium', lineHeight: 14 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  bottomMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  bottomCount: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  bottomActions: { flexDirection: 'row', gap: spacing.sm },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: spacing.md },
  secondaryLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, paddingVertical: 13 },
  primaryLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '75%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  sheetSearch: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 40, fontSize: 15, fontFamily: 'Inter_400Regular' },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetHint: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  newBoardRow: { flexDirection: 'row', gap: spacing.sm },
  newBoardInput: { flex: 1 },
  newBoardBtn: { borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  newBoardBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sheetRowLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
});
