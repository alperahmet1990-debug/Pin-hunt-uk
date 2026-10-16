/**
 * BoardMosaicCard — a board on My Collection's Boards tab (UX-067, #340).
 *
 * Grid: up to four pin photos in a 2x2 mosaic inside the tile-within-a-tile
 * frame, dotted squares where the board has fewer pins, then the name and
 * pin count. "All pins" uses the deep ink frame. A "⇄ N" badge, in the
 * app's For Trade colour, shows how many of the board's pins are up for trade.
 * List: one row with the first photo, name, count and the same badge.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CataloguePin } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { PinImage } from '@/components/ui/PinImage';
import { getPinImageSource } from '@/utils/pinImage';
import { fontScale, radius, spacing } from '@/constants/theme';

export interface BoardMosaicItem {
  id: string;
  title: string;
  /** Pins to preview, in board order. */
  pins: CataloguePin[];
  count: number;
  tradeCount: number;
  /** The "All pins" card. */
  isAll?: boolean;
}

const MOSAIC_GAP = 6;
const PAD = 7;

const pinsLabel = (n: number) => `${n.toLocaleString()} pin${n === 1 ? '' : 's'}`;

function TradeBadge({ count, style }: { count: number; style?: object }) {
  const colors = useColors();
  if (count <= 0) return null;
  return (
    <View testID="board-trade-badge" style={[styles.badge, { backgroundColor: colors.forTrade, borderColor: colors.homeBackground }, style]}>
      <Feather name="repeat" size={10} color={colors.homeSurface} />
      <Text style={[styles.badgeText, { color: colors.homeSurface }]} maxFontSizeMultiplier={fontScale.badge}>{count}</Text>
    </View>
  );
}

export function BoardMosaicCard({ item, width, onPress }: { item: BoardMosaicItem; width: number; onPress: () => void }) {
  const colors = useColors();
  const cell = (width - PAD * 2 - 2 - MOSAIC_GAP) / 2;
  const slots = [0, 1, 2, 3].map(i => item.pins[i]);
  // homeTeal is the deep fill in both modes (homeInk turns light in dark mode).
  const frame = item.isAll ? colors.homeTeal : colors.homeAqua;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${pinsLabel(item.count)}${item.tradeCount ? `, ${item.tradeCount} for trade` : ''}`}
      style={{ width, marginBottom: spacing.lg }}
    >
      <View style={[styles.frame, { backgroundColor: frame, borderColor: item.isAll ? frame : colors.homeLine }]}>
        {slots.map((pin, i) => (
          pin ? (
            <View key={i} style={[styles.cell, { width: cell, height: cell, backgroundColor: colors.homeSurface }]}>
              <PinImage source={getPinImageSource(pin)} accessible={false} style={styles.cellImage} contentFit="cover" />
            </View>
          ) : (
            <View
              key={i}
              testID="board-empty-slot"
              style={[styles.cell, styles.emptyCell, { width: cell, height: cell, borderColor: item.isAll ? colors.homeSurface + '55' : colors.homeCoral + '66' }]}
            />
          )
        ))}
        <TradeBadge count={item.tradeCount} style={styles.badgeCorner} />
      </View>
      <Text style={[styles.title, { color: colors.homeInk }]} numberOfLines={1}>{item.title}</Text>
      <Text style={[styles.sub, { color: colors.homeMuted }]} numberOfLines={1}>{pinsLabel(item.count)}</Text>
    </TouchableOpacity>
  );
}

export function BoardListRow({ item, onPress }: { item: BoardMosaicItem; onPress: () => void }) {
  const colors = useColors();
  const lead = item.pins[0];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${pinsLabel(item.count)}${item.tradeCount ? `, ${item.tradeCount} for trade` : ''}`}
      style={[styles.row, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={[styles.rowThumb, { backgroundColor: item.isAll ? colors.homeTeal : colors.homeAqua }]}>
        {lead ? (
          <PinImage source={getPinImageSource(lead)} accessible={false} style={styles.rowThumbImage} contentFit="cover" />
        ) : (
          <Feather name="folder" size={18} color={colors.homeMuted} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.homeInk }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.sub, { color: colors.homeMuted }]} numberOfLines={1}>{pinsLabel(item.count)}</Text>
      </View>
      <TradeBadge count={item.tradeCount} />
      <Feather name="chevron-right" size={18} color={colors.homeMuted} />
    </TouchableOpacity>
  );
}

/** "+ New board" in the same footprint as a board card. */
export function NewBoardCard({ width, onPress }: { width: number; onPress: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="New board" style={{ width, marginBottom: spacing.lg }}>
      <View style={[styles.frame, styles.newFrame, { height: width, borderColor: colors.homeCoral + '88' }]}>
        <Feather name="plus" size={24} color={colors.homeCoralDeep} />
        <Text style={[styles.newText, { color: colors.homeCoralDeep }]}>New board</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  frame: { flexDirection: 'row', flexWrap: 'wrap', gap: MOSAIC_GAP, padding: PAD, borderRadius: radius.lg, borderWidth: 1 },
  cell: { borderRadius: radius.sm, overflow: 'hidden' },
  cellImage: { width: '100%', height: '100%' },
  emptyCell: { borderWidth: 2, borderStyle: 'dashed' },
  title: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: spacing.sm, marginHorizontal: spacing.xs },
  sub: { fontSize: 12.5, fontFamily: 'Inter_500Medium', marginTop: 2, marginHorizontal: spacing.xs },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 11, borderWidth: 2, paddingHorizontal: 6, paddingVertical: 2 },
  badgeCorner: { position: 'absolute', top: -6, right: -6 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, paddingRight: spacing.md },
  rowThumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowThumbImage: { width: '100%', height: '100%' },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  newFrame: { borderStyle: 'dashed', borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, flexWrap: 'nowrap', flexDirection: 'column' },
  newText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
