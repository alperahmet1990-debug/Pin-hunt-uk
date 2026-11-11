/**
 * Day / month / year fields for a date of birth (LP-8, #530).
 * Used on Register and Confirm age. Starts empty: no pre-filled values.
 */
import React, { useRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { DOB_HINT, DOB_LABEL, digitsOnly } from '@/utils/ageCheck';

export interface DateOfBirthValue {
  day: string;
  month: string;
  year: string;
}

export const EMPTY_DATE_OF_BIRTH: DateOfBirthValue = { day: '', month: '', year: '' };

export function DateOfBirthField({
  value,
  onChange,
  onSubmitEditing,
}: {
  value: DateOfBirthValue;
  onChange(next: DateOfBirthValue): void;
  onSubmitEditing?(): void;
}) {
  const colors = useColors();
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const inputStyle = [
    styles.input,
    { borderColor: colors.homeLine, backgroundColor: colors.homeSurface, color: colors.homeInk },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.homeInk }]} nativeID="dob-label">
        {DOB_LABEL}
      </Text>
      <View style={styles.row}>
        <TextInput
          style={[inputStyle, styles.short]}
          placeholder="DD"
          placeholderTextColor={colors.homeMuted}
          value={value.day}
          onChangeText={t => {
            const day = digitsOnly(t, 2);
            onChange({ ...value, day });
            if (day.length === 2) monthRef.current?.focus();
          }}
          keyboardType="number-pad"
          maxLength={2}
          returnKeyType="next"
          accessibilityLabel="Day of birth"
          testID="dob-day"
        />
        <TextInput
          ref={monthRef}
          style={[inputStyle, styles.short]}
          placeholder="MM"
          placeholderTextColor={colors.homeMuted}
          value={value.month}
          onChangeText={t => {
            const month = digitsOnly(t, 2);
            onChange({ ...value, month });
            if (month.length === 2) yearRef.current?.focus();
          }}
          keyboardType="number-pad"
          maxLength={2}
          returnKeyType="next"
          accessibilityLabel="Month of birth"
          testID="dob-month"
        />
        <TextInput
          ref={yearRef}
          style={[inputStyle, styles.long]}
          placeholder="YYYY"
          placeholderTextColor={colors.homeMuted}
          value={value.year}
          onChangeText={t => onChange({ ...value, year: digitsOnly(t, 4) })}
          keyboardType="number-pad"
          maxLength={4}
          returnKeyType="done"
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel="Year of birth"
          testID="dob-year"
        />
      </View>
      <Text style={[styles.hint, { color: colors.homeMuted }]}>{DOB_HINT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: {
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    minWidth: 0,
  },
  short: { flex: 1 },
  long: { flex: 1.6 },
  hint: { fontSize: 12.5, lineHeight: 18, fontFamily: 'Inter_400Regular' },
});
