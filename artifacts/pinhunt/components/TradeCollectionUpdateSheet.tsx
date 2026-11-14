/**
 * TradeCollectionUpdateSheet: "Update your collection?" once a trade is
 * complete (WP1 step 3). Rows come pre-ticked from the agreed pins; the
 * collector can untick any, then update in one go (with Undo) or skip.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import type { CollectionUpdateRow } from '@/utils/tradeCollectionUpdate';

export interface TradeCollectionUpdateSheetProps {
  visible: boolean;
  rows: CollectionUpdateRow[];
  onClose: () => void;
  onApply: (ticked: Set<string>) => void;
}

const GROUPS = [
  { side: 'give' as const, label: 'Pins you sent' },
  { side: 'get' as const, label: 'Pins you received' },
];

export function TradeCollectionUpdateSheet({ visible, rows, onClose, onApply }: TradeCollectionUpdateSheetProps) {
  const colors = useColors();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  useEffect(() => { if (visible) setTicked(new Set(rows.map(r => r.key))); }, [visible, rows]);
  const toggle = (key: string) => setTicked(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Update your collection?"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label="Update Collection" onPress={() => onApply(ticked)} disabled={ticked.size === 0} />
          <Button label="Not Now" variant="secondary" onPress={onClose} />
        </View>
      }
    >
      <Text style={[styles.intro, { color: colors.homeMuted }]}>
        Trade complete. Keep your collection in step with what you swapped. You can undo this.
      </Text>
      {GROUPS.map(group => {
        const groupRows = rows.filter(r => r.side === group.side);
        if (groupRows.length === 0) return null;
        return (
          <View key={group.side} style={styles.group}>
            <Text accessibilityRole="header" style={[styles.groupLabel, { color: colors.homeInk }]}>{group.label}</Text>
            {groupRows.map(row => {
              const checked = ticked.has(row.key);
              const name = row.quantity > 1 ? `${row.title} ×${row.quantity}` : row.title;
              return (
                <TouchableOpacity
                  key={row.key}
                  onPress={() => toggle(row.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${name}: ${row.action}`}
                  style={[styles.row, { borderColor: checked ? colors.homeCoral : colors.homeLine, backgroundColor: colors.homeSurface }]}
                >
                  <View style={styles.rowText}>
                    <Text numberOfLines={2} style={[styles.title, { color: colors.homeInk }]}>{name}</Text>
                    <Text style={[styles.action, { color: colors.homeMuted }]}>{row.action}</Text>
                  </View>
                  <View style={[styles.check, { borderColor: checked ? colors.homeCoral : colors.homeLine, backgroundColor: checked ? colors.homeCoral : 'transparent' }]}>
                    {checked ? <Feather name="check" size={14} color={colors.homeSurface} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular', marginBottom: spacing.md },
  group: { gap: spacing.sm, marginBottom: spacing.lg },
  groupLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, padding: spacing.md, borderWidth: 1, borderRadius: radius.md },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  action: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
