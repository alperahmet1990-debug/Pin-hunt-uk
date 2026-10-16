/**
 * Field-tick bar (RR-21): shown for one pin and the one source URL the reviewer
 * just opened. Nothing is ticked when it appears; the URL it saves is the
 * opened one, never typed.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Button } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { CHECKABLE_FIELDS } from '@/utils/researchReview';

interface FieldTickBarProps {
  url: string;
  ticked: string[];
  busy?: boolean;
  onToggle: (field: string) => void;
  onTickAll: () => void;
  onNoMatch: () => void;
  onSave: () => void;
}

export function FieldTickBar({ url, ticked, busy, onToggle, onTickAll, onNoMatch, onSave }: FieldTickBarProps) {
  const c = useColors();
  return (
    <View testID="field-tick-bar" style={[styles.bar, { backgroundColor: c.homeSurface, borderColor: c.homeInk }]}>
      <Text style={[styles.title, { color: c.homeInk }]}>What did that page confirm?</Text>
      <Text style={[styles.muted, { color: c.homeMuted }]} numberOfLines={1}>{url}</Text>
      <View style={styles.chips}>
        {CHECKABLE_FIELDS.map(f => {
          const on = ticked.includes(f.field);
          return (
            <TouchableOpacity
              key={f.field}
              onPress={() => onToggle(f.field)}
              style={[styles.toggle, { borderColor: c.homeLine }, on && { backgroundColor: c.homeTealSoft, borderColor: c.homeInk }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Confirmed: ${f.label}`}
            >
              <Text style={[styles.chipText, { color: c.homeInk }]}>{on ? '✓ ' : ''}{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.chips}>
        <Button label="Tick all shown" size="compact" variant="secondary" onPress={onTickAll} />
        <Button label="Doesn't match" size="compact" variant="text" onPress={onNoMatch} />
      </View>
      <Button label="Save checks" icon="check" loading={busy} disabled={ticked.length === 0} onPress={onSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  muted: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  toggle: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
