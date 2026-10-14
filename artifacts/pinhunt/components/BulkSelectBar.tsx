/**
 * Bulk actions for a selection of pins (UX-017, #132): Owned · For Trade ·
 * ISO · Add to board · Remove, pinned to the bottom of a collection or board
 * grid in select mode.
 *
 * Status changes go through `setStatuses` (one state update, one batched
 * sync) and Undo puts every pin back exactly as it was via
 * `restoreEntries`. Moving owned pins to ISO and removing ask first, in-app
 * (not Alert: memory expo-web-action-confirmations). On a board, Remove
 * takes the pins off that board only.
 */
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useBoards } from '@/context/BoardsContext';
import { useToast } from '@/components/ui/Toast';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { radius, spacing } from '@/constants/theme';
import type { CollectionStatus } from '@/types/pin';
import { WEB_TAB_BAR_HEIGHT } from '@/utils/tabBarSpace';

type BulkStatus = 'owned' | 'for_trade' | 'wanted';

const pinsWord = (n: number) => `${n} ${n === 1 ? 'pin' : 'pins'}`;

/** Toast copy for a bulk status change (glossary: Owned / ISO / For Trade). */
export function bulkStatusMessage(status: BulkStatus, n: number): string {
  if (status === 'wanted') return `Moved ${pinsWord(n)} to your ISO`;
  return `Marked ${pinsWord(n)} as ${status === 'owned' ? 'Owned' : 'For Trade'}`;
}

interface BulkSelectBarProps {
  /** Selected pin ids, in display order. */
  ids: string[];
  /** Called after an action is applied (the screen leaves select mode). */
  onDone: () => void;
  /** On a board, Remove means "take off this board". */
  boardId?: string;
  /** Space below the bar (e.g. the tab bar). */
  bottomOffset?: number;
}

