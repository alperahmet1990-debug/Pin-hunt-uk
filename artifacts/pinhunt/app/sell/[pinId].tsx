/**
 * Sell Securely screen — create an external marketplace listing for a pin.
 *
 * The pinId URL param is the pinhunt_id (e.g. "PHUK-00000001").
 * PinHunt never processes payments; buyers are directed to the marketplace.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { radius, spacing } from '@/constants/theme';
import {
  PLATFORM_CONFIG,
  CURRENCIES,
  CURRENCY_SYMBOLS,
  validateMarketplaceUrl,
} from '@/utils/marketplaceUrl';
import type { ExternalSaleListingPlatform } from '@workspace/pin-repository';

const PLATFORMS: ExternalSaleListingPlatform[] = ['vinted', 'ebay', 'other'];

export default function SellScreen() {
  const { pinId } = useLocalSearchParams<{ pinId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pins } = usePinCatalogue();
  const { repo, userId } = useMarketplace();

  const pin = pins.find(p => p.id === pinId);

  const [platform, setPlatform] = useState<ExternalSaleListingPlatform>('vinted');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'GBP' | 'USD' | 'EUR' | 'AUD' | 'CAD'>('GBP');
  const [asDraft, setAsDraft] = useState(false);
  const [saving, setSaving] = useState(false);

  const cfg = PLATFORM_CONFIG[platform];

  const handleUrlChange = (text: string) => {
    setUrl(text);
    if (urlError) setUrlError(null);
  };

  const handlePlatformChange = (p: ExternalSaleListingPlatform) => {
    setPlatform(p);
    setUrl('');
    setUrlError(null);
  };

  const handleSubmit = async () => {
    if (!repo || !userId || !pin) return;

    const validation = validateMarketplaceUrl(platform, url);
    if (!validation.valid) {
      setUrlError(validation.error ?? 'Invalid URL.');
      return;
    }

    const parsedPrice = price.trim() ? parseFloat(price.replace(/[^0-9.]/g, '')) : undefined;
    if (price.trim() && (isNaN(parsedPrice!) || parsedPrice! <= 0)) {
      Alert.alert('Invalid price', 'Please enter a valid asking price, or leave it blank.');
      return;
    }

    try {
      setSaving(true);
      await repo.createExternalSaleListing(userId, {
        pinPinhuntId: pin.id,
        platform,
        listingUrl: url.trim(),
        askingPrice: parsedPrice,
        currency: parsedPrice ? currency : undefined,
        status: asDraft ? 'draft' : 'active',
      });
      router.replace('/my-listings');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save listing. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!pin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
        <Stack.Screen options={{ title: 'List for Sale' }} />
        <Text style={{ color: colors.homeMuted }}>Pin not found.</Text>
      </View>
    );
  }

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  return (
    <>
      <Stack.Screen options={{ title: 'List for Sale' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Pin info ── */}
          <View style={[styles.pinCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}>
            <View style={styles.pinMeta}>
              <Text style={[styles.pinTitle, { color: colors.homeInk }]} numberOfLines={2}>
                {pin.title}
              </Text>
              <Text style={[styles.pinCollection, { color: colors.homeMuted }]}>
                {pin.collection} · {pin.brand}
              </Text>
            </View>
          </View>

          {/* ── Platform selector ── */}
          <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>MARKETPLACE</Text>
          <View style={[styles.platformRow]}>
            {PLATFORMS.map(p => {
              const c = PLATFORM_CONFIG[p];
              const isActive = platform === p;
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => handlePlatformChange(p)}
                  activeOpacity={0.8}
                  style={[
                    styles.platformBtn,
                    {
                      backgroundColor: isActive ? c.color + '18' : colors.homeSurface,
                      borderColor: isActive ? c.color : colors.homeLine,
                      borderRadius: radius.lg,
                    },
                  ]}
                >
                  <Feather
                    name={c.icon as keyof typeof Feather.glyphMap}
                    size={18}
                    color={isActive ? c.color : colors.homeMuted}
                  />
                  <Text style={[styles.platformLabel, { color: isActive ? c.color : colors.homeMuted }]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Platform instruction ── */}
          <View style={[styles.instructionBox, { backgroundColor: colors.homeAqua, borderRadius: radius.lg }]}>
            <Feather name="info" size={14} color={colors.homeMuted} style={{ marginTop: 1 }} />
            <Text style={[styles.instructionText, { color: colors.homeMuted }]}>
              {cfg.instruction}
            </Text>
          </View>

          {/* ── Listing URL ── */}
          <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>LISTING URL</Text>
          <TextInput
            value={url}
            onChangeText={handleUrlChange}
            placeholder={cfg.exampleUrl}
            placeholderTextColor={colors.homeMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              styles.input,
              {
                color: colors.homeInk,
                borderColor: urlError ? colors.destructive : colors.homeLine,
                backgroundColor: colors.homeSurface,
                borderRadius: radius.lg,
              },
            ]}
          />
          {urlError && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>{urlError}</Text>
          )}

          {/* Quick open to verify */}
          {url.trim().startsWith('https://') && !urlError && (
            <TouchableOpacity
              onPress={() => Linking.openURL(url.trim())}
              style={styles.verifyLink}
            >
              <Feather name="external-link" size={12} color={colors.homeCoral} />
              <Text style={[styles.verifyLinkLabel, { color: colors.homeCoral }]}>Open to verify</Text>
            </TouchableOpacity>
          )}

          {/* ── Price (optional) ── */}
          <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>ASKING PRICE (optional)</Text>
          <View style={styles.priceRow}>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={colors.homeMuted}
              keyboardType="decimal-pad"
              style={[
                styles.priceInput,
                {
                  color: colors.homeInk,
                  borderColor: colors.homeLine,
                  backgroundColor: colors.homeSurface,
                  borderRadius: radius.lg,
                },
              ]}
            />
            {/* Currency picker */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.currencyRow}
            >
              {CURRENCIES.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCurrency(c as typeof currency)}
                  activeOpacity={0.8}
                  style={[
                    styles.currencyBtn,
                    {
                      backgroundColor: currency === c ? colors.homeCoral : colors.homeSurface,
                      borderColor: currency === c ? colors.homeCoral : colors.homeLine,
                      borderRadius: radius.sm,
                    },
                  ]}
                >
                  <Text style={[styles.currencyLabel, { color: currency === c ? colors.homeSurface : colors.homeMuted }]}>
                    {CURRENCY_SYMBOLS[c as typeof currency]} {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── Status toggle ── */}
          <TouchableOpacity
            onPress={() => setAsDraft(d => !d)}
            activeOpacity={0.8}
            style={[styles.draftRow, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
          >
            <View style={styles.draftInfo}>
              <Text style={[styles.draftTitle, { color: colors.homeInk }]}>Save as draft</Text>
              <Text style={[styles.draftSub, { color: colors.homeMuted }]}>
                Draft listings are not visible to other collectors until you publish.
              </Text>
            </View>
            <View
              style={[
                styles.toggle,
                { backgroundColor: asDraft ? colors.homeCoral : colors.homeAqua, borderColor: colors.homeLine },
              ]}
            >
              <View style={[styles.toggleThumb, { backgroundColor: asDraft ? colors.homeSurface : colors.homeMuted, transform: [{ translateX: asDraft ? 16 : 0 }] }]} />
            </View>
          </TouchableOpacity>

          {/* ── Safety warning ── */}
          <View style={[styles.warningBox, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine, borderRadius: radius.lg }]}>
            <Feather name="shield" size={18} color={colors.homeSandInk} style={{ marginTop: 1 }} />
            <Text style={[styles.warningText, { color: colors.homeSandInk }]}>
              Complete payment only through the marketplace's official checkout. Payments arranged outside the marketplace may not be protected.
            </Text>
          </View>

          {/* ── Submit ── */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving || !url.trim()}
            activeOpacity={0.85}
            style={[
              styles.submitBtn,
              {
                backgroundColor: url.trim() ? colors.homeCoral : colors.homeAqua,
                borderRadius: radius.lg,
                shadowColor: colors.homeShadow,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.homeSurface} size="small" />
            ) : (
              <>
                <Feather name="check" size={16} color={url.trim() ? colors.homeSurface : colors.homeMuted} />
                <Text style={[styles.submitLabel, { color: url.trim() ? colors.homeSurface : colors.homeMuted }]}>
                  {asDraft ? 'Save Draft' : 'Publish Listing'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pinCard: {
    padding: spacing.lg - 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  pinMeta: { flex: 1, gap: spacing.xs },
  pinTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  pinCollection: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  fieldLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginTop: spacing.xs,
    marginBottom: spacing.sm - 2,
  },
  platformRow: { flexDirection: 'row', gap: spacing.sm + 2 },
  platformBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs + 2,
    borderWidth: 1.5,
  },
  platformLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  instructionBox: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    padding: spacing.md,
    marginVertical: spacing.xs,
  },
  instructionText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  input: {
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  errorText: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -6 },
  verifyLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: -6 },
  verifyLinkLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  priceRow: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'center' },
  priceInput: {
    width: 110,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 1,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  currencyRow: { gap: spacing.sm - 2, alignItems: 'center', paddingVertical: 2 },
  currencyBtn: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm },
  currencyLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg - 2,
    borderWidth: 1,
    gap: spacing.md,
  },
  draftInfo: { flex: 1, gap: 2 },
  draftTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  draftSub: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleThumb: { width: 18, height: 18, borderRadius: 9 },
  warningBox: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    padding: spacing.lg - 2,
    borderWidth: 1.5,
    marginTop: spacing.xs,
  },
  warningText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg - 2,
    marginTop: spacing.sm,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  submitLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
