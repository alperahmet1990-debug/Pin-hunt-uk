/**
 * Long-press quick actions on any pin tile (UX-016, #127): Owned · ISO ·
 * For Trade (current one marked), Copies − / +, boards, and Remove — without
 * opening Pin detail. Same rules as Add to Collection (UX-013): status is a
 * radio group, dropping ×N copies or removing asks first in the sheet, and
 * every status change has an Undo that restores the exact previous entry.
 *
 * Screens call `usePinActions()`, pass `open` to tiles as onLongPress, spread
 * `a11y(pin)` onto the tile so VoiceOver gets the same actions, and render
 * `sheet` once.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, type AccessibilityActionEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { useToast } from '@/components/ui/Toast';
import { Sheet } from '@/components/ui/Sheet';
import { dropsCopies, removalConsequence, statusChangeMessage } from '@/components/QuickAddSheet';
import { radius, spacing } from '@/constants/theme';
import type { CollectionStatus } from '@/types/pin';
import type { CataloguePin } from '@workspace/pin-repository';

type ActiveStatus = Exclude<CollectionStatus, 'none'>;

const STATUSES: { status: ActiveStatus; label: string; icon: keyof typeof Feather.glyphMap; a11y: string }[] = [
  { status: 'owned', label: 'Owned', icon: 'check-circle', a11y: 'Mark as Owned' },
  { status: 'wanted', label: 'ISO', icon: 'bookmark', a11y: 'Add to ISO' },
  { status: 'for_trade', label: 'For Trade', icon: 'repeat', a11y: 'Mark as For Trade' },
];

type PinLike = Pick<CataloguePin, 'id' | 'title'>;

export function usePinActions() {
  const { getEntry, setStatus, restoreEntry } = useCollection();
  const toast = useToast();
  const [pin, setPin] = useState<PinLike | null>(null);
  // Undo can run after the sheet closed: use the latest restore.
  const restoreRef = useRef(restoreEntry);
  restoreRef.current = restoreEntry;

  const open = useCallback((p: PinLike) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPin(p);
  }, []);

  /** Status change with an Undo toast that restores status, copies and boards. */
  const apply = useCallback((p: PinLike, next: CollectionStatus) => {
    const entry = getEntry(p.id);
    const previous: CollectionStatus = entry?.status ?? 'none';
    const snapshot = entry ? { ...entry } : undefined;
    setStatus(p.id, next);
    toast.show({
      message: statusChangeMessage(previous, next),
      action: { label: 'Undo', onPress: () => restoreRef.current(p.id, snapshot) },
    });
  }, [getEntry, setStatus, toast]);

  /** VoiceOver custom actions for a tile: the sheet plus the other statuses. */
  const a11y = useCallback((p: PinLike) => {
    const entry = getEntry(p.id);
    const current: CollectionStatus = entry?.status ?? 'none';
    const actions = [
      { name: 'quickActions', label: 'Quick actions' },
      ...STATUSES.filter(s => s.status !== current).map(s => ({ name: s.status, label: s.a11y })),
    ];
    return {
      accessibilityActions: actions,
      onAccessibilityAction: (event: AccessibilityActionEvent) => {
        const name = event.nativeEvent.actionName;
        const target = STATUSES.find(s => s.status === name);
        // Anything that needs a confirmation goes through the sheet.
        if (!target || dropsCopies(current, target.status, entry?.quantity ?? 1)) open(p);
        else apply(p, target.status);
      },
    };
  }, [getEntry, apply, open]);

  // Mounted only while open, so screens pay nothing for it until a long-press.
  const sheet = pin ? <PinActionsSheet pin={pin} onClose={() => setPin(null)} onApply={apply} /> : null;
  return { open, a11y, sheet };
}

