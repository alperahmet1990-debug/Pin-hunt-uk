/**
 * UkAskingChip: a compact "UK asking ~£x" for chat pin cards, the trade's pin
 * list and Find Trades (WP1 step 3). Uses the batched useLatestMarketValue,
 * so a list of chips is one request. Renders nothing unless the value is a
 * confident UK one (ukAskingLine).
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ukAskingLine, useLatestMarketValue } from '@/hooks/useMarketValue';

export function UkAskingChip({ pinhuntId, style, inverse }: {
  pinhuntId: string | undefined;
  style?: StyleProp<ViewStyle>;
  /** On a coloured background (my own chat bubble). */
  inverse?: boolean;
}) {
  const colors = useColors();
  const line = ukAskingLine(useLatestMarketValue(pinhuntId));
  if (!line) return null;
  return (
    <View
      testID={`uk-asking-${pinhuntId}`}
      style={[styles.chip, { backgroundColor: inverse ? colors.homeSurface + '33' : colors.homeSurface, borderColor: inverse ? 'transparent' : colors.homeLine }, style]}
    >
      <Text numberOfLines={1} style={[styles.text, { color: inverse ? colors.homeSurface : colors.homeInk }]}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
