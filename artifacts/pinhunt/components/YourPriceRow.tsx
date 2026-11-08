/**
 * "Your price £15 · Edit" under the value card (CV-03, #514). Nothing when the
 * collector hasn't priced the pin in the chosen currency, or prices are off.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { spacing } from '@/constants/theme';
import { usePriceCurrency } from '@/hooks/usePriceCurrency';
import { useMyPinPrice } from '@/hooks/useMyPinPrice';
import { formatPrice } from '@/utils/priceFormat';

export function YourPriceRow({ pinId, onEdit }: { pinId: string; onEdit: () => void }) {
  const colors = useColors();
  const [currency] = usePriceCurrency();
  const mine = useMyPinPrice(pinId);
  const price = mine.priceIn(currency);
  if (mine.status !== 'ready' || !price) return null;
  return (
    <View style={[styles.row, { borderTopColor: colors.homeLine }]}>
      <Text style={[styles.text, { color: colors.homeInk }]}>
        Your price <Text style={styles.amount}>{formatPrice(price.amount, currency)}</Text>
      </Text>
      <TouchableOpacity onPress={onEdit} accessibilityRole="button" accessibilityLabel="Edit your price" hitSlop={8} style={styles.edit}>
        <Text style={[styles.editLabel, { color: colors.homeCoralDeep }]}>Edit</Text>
      </TouchableOpacity>
    </View>
  );
}

/** True when the collector already has a price in the chosen currency. */
export function useHasMyPrice(pinId: string | undefined): boolean {
  const [currency] = usePriceCurrency();
  const mine = useMyPinPrice(pinId);
  return mine.status === 'ready' && mine.priceIn(currency) != null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: spacing.sm },
  text: { fontSize: 13.5, fontFamily: 'Inter_400Regular' },
  amount: { fontFamily: 'Inter_700Bold' },
  edit: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  editLabel: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
});