export function BulkSelectBar({ ids, onDone, boardId, bottomOffset }: BulkSelectBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getEntry, setStatuses, restoreEntries } = useCollection();
  const { customBoards, addPinsToBoard, removePinsFromBoard } = useBoards();
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | 'iso' | 'remove'>(null);
  const [boardPicker, setBoardPicker] = useState(false);

  const n = ids.length;
  const disabled = n === 0;
  const keptCount = ids.filter(id => {
    const s = getEntry(id)?.status;
    return s === 'owned' || s === 'for_trade';
  }).length;

  const snapshot = () => ids.map(id => {
    const entry = getEntry(id);
    return [id, entry ? { ...entry } : undefined] as [string, ReturnType<typeof getEntry>];
  });

  const applyStatus = (status: CollectionStatus, message: string) => {
    const before = snapshot();
    setStatuses(ids, status);
    toast.show({ message, action: { label: 'Undo', onPress: () => restoreEntries(before) } });
    setConfirm(null);
    onDone();
  };

  const chooseStatus = (status: BulkStatus) => {
    if (disabled) return;
    // Owned/For Trade → ISO drops ownership and copies: ask first.
    if (status === 'wanted' && keptCount > 0) { setConfirm('iso'); return; }
    applyStatus(status, bulkStatusMessage(status, n));
  };

  const remove = () => {
    if (boardId) {
      const removed = [...ids];
      removePinsFromBoard(boardId, removed);
      toast.show({
        message: `Removed ${pinsWord(n)} from this board`,
        action: { label: 'Undo', onPress: () => addPinsToBoard(boardId, removed) },
      });
      setConfirm(null);
      onDone();
      return;
    }
    applyStatus('none', `Removed ${pinsWord(n)}`);
  };

  const addToBoard = (target: { id: string; name: string }) => {
    // Boards hold pins you have; ISO pins in the selection are left out.
    addPinsToBoard(target.id, ids);
    const skipped = n - keptCount;
    toast.show({
      message: `Added ${pinsWord(keptCount)} to ${target.name}${skipped > 0 ? ` · ${skipped} ISO skipped` : ''}`,
    });
    setBoardPicker(false);
    onDone();
  };

  const actions: { key: string; label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; tone?: string; hidden?: boolean }[] = [
    { key: 'owned', label: 'Owned', icon: 'check-circle', onPress: () => chooseStatus('owned') },
    { key: 'for_trade', label: 'For Trade', icon: 'repeat', onPress: () => chooseStatus('for_trade') },
    { key: 'wanted', label: 'ISO', icon: 'bookmark', onPress: () => chooseStatus('wanted') },
    { key: 'board', label: 'Board', icon: 'folder-plus', onPress: () => !disabled && setBoardPicker(true), hidden: !!boardId },
    { key: 'remove', label: 'Remove', icon: 'trash-2', onPress: () => !disabled && setConfirm('remove'), tone: colors.destructive },
  ];

  return (
    <>
      <View
        style={[styles.bar, {
          backgroundColor: colors.homeSurface,
          borderColor: colors.homeLine,
          bottom: bottomOffset ?? 0,
          paddingBottom: bottomOffset ? spacing.sm : Math.max(insets.bottom, spacing.md),
        }]}
      >
        {actions.filter(a => !a.hidden).map(a => (
          <TouchableOpacity
            key={a.key}
            onPress={a.onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${a.label}${a.key === 'remove' && boardId ? ' from board' : ''}, ${pinsWord(n)}`}
            accessibilityState={{ disabled }}
            style={[styles.action, { opacity: disabled ? 0.4 : 1 }]}
          >
            <Feather name={a.icon} size={18} color={a.tone ?? colors.homeInk} />
            <Text numberOfLines={1} style={[styles.actionLabel, { color: a.tone ?? colors.homeInk }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ConfirmDialog
        visible={confirm === 'iso'}
        title={`Move ${pinsWord(n)} to your ISO?`}
        message={`You'll no longer own ${keptCount === 1 ? 'one of them' : `${keptCount} of them`}, and their copies and boards go with it. You can undo this.`}
        confirmLabel="Move to ISO"
        onConfirm={() => applyStatus('wanted', bulkStatusMessage('wanted', n))}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === 'remove'}
        title={boardId ? `Remove ${pinsWord(n)} from this board?` : `Remove ${pinsWord(n)}?`}
        message={boardId
          ? 'They stay in your collection. You can undo this.'
          : 'They come off your collection and ISO. You can undo this.'}
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
      <Sheet visible={boardPicker} onClose={() => setBoardPicker(false)} title={`Add ${pinsWord(keptCount)} to a board`}>
        {customBoards.length === 0 ? (
          <Text style={[styles.hint, { color: colors.homeMuted }]}>No boards yet. Create one from the Boards row first.</Text>
        ) : customBoards.map(b => (
          <TouchableOpacity
            key={b.id}
            onPress={() => addToBoard(b)}
            accessibilityRole="button"
            style={[styles.boardRow, { borderBottomColor: colors.homeLine }]}
          >
            <Feather name="folder" size={16} color={colors.homeMuted} />
            <Text style={[styles.boardName, { color: colors.homeInk }]} numberOfLines={1}>{b.name}</Text>
            <Text style={[styles.hint, { color: colors.homeMuted }]}>{b.pinIds.length}</Text>
          </TouchableOpacity>
        ))}
        {n > keptCount && (
          <Text style={[styles.hint, { color: colors.homeMuted, marginTop: spacing.sm }]}>
            Boards hold pins you have, so the {n - keptCount} ISO {n - keptCount === 1 ? 'pin is' : 'pins are'} left out.
          </Text>
        )}
      </Sheet>
    </>
  );
}

/** Space the bulk bar takes, so grids can pad their last row clear of it. */
export const BULK_BAR_HEIGHT = 64;

/** Where a bar sits on a tab screen: just above the tab bar. */
export function tabBarOffset(insetBottom: number): number {
  return Platform.OS === 'web' ? WEB_TAB_BAR_HEIGHT : insetBottom + 52;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around',
    paddingTop: spacing.sm, paddingHorizontal: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.md },
  actionLabel: { fontSize: 11.5, fontFamily: 'Inter_600SemiBold' },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  boardName: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
});
