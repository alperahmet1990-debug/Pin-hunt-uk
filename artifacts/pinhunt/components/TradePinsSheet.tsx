/**
 * TradePinsSheet: choose the pins in a trade, as "I'll give" and "I'd like"
 * (migration 070). Used to propose in chat and to change the pins while a
 * trade is waiting. Choices come from the pins shared in the chat, the
 * collection match, and the pins already in the trade.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CataloguePin } from '@workspace/pin-repository';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { PinImage } from '@/components/ui/PinImage';
import { useColors } from '@/hooks/useColors';
import { getPinImageSource } from '@/utils/pinImage';
import { radius, spacing } from '@/constants/theme';
import { choiceKey, selectionProblem, type TradePinChoice, type TradeSide } from '@/utils/tradeItems';

export interface TradePinsSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title. */
  intro?: string;
  confirmLabel: string;
  choices: TradePinChoice[];
  /** Ticked when the sheet opens. */
  initialSelected: Set<string>;
  busy?: boolean;
  /** Looks up a catalogue pin for its title and picture. */
  pinFor?: (pinhuntId: string) => CataloguePin | undefined;
  onConfirm: (selected: Set<string>) => void;
}

const SECTIONS: { side: TradeSide; label: string; empty: string }[] = [
  { side: 'give', label: "I'll give", empty: 'Share your pins in the chat to add them here.' },
  { side: 'get', label: "I'd like", empty: 'Pins they share in the chat show here.' },
];

export function TradePinsSheet({
  visible, onClose, title, intro, confirmLabel, choices, initialSelected, busy, pinFor, onConfirm,
}: TradePinsSheetProps) {
  const colors = useColors();
  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  // Start from the suggested pins each time the sheet opens.
  useEffect(() => { if (visible) setSelected(new Set(initialSelected)); }, [visible, initialSelected]);

  const problem = useMemo(() => selectionProblem(choices, selected), [choices, selected]);
  const toggle = (key: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <View style={{ gap: spacing.sm }}>
          {problem && choices.length > 0 ? (
            <Text style={[styles.problem, { color: colors.homeMuted }]}>{problem}</Text>
          ) : null}
          <Button
            label={confirmLabel}
            onPress={() => onConfirm(selected)}
            disabled={!!problem || busy}
            loading={busy}
          />
        </View>
      }
    >
      {intro ? <Text style={[styles.intro, { color: colors.homeMuted }]}>{intro}</Text> : null}
      {SECTIONS.map(section => {
        const rows = choices.filter(c => c.side === section.side);
        return (
          <View key={section.side} style={styles.section}>
            <Text accessibilityRole="header" style={[styles.sectionLabel, { color: colors.homeInk }]}>
              {section.label}
            </Text>
            {rows.length === 0 ? (
              <Text style={[styles.empty, { color: colors.homeMuted }]}>{section.empty}</Text>
            ) : rows.map(choice => {
              const key = choiceKey(choice);
              const pin = pinFor?.(choice.pinhuntId);
              const name = pin?.title ?? choice.title ?? choice.pinhuntId;
              const checked = selected.has(key);
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => toggle(key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${section.label}: ${name}`}
                  style={[styles.row, { borderColor: checked ? colors.homeCoral : colors.homeLine, backgroundColor: colors.homeSurface }]}
                >
                  {pin ? (
                    <PinImage source={getPinImageSource(pin)} style={styles.image} accessible={false} />
                  ) : choice.imageUrl ? (
                    <PinImage source={{ uri: choice.imageUrl }} style={styles.image} accessible={false} />
                  ) : (
                    <View style={[styles.image, { backgroundColor: colors.homeAqua }]} />
                  )}
                  <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.homeInk }]}>{name}</Text>
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
  section: { gap: spacing.sm, marginBottom: spacing.lg },
  sectionLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  empty: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, padding: spacing.sm, borderWidth: 1, borderRadius: radius.md },
  image: { width: 40, height: 40, borderRadius: radius.sm },
  rowTitle: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  problem: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
