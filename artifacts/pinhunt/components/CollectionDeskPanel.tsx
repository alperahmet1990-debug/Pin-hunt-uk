/**
 * The side panel beside the pin grid on wide screens (iPad landscape, wide
 * windows): "Collecting at home". Where the phone shows the bulk bar at the
 * bottom, the iPad keeps the places pins can go in view the whole time:
 * For Trade, Owned, ISO and your boards.
 *
 * Not selecting: a prompt to start selecting, plus your boards to open.
 * Selecting: every place is a target that moves the selection there in one
 * go, through the same actions as the phone's bulk bar (useBulkActions):
 * one setStatuses call, Undo, and the same confirmations. ISO and For Trade
 * stay separate targets.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useBulkActions } from '@/components/BulkSelectBar';
import { radius, spacing } from '@/constants/theme';
import { SIDE_PANEL_WIDTH } from '@/utils/deviceLayout';

const pinsWord = (n: number) => `${n} ${n === 1 ? 'pin' : 'pins'}`;

interface CollectionDeskPanelProps {
  /** Select mode is on. */
  selecting: boolean;
  /** Selected pin ids, in display order. */
  ids: string[];
  /** Turn select mode on. */
  onStartSelecting: () => void;
  /** Called after an action is applied (the screen leaves select mode). */
  onDone: () => void;
  /** Open a board (not selecting). */
  onOpenBoard: (id: string) => void;
  /** Open the Owned, For Trade or ISO list (not selecting). */
  onOpenStatus: (status: 'owned' | 'for_trade' | 'wanted') => void;
  /** Pins per status, for the targets' counts. */
  counts: { owned: number; forTrade: number; iso: number };
}

type Icon = keyof typeof Feather.glyphMap;

export function CollectionDeskPanel({ selecting, ids, onStartSelecting, onDone, onOpenBoard, onOpenStatus, counts }: CollectionDeskPanelProps) {
  const colors = useColors();
  const bulk = useBulkActions({ ids, onDone });
  const { n, disabled, keptCount, customBoards } = bulk;
  const active = selecting && !disabled;

  const statusTargets: { key: 'for_trade' | 'owned' | 'wanted'; label: string; icon: Icon; count: number }[] = [
    { key: 'for_trade', label: 'For Trade', icon: 'repeat', count: counts.forTrade },
    { key: 'owned', label: 'Owned', icon: 'check-circle', count: counts.owned },
    { key: 'wanted', label: 'ISO', icon: 'bookmark', count: counts.iso },
  ];

  const target = (
    key: string,
    label: string,
    icon: Icon,
    detail: string,
    onPress: () => void,
    a11yLabel: string,
  ) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      disabled={selecting && disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: selecting && disabled }}
      style={[styles.target, {
        backgroundColor: active ? colors.homeAqua : colors.homeBackground,
        borderColor: active ? colors.homeCoral : colors.homeLine,
        borderStyle: active ? 'dashed' : 'solid',
      }]}
    >
      <Feather name={icon} size={20} color={active ? colors.homeCoralDeep : colors.homeInk} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.targetLabel, { color: colors.homeInk }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.targetDetail, { color: active ? colors.homeCoralDeep : colors.homeMuted }]} numberOfLines={1}>{detail}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View
      accessibilityLabel="Organise"
      style={[styles.panel, { backgroundColor: colors.homeSurface, borderLeftColor: colors.homeLine }]}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>
          {selecting ? (n > 0 ? `${pinsWord(n)} selected` : 'Select pins') : 'Organise'}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.homeMuted }]}>
          {selecting
            ? (n > 0 ? 'Tap a place to move them all at once.' : 'Tap pins in the grid to select them.')
            : 'Select a few pins, or a whole fair\'s worth, then move them in one go.'}
        </Text>
        {!selecting && (
          <TouchableOpacity
            onPress={onStartSelecting}
            accessibilityRole="button"
            accessibilityLabel="Select pins"
            style={[styles.primary, { backgroundColor: colors.homeCoral }]}
          >
            <Feather name="check-square" size={18} color={colors.homeHeroText} />
            <Text style={[styles.primaryText, { color: colors.homeHeroText }]}>Select pins</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.section, { color: colors.homeMuted }]}>Your collection</Text>
        {statusTargets.map(t => target(
          t.key,
          t.label,
          t.icon,
          active ? `Move ${pinsWord(n)} here` : pinsWord(t.count),
          () => (selecting ? bulk.chooseStatus(t.key) : onOpenStatus(t.key)),
          active ? `${t.label}, move ${pinsWord(n)}` : `${t.label}, ${pinsWord(t.count)}`,
        ))}

        {customBoards.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.homeMuted }]}>Boards</Text>
            {customBoards.map(b => target(
              `board-${b.id}`,
              b.name,
              'folder',
              active ? `Add ${pinsWord(keptCount)} here` : pinsWord(b.pinIds.length),
              () => (selecting ? bulk.addToBoard(b) : onOpenBoard(b.id)),
              active ? `${b.name}, add ${pinsWord(keptCount)}` : `${b.name}, ${pinsWord(b.pinIds.length)}`,
            ))}
            {active && n > keptCount && (
              <Text style={[styles.hint, { color: colors.homeMuted }]}>
                Boards hold pins you have, so ISO pins are left out.
              </Text>
            )}
          </>
        )}

        {selecting && (
          <TouchableOpacity
            onPress={bulk.requestRemove}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Remove, ${pinsWord(n)}`}
            accessibilityState={{ disabled }}
            style={[styles.remove, { opacity: disabled ? 0.4 : 1 }]}
          >
            <Feather name="trash-2" size={16} color={bulk.destructiveTone} />
            <Text style={[styles.removeText, { color: bulk.destructiveTone }]}>Remove from collection</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      {bulk.dialogs}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: SIDE_PANEL_WIDTH, borderLeftWidth: StyleSheet.hairlineWidth },
  content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: 140 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  primary: {
    marginTop: spacing.sm, minHeight: 48, borderRadius: radius.pill,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  primaryText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  section: {
    marginTop: spacing.lg, fontSize: 12, fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  target: {
    minHeight: 56, borderRadius: radius.md, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg,
  },
  targetLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  targetDetail: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  remove: { marginTop: spacing.lg, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  removeText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
