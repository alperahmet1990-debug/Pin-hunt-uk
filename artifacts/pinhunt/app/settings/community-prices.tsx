/**
 * Profile → Privacy and safety → Community prices (CV-03, #514).
 * "Include my prices in community prices": on unless the collector turns it
 * off. Their prices are never shown with their name either way.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { isCommunityPricesUnavailable } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { getCommunityPriceService } from '@/lib/communityPriceService';

export default function CommunityPricesSettingScreen() {
  const colors = useColors();
  const service = getCommunityPriceService();
  const [include, setInclude] = useState<boolean | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'off' | 'error'>(service ? 'loading' : 'off');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!service) return;
    service.getMyCommunityPriceSetting()
      .then(v => { setInclude(v); setState('ready'); })
      .catch(err => setState(isCommunityPricesUnavailable(err) ? 'off' : 'error'));
  }, [service]);

  const change = async (value: boolean) => {
    if (!service) return;
    const before = include;
    setInclude(value);
    setSaving(true);
    try {
      await service.setMyCommunityPriceSetting(value);
    } catch {
      setInclude(before);
      setState('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Community prices' }} />
      <ScrollView style={{ backgroundColor: colors.homeBackground }} contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.homeMuted }]}>
          When you price a pin you own, your price helps make that pin's community price. Other collectors see the
          community price and how many collectors priced it, never who.
        </Text>

        {state === 'off' && (
          <Text style={[styles.intro, { color: colors.homeInk }]}>Community prices aren't available yet.</Text>
        )}
        {state === 'loading' && <ActivityIndicator color={colors.homeCoral} />}
        {(state === 'ready' || state === 'error') && include != null && (
          <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={styles.copy}>
              <Text style={[styles.label, { color: colors.homeInk }]}>Include my prices in community prices</Text>
              <Text style={[styles.hint, { color: colors.homeMuted }]}>
                {include ? 'On. Your prices count, without your name.' : 'Off. Your prices are kept for you only.'}
              </Text>
            </View>
            <Switch
              value={include}
              onValueChange={v => void change(v)}
              disabled={saving}
              accessibilityLabel="Include my prices in community prices"
              trackColor={{ true: colors.homeCoral, false: colors.homeLine }}
            />
          </View>
        )}
        {state === 'error' && (
          <Text style={[styles.hint, { color: colors.destructive }]}>Couldn't save that. Please try again.</Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  intro: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});
