/**
 * "What's ISO?" — the one place the app explains the collector term (#65,
 * docs/design/glossary.md). Opened from the ISO tab. Keeps ISO and For Trade
 * clearly separate, and points to the next step: Find Trades when there are
 * ISO pins, search when there aren't.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { spacing } from '@/constants/theme';

type Line = { icon: React.ComponentProps<typeof Feather>['name']; term?: string; text: string };

/** Plain sentences; the two terms being defined are in bold. */
export const WHATS_ISO_LINES: Line[] = [
  { icon: 'bookmark', term: 'ISO', text: 'means In Search Of: the pins you\u2019re looking for.' },
  { icon: 'users', text: 'PinHunt finds collectors who have your ISO pins for trade. You\u2019ll see them in Find Trades.' },
  { icon: 'repeat', term: 'For Trade', text: 'is the other side: pins you own and would swap.' },
  { icon: 'plus-circle', text: 'To add a pin to your ISO, choose ISO when you add it from a scan, search or a set.' },
];

interface WhatsIsoSheetProps {
  visible: boolean;
  onClose: () => void;
  /** How many pins are on the collector's ISO; picks the next step. */
  isoCount: number;
  onFindTrades: () => void;
  onFindPins: () => void;
}

export function WhatsIsoSheet({ visible, onClose, isoCount, onFindTrades, onFindPins }: WhatsIsoSheetProps) {
  const colors = useColors();
  const hasIso = isoCount > 0;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="What's ISO?"
      footer={(
        <View style={styles.footer}>
          <Button
            label={hasIso ? 'See who has them' : 'Find a pin to add'}
            icon={hasIso ? 'users' : 'search'}
            onPress={() => { onClose(); (hasIso ? onFindTrades : onFindPins)(); }}
            fullWidth
          />
          <Button label="Got it" variant="text" onPress={onClose} fullWidth />
        </View>
      )}
    >
      <View style={styles.lines}>
        {WHATS_ISO_LINES.map(({ icon, term, text }) => (
          <View key={icon} style={styles.line} accessible accessibilityLabel={term ? `${term} ${text}` : text}>
            <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
              <Feather name={icon} size={16} color={colors.homeCoralDeep} />
            </View>
            <Text style={[styles.text, { color: colors.homeInk }]}>
              {term ? <Text style={styles.term}>{term} </Text> : null}
              {text}
            </Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lines: { gap: spacing.md + 2, paddingBottom: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', paddingTop: 5 },
  term: { fontFamily: 'Inter_700Bold' },
  footer: { gap: spacing.xs },
});
