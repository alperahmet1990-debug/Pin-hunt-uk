import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { MarketValueSection } from '@/components/MarketValueSection';

interface ValueDisplayProps {
  pinId: string;
  /** PinHunt's own catalogue estimate (GBP), if the trusted catalogue has one. */
  catalogueEstimateGBP?: number | null;
  /** The collector's own value for this pin, if they've set one. Not yet wired up anywhere in the app — reserved for when that data exists. */
  collectorValue?: { amountGBP: number } | null;
}

/** One cohesive value card: PinHunt's own estimate headlines it, with live UK/US eBay-backed figures underneath — replaces the old "Market Valuation" + "Estimated Market Value" pair of competing cards. */
export function ValueDisplay({ pinId, catalogueEstimateGBP, collectorValue }: ValueDisplayProps) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
      <View style={styles.headline}>
        <Text style={[styles.kicker, { color: colors.homeMuted }]}>PINHUNT ESTIMATED VALUE</Text>
        {catalogueEstimateGBP != null ? (
          <Text style={[styles.amount, { color: colors.homeCoralDeep }]}>£{catalogueEstimateGBP.toFixed(2)}</Text>
        ) : (
          <Text style={[styles.amountEmpty, { color: colors.homeMuted }]}>Not yet catalogued</Text>
        )}
      </View>

      {collectorValue != null && (
        <View style={[styles.collectorRow, { backgroundColor: colors.homeAqua }]}>
          <Feather name="user" size={12} color={colors.homeTeal} />
          <Text style={[styles.collectorText, { color: colors.homeTeal }]}>
            Set by you: £{collectorValue.amountGBP.toFixed(2)}
          </Text>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: colors.homeLine }]} />

      <MarketValueSection pinId={pinId} embedded />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headline: { alignItems: 'center', gap: 4 },
  kicker: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  amount: { fontSize: 34, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  amountEmpty: { fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 6 },
  collectorRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  collectorText: { fontSize: 11.5, fontFamily: 'Inter_600SemiBold' },
  divider: { height: StyleSheet.hairlineWidth },
});
