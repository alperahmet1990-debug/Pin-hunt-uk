import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { getPinImageSource } from '@/utils/pinImage';
import { KeyboardAwareScrollViewCompat } from './KeyboardAwareScrollViewCompat';
import type { CollectionStatus } from '@/types/pin';
import type { Board } from '@/types/board';
import type { CataloguePin } from '@workspace/pin-repository';

const STATUS_CONFIG: Array<{
  status: CollectionStatus;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}> = [
  { status: 'owned', label: 'Owned', icon: 'check-circle' },
  { status: 'wanted', label: 'ISO', icon: 'bookmark' },
  { status: 'for_trade', label: 'For Trade', icon: 'repeat' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const SHEET_PADDING = 20;
const BOARD_GAP = 10;
const BOARD_CARD_WIDTH = (SCREEN_WIDTH - SHEET_PADDING * 2 - BOARD_GAP) / 2;

interface QuickAddSheetProps {
  /** Pin to act on. Sheet is hidden when null. */
  pin: CataloguePin | null;
  onClose: () => void;
  /**
   * Renders with the Sea Glass & Coral tokens instead of the app-wide Golden
   * Era palette. Used by screens that have already adopted the new design
   * system (Pin Detail, Set Detail) without restyling this sheet's other
   * call sites (search, scan matches, catalogue) ahead of the full migration.
   */
  seaGlass?: boolean;
}

/**
 * One consistent "save this pin" moment used from search results, scan
 * matches, set pages and the catalogue: pick a status, optionally drop the
 * pin onto a board, then jump straight to the collection — all without
 * leaving the current screen.
 */
export function QuickAddSheet({ pin, onClose, seaGlass = false }: QuickAddSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getEntry, setStatus, adjustQuantity } = useCollection();
  const { customBoards, createBoard, addPinToBoard, removePinFromBoard, getBoardPins } = useBoards();

  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  // A board tap that arrived before the pin was Owned/For Trade — boards can
  // only hold pins the collector has (see BoardsContext.addPinToBoard), so we
  // mark it Owned first and add it to the board once that status change has
  // actually landed (setStatus's state update isn't visible synchronously).
  const [pendingBoardId, setPendingBoardId] = useState<string | null>(null);

  const entry = pin ? getEntry(pin.id) : undefined;
  const currentStatus: CollectionStatus = entry?.status ?? 'none';
  const isKept = currentStatus === 'owned' || currentStatus === 'for_trade';

  useEffect(() => {
    if (!pendingBoardId || !pin || !isKept) return;
    addPinToBoard(pendingBoardId, pin.id);
    setPendingBoardId(null);
  }, [pendingBoardId, pin, isKept, addPinToBoard]);

  // Token indirection so this one sheet can render in either palette without
  // duplicating the component for its Sea Glass call sites.
  const t = seaGlass
    ? {
        sheetBg: colors.homeBackground,
        border: colors.homeLine,
        fg: colors.homeInk,
        muted: colors.homeMuted,
        primary: colors.homeCoral,
        primaryFg: colors.homeSurface,
        secondary: colors.homeAqua,
        card: colors.homeSurface,
        radius: 16,
      }
    : {
        sheetBg: colors.background,
        border: colors.border,
        fg: colors.foreground,
        muted: colors.mutedForeground,
        primary: colors.primary,
        primaryFg: colors.primaryForeground,
        secondary: colors.secondary,
        card: colors.card,
        radius: colors.radius,
      };

  const statusColor = (s: CollectionStatus) =>
    s === 'owned' ? colors.owned : s === 'wanted' ? colors.wanted : colors.forTrade;

  const handleStatus = (s: CollectionStatus) => {
    if (!pin) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatus(pin.id, currentStatus === s ? 'none' : s);
  };

  const handleToggleBoard = (boardId: string) => {
    if (!pin) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    const board = customBoards.find(b => b.id === boardId);
    if (!board) return;
    if (board.pinIds.includes(pin.id)) {
      removePinFromBoard(boardId, pin.id);
      return;
    }
    if (!isKept) {
      // Tapping a board is the collector saying "I have this" — mark it
      // Owned automatically rather than silently failing to add it.
      setStatus(pin.id, 'owned');
      setPendingBoardId(boardId);
      return;
    }
    addPinToBoard(boardId, pin.id);
  };

  const handleCreateAndAdd = () => {
    const name = newBoardName.trim();
    if (!name || !pin) return;
    Keyboard.dismiss();
    const board = createBoard(name);
    addPinToBoard(board.id, pin.id);
    setCreatingBoard(false);
    setNewBoardName('');
  };

  const close = () => {
    Keyboard.dismiss();
    setCreatingBoard(false);
    setNewBoardName('');
    onClose();
  };

  const goToCollection = () => {
    close();
    router.push('/(tabs)/collection');
  };

  return (
    <Modal visible={!!pin} animationType="slide" transparent onRequestClose={close}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={close} />
      {pin && (
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.sheetBg,
              borderTopColor: t.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: t.border }]} />
          <TouchableOpacity
            onPress={close}
            accessibilityLabel="Close"
            hitSlop={8}
            style={[styles.closeBtn, { backgroundColor: t.secondary }]}
          >
            <Feather name="x" size={16} color={t.fg} />
          </TouchableOpacity>

          {/* Pin summary — static, not part of the scroll */}
          <View style={styles.pinRow}>
            <Image
              source={getPinImageSource(pin)}
              style={[styles.pinImage, { backgroundColor: t.secondary, borderRadius: 10 }]}
            />
            <View style={styles.pinInfo}>
              <Text style={[styles.pinTitle, { color: t.fg }]} numberOfLines={2}>
                {pin.title}
              </Text>
              {pin.collection ? (
                <Text style={[styles.pinMeta, { color: t.muted }]} numberOfLines={1}>
                  {pin.collection}
                </Text>
              ) : null}
            </View>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.scroll}
            bottomOffset={90}
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => Keyboard.dismiss()}
          >
            {/* Status buttons */}
            <View style={styles.statusRow}>
              {STATUS_CONFIG.map(({ status, label, icon }) => {
                const active = currentStatus === status;
                return (
                  <TouchableOpacity
                    key={status}
                    onPress={() => handleStatus(status)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Mark as ${label}`}
                    style={[
                      styles.statusBtn,
                      {
                        backgroundColor: active ? statusColor(status) : t.secondary,
                        borderRadius: t.radius,
                      },
                    ]}
                  >
                    <Feather name={icon} size={16} color={active ? t.primaryFg : t.muted} />
                    <Text
                      style={[
                        styles.statusLabel,
                        { color: active ? t.primaryFg : t.muted },
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {isKept && (
              <View style={[styles.quantityRow, { borderColor: t.border }]}>
                <View style={styles.quantityCopy}>
                  <Text style={[styles.quantityTitle, { color: t.fg }]}>Copies</Text>
                  <Text style={[styles.quantityHint, { color: t.muted }]}>
                    How many of this pin you have
                  </Text>
                </View>
                <View style={styles.quantityControls}>
                  <TouchableOpacity
                    onPress={() => pin && adjustQuantity(pin.id, -1)}
                    disabled={(entry?.quantity ?? 1) <= 1}
                    accessibilityLabel="Decrease quantity"
                    style={[styles.quantityButton, { backgroundColor: t.secondary }]}
                  >
                    <Feather name="minus" size={16} color={(entry?.quantity ?? 1) <= 1 ? t.muted : t.fg} />
                  </TouchableOpacity>
                  <Text style={[styles.quantityValue, { color: t.fg }]}>
                    {entry?.quantity ?? 1}
                  </Text>
                  <TouchableOpacity
                    onPress={() => pin && adjustQuantity(pin.id, 1)}
                    accessibilityLabel="Increase quantity"
                    style={[styles.quantityButton, { backgroundColor: t.secondary }]}
                  >
                    <Feather name="plus" size={16} color={t.fg} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Boards — the main experience */}
            <View style={styles.boardsHead}>
              <Text style={[styles.boardsHeading, { color: t.muted }]}>YOUR BOARDS</Text>
              {!creatingBoard && (
                <TouchableOpacity onPress={() => setCreatingBoard(true)} activeOpacity={0.75} style={styles.newBoardTrigger}>
                  <Feather name="plus" size={13} color={t.primary} />
                  <Text style={[styles.newBoardTriggerLabel, { color: t.primary }]}>New Board</Text>
                </TouchableOpacity>
              )}
            </View>
            {!isKept && (
              <Text style={[styles.boardsHint, { color: t.muted }]}>
                Tap a board below to add this pin — we'll mark it Owned for you.
              </Text>
            )}

            {creatingBoard && (
              <View style={[styles.newBoardForm, { backgroundColor: t.secondary, borderRadius: t.radius }]}>
                <TextInput
                  value={newBoardName}
                  onChangeText={setNewBoardName}
                  placeholder="Board name…"
                  placeholderTextColor={t.muted}
                  style={[styles.newBoardInput, { color: t.fg }]}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateAndAdd}
                />
                <TouchableOpacity
                  onPress={() => { setCreatingBoard(false); setNewBoardName(''); Keyboard.dismiss(); }}
                  style={styles.newBoardCancel}
                  activeOpacity={0.75}
                >
                  <Feather name="x" size={16} color={t.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateAndAdd}
                  disabled={!newBoardName.trim()}
                  activeOpacity={0.85}
                  style={[
                    styles.newBoardCreate,
                    { backgroundColor: newBoardName.trim() ? t.primary : t.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.newBoardCreateLabel,
                      { color: newBoardName.trim() ? t.primaryFg : t.muted },
                    ]}
                  >
                    Create
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {customBoards.length === 0 && !creatingBoard ? (
              <Text style={[styles.emptyBoards, { color: t.muted }]}>
                No boards yet — create one to start organising your collection.
              </Text>
            ) : (
              <View style={styles.boardGrid}>
                {customBoards.map(board => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    pins={getBoardPins(board).slice(0, 4)}
                    selected={board.pinIds.includes(pin.id)}
                    onPress={() => handleToggleBoard(board.id)}
                    t={t}
                  />
                ))}
              </View>
            )}
          </KeyboardAwareScrollViewCompat>

          <KeyboardStickyView offset={{ closed: 0, opened: Platform.OS === 'ios' ? 8 : 0 }}>
            <View style={[styles.footer, { backgroundColor: t.sheetBg, paddingBottom: Math.max(insets.bottom, 16) }]}>
              {currentStatus !== 'none' && (
                <TouchableOpacity
                  onPress={goToCollection}
                  activeOpacity={0.8}
                  style={[
                    styles.footerBtn,
                    { borderColor: t.border, backgroundColor: t.card, borderRadius: t.radius },
                  ]}
                >
                  <Text style={[styles.footerBtnLabel, { color: t.fg }]}>View Collection</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={close}
                activeOpacity={0.85}
                style={[
                  styles.footerBtn,
                  { backgroundColor: t.primary, borderRadius: t.radius },
                ]}
              >
                <Text style={[styles.footerBtnLabel, { color: t.primaryFg }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </KeyboardStickyView>
        </View>
      )}
    </Modal>
  );
}

// ─── Board card ───────────────────────────────────────────────────────────────

type Tokens = {
  sheetBg: string; border: string; fg: string; muted: string;
  primary: string; primaryFg: string; secondary: string; card: string; radius: number;
};

function BoardCard({ board, pins, selected, onPress, t }: {
  board: Board;
  pins: CataloguePin[];
  selected: boolean;
  onPress: () => void;
  t: Tokens;
}) {
  const cells = [0, 1, 2, 3].map(i => pins[i] ?? null);
  const hasAny = pins.length > 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.boardCard, { backgroundColor: t.card, borderColor: selected ? t.primary : t.border }]}>
      <View style={styles.mosaic}>
        {hasAny ? (
          cells.map((cellPin, i) => (
            <View key={i} style={[styles.mosaicCell, { backgroundColor: t.secondary, borderColor: t.card }]}>
              {cellPin && <Image source={getPinImageSource(cellPin)} style={styles.mosaicImage} resizeMode="contain" />}
            </View>
          ))
        ) : (
          <View style={[styles.mosaicEmpty, { backgroundColor: t.secondary }]}>
            <Feather name="grid" size={22} color={t.muted} />
          </View>
        )}
        {selected && (
          <View style={[styles.boardCheck, { backgroundColor: t.primary }]}>
            <Feather name="check" size={12} color={t.primaryFg} />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[styles.boardName, { color: t.fg }]}>{board.name}</Text>
      <Text style={[styles.boardMeta, { color: t.muted }]}>{board.pinIds.length} pin{board.pinIds.length !== 1 ? 's' : ''}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: SHEET_PADDING,
    paddingTop: 8,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 6,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: SHEET_PADDING,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 14 },
  pinImage: { width: 52, height: 52 },
  pinInfo: { flex: 1, gap: 2 },
  pinTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  pinMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  scroll: { flexGrow: 0 },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  statusLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  quantityRow: {
    minHeight: 58,
    marginBottom: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityCopy: { flex: 1 },
  quantityTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  quantityHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quantityButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { minWidth: 20, textAlign: 'center', fontSize: 16, fontFamily: 'Inter_700Bold' },
  boardsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  boardsHeading: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  boardsHint: { fontSize: 11.5, fontFamily: 'Inter_400Regular', lineHeight: 15, marginBottom: 10, marginTop: -2 },
  newBoardTrigger: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  newBoardTriggerLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  newBoardForm: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, marginBottom: 14 },
  newBoardInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', paddingHorizontal: 8, paddingVertical: 6 },
  newBoardCancel: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  newBoardCreate: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  newBoardCreateLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyBoards: { fontSize: 13, fontFamily: 'Inter_400Regular', paddingVertical: 16, textAlign: 'center' },
  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: BOARD_GAP, paddingBottom: 8 },
  boardCard: { width: BOARD_CARD_WIDTH, borderWidth: 1.5, borderRadius: 16, padding: 8 },
  mosaic: { width: '100%', aspectRatio: 1, flexDirection: 'row', flexWrap: 'wrap', borderRadius: 10, overflow: 'hidden', position: 'relative' },
  mosaicCell: { width: '50%', height: '50%', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  mosaicImage: { width: '100%', height: '100%' },
  mosaicEmpty: { width: '100%', height: '100%', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  boardCheck: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  boardName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  boardMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footerBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
