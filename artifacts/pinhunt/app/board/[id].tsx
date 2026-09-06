import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  FlatList,
  Image,
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
import { PinCard } from '@/components/PinCard';
import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import type { CataloguePin } from '@workspace/pin-repository';

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

  const board = getBoardById(id ?? '');
  const boardPins = board ? getBoardPins(board) : [];

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

        {board.isCustom && !editMode && boardPins.length > 0 && (
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
        <FlatList
          data={boardPins}
          keyExtractor={p => p.id}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.grid, { paddingBottom: botPad }]}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <View style={styles.gridItemWrap}>
              <PinCard
                pin={item}
                mode="grid"
                seaGlass
                onPress={() =>
                  editMode
                    ? handleRemovePin(item)
                    : router.push({ pathname: '/pin/[id]', params: { id: item.id } })
                }
              />
              {!editMode && board.thumbnailPinId === item.id && (
                <View style={[styles.coverChip, { backgroundColor: colors.homeCoral }]}>
                  <Feather name="image" size={10} color={colors.homeSurface} />
                  <Text style={[styles.coverChipText, { color: colors.homeSurface }]}>Cover</Text>
                </View>
              )}
              {editMode && (
                <TouchableOpacity
                  style={[styles.removeOverlay, { borderRadius: radius.lg }]}
                  onPress={() => handleRemovePin(item)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.removeBadge, { backgroundColor: colors.destructive }]}>
                    <Feather name="minus" size={14} color="#fff" />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.coverBadge,
                      {
                        backgroundColor:
                          board.thumbnailPinId === item.id ? colors.homeCoral : 'rgba(0,0,0,0.55)',
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setBoardThumbnail(
                        board.id,
                        board.thumbnailPinId === item.id ? undefined : item.id,
                      );
                    }}
                    activeOpacity={0.8}
                    accessibilityLabel={
                          board.thumbnailPinId === item.id ? 'Remove as board cover' : 'Set as board cover'
                    }
                  >
                    <Feather name="image" size={13} color="#fff" />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* Board options menu */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.confirmBackdrop} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuCard, { backgroundColor: colors.homeSurface }]}>
            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.75}
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
              onPress={() => { setMenuVisible(false); setDeleteConfirmVisible(true); }}
            >
              <View style={[styles.menuIcon, { backgroundColor: colors.destructive + '18' }]}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </View>
              <Text style={[styles.menuLabel, { color: colors.destructive }]}>Delete Board</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
                        <Image source={getPinImageSource(item)} style={[styles.addRowImage, { backgroundColor: colors.homeAqua }]} />
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

      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmCard, { backgroundColor: colors.homeSurface }]}>
            <Text style={[styles.confirmTitle, { color: colors.homeInk }]}>Rename Board</Text>
            <TextInput
              style={[styles.renameInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Board name"
              placeholderTextColor={colors.homeMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (newName.trim()) {
                  renameBoard(board.id, newName);
                  setRenameVisible(false);
                }
              }}
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity
                onPress={() => setRenameVisible(false)}
                style={[styles.confirmButton, { backgroundColor: colors.homeAqua }]}
              >
                <Text style={[styles.confirmButtonText, { color: colors.homeInk }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (newName.trim()) {
                    renameBoard(board.id, newName);
                    setRenameVisible(false);
                  }
                }}
                style={[styles.confirmButton, { backgroundColor: colors.homeCoral, opacity: newName.trim() ? 1 : 0.5 }]}
                disabled={!newName.trim()}
              >
                <Text style={[styles.confirmButtonText, { color: colors.homeSurface }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deleteConfirmVisible || pinToRemove !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeleteConfirmVisible(false);
          setPinToRemove(null);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmCard, { backgroundColor: colors.homeSurface }]}>
            <Text style={[styles.confirmTitle, { color: colors.homeInk }]}>
              {deleteConfirmVisible ? 'Delete Board?' : 'Remove Pin?'}
            </Text>
            <Text style={[styles.confirmBody, { color: colors.homeMuted }]}>
              {deleteConfirmVisible
                ? `Delete "${board.name}"? Your pins won't be removed from your Collection.`
                : `Remove "${pinToRemove?.title ?? 'this pin'}" from this Board?`}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                onPress={() => {
                  setDeleteConfirmVisible(false);
                  setPinToRemove(null);
                }}
                style={[styles.confirmButton, { backgroundColor: colors.homeAqua }]}
              >
                <Text style={[styles.confirmButtonText, { color: colors.homeInk }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (deleteConfirmVisible) {
                    deleteBoard(board.id);
                    router.back();
                  } else if (pinToRemove) {
                    removePinFromBoard(board.id, pinToRemove.id);
                    setPinToRemove(null);
                  }
                }}
                style={[styles.confirmButton, { backgroundColor: colors.destructive }]}
              >
                <Text style={[styles.confirmButtonText, { color: '#fff' }]}>
                  {deleteConfirmVisible ? 'Delete' : 'Remove'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  // Grid
  grid: { paddingTop: 12, paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'space-between' },
  gridItemWrap: { position: 'relative', flex: 1 },
  removeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  removeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  menuCard: { position: 'absolute', top: 100, right: spacing.lg, width: 210, borderRadius: radius.lg, overflow: 'hidden', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
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
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 380, borderRadius: 20, padding: 20 },
  confirmTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  confirmBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 20 },
  renameInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, fontSize: 15, fontFamily: 'Inter_500Medium', marginBottom: 20 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  confirmButton: { minHeight: 44, minWidth: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16 },
  confirmButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