function PinActionsSheet({ pin, onClose, onApply }: {
  pin: PinLike | null;
  onClose: () => void;
  onApply: (pin: PinLike, next: CollectionStatus) => void;
}) {
  const colors = useColors();
  const { getEntry, adjustQuantity } = useCollection();
  const { customBoards, addPinToBoard, removePinFromBoard } = useBoards();
  const [confirm, setConfirm] = useState<null | 'remove' | 'toIso'>(null);
  const [boardsOpen, setBoardsOpen] = useState(false);
  useEffect(() => { setConfirm(null); setBoardsOpen(false); }, [pin?.id]);

  const entry = pin ? getEntry(pin.id) : undefined;
  const current: CollectionStatus = entry?.status ?? 'none';
  const kept = current === 'owned' || current === 'for_trade';
  const copies = entry?.quantity ?? 1;
  const boards = pin ? customBoards.filter(b => b.pinIds.includes(pin.id)) : [];

  const choose = (next: ActiveStatus) => {
    if (!pin || next === current) return; // radio group: the current status is a no-op
    if (dropsCopies(current, next, copies)) { setConfirm('toIso'); return; }
    onApply(pin, next);
    onClose();
  };
  const confirmed = () => {
    if (!pin || !confirm) return;
    onApply(pin, confirm === 'remove' ? 'none' : 'wanted');
    onClose();
  };
  const statusColor = (s: ActiveStatus) => (s === 'owned' ? colors.owned : s === 'wanted' ? colors.wanted : colors.forTrade);

  return (
    <Sheet visible={!!pin} onClose={onClose} title={pin?.title ?? ''}>
      {pin && (
        <View style={styles.body}>
          <View accessibilityRole="radiogroup" style={styles.statusRow}>
            {STATUSES.map(s => {
              const active = s.status === current;
              const tone = statusColor(s.status);
              return (
                <TouchableOpacity
                  key={s.status}
                  onPress={() => choose(s.status)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={s.label}
                  style={[styles.statusChip, active
                    ? { backgroundColor: tone, borderColor: tone }
                    : { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                >
                  <Feather name={s.icon} size={16} color={active ? colors.homeSurface : tone} />
                  <Text style={[styles.statusLabel, { color: active ? colors.homeSurface : colors.homeInk }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {confirm && (
            <View style={[styles.confirm, { backgroundColor: colors.homeAqua }]}>
              <Text style={[styles.confirmText, { color: colors.homeInk }]}>
                {removalConsequence(confirm, current, copies, boards.length)}
              </Text>
              <View style={styles.confirmActions}>
                <TouchableOpacity onPress={() => setConfirm(null)} accessibilityRole="button" style={[styles.confirmBtn, { backgroundColor: colors.homeSurface }]}>
                  <Text style={[styles.rowLabel, { color: colors.homeInk }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmed} accessibilityRole="button" style={[styles.confirmBtn, { backgroundColor: confirm === 'remove' ? colors.destructive : colors.homeCoral }]}>
                  <Text style={[styles.rowLabel, { color: colors.homeSurface }]}>{confirm === 'remove' ? 'Remove' : 'Move to ISO'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {kept && (
            <View style={[styles.row, { borderBottomColor: colors.homeLine }]}>
              <Text style={[styles.rowLabel, { color: colors.homeInk, flex: 1 }]}>Copies</Text>
              <TouchableOpacity
                onPress={() => adjustQuantity(pin.id, -1)}
                disabled={copies <= 1}
                accessibilityRole="button"
                accessibilityLabel="One fewer copy"
                style={[styles.stepper, { backgroundColor: colors.homeAqua, opacity: copies <= 1 ? 0.4 : 1 }]}
              >
                <Feather name="minus" size={16} color={colors.homeInk} />
              </TouchableOpacity>
              <Text accessibilityLabel={`${copies} ${copies === 1 ? 'copy' : 'copies'}`} style={[styles.copies, { color: colors.homeInk }]}>{copies}</Text>
              <TouchableOpacity
                onPress={() => adjustQuantity(pin.id, 1)}
                accessibilityRole="button"
                accessibilityLabel="One more copy"
                style={[styles.stepper, { backgroundColor: colors.homeAqua }]}
              >
                <Feather name="plus" size={16} color={colors.homeInk} />
              </TouchableOpacity>
            </View>
          )}

          {kept && customBoards.length > 0 && (
            <>
              <TouchableOpacity
                onPress={() => setBoardsOpen(o => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: boardsOpen }}
                style={[styles.row, { borderBottomColor: colors.homeLine }]}
              >
                <Feather name="folder-plus" size={18} color={colors.homeInk} />
                <Text style={[styles.rowLabel, { color: colors.homeInk, flex: 1 }]}>Add to board…</Text>
                {boards.length > 0 && <Text style={[styles.rowMeta, { color: colors.homeMuted }]}>On {boards.length}</Text>}
                <Feather name={boardsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.homeMuted} />
              </TouchableOpacity>
              {boardsOpen && customBoards.map(b => {
                const on = b.pinIds.includes(pin.id);
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => (on ? removePinFromBoard(b.id, pin.id) : addPinToBoard(b.id, pin.id))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={b.name}
                    style={[styles.row, styles.boardRow, { borderBottomColor: colors.homeLine }]}
                  >
                    <Feather name="folder" size={16} color={colors.homeMuted} />
                    <Text style={[styles.rowLabel, { color: colors.homeInk, flex: 1 }]} numberOfLines={1}>{b.name}</Text>
                    {on && <Feather name="check" size={18} color={colors.homeCoral} />}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {current !== 'none' && !confirm && (
            <TouchableOpacity
              onPress={() => setConfirm('remove')}
              accessibilityRole="button"
              style={[styles.row, { borderBottomWidth: 0 }]}
            >
              <Feather name="trash-2" size={18} color={colors.destructive} />
              <Text style={[styles.rowLabel, { color: colors.destructive }]}>
                {current === 'wanted' ? 'Remove from your ISO' : 'Remove from my collection'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xs },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statusChip: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, borderWidth: 1 },
  statusLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  confirm: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  confirmText: { fontSize: 13.5, fontFamily: 'Inter_500Medium', lineHeight: 19 },
  confirmActions: { flexDirection: 'row', gap: spacing.sm },
  confirmBtn: { flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  boardRow: { paddingLeft: spacing.xl },
  rowLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  rowMeta: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  stepper: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  copies: { minWidth: 28, textAlign: 'center', fontSize: 16, fontFamily: 'Inter_700Bold' },
});
