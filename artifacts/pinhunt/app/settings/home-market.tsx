/**
 * Profile → Home market (HM-02, #562). One tap changes it; prices, events
 * and dates follow straight away. Your saved prices in each currency stay.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useProfile } from '@/context/ProfileContext';
import { useToast } from '@/components/ui/Toast';
import { HomeMarketChoice } from '@/components/HomeMarketChoice';
import { spacing } from '@/constants/theme';
import type { HomeMarket } from '@/utils/format';
import { MARKET_LABEL } from '@/utils/homeMarket';
import { profileSaveErrorLine } from '@/utils/userError';

export default function HomeMarketScreen() {
  const colors = useColors();
  const toast = useToast();
  const { profile, updateMyProfile } = useProfile();
  const saved = profile?.homeMarket ?? 'UK';
  const [pending, setPending] = useState<HomeMarket | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (market: HomeMarket) => {
    if (market === saved || pending) return;
    setPending(market);
    setError(null);
    try {
      await updateMyProfile({ homeMarket: market });
      toast.show({ message: `Home market: ${MARKET_LABEL[market].name}` });
    } catch (e) {
      setError(profileSaveErrorLine(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Home market' }} />
      <ScrollView style={{ backgroundColor: colors.homeBackground }} contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.homeMuted }]}>
          Your home market sets the currency and date style you see first. Nothing is hidden: you can still compare
          the other market's prices on any pin.
        </Text>
        <HomeMarketChoice value={pending ?? saved} onChange={m => void change(m)} disabled={pending !== null} />
        {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
        <Text style={[styles.note, { color: colors.homeMuted }]}>
          Prices you've set in £ and $ are kept separately and never converted.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  intro: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  note: { fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});
