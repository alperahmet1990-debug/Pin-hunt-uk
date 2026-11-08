/**
 * "Your price" (CV-03, #514): the collector's own price for a pin they have
 * in their collection or For Trade. Used in a sheet from the pin page and
 * inline in Manage Collection.
 *
 * The community price is shown only after the collector saves, so it can't
 * sway the number they would have picked. The first time they price a pin, a
 * note says their price counts anonymously, with a link to the setting.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import type { CommunityPrice, PriceCurrency } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { radius, spacing } from '@/constants/theme';
import { usePriceCurrency } from '@/hooks/usePriceCurrency';
import { clearMyPinPrice, saveMyPinPrice, useMyPinPrice } from '@/hooks/useMyPinPrice';
import { getCommunityPriceService } from '@/lib/communityPriceService';
import { CURRENCY_SYMBOL, formatPrice } from '@/utils/priceFormat';

export const priceNoteKey = (userId: string) => `@pinhunt_price_note_v1:${userId}`;

/** "12", "12.5", "£12.50" → 12.5; anything else → null. */
export function parsePriceInput(text: string): number | null {
  const cleaned = text.replace(/[£$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= 100000 ? n : null;
}

interface Props {
  pinId: string;
  /** Called after a save or removal, e.g. to close a sheet a moment later. */
  onDone?: () => void;
  /** Hide the "Your price" heading when the container already shows it (a sheet title). */
  showHeading?: boolean;
}

export function YourPriceEditor(props: Props) {
  // No price source (unit tests, unconfigured builds): nothing, and no
  // context reads. The source is fixed for the session, so this is stable.
  if (!getCommunityPriceService()) return null;
  return <Editor {...props} />;
}

function Editor({ pinId, onDone, showHeading = true }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const [currency, setCurrency] = usePriceCurrency();
  const mine = useMyPinPrice(pinId);
  const current = mine.priceIn(currency);

  const [text, setText] = useState(current ? String(current.amount) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ community: CommunityPrice | null; removed?: boolean } | null>(null);
  const [showNote, setShowNote] = useState(false);

  // The field follows the saved price for the chosen currency. A reload after
  // saving updates the field but keeps the "Saved" message.
  useEffect(() => {
    setText(current ? String(current.amount) : '');
  }, [current?.amount, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSaved(null);
    setError(null);
  }, [currency]);

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(priceNoteKey(user.id))
      .then(seen => setShowNote(!seen))
      .catch(() => setShowNote(true));
  }, [user?.id]);

  if (mine.status === 'off') return null;

  const amount = parsePriceInput(text);
  const changed = amount != null && amount !== current?.amount;

  const save = async () => {
    if (amount == null) { setError('Enter a price above 0, like 12 or 12.50.'); return; }
    setBusy(true);
    setError(null);
    try {
      await saveMyPinPrice(pinId, currency, amount);
      const community = await getCommunityPriceService()?.getCommunityPrice(pinId, currency) ?? null;
      setSaved({ community });
      if (user?.id) AsyncStorage.setItem(priceNoteKey(user.id), '1').catch(() => {});
      setShowNote(false);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your price.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearMyPinPrice(pinId, currency);
      setText('');
      setSaved({ community: null, removed: true });
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove your price.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap} testID="your-price-editor">
      <View>
        {showHeading && <Text style={[styles.title, { color: colors.homeInk }]}>Your price</Text>}
        <Text style={[styles.hint, { color: colors.homeMuted }]}>What you'd price this pin at, for trading or a pin event.</Text>
      </View>

      <View style={styles.row}>
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
        <TextInput
          value={text}
          onChangeText={v => { setText(v); setSaved(null); setError(null); }}
          placeholder="0.00"
          placeholderTextColor={colors.homeMuted}
          keyboardType="decimal-pad"
          inputMode="decimal"
          accessibilityLabel={`Your price in ${currency === 'GBP' ? 'pounds' : 'dollars'}`}
          returnKeyType="done"
          onSubmitEditing={() => { if (changed) void save(); }}
          style={[styles.input, { color: colors.homeInk, borderColor: amount != null || !text ? colors.homeLine : colors.destructive, backgroundColor: colors.homeSurface }]}
        />
        <TouchableOpacity
          onPress={() => void save()}
          disabled={busy || !changed}
          accessibilityRole="button"
          accessibilityLabel="Save your price"
          style={[styles.save, { backgroundColor: changed ? colors.homeCoral : colors.homeAqua }]}
        >
          {busy ? <ActivityIndicator color={colors.homeSurface} /> : (
            <Text style={[styles.saveLabel, { color: changed ? colors.homeSurface : colors.homeMuted }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

      {showNote && !saved && (
        <View style={[styles.note, { backgroundColor: colors.homeAqua }]}>
          <Text style={[styles.noteText, { color: colors.homeInk }]}>
            Your price counts towards this pin's community price. Nobody sees it's yours.
          </Text>
          <TouchableOpacity onPress={() => router.push('/settings/community-prices' as never)} accessibilityRole="link" hitSlop={6}>
            <Text style={[styles.link, { color: colors.homeCoralDeep }]}>Change this in Privacy</Text>
          </TouchableOpacity>
        </View>
      )}

      {saved && !saved.removed && (
        <View accessibilityLiveRegion="polite" style={[styles.reveal, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine }]}>
          <Text style={[styles.revealText, { color: colors.homeInk }]}>
            {saved.community
              ? `Saved. Community price: ${formatPrice(saved.community.median, currency)} from ${saved.community.collectorCount} ${saved.community.collectorCount === 1 ? 'collector' : 'collectors'}.`
              : 'Saved.'}
          </Text>
        </View>
      )}
      {saved?.removed && (
        <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.homeMuted }]}>Your price is removed.</Text>
      )}

      {current && !saved?.removed && (
        <TouchableOpacity onPress={() => void remove()} disabled={busy} accessibilityRole="button" style={styles.remove}>
          <Text style={[styles.removeLabel, { color: colors.homeMuted }]}>Remove my price</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm + 2 },
  title: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switch: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  switchOption: { minWidth: 40, minHeight: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  switchLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  save: { minHeight: 44, minWidth: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  saveLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  error: { fontSize: 12.5, fontFamily: 'Inter_500Medium' },
  note: { borderRadius: radius.md, padding: spacing.md, gap: 6 },
  noteText: { fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  link: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  reveal: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  revealText: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  remove: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  removeLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
});
