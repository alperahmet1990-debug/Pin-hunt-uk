/**
 * TradeItemsCard: the pins agreed in a trade (migration 070), from the
 * viewer's side: "You give" and "You get". While the trade waits, either
 * collector can change them (onEdit).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CataloguePin, TradeItem } from '@workspace/pin-repository';
import { PinImage } from '@/components/ui/PinImage';
import { useColors } from '@/hooks/useColors';
import { getPinImageSource } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import { sideFor, type TradeSide } from '@/utils/tradeItems';

export interface TradeItemsCardProps {
  items: TradeItem[];
  viewerIsInitiator: boolean;
  pinFor?: (pinhuntId: string) => CataloguePin | undefined;
  onPinPress?: (pinhuntId: string) => void;
  /** Shown while the pins can still change. */
  onEdit?: () => void;
  /** "agreed" once accepted: the pins are frozen. */
  agreed?: boolean;
}

const GROUPS: { side: TradeSide; label: string }[] = [
  { side: 'give', label: 'You give' },
  { side: 'get', label: 'You get' },
];

export function TradeItemsCard({ items, viewerIsInitiator, pinFor, onPinPress, onEdit, agreed }: TradeItemsCardProps) {
  const colors = useColors();
  return (
    <View testID="trade-items" style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>
          {agreed ? 'Agreed pins' : 'Pins in this trade'}
        </Text>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} accessibilityRole="button" accessibilityLabel={items.length ? 'Change pins' : 'Add pins'} hitSlop={10} style={styles.edit}>
            <Feather name="edit-2" size={13} color={colors.homeCoral} />
            <Text style={[styles.editText, { color: colors.homeCoral }]}>{items.length ? 'Change pins' : 'Add pins'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: colors.homeMuted }]}>
          No pins chosen yet. Add them so you both know what's being swapped.
        </Text>
      ) : GROUPS.map(group => {
        const rows = items.filter(i => sideFor(i.direction, viewerIsInitiator) === group.side);
        if (rows.length === 0) return null;
        return (
          <View key={group.side} style={styles.group}>
            <Text style={[styles.groupLabel, { color: colors.homeMuted }]}>{group.label}</Text>
            {rows.map(item => {
              const pin = item.pinhuntId ? pinFor?.(item.pinhuntId) : undefined;
              const name = item.title ?? pin?.title ?? item.pinhuntId ?? 'Pin';
              const label = item.quantity > 1 ? `${name} ×${item.quantity}` : name;
              const content = (
                <>
                  {pin ? (
                    <PinImage source={getPinImageSource(pin)} style={styles.image} accessible={false} />
                  ) : (
                    <View style={[styles.image, { backgroundColor: colors.homeAqua }]} />
                  )}
                  <Text numberOfLines={2} style={[styles.rowText, { color: colors.homeInk }]}>{label}</Text>
                </>
              );
              return onPinPress && item.pinhuntId ? (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => onPinPress(item.pinhuntId!)}
                  accessibilityRole="link"
                  accessibilityLabel={`${group.label}: ${label}`}
                  style={styles.row}
                >
                  {content}
                </TouchableOpacity>
              ) : (
                <View key={item.id} accessible accessibilityLabel={`${group.label}: ${label}`} style={styles.row}>{content}</View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** One line per side, for places without room for the card (admin reviews). */
export function tradeItemsSummary(items: TradeItem[], direction: TradeItem['direction']): string {
  const names = items
    .filter(i => i.direction === direction)
    .map(i => `${i.title ?? i.pinhuntId ?? 'Pin'}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`);
  return names.length ? names.join(', ') : 'nothing';
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  editText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  empty: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  group: { gap: spacing.xs },
  groupLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  image: { width: 36, height: 36, borderRadius: radius.sm },
  rowText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
});
