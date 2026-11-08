/**
 * Collection → For Trade → "Price my trade pins" (CV-05, #516).
 *
 * Every pin the collector has For Trade, each with a price box, for getting
 * ready for a pin event. Prices save as they go (on leaving a box or pressing
 * Done), one write at a time per pin, always ending on the latest value. A
 * pin's community price shows under it only after its price is saved.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CataloguePin, CommunityPrice, PriceCurrency } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { PinImage } from '@/components/ui/PinImage';
import { EmptyState } from '@/components/EmptyState';
import { getPinImageSource } from '@/utils/pinImage';
import { usePriceCurrency } from '@/hooks/usePriceCurrency';
import { getCommunityPriceService } from '@/lib/communityPriceService';
import { refreshCommunityPrice } from '@/hooks/useCommunityPrice';
import { createPriceSaveQueue } from '@/utils/priceSaveQueue';
import { parsePriceInput } from '@/components/YourPriceEditor';
import { CURRENCY_SYMBOL, formatPrice } from '@/utils/priceFormat';

type RowState = { text: string; saved: number | null; status: 'idle' | 'saving' | 'saved' | 'error'; community?: CommunityPrice | null };

export default function PriceTradePinsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { collection } = useCollection();
  const { pins: catalogue, ensurePins } = usePinCatalogue();
  const [currency, setCurrency] = usePriceCurrency();
  const service = getCommunityPriceService();

  const entries = useMemo(
    () => Object.values(collection).filter(e => e.status === 'for_trade'),
    [collection],
  );
  const ids = useMemo(() => entries.map(e => e.pinId), [entries]);
  useEffect(() => { if (ids.length) void ensurePins(ids); }, [ids, ensurePins]);
  const byId = useMemo(() => new Map(catalogue.map(p => [p.id, p])), [catalogue]);
  const rows = useMemo(
    () => entries
      .map(e => ({ entry: e, pin: byId.get(e.pinId) }))
      .filter((r): r is { entry: typeof entries[number]; pin: CataloguePin } => Boolean(r.pin))
      .sort((a, b) => a.pin.title.localeCompare(b.pin.title)),
    [entries, byId],
  );

  const [state, setState] = useState<Record<string, RowState>>({});
  const [loadError, setLoadError] = useState(false);
  const idsKey = ids.join(',');

  // The collector's saved prices in this currency.
  useEffect(() => {
    if (!service || ids.length === 0) return;
    let cancelled = false;
    service.getMyPinPrices(ids)
      .then(prices => {
        if (cancelled) return;
        const next: Record<string, RowState> = {};
        for (const id of ids) {
          const p = prices.find(x => x.pinId === id && x.currency === currency);
          next[id] = { text: p ? String(p.amount) : '', saved: p?.amount ?? null, status: 'idle' };
        }
        setState(next);
        setLoadError(false);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, idsKey, currency]);

  const queue = useRef(createPriceSaveQueue(async (pinId, cur, amount) => {
    if (!service) return;
    if (amount == null) await service.clearMyPinPrice(pinId, cur);
    else await service.setMyPinPrice(pinId, cur, amount);
  })).current;

  const patch = useCallback((id: string, p: Partial<RowState>) => {
    setState(s => ({ ...s, [id]: { ...(s[id] ?? { text: '', saved: null, status: 'idle' }), ...p } }));
  }, []);

  const commit = useCallback(async (pinId: string, cur: PriceCurrency, text: string, saved: number | null) => {
    const trimmed = text.trim();
    const amount = trimmed ? parsePriceInput(trimmed) : null;
    if (trimmed && amount == null) { patch(pinId, { status: 'error' }); return; }
    if (amount === saved) return;
    patch(pinId, { status: 'saving' });
    try {
      await queue.save(pinId, cur, amount);
      const community = amount == null ? null : await service?.getCommunityPrice(pinId, cur).catch(() => null) ?? null;
      void refreshCommunityPrice(pinId, cur);
      patch(pinId, { saved: amount, status: 'saved', community });
    } catch {
      patch(pinId, { status: 'error' });
    }
  }, [patch, queue, service]);

  const pricedCount = rows.filter(r => state[r.pin.id]?.saved != null).length;

  if (!service) {
    return (
      <>
        <Stack.Screen options={{ title: 'Price my trade pins' }} />
        <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
          <EmptyState icon="tag" title="Prices aren't available yet" subtitle="Come back soon to price your trade pins." />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Price my trade pins' }} />
      <FlatList
        style={{ backgroundColor: colors.homeBackground }}
        contentContainerStyle={[styles.content, { paddingBottom: (Platform.OS === 'web' ? 24 : insets.bottom) + 24 }]}
        data={rows}
        keyExtractor={r => r.pin.id}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.intro, { color: colors.homeMuted }]}>
              Price your For Trade pins before a trading day or pin event. Your prices help make each pin's community price.
            </Text>
            <View style={styles.headerRow}>
              <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: colors.homeInk }]}>
                {pricedCount} of {rows.length} priced
              </Text>
              <View accessibilityRole="radiogroup" style={[styles.switch, { backgroundColor: colors.homeAqua }]}>
                {(['GBP', 'USD'] as const).map(c => {
                  const on = c === currency;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCurrency(c)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={c === 'GBP' ? 'Pounds' : 'Dollars'}
                      style={[styles.switchOption, on && { backgroundColor: colors.homeSurface }]}
                    >
                      <Text style={[styles.switchLabel, { color: on ? colors.homeInk : colors.homeMuted }]}>{CURRENCY_SYMBOL[c]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            {loadError && (
              <Text style={[styles.error, { color: colors.destructive }]}>Couldn't load your prices. Pull back and try again.</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="repeat" title="No pins for trade yet" subtitle="Mark pins you own as For Trade, then price them here." />
        }
        renderItem={({ item: { pin, entry } }) => {
          const row = state[pin.id] ?? { text: '', saved: null, status: 'idle' as const };
          return (
            <View style={[styles.row, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
              <View style={styles.rowTop}>
                <PinImage source={getPinImageSource(pin)} style={[styles.thumb, { backgroundColor: colors.homeAqua }]} />
                <View style={styles.rowCopy}>
                  <Text numberOfLines={2} style={[styles.title, { color: colors.homeInk }]}>{pin.title}</Text>
                  <Text style={[styles.sub, { color: colors.homeMuted }]}>
                    For Trade{entry.quantity > 1 ? ` · ${entry.quantity} copies` : ''}
                  </Text>
                </View>
                <TextInput
                  value={row.text}
                  onChangeText={text => patch(pin.id, { text, status: 'idle' })}
                  onBlur={() => void commit(pin.id, currency, row.text, row.saved)}
                  onSubmitEditing={() => void commit(pin.id, currency, row.text, row.saved)}
                  placeholder={`${CURRENCY_SYMBOL[currency]} –`}
                  placeholderTextColor={colors.homeMuted}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  returnKeyType="done"
                  accessibilityLabel={`Price for ${pin.title}, in ${currency === 'GBP' ? 'pounds' : 'dollars'}`}
                  style={[styles.input, {
                    color: colors.homeInk,
                    backgroundColor: colors.homeBackground,
                    borderColor: row.status === 'error' ? colors.destructive : row.saved != null ? colors.homeCoral : colors.homeLine,
                  }]}
                />
              </View>
              {row.status === 'saving' && <Text style={[styles.sub, { color: colors.homeMuted }]}>Saving…</Text>}
              {row.status === 'error' && (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {row.text.trim() && parsePriceInput(row.text) == null ? 'Enter a price like 12 or 12.50.' : 'Couldn’t save. Try again.'}
                </Text>
              )}
              {row.status === 'saved' && row.saved != null && (
                <Text accessibilityLiveRegion="polite" style={[styles.reveal, { color: colors.homeInk, backgroundColor: colors.homeWarmSurface }]}>
                  {row.community
                    ? `Saved. Community price: ${formatPrice(row.community.median, currency)} from ${row.community.collectorCount} ${row.community.collectorCount === 1 ? 'collector' : 'collectors'}.`
                    : 'Saved.'}
                </Text>
              )}
              {row.status === 'saved' && row.saved == null && (
                <Text style={[styles.sub, { color: colors.homeMuted }]}>Price removed.</Text>
              )}
            </View>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.sm + 2 },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  intro: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  progress: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  switch: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  switchOption: { minWidth: 40, minHeight: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  switchLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  row: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm + 2, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  rowCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  input: { width: 84, minHeight: 44, borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: 10, fontSize: 15, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  error: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  reveal: { fontSize: 12.5, fontFamily: 'Inter_500Medium', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
});
