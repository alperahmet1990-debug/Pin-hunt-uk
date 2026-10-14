import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  FlatList,
  Modal,
  Platform,
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
import { useBoards } from '@/context/BoardsContext';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { getPinImageSource } from '@/utils/pinImage';
import { EmptyState } from '@/components/EmptyState';
import { usePinActions } from '@/components/PinActionsSheet';
import { BulkSelectBar, BULK_BAR_HEIGHT } from '@/components/BulkSelectBar';
import { usePinSelection } from '@/hooks/usePinSelection';
import { ConfirmDialog, PinGrid, PinTile, ScreenContainer, Sheet } from '@/components/ui';
import { BOARD_SORT_OPTIONS, sortBoardPins, type BoardSort } from '@/utils/boardSort';
import { radius, spacing } from '@/constants/theme';
import type { CataloguePin } from '@workspace/pin-repository';
import { PinImage } from '@/components/ui/PinImage';

// Search scope for Add Pins to Board: name/title, character, set/series —
// mirrors the fields collection.tsx's search matches, minus the broader
// catalogue metadata (brand, retailer, etc.) that isn't relevant here.
function pinMatchesAddSearch(pin: CataloguePin, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    pin.title,
    pin.collection,
    pin.normalisedSeries,
    ...(pin.characters || []),
    pin.allCharacters,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pinActions = usePinActions();
  // Bulk edits (UX-017); never at the same time as edit mode.
  const selection = usePinSelection();
  const { getBoardById, getBoardPins, addPinToBoard, removePinFromBoard, deleteBoard, setBoardThumbnail, renameBoard } = useBoards();
  const { pins: catalogue } = usePinCatalogue();
  const { collection } = useCollection();

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [pinToRemove, setPinToRemove] = useState<CataloguePin | null>(null);
  const [sort, setSort] = useState<BoardSort>('recent');
  const [sortVisible, setSortVisible] = useState(false);

  const board = getBoardById(id ?? '');
  const boardPins = board ? getBoardPins(board) : [];
  const sortedPins = useMemo(
    () => (board ? sortBoardPins(boardPins, board.pinIds, sort) : []),
    [board, boardPins, sort],
  );
  const sortLabel = BOARD_SORT_OPTIONS.find(o => o.value === sort)?.label ?? '';

  useEffect(() => {
    if (board && !renameVisible) {
      setNewName(board.name);
    }
  }, [board, renameVisible]);

  useEffect(() => {
    if (!addModalVisible) setAddSearchQuery('');
  }, [addModalVisible]);

  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 24) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 20;

  // Owned/for-trade pins, regardless of board membership.
  const ownedPool = useMemo(() => {
    if (!board || !board.isCustom) return [] as CataloguePin[];
    const ownedIds = new Set(
      Object.values(collection)
        .filter(e => e.status === 'owned' || e.status === 'for_trade')
        .map(e => e.pinId),
    );
    return catalogue.filter(p => ownedIds.has(p.id));
  }, [board, collection, catalogue]);

  // Pins eligible for this Add Pins session: owned pins that weren't already
  // on the board when the sheet opened. Fixed for the life of the sheet so a
  // pin the collector just added stays visible (as a check) instead of the
  // row vanishing under their thumb — that's what lets them add several in a
  // row. Pins that were on the board before opening never appear here.
  const addModalBoardPinIdsRef = useRef<Set<string>>(new Set());
  const prevAddModalVisibleRef = useRef(false);
  if (addModalVisible && !prevAddModalVisibleRef.current) {
    addModalBoardPinIdsRef.current = new Set(board?.pinIds ?? []);
  }
  prevAddModalVisibleRef.current = addModalVisible;

  const eligiblePins = useMemo(() => {
    return ownedPool
      .filter(p => !addModalBoardPinIdsRef.current.has(p.id))
      .sort((a, b) =>
        (collection[b.id]?.dateAdded || '').localeCompare(collection[a.id]?.dateAdded || ''),
      );
    // Recomputed whenever the sheet opens/closes so the sort reflects the
    // snapshot captured just above; addModalBoardPinIdsRef itself isn't reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedPool, collection, addModalVisible]);

  const filteredAddPins = useMemo(
    () => eligiblePins.filter(p => pinMatchesAddSearch(p, addSearchQuery)),
    [eligiblePins, addSearchQuery],
  );

  if (!board) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.notFound}>
          <Text style={[styles.notFoundText, { color: colors.homeInk }]}>Board not found.</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.homeCoral, fontFamily: 'Inter_500Medium', fontSize: 14 }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const saveRename = () => {
    if (!board || !newName.trim()) return;
    renameBoard(board.id, newName);
    setRenameVisible(false);
  };

  const handleAddPin = (pin: CataloguePin) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addPinToBoard(board.id, pin.id);
  };

  const handleRemovePin = (pin: CataloguePin) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPinToRemove(pin);
  };

  return (
    <ScreenContainer edges={{ top: false, bottom: false }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: topInset + 10, borderBottomColor: colors.homeLine }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={[styles.roundBtn, { backgroundColor: colors.homeAqua }]}
          >
            <Feather name="chevron-left" size={20} color={colors.homeInk} />
          </TouchableOpacity>

          {board.isCustom && (
            <View style={styles.headerRightActions}>
              {editMode ? (
                <TouchableOpacity
                  onPress={() => setEditMode(false)}
                  activeOpacity={0.85}
                  style={[styles.doneBtn, { backgroundColor: colors.homeCoral }]}
                >
                  <Text style={[styles.doneBtnLabel, { color: colors.homeSurface }]}>Done</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  accessibilityLabel="Board options"
                  onPress={() => setMenuVisible(true)}
                  activeOpacity={0.85}
                  style={[styles.roundBtn, { backgroundColor: colors.homeAqua }]}
                >
                  <Feather name="more-horizontal" size={20} color={colors.homeInk} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <Text style={[styles.boardTitle, { color: colors.homeInk }]} numberOfLines={2}>
          {board.name}
        </Text>

        <View style={styles.metaRow}>
          <Text style={[styles.pinCount, { color: colors.homeMuted }]}>
            {boardPins.length} {boardPins.length === 1 ? 'pin' : 'pins'}
          </Text>
          {!board.isCustom && (
            <View style={[styles.suggestedChip, { backgroundColor: colors.homeTeal + '1E' }]}>
              <Feather name="zap" size={10} color={colors.homeTeal} />
              <Text style={[styles.suggestedChipText, { color: colors.homeTeal }]}>
                Auto-updated from your collection
              </Text>
            </View>
          )}
        </View>

        {board.isCustom && !editMode && !selection.active && boardPins.length > 0 && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={() => setAddModalVisible(true)}
              style={[styles.addBtn, { backgroundColor: colors.homeCoral, shadowColor: colors.homeShadow }]}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={16} color={colors.homeSurface} />
              <Text style={[styles.addBtnText, { color: colors.homeSurface }]}>Add Pins</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setEditMode(true)}
              style={[styles.editBtn, { backgroundColor: colors.homeAqua }]}
              activeOpacity={0.85}
            >
              <Feather name="sliders" size={15} color={colors.homeTeal} />
              <Text style={[styles.editBtnText, { color: colors.homeTeal }]}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}

        {!editMode && !selection.active && boardPins.length > 1 && (
          <View style={styles.toolRow}>
            <TouchableOpacity
              onPress={() => setSortVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`Sort: ${sortLabel}`}
              style={styles.sortBtn}
            >
              <Feather name="bar-chart-2" size={14} color={colors.homeMuted} style={{ transform: [{ rotate: '90deg' }] }} />
              <Text style={[styles.sortBtnText, { color: colors.homeMuted }]}>Sort: <Text style={{ color: colors.homeInk }}>{sortLabel}</Text></Text>
              <Feather name="chevron-down" size={14} color={colors.homeMuted} />
            </TouchableOpacity>
            {board.isCustom && (
              <TouchableOpacity onPress={selection.start} accessibilityRole="button" accessibilityLabel="Select pins" style={styles.sortBtn}>
                <Feather name="check-square" size={14} color={colors.homeInk} />
                <Text style={[styles.sortBtnText, { color: colors.homeInk }]}>Select</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {selection.active && (
          <View style={styles.toolRow}>
            <Text accessibilityLiveRegion="polite" style={[styles.sortBtnText, { color: colors.homeInk, flex: 1 }]}>{selection.count} selected</Text>
            <TouchableOpacity onPress={() => selection.toggleAll(sortedPins.map(p => p.id))} accessibilityRole="button" style={styles.sortBtn}>
              <Text style={[styles.sortBtnText, { color: colors.homeCoralDeep }]}>
                {selection.allSelected(sortedPins.map(p => p.id)) ? 'Clear' : `Select all ${sortedPins.length}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={selection.stop} accessibilityRole="button" accessibilityLabel="Cancel selecting" style={styles.sortBtn}>
              <Text style={[styles.sortBtnText, { color: colors.homeInk }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        {editMode && (
          <Text style={[styles.editHint, { color: colors.homeMuted }]}>
            Tap − to remove a pin, or the picture icon to make it the board cover.
          </Text>
        )}
      </View>

      {boardPins.length === 0 ? (
        <EmptyState
          icon="grid"
          title="No pins on this board yet"
          subtitle={
            board.isCustom
              ? 'Tap Add Pins to add owned pins to this board.'
              : 'Add pins from this set to your Owned list and they will appear here automatically.'
          }
          actionLabel={board.isCustom ? 'Add Pins' : undefined}
          onAction={board.isCustom ? () => setAddModalVisible(true) : undefined}
        />
      ) : (
        <PinGrid
          data={sortedPins}
          keyExtractor={p => p.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: botPad + (selection.active ? BULK_BAR_HEIGHT : 0) }}
          extraData={selection.selected}
          renderTile={(item, size) => {
            const isCover = board.thumbnailPinId === item.id;
            return (
              <View>
                <PinTile
                  title={item.title}
                  imageUrl={item.imageUrl}
                  size={size}
                  copies={editMode ? undefined : collection[item.id]?.quantity}
                  // Edit mode only acts through the two controls below, never the tile.
                  selected={selection.active ? selection.has(item.id) : undefined}
                  onPress={() => {
                    if (selection.active) selection.toggle(item.id);
                    else if (!editMode) router.push({ pathname: '/pin/[id]', params: { id: item.id } });
                  }}
                  onLongPress={editMode || selection.active ? undefined : () => pinActions.open(item)}
                  {...(editMode || selection.active ? {} : pinActions.a11y(item))}
                />
                {!editMode && isCover && (
                  <View pointerEvents="none" style={[styles.coverChip, { backgroundColor: colors.homeCoral }]}>
                    <Feather name="image" size={10} color={colors.homeSurface} />
                    <Text style={[styles.coverChipText, { color: colors.homeSurface }]}>Cover</Text>
                  </View>
                )}
                {/* Remove and cover are siblings with their own 44 pt targets (UX-019). */}
                {editMode && (
                  <TouchableOpacity
                    onPress={() => handleRemovePin(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.title} from this board`}
                    style={[styles.editControl, styles.removeControl, { backgroundColor: colors.destructive }]}
                  >
                    <Feather name="minus" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                {editMode && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setBoardThumbnail(board.id, isCover ? undefined : item.id);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isCover ? `Remove ${item.title} as board cover` : `Set ${item.title} as board cover`}
                    accessibilityState={{ selected: isCover }}
                    style={[styles.editControl, styles.coverControl, { backgroundColor: isCover ? colors.homeCoral : 'rgba(0,0,0,0.55)' }]}
                  >
                    <Feather name="image" size={14} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      <Sheet visible={sortVisible} onClose={() => setSortVisible(false)} title="Sort board">
        {BOARD_SORT_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.value}
            onPress={() => { setSort(option.value); setSortVisible(false); }}
            accessibilityRole="radio"
            accessibilityState={{ checked: sort === option.value }}
            style={[styles.menuRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.homeLine }]}
          >
            <Text style={[styles.menuLabel, { flex: 1, color: colors.homeInk }]}>{option.label}</Text>
            {sort === option.value && <Feather name="check" size={18} color={colors.homeCoral} />}
          </TouchableOpacity>
        ))}
      </Sheet>

      {pinActions.sheet}
      {selection.active && (
        <BulkSelectBar ids={[...selection.selected]} boardId={board.id} onDone={selection.stop} />
      )}

      {/* Board options (UX-041: a Sheet, so the backdrop no longer wraps the rows) */}
      <Sheet visible={menuVisible} onClose={() => setMenuVisible(false)} title="Board options">
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.75}
          accessibilityRole="button"
          onPress={() => { setMenuVisible(false); setRenameVisible(true); }}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.homeAqua }]}>
            <Feather name="edit-2" size={16} color={colors.homeTeal} />
          </View>
          <Text style={[styles.menuLabel, { color: colors.homeInk }]}>Rename Board</Text>
        </TouchableOpacity>
        <View style={[styles.menuDivider, { backgroundColor: colors.homeLine }]} />
        <TouchableOpacity
          style={styles.menuRow}
          activeOpacity={0.75}
          accessibilityRole="button"
          onPress={() => { setMenuVisible(false); setDeleteConfirmVisible(true); }}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.destructive + '18' }]}>
            <Feather name="trash-2" size={16} color={colors.destructive} />
          </View>
          <Text style={[styles.menuLabel, { color: colors.destructive }]}>Delete Board</Text>
        </TouchableOpacity>
      </Sheet>

      {/* Add Pins Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={[styles.modalRoot, { backgroundColor: colors.homeBackground }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.homeLine, backgroundColor: colors.homeSurface }]}>
            <Text style={[styles.modalTitle, { color: colors.homeInk }]}>Add Pins to Board</Text>
            <TouchableOpacity onPress={() => setAddModalVisible(false)} activeOpacity={0.7} style={styles.modalCloseBtn}>
              <Feather name="x" size={22} color={colors.homeInk} />
            </TouchableOpacity>
          </View>

          {eligiblePins.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="All your eligible pins are already on this board."
              actionLabel="Close"
              onAction={() => setAddModalVisible(false)}
            />
          ) : (
            <>
              <View style={styles.addSearchWrap}>
                <View style={[styles.addSearchBox, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}>
                  <Feather name="search" size={16} color={colors.homeMuted} />
                  <TextInput
                    value={addSearchQuery}
                    onChangeText={setAddSearchQuery}
                    placeholder="Search your collection..."
                    placeholderTextColor={colors.homeMuted}
                    style={[styles.addSearchInput, { color: colors.homeInk }]}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {addSearchQuery ? (
                    <TouchableOpacity onPress={() => setAddSearchQuery('')} hitSlop={10}>
                      <Feather name="x-circle" size={16} color={colors.homeMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {filteredAddPins.length === 0 ? (
                <EmptyState icon="search" title="No pins found in your collection." />
              ) : (
                <FlatList
                  data={filteredAddPins}
                  keyExtractor={p => p.id}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 20 }}
                  renderItem={({ item }) => {
                    const isAdded = board.pinIds.includes(item.id);
                    return (
                      <TouchableOpacity
                        onPress={() => !isAdded && handleAddPin(item)}
                        activeOpacity={isAdded ? 1 : 0.8}
                        disabled={isAdded}
                        style={[styles.addRow, { borderBottomColor: colors.homeLine }]}
                      >
                        <PinImage source={getPinImageSource(item)} style={[styles.addRowImage, { backgroundColor: colors.homeAqua }]} />
                        <View style={styles.addRowInfo}>
                          <Text style={[styles.addRowTitle, { color: colors.homeInk }]} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={[styles.addRowMeta, { color: colors.homeMuted }]}>
                            {item.collection}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.addCircle,
                            {
                              borderColor: isAdded ? colors.owned : colors.homeCoral,
                              backgroundColor: isAdded ? colors.owned : colors.homeCoral,
                            },
                          ]}
                        >
                          <Feather name={isAdded ? 'check' : 'plus'} size={16} color={colors.homeSurface} />
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </>
          )}
        </View>
      </Modal>

      {/* Rename: input at the top of a Sheet, so it stays above the keyboard (UX-041). */}
      <Sheet
        visible={renameVisible}
        onClose={() => setRenameVisible(false)}
        title="Rename board"
        footer={
          <TouchableOpacity
            onPress={saveRename}
            disabled={!newName.trim()}
            accessibilityRole="button"
            style={[styles.sheetPrimary, { backgroundColor: newName.trim() ? colors.homeCoral : colors.homeAqua }]}
          >
            <Text style={[styles.confirmButtonText, { color: newName.trim() ? colors.homeSurface : colors.homeMuted }]}>Save</Text>
          </TouchableOpacity>
        }
      >
        <TextInput
          style={[styles.renameInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
          value={newName}
          onChangeText={setNewName}
          placeholder="Board name"
          placeholderTextColor={colors.homeMuted}
          accessibilityLabel="Board name"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={saveRename}
        />
      </Sheet>

      <ConfirmDialog
        visible={deleteConfirmVisible}
        title="Delete Board?"
        message={`Delete "${board.name}"? Your pins won't be removed from your Collection.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={() => {
          deleteBoard(board.id);
          router.back();
        }}
      />
      <ConfirmDialog
        visible={pinToRemove !== null}
        title="Remove Pin?"
        message={`Remove "${pinToRemove?.title ?? 'this pin'}" from this Board?`}
        confirmLabel="Remove"
        destructive
        onCancel={() => setPinToRemove(null)}
        onConfirm={() => {
          if (pinToRemove) removePinFromBoard(board.id, pinToRemove.id);
          setPinToRemove(null);
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  // Header
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center' },
  roundBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  doneBtn: { paddingHorizontal: spacing.md, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  doneBtnLabel: { fontSize: 13.5, fontFamily: 'Inter_700Bold' },
  boardTitle: { fontSize: 21, lineHeight: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.4, marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  pinCount: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  suggestedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  suggestedChipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.md,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  addBtnText: { fontSize: 13.5, fontFamily: 'Inter_700Bold' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.md },
  editBtnText: { fontSize: 13.5, fontFamily: 'Inter_700Bold' },
  toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44 },
  sortBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  editHint: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18, marginTop: 4 },
  // Grid: edit controls sit on opposite top corners, 28 pt + 8 pt slop = 44 pt targets
  editControl: { position: 'absolute', top: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  removeControl: { left: 6 },
  coverControl: { right: 6 },
  coverChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  coverChipText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  // Board options menu
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingVertical: spacing.sm },
  menuIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  menuDivider: { height: StyleSheet.hairlineWidth },
  // Add pins modal
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCloseBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  addSearchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  addSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  addSearchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', height: '100%' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  addRowImage: { width: 56, height: 56, borderRadius: 12, resizeMode: 'contain' },
  addRowInfo: { flex: 1 },
  addRowTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  addRowMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  addCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, fontSize: 15, fontFamily: 'Inter_500Medium' },
  sheetPrimary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  confirmButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
