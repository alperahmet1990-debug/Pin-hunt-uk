/**
 * Contribute Pin Image — shown after a scan match resolves to a catalogue
 * pin that has no display image yet (scan.tsx's handleSelectMatch routes
 * here instead of straight to /pin/[id] when !match.pin.imageUrl).
 *
 * Three steps: consent (explain + explicit rights grant) → capture (a
 * dedicated, higher-quality photo — not the disposable identify photo) →
 * confirm (preview, retake or submit). The submitted photo is stored
 * privately pending admin review; it only becomes the pin's public
 * catalogue image once approved.
 *
 * `from=catalogue` (the beta contributor screen, app/contribute) adds an
 * "Is this your pin?" check against the pin's details/reference photo, lets
 * a contributor propose a replacement for a pin that already has a photo
 * (with a reason), and finishes with "Next pin" instead of the pin page.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useCollection } from '@/context/CollectionContext';
import { API_BASE } from '@/lib/apiBase';
import {
  findNextContributionTarget,
  getCachedCoverage,
  markCoveragePending,
} from '@/hooks/useCatalogueCoverage';
import type { ContributedImageReason } from '@workspace/pin-repository';

type Step = 'consent' | 'confirm' | 'submitting' | 'done';

const REPLACE_REASONS: Array<{ value: ContributedImageReason; label: string }> = [
  { value: 'wrong_pin', label: 'Current photo is the wrong pin' },
  { value: 'poor_quality', label: 'Current photo is poor quality' },
  { value: 'other', label: 'Something else' },
];

interface CapturedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

export default function ContributeImageScreen() {
  const { pinId, from } = useLocalSearchParams<{ pinId: string; from?: string }>();
  const fromCatalogue = from === 'catalogue';
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pins, ensurePins } = usePinCatalogue();
  const { session } = useAuth();
  const { collection } = useCollection();

  // The catalogue context only caches a slice — make sure this pin is loaded.
  useEffect(() => { if (pinId) ensurePins([pinId]); }, [pinId, ensurePins]);

  const pin = pins.find(p => p.id === pinId);
  const coverage = fromCatalogue ? getCachedCoverage(pinId) : undefined;
  const title = pin?.title ?? coverage?.title;
  const existingImageUrl = pin?.imageUrl ?? coverage?.imageUrl;
  // Replacing an existing photo is only offered from the catalogue screen;
  // the scan flow only routes here for pins with no photo.
  const isReplacement = fromCatalogue && !!existingImageUrl;
  const [reason, setReason] = useState<ContributedImageReason | null>(null);

  const [step, setStep] = useState<Step>('consent');
  const [consentChecked, setConsentChecked] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const goToPin = useCallback(() => {
    router.replace({ pathname: '/pin/[id]', params: { id: pinId } });
  }, [router, pinId]);

  const leave = useCallback(() => {
    if (fromCatalogue) router.back();
    else goToPin();
  }, [fromCatalogue, router, goToPin]);

  const ownedIds = useMemo(() => new Set(
    Object.entries(collection)
      .filter(([, e]) => e.status === 'owned' || e.status === 'for_trade')
      .map(([id]) => id),
  ), [collection]);
  const nextPin = step === 'done' && fromCatalogue ? findNextContributionTarget(pinId, ownedIds) : undefined;

  const goToNextPin = useCallback(() => {
    if (!nextPin) return;
    router.replace({ pathname: '/contribute-image/[pinId]', params: { pinId: nextPin.pinhuntId, from: 'catalogue' } });
  }, [router, nextPin]);

  const handleTakePhoto = useCallback(async () => {
    setError(null);
    const launcher = Platform.OS === 'web'
      ? ImagePicker.launchImageLibraryAsync
      : ImagePicker.launchCameraAsync;

    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera access needed', 'Please allow camera access in Settings to take a photo.');
        return;
      }
    }

    const result = await launcher({
      mediaTypes: 'images',
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Could not read photo', 'Please try again.');
      return;
    }

    setPhoto({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' });
    setStep('confirm');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!photo || !session?.access_token) return;
    setStep('submitting');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pin-images/contribute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pinId,
          imageBase64: photo.base64,
          mimeType: photo.mimeType,
          consentGranted: true,
          ...(fromCatalogue ? { proposalReason: isReplacement ? reason : 'missing' } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not submit your photo.');
      markCoveragePending(pinId);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your photo.');
      setStep('confirm');
    }
  }, [photo, session?.access_token, pinId, fromCatalogue, isReplacement, reason]);

  const canStart = consentChecked && (!isReplacement || reason !== null);

  return (
    <>
      <Stack.Screen options={{ title: isReplacement ? 'Propose a Photo' : 'Add a Photo' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: botPad, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 'consent' && (
          <View style={styles.block}>
            <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
              <Feather name="camera" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {isReplacement ? 'Propose a better photo' : 'We don\u2019t have a photo of this pin yet'}
            </Text>
            {fromCatalogue ? (
              <View style={[styles.pinCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {existingImageUrl ? (
                  <Image source={{ uri: existingImageUrl }} style={styles.pinCardImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.pinCardImage, styles.pinCardEmpty, { backgroundColor: colors.secondary }]}>
                    <Feather name="image" size={20} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.pinCardLabel, { color: colors.mutedForeground }]}>Is this your pin?</Text>
                  <Text style={[styles.pinCardTitle, { color: colors.foreground }]} numberOfLines={3}>{title ?? pinId}</Text>
                  <Text style={[styles.pinCardMeta, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {[coverage?.setName ?? pin?.collection, coverage?.releaseYear ?? pin?.releaseYear, coverage?.editionType ?? pin?.edition]
                      .filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={[styles.pinCardMeta, { color: colors.mutedForeground }]}>{pinId}</Text>
                </View>
              </View>
            ) : title ? (
              <Text style={[styles.pinName, { color: colors.mutedForeground }]}>{title}</Text>
            ) : null}

            {isReplacement && (
              <View style={styles.reasons}>
                <Text style={[styles.reasonsLabel, { color: colors.foreground }]}>Why replace the current photo?</Text>
                {REPLACE_REASONS.map(r => {
                  const active = reason === r.value;
                  return (
                    <TouchableOpacity
                      key={r.value}
                      onPress={() => setReason(r.value)}
                      activeOpacity={0.8}
                      style={[styles.reasonRow, { borderColor: active ? colors.primary : colors.border }]}
                    >
                      <Feather name={active ? 'check-circle' : 'circle'} size={18} color={active ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.reasonText, { color: colors.foreground }]}>{r.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Take one clean photo — plain background, good light, pin filling the frame —
              and we&apos;ll use it as this pin&apos;s photo everywhere in PinHunt: catalogue
              browsing, set pages, and every collector&apos;s view, not just yours.
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              {isReplacement
                ? 'The current photo stays until a PinHunt moderator reviews yours \u2014 nothing changes unless it\u2019s approved.'
                : 'A PinHunt moderator reviews every photo before it goes live, so it won\u2019t appear anywhere until approved.'}
            </Text>

            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => setConsentChecked(v => !v)}
              activeOpacity={0.8}
            >
              <Switch value={consentChecked} onValueChange={setConsentChecked} />
              <Text style={[styles.consentText, { color: colors.foreground }]}>
                I took this photo and I agree PinHunt can use it as this pin&apos;s public
                catalogue photo.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: canStart ? colors.primary : colors.secondary }]}
              onPress={handleTakePhoto}
              disabled={!canStart}
              activeOpacity={0.85}
            >
              <Feather name="camera" size={18} color={canStart ? '#fff' : colors.mutedForeground} />
              <Text style={[styles.primaryBtnLabel, { color: canStart ? '#fff' : colors.mutedForeground }]}>
                Take Photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={leave} activeOpacity={0.7}>
              <Text style={[styles.skipLabel, { color: colors.mutedForeground }]}>
                {fromCatalogue ? 'Not my pin \u2014 go back' : 'Maybe later'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {(step === 'confirm' || step === 'submitting') && photo && (
          <View style={styles.block}>
            <Image source={{ uri: photo.uri }} style={[styles.preview, { borderColor: colors.border }]} />
            {error && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            )}
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={handleTakePhoto}
                disabled={step === 'submitting'}
                activeOpacity={0.85}
              >
                <Feather name="refresh-cw" size={16} color={colors.foreground} />
                <Text style={[styles.secondaryBtnLabel, { color: colors.foreground }]}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmit}
                disabled={step === 'submitting'}
                activeOpacity={0.85}
              >
                {step === 'submitting' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.primaryBtnLabel, { color: '#fff' }]}>Submit Photo</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.block}>
            <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
              <Feather name="check" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Thanks!</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Your photo is being reviewed. We&apos;ll use it as this pin&apos;s catalogue photo
              once it&apos;s approved.
            </Text>
            {nextPin ? (
              <>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={goToNextPin}
                  activeOpacity={0.85}
                >
                  <Feather name="camera" size={18} color="#fff" />
                  <Text style={[styles.primaryBtnLabel, { color: '#fff' }]}>Next pin that needs a photo</Text>
                </TouchableOpacity>
                <Text style={[styles.pinName, { color: colors.mutedForeground }]} numberOfLines={2}>{nextPin.title}</Text>
                <TouchableOpacity style={styles.skipBtn} onPress={leave} activeOpacity={0.7}>
                  <Text style={[styles.skipLabel, { color: colors.mutedForeground }]}>Back to the catalogue</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={leave}
                activeOpacity={0.85}
              >
                <Text style={[styles.primaryBtnLabel, { color: '#fff' }]}>
                  {fromCatalogue ? 'Back to the catalogue' : 'Continue'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  block: { gap: spacing.md, alignItems: 'center', paddingTop: spacing.xl },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  pinName: { fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  body: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, textAlign: 'center' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, width: '100%', marginTop: spacing.sm },
  consentText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, width: '100%', paddingVertical: 14, borderRadius: 18, marginTop: spacing.sm },
  primaryBtnLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  skipBtn: { paddingVertical: spacing.sm },
  skipLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  preview: { width: 260, height: 260, borderRadius: 18, borderWidth: 1 },
  errorText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: 18, paddingVertical: 13 },
  secondaryBtnLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  pinCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', borderWidth: 1, borderRadius: 18, padding: spacing.md },
  pinCardImage: { width: 76, height: 76, borderRadius: 12 },
  pinCardEmpty: { alignItems: 'center', justifyContent: 'center' },
  pinCardLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4, textTransform: 'uppercase' },
  pinCardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  pinCardMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  reasons: { width: '100%', gap: spacing.sm },
  reasonsLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: 14, padding: spacing.md },
  reasonText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  submitBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 14 },
});
