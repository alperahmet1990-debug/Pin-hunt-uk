import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
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
import { PINS } from '@/mock-data/pins';
import { PinCard } from '@/components/PinCard';
import { EmptyState } from '@/components/EmptyState';
import type { Pin } from '@/types/pin';

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getBoardById, getBoardPins, addPinToBoard, removePinFromBoard, deleteBoard } = useBoards();
  const { collection } = useCollection();

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const board = getBoardById(id ?? '');
  const boardPins = board ? getBoardPins(board) : [];

  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 20;

  // Owned pins not yet in this custom board
  const availablePins = useMemo(() => {
    if (!board || !board.isCustom) return [];
    const boardPinIds = new Set(board.pinIds);
    const ownedIds = new Set(
      Object.values(collection)
        .filter(e => e.status === 'owned')
        .map(e => e.pinId),
    );
    return PINS.filter(p => ownedIds.has(p.id) && !boardPinIds.has(p.id));
  }, [board, collection]);

  if (!board) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFoundText, { color: colors.foreground }]}>Board not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[{ color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 14 }]}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleDeleteBoard = () => {
    Alert.alert(
      'Delete Board',
      `Delete "${board.name}"? Your pins won't be removed from your collection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteBoard(board.id);
            router.back();
          },
        },
      ],
    );
  };

  const handleAddPin = (pin: Pin) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addPinToBoard(board.id, pin.id);
  };

  const handleRemovePin = (pin: Pin) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Remove Pin',
      `Remove "${pin.title}" from this board?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removePinFromBoard(board.id, pin.id) },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: board.name,
          headerRight: () =>
            board.isCustom ? (
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => setEditMode(e => !e)}
                  style={styles.headerBtn}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.headerBtnText, { color: editMode ? colors.destructive : colors.primary }]}>
                    {editMode ? 'Done' : 'Edit'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteBoard} style={styles.headerBtn} activeOpacity={0.7}>
                  <Feather name="trash-2" size={18} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            ) : null,
        }}
      />

      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Board meta */}
        <View style={[styles.metaBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.metaLeft}>
            <Text style={[styles.pinCount, { color: colors.foreground }]}>
              {boardPins.length} {boardPins.length === 1 ? 'pin' : 'pins'}
            </Text>
            {!board.isCustom && (
              <View style={[styles.suggestedChip, { backgroundColor: colors.accent + '22' }]}>
                <Feather name="zap" size={10} color={colors.accent} />
                <Text style={[styles.suggestedChipText, { color: colors.accent }]}>
                  Auto-updated from your collection
                </Text>
              </View>
            )}
          </View>
          {board.isCustom && !editMode && (
            <TouchableOpacity
              onPress={() => setAddModalVisible(true)}
              style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius - 4 }]}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={16} color={colors.primaryForeground} />
              <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Add Pins</Text>
            </TouchableOpacity>
          )}
        </View>

        {boardPins.length === 0 ? (
          <EmptyState
            icon="grid"
            title="No pins in this board yet"
            subtitle={
              board.isCustom
                ? 'Tap Add Pins to add owned pins to this board.'
                : 'Add pins from this collection to your Owned list and they will appear here automatically.'
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
                  onPress={() =>
                    editMode
                      ? handleRemovePin(item)
                      : router.push({ pathname: '/pin/[id]', params: { id: item.id } })
                  }
                />
                {editMode && (
                  <TouchableOpacity
                    style={[styles.removeOverlay, { borderRadius: colors.radius }]}
                    onPress={() => handleRemovePin(item)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.removeBadge, { backgroundColor: colors.destructive }]}>
                      <Feather name="minus" size={14} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        )}
      </View>

      {/* Add Pins Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Pins to Board</Text>
            <TouchableOpacity onPress={() => setAddModalVisible(false)} activeOpacity={0.7}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {availablePins.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="All owned pins added"
              subtitle="Every pin in your Owned collection is already in this board."
              actionLabel="Close"
              onAction={() => setAddModalVisible(false)}
            />
          ) : (
            <FlatList
              data={availablePins}
              keyExtractor={p => p.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 12, paddingBottom: insets.bottom + 20 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleAddPin(item)}
                  activeOpacity={0.8}
                  style={[styles.addRow, { borderBottomColor: colors.border }]}
                >
                  <Image source={item.image} style={styles.addRowImage} />
                  <View style={styles.addRowInfo}>
                    <Text style={[styles.addRowTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={[styles.addRowMeta, { color: colors.mutedForeground }]}>
                      {item.brand} · {item.collection}
                    </Text>
                  </View>
                  <View style={[styles.addCircle, { borderColor: colors.primary, backgroundColor: colors.primary }]}>
                    <Feather name="plus" size={16} color="#fff" />
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 4 },
  headerBtn: { padding: 4 },
  headerBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metaLeft: { flex: 1, gap: 6 },
  pinCount: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  suggestedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  suggestedChipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  grid: { paddingTop: 12, paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'space-between' },
  gridItemWrap: { position: 'relative', flex: 1 },
  removeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  removeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  modalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  addRowImage: { width: 56, height: 56, borderRadius: 8, resizeMode: 'cover' },
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
});
