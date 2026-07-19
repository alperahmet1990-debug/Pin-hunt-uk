import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
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
import { PinCard } from '@/components/PinCard';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { BoardCardHorizontal } from '@/components/BoardCard';
import type { CollectionStatus } from '@/types/pin';
import type { CataloguePin } from '@workspace/pin-repository';

type Section = 'owned' | 'wanted' | 'for_trade';
type ViewMode = 'grid' | 'list';

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'owned', label: 'Owned' },
  { key: 'wanted', label: 'ISO' },
  { key: 'for_trade', label: 'For Trade' },
];

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { collection, counts } = useCollection();
  const { pins: catalogue } = usePinCatalogue();
  const { allBoards, createBoard, getBoardPins } = useBoards();

  const [section, setSection] = useState<Section>('owned');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const nameInputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  const filtered = useMemo(() => {
    const pinIds = Object.values(collection)
      .filter(e => e.status === section)
      .map(e => e.pinId);
    const pins = pinIds
      .map(id => catalogue.find(p => p.id === id))
      .filter((p): p is CataloguePin => p !== undefined);

    if (!query) return pins;
    const q = query.toLowerCase();
    return pins.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        p.collection.toLowerCase().includes(q) ||
        p.characters.some(c => c.toLowerCase().includes(q)),
    );
  }, [collection, section, query]);

  const estimatedValue = useMemo(() => {
    const owned = Object.values(collection)
      .filter(e => e.status === 'owned')
      .map(e => catalogue.find(p => p.id === e.pinId))
      .filter(Boolean);
    return owned.reduce((sum, p) => sum + (p?.estimatedValueGBP ?? 0), 0);
  }, [collection]);

  const sectionCount = (s: Section) =>
    s === 'owned' ? counts.owned : s === 'wanted' ? counts.wanted : counts.forTrade;

  const activeColor = (s: Section) =>
    s === 'owned' ? colors.owned : s === 'wanted' ? colors.wanted : colors.forTrade;

  const emptyMessages: Record<Section, { title: string; subtitle: string }> = {
    owned: { title: 'No pins owned yet', subtitle: 'Mark pins as Owned from the Catalogue or Scan tabs.' },
    wanted: { title: 'No ISO pins yet', subtitle: 'Mark pins as ISO to track what you are searching for.' },
    for_trade: { title: 'Nothing up for trade', subtitle: "Mark pins as For Trade to let others know you're open to swaps." },
  };

  const handleCreateBoard = () => {
    const name = newBoardName.trim();
    if (!name) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const board = createBoard(name);
    setNewBoardName('');
    setCreateModalVisible(false);
    router.push({ pathname: '/board/[id]', params: { id: board.id } });
  };

  // Boards section shown at top of Owned list
  const BoardsHeader = useMemo(() => {
    if (section !== 'owned') return null;
    return (
      <View style={styles.boardsSection}>
        <View style={styles.boardsSectionHeader}>
          <Text style={[styles.boardsSectionTitle, { color: colors.foreground }]}>Boards</Text>
          <TouchableOpacity
            onPress={() => {
              setNewBoardName('');
              setCreateModalVisible(true);
            }}
            style={[styles.newBoardBtn, { backgroundColor: colors.secondary, borderRadius: 8, borderColor: colors.border }]}
            activeOpacity={0.75}
          >
            <Feather name="plus" size={14} color={colors.primary} />
            <Text style={[styles.newBoardBtnLabel, { color: colors.primary }]}>New Board</Text>
          </TouchableOpacity>
        </View>

        {allBoards.length === 0 ? (
          <View style={[styles.emptyBoards, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, marginHorizontal: 16 }]}>
            <Feather name="grid" size={20} color={colors.mutedForeground} />
            <Text style={[styles.emptyBoardsText, { color: colors.mutedForeground }]}>
              No boards yet. Create one to organise your pins, or add pins to your collection for suggested boards.
            </Text>
          </View>
        ) : (
          <View style={styles.boardsList}>
            {allBoards.map(board => {
              const pins = getBoardPins(board);
              return (
                <BoardCardHorizontal
                  key={board.id}
                  board={board}
                  pins={pins}
                  onPress={() =>
                    router.push({ pathname: '/board/[id]', params: { id: board.id } })
                  }
                />
              );
            })}
          </View>
        )}

        {/* Divider before pin grid */}
        {filtered.length > 0 && (
          <View style={styles.allPinsHeader}>
            <Text style={[styles.allPinsTitle, { color: colors.foreground }]}>All Owned Pins</Text>
          </View>
        )}
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, allBoards, filtered.length, colors]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.headerBar,
          { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Collection</Text>
          <TouchableOpacity
            onPress={() => setViewMode(v => (v === 'grid' ? 'list' : 'grid'))}
            style={[styles.toggleBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}
            activeOpacity={0.75}
          >
            <Feather name={viewMode === 'grid' ? 'list' : 'grid'} size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Summary row */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.owned }]}>{counts.owned}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Owned</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.wanted }]}>{counts.wanted}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>ISO</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.forTrade }]}>{counts.forTrade}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>For Trade</Text>
          </View>
          <View style={[styles.valueDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.gold }]}>£{estimatedValue}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Est. Value*</Text>
          </View>
        </View>

        {/* Section tabs */}
        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          {SECTIONS.map(s => {
            const isActive = s.key === section;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => { setSection(s.key); setQuery(''); }}
                style={[
                  styles.tab,
                  isActive && { borderBottomColor: activeColor(s.key), borderBottomWidth: 2 },
                ]}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabLabel, { color: isActive ? activeColor(s.key) : colors.mutedForeground }]}>
                  {s.label}
                </Text>
                <View style={[styles.tabBadge, { backgroundColor: isActive ? activeColor(s.key) : colors.secondary }]}>
                  <Text style={[styles.tabBadgeLabel, { color: isActive ? '#fff' : colors.mutedForeground }]}>
                    {sectionCount(s.key)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ paddingBottom: 8 }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search this section…" />
        </View>
      </View>

      {section !== 'owned' && filtered.length === 0 ? (
        <EmptyState
          icon={section === 'wanted' ? 'bookmark' : 'repeat'}
          title={emptyMessages[section].title}
          subtitle={emptyMessages[section].subtitle}
          actionLabel="Browse Catalogue"
          onAction={() => router.push('/(tabs)/catalogue')}
        />
      ) : section === 'owned' && filtered.length === 0 && allBoards.length === 0 ? (
        <>
          {BoardsHeader}
          <EmptyState
            icon="heart"
            title={emptyMessages.owned.title}
            subtitle={emptyMessages.owned.subtitle}
            actionLabel="Browse Catalogue"
            onAction={() => router.push('/(tabs)/catalogue')}
          />
        </>
      ) : (
        <FlatList
          key={viewMode}
          data={filtered}
          keyExtractor={p => p.id}
          numColumns={viewMode === 'grid' ? 2 : 1}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={BoardsHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: botPad },
            viewMode === 'grid' && styles.gridPadding,
          ]}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          renderItem={({ item }) => (
            <PinCard
              pin={item}
              mode={viewMode}
              onPress={() =>
                router.push({ pathname: '/pin/[id]', params: { id: item.id } })
              }
            />
          )}
        />
      )}

      {/* Estimated value disclaimer */}
      <View style={[styles.disclaimer, { backgroundColor: colors.muted, borderTopColor: colors.border }]}>
        <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
          * Estimated values are sample data only and do not reflect real market prices.
        </Text>
      </View>

      {/* Create Board Modal */}
      <Modal
        visible={createModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCreateModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.createModal, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}
          >
            <Text style={[styles.createModalTitle, { color: colors.foreground }]}>New Board</Text>
            <Text style={[styles.createModalSub, { color: colors.mutedForeground }]}>
              Give your board a name, such as "2026 Wave A Hidden Mickeys" or "Tiana Collection".
            </Text>
            <TextInput
              ref={nameInputRef}
              value={newBoardName}
              onChangeText={setNewBoardName}
              placeholder="Board name…"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.createInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateBoard}
              maxLength={60}
            />
            <View style={styles.createActions}>
              <TouchableOpacity
                onPress={() => setCreateModalVisible(false)}
                style={[styles.createCancelBtn, { borderColor: colors.border, borderRadius: colors.radius - 4 }]}
                activeOpacity={0.75}
              >
                <Text style={[styles.createCancelLabel, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateBoard}
                style={[
                  styles.createConfirmBtn,
                  { backgroundColor: newBoardName.trim() ? colors.primary : colors.muted, borderRadius: colors.radius - 4 },
                ]}
                activeOpacity={0.85}
                disabled={!newBoardName.trim()}
              >
                <Text style={[styles.createConfirmLabel, { color: newBoardName.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                  Create
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  toggleBtn: { padding: 8 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 4,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryCount: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  valueDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  tabBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeLabel: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  listContent: { paddingTop: 0 },
  gridPadding: { paddingHorizontal: 16 },
  gridRow: { gap: 12, justifyContent: 'space-between' },
  disclaimer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  disclaimerText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  // Boards section
  boardsSection: { paddingTop: 16, paddingBottom: 4 },
  boardsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  boardsSectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  newBoardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  newBoardBtnLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyBoards: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  emptyBoardsText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  boardsList: { marginBottom: 16 },
  allPinsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 4,
  },
  allPinsTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  // Create modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  createModal: {
    width: '100%',
    padding: 20,
    gap: 14,
    borderWidth: 1,
  },
  createModalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  createModalSub: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  createInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  createActions: { flexDirection: 'row', gap: 10 },
  createCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderWidth: 1,
  },
  createCancelLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  createConfirmBtn: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  createConfirmLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
