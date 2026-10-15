/**
 * Find the missing pins — who has the pins you're missing from one set
 * (UX-021, #129). Reached from Set detail's footer and Find Trades'
 * "Complete your sets" card. One getForTradeInventory call for every missing
 * pin, grouped per collector and sorted by how many of them each one has.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useSetTraders } from '@/hooks/useSetTraders';
import { useAddMissingToIso } from '@/hooks/useAddMissingToIso';
import { PLACEHOLDER_IMAGE } from '@/utils/pinImage';
import { hasThemLabel, type SetTrader } from '@/utils/setTraders';
import { radius, spacing } from '@/constants/theme';
import { PinImage } from '@/components/ui/PinImage';

const THUMBS = 4;

export default function SetTradersScreen() {
  const { collection: setName } = useLocalSearchParams<{ collection: string }>();
  const colors = useColors();
  const router = useRouter();
  const { collection } = useCollection();
  const { pins: catalogue, ensureCollections } = usePinCatalogue();
  const [setLoading, setSetLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!setName) { setSetLoading(false); return; }
    ensureCollections([setName]).catch(() => {}).finally(() => { if (!cancelled) setSetLoading(false); });
    return () => { cancelled = true; };
  }, [setName, ensureCollections]);

  const missingPins = useMemo(
    () => catalogue.filter(p => p.collection === setName && !['owned', 'for_trade'].includes(collection[p.id]?.status ?? '')),
    [catalogue, setName, collection],
  );
  const missingIds = useMemo(() => missingPins.map(p => p.id), [missingPins]);
  const { traders, loading: tradersLoading, error, refresh, available } = useSetTraders(setLoading ? [] : missingIds);
  const { add: addToIso, pending: pendingIso } = useAddMissingToIso();
  const loading = setLoading || tradersLoading;
  const toIso = pendingIso(missingIds).length;

  const message = (trader: SetTrader) => router.push({
    pathname: '/community/start-conversation' as any,
    params: {
      recipientId: trader.traderId,
      recipientName: trader.username,
      contextPinId: trader.pins[0]?.pinId,
      contextPinTitle: trader.pins[0]?.title,
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Find the missing' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.setName, { color: colors.homeInk }]} numberOfLines={2}>{setName}</Text>
        {!setLoading && (
          <Text style={[styles.summary, { color: colors.homeMuted }]}>
            {missingPins.length === 0
              ? 'You have every pin in this set.'
              : `${missingPins.length} missing${available != null && !tradersLoading
                ? ` · ${available} available from ${traders.length} ${traders.length === 1 ? 'collector' : 'collectors'}`
                : ''}`}
          </Text>
        )}

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.homeCoral} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.emptySub, { color: colors.destructive }]}>{error}</Text>
            <TouchableOpacity onPress={refresh} accessibilityRole="button" style={styles.textBtn}>
              <Text style={[styles.textBtnLabel, { color: colors.homeCoralDeep }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : missingPins.length === 0 ? null : traders.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={32} color={colors.homeMuted} />
            <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>No one has these for trade yet</Text>
            <Text style={[styles.emptySub, { color: colors.homeMuted }]}>
              Add them to your ISO and they'll show up in Find Trades as soon as a collector lists one.
            </Text>
            {toIso > 0 && (
              <TouchableOpacity
                onPress={() => addToIso(missingIds)}
                accessibilityRole="button"
                activeOpacity={0.85}
                style={[styles.primary, { backgroundColor: colors.homeCoral }]}
              >
                <Text style={[styles.primaryLabel, { color: colors.homeSurface }]}>Add missing to ISO</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.list}>
            {traders.map(trader => (
              <View key={trader.traderId} style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                <Text style={[styles.cardTitle, { color: colors.homeInk }]}>
                  @{trader.username}{' '}
                  <Text style={{ color: colors.homeMuted, fontFamily: 'Inter_500Medium' }}>
                    {hasThemLabel(trader.pins.length, missingPins.length)}
                  </Text>
                </Text>
                <View style={styles.thumbs}>
                  {trader.pins.slice(0, THUMBS).map(pin => (
                    <TouchableOpacity
                      key={pin.pinId}
                      onPress={() => router.push({ pathname: '/pin/[id]', params: { id: pin.pinId } })}
                      accessibilityRole="button"
                      accessibilityLabel={pin.title}
                      style={styles.thumbWrap}
                    >
                      <PinImage
                        source={pin.imageUrl ? { uri: pin.imageUrl } : PLACEHOLDER_IMAGE}
                        style={[styles.thumb, { backgroundColor: colors.homeAqua }]}
                      />
                      <Text numberOfLines={1} style={[styles.thumbLabel, { color: colors.homeMuted }]}>{pin.title}</Text>
                    </TouchableOpacity>
                  ))}
                  {trader.pins.length > THUMBS && (
                    <View style={[styles.more, { backgroundColor: colors.homeAqua }]}>
                      <Text style={[styles.moreLabel, { color: colors.homeInk }]}>+{trader.pins.length - THUMBS}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={() => message(trader)}
                    accessibilityRole="button"
                    accessibilityLabel={`Message @${trader.username}`}
                    activeOpacity={0.85}
                    style={[styles.action, { backgroundColor: colors.homeCoral }]}
                  >
                    <Feather name="message-circle" size={15} color={colors.homeSurface} />
                    <Text style={[styles.actionLabel, { color: colors.homeSurface }]}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/collector/[username]', params: { username: trader.username } })}
                    accessibilityRole="button"
                    accessibilityLabel={`View @${trader.username}'s profile`}
                    activeOpacity={0.85}
                    style={[styles.action, { borderWidth: 1, borderColor: colors.homeLine }]}
                  >
                    <Text style={[styles.actionLabel, { color: colors.homeInk }]}>View profile</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {toIso > 0 && (
              <TouchableOpacity onPress={() => addToIso(missingIds)} accessibilityRole="button" style={styles.textBtn}>
                <Text style={[styles.textBtnLabel, { color: colors.homeCoralDeep }]}>Add missing to ISO</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  setName: { fontSize: 20, lineHeight: 25, fontFamily: 'Inter_700Bold' },
  summary: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 4 },
  center: { alignItems: 'center', paddingTop: 48, gap: spacing.md },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emptySub: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 300 },
  primary: { minHeight: 48, paddingHorizontal: spacing.xl, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  primaryLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  textBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  list: { marginTop: spacing.lg, gap: spacing.md },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  thumbs: { flexDirection: 'row', gap: spacing.sm },
  thumbWrap: { width: 64 },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  thumbLabel: { fontSize: 10.5, fontFamily: 'Inter_500Medium', marginTop: 4 },
  more: { width: 64, height: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  moreLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, minHeight: 44, borderRadius: radius.pill, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
