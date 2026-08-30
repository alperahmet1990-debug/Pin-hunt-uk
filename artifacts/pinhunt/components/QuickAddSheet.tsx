import React, { useState } from 'react';
import {
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
import { getPinImageSource } from '@/utils/pinImage';
import type { CollectionStatus } from '@/types/pin';
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

interface QuickAddSheetProps {
  /** Pin to act on. Sheet is hidden when null. */
  pin: CataloguePin | null;
  onClose: () => void;
}

/**
 * One consistent "save this pin" moment used from search results, scan
 * matches, set pages and the catalogue: pick a status, optionally drop the
 * pin onto a board, then jump straight to the collection — all without
 * leaving the current screen.
 */
export function QuickAddSheet({ pin, onClose }: QuickAddSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getEntry, setStatus, adjustQuantity } = useCollection();
  const { customBoards, createBoard, addPinToBoard, removePinFromBoard } = useBoards();

  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  const entry = pin ? getEntry(pin.id) : undefined;
  const currentStatus: CollectionStatus = entry?.status ?? 'none';

  const statusColor = (s: CollectionStatus) =>
    s === 'owned' ? colors.owned : s === 'wanted' ? colors.wanted : colors.forTrade;

  const handleStatus = (s: CollectionStatus) => {
    if (!pin) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatus(pin.id, currentStatus === s ? 'none' : s);
  };

  const handleToggleBoard = (boardId: string) => {
    if (!pin) return;
    const board = customBoards.find(b => b.id === boardId);
    if (!board) return;
    if (board.pinIds.includes(pin.id)) removePinFromBoard(boardId, pin.id);
    else addPinToBoard(boardId, pin.id);
  };

  const handleCreateAndAdd = () => {
    const name = newBoardName.trim();
    if (!name || !pin) return;
    const board = createBoard(name);
    addPinToBoard(board.id, pin.id);
    setCreatingBoard(false);
    setNewBoardName('');
  };

  const close = () => {
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
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Pin summary */}
          <View style={styles.pinRow}>
            <Image
              source={getPinImageSource(pin)}
              style={[styles.pinImage, { backgroundColor: colors.secondary, borderRadius: 10 }]}
            />
            <View style={styles.pinInfo}>
              <Text style={[styles.pinTitle, { color: colors.foreground }]} numberOfLines={2}>
                {pin.title}
              </Text>
              <Text style={[styles.pinMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {pin.brand} · {pin.collection}
              </Text>
            </View>
          </View>

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
                      backgroundColor: active ? statusColor(status) : colors.secondary,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  <Feather name={icon} size={16} color={active ? '#fff' : colors.mutedForeground} />
                  <Text
                    style={[
                      styles.statusLabel,
                      { color: active ? '#fff' : colors.mutedForeground },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {(currentStatus === 'owned' || currentStatus === 'for_trade') && (
            <View style={[styles.quantityRow, { borderColor: colors.border }]}>
              <View style={styles.quantityCopy}>
                <Text style={[styles.quantityTitle, { color: colors.foreground }]}>Copies</Text>
                <Text style={[styles.quantityHint, { color: colors.mutedForeground }]}>
                  How many of this pin you have
                </Text>
              </View>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  onPress={() => pin && adjustQuantity(pin.id, -1)}
                  disabled={(entry?.quantity ?? 1) <= 1}
                  accessibilityLabel="Decrease quantity"
                  style={[styles.quantityButton, { backgroundColor: colors.secondary }]}
                >
                  <Feather name="minus" size={16} color={(entry?.quantity ?? 1) <= 1 ? colors.mutedForeground : colors.foreground} />
                </TouchableOpacity>
                <Text style={[styles.quantityValue, { color: colors.foreground }]}>
                  {entry?.quantity ?? 1}
                </Text>
                <TouchableOpacity
                  onPress={() => pin && adjustQuantity(pin.id, 1)}
                  accessibilityLabel="Increase quantity"
                  style={[styles.quantityButton, { backgroundColor: colors.secondary }]}
                >
                  <Feather name="plus" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Boards */}
          <Text style={[styles.boardsHeading, { color: colors.mutedForeground }]}>
            Boards
          </Text>
          <ScrollView style={styles.boardList} showsVerticalScrollIndicator={false}>
            {customBoards.length === 0 && !creatingBoard && (
              <Text style={[styles.emptyBoards, { color: colors.mutedForeground }]}>
                No boards yet — create one below.
              </Text>
            )}
            {customBoards.map(board => {
              const isIn = board.pinIds.includes(pin.id);
              return (
                <TouchableOpacity
                  key={board.id}
                  onPress={() => handleToggleBoard(board.id)}
                  activeOpacity={0.75}
                  style={[styles.boardRow, { borderBottomColor: colors.border }]}
                >
                  <View
                    style={[
                      styles.boardCheck,
                      {
                        backgroundColor: isIn ? colors.primary : 'transparent',
                        borderColor: isIn ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    {isIn && <Feather name="check" size={13} color="#fff" />}
                  </View>
                  <Text style={[styles.boardName, { color: colors.foreground }]} numberOfLines={1}>
                    {board.name}
                  </Text>
                  <Text style={[styles.boardMeta, { color: colors.mutedForeground }]}>
                    {board.pinIds.length} pin{board.pinIds.length !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {creatingBoard ? (
              <View style={styles.newBoardForm}>
                <TextInput
                  value={newBoardName}
                  onChangeText={setNewBoardName}
                  placeholder="Board name…"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.newBoardInput,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateAndAdd}
                />
                <TouchableOpacity
                  onPress={handleCreateAndAdd}
                  disabled={!newBoardName.trim()}
                  activeOpacity={0.85}
                  style={[
                    styles.newBoardCreate,
                    { backgroundColor: newBoardName.trim() ? colors.primary : colors.secondary },
                  ]}
                >
                  <Text
                    style={[
                      styles.newBoardCreateLabel,
                      { color: newBoardName.trim() ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    Add
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setCreatingBoard(true)}
                activeOpacity={0.8}
                style={styles.newBoardTrigger}
              >
                <Feather name="plus-circle" size={17} color={colors.primary} />
                <Text style={[styles.newBoardTriggerLabel, { color: colors.primary }]}>New Board</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {currentStatus !== 'none' && (
              <TouchableOpacity
                onPress={goToCollection}
                activeOpacity={0.8}
                style={[
                  styles.footerBtn,
                  { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius },
                ]}
              >
                <Text style={[styles.footerBtnLabel, { color: colors.foreground }]}>View Collection</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={close}
              activeOpacity={0.85}
              style={[
                styles.footerBtn,
                { backgroundColor: colors.primary, borderRadius: colors.radius },
              ]}
            >
              <Text style={[styles.footerBtnLabel, { color: colors.primaryForeground }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  pinImage: { width: 56, height: 56 },
  pinInfo: { flex: 1, gap: 2 },
  pinTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  pinMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
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
  boardsHeading: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  boardList: { maxHeight: 220 },
  emptyBoards: { fontSize: 13, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  boardCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  boardMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  newBoardTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  newBoardTriggerLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  newBoardForm: { flexDirection: 'row', gap: 8, paddingVertical: 10, alignItems: 'center' },
  newBoardInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  newBoardCreate: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  newBoardCreateLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 14 },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footerBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
