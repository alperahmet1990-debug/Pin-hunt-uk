/**
 * Contribute Pin Image — add a photo for a catalogue pin. Reached from:
 *   - the scan result's "Add your photo" (`from=scan`), when the matched pin
 *     has no catalogue photo. The scan photo is offered as the starting
 *     image (utils/scanPhotoHandoff.ts); the collector can take a new one;
 *   - the pin page's "Add a photo" card (no `from`), for a pin with no photo;
 *   - `from=catalogue` and `from=replace` (below).
 *
 * Steps: consent (explain + explicit rights grant) → photo (the scan photo,
 * or a new camera shot) → processing (the server cleans it up via Pixian and
 * keeps the photo as taken for the admin only) → confirm (the cleaned-up
 * photo, watermarked exactly as it will be published — retake or submit).
 * The submitted photo is stored privately pending admin review; it only
 * becomes the pin's public catalogue image once approved. Admins' and the
 * App Creator's photos are reviewed too by default, so they get the same
 * raw | cleaned | Pin & Pop check; an admin can tick "Publish now" instead.
 *
 * `from=catalogue` (the beta contributor screen, app/contribute) adds an
 * "Is this your pin?" check against the pin's details/reference photo, lets
 * a contributor propose a replacement for a pin that already has a photo
 * (with a reason), and finishes with "Next pin" instead of the pin page.
 *
 * `from=replace` (the pin page's "Suggest a better photo", #383) proposes a
 * replacement for the pin's current photo: it shows that photo, asks why,
 * and returns to the pin page when done.
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
import { radius, spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { useCollection } from '@/context/CollectionContext';
import { API_BASE } from '@/lib/apiBase';
import { useAiPhotoConsent } from '@/hooks/useAiPhotoConsent';
import {
  findNextContributionTarget,
  getCachedCoverage,
  markCoveragePending,
  markCoveragePublished,
} from '@/hooks/useCatalogueCoverage';
import { useMyAccess } from '@/hooks/useMyAccess';
import type { ContributedImageReason } from '@workspace/pin-repository';
import { getScanPhotoForContribution } from '@/utils/scanPhotoHandoff';

type Step = 'consent' | 'processing' | 'confirm' | 'submitting' | 'done';

const REPLACE_REASONS: Array<{ value: ContributedImageReason; label: string }> = [
  { value: 'wrong_pin', label: 'Current photo is the wrong pin' },
  { value: 'poor_quality', label: 'Current photo is poor quality' },
  { value: 'other', label: 'Something else' },
];

/** The server's cleaned-up, watermarked result, awaiting confirmation. */
interface ProcessedPreview {
  uri: string;
  draftPath: string;
}

export default function ContributeImageScreen() {
  const { pinId, from } = useLocalSearchParams<{ pinId: string; from?: string }>();
  const fromCatalogue = from === 'catalogue';
  const fromReplace = from === 'replace';
  const fromScan = from === 'scan';
  // The photo the collector just scanned, offered as the starting image.
  const scanPhoto = fromScan ? getScanPhotoForContribution(pinId) : null;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pins, ensurePins } = usePinCatalogue();
  const { session } = useAuth();
  // The photo is cleaned up by Pixian before it's shown back (#501).
  const { ensure: ensureConsent, sheet: consentSheet } = useAiPhotoConsent();
  const { collection } = useCollection();
  // Admins and the App Creator are reviewed too, unless they choose
  // "Publish now" (the server checks they really are an admin).
  const { isAdmin } = useMyAccess();
  const [publishNow, setPublishNow] = useState(false);
  const [published, setPublished] = useState(false);

  // The catalogue context only caches a slice — make sure this pin is loaded.
  useEffect(() => { if (pinId) ensurePins([pinId]); }, [pinId, ensurePins]);

  const pin = pins.find(p => p.id === pinId);
  const coverage = fromCatalogue ? getCachedCoverage(pinId) : undefined;
  const title = pin?.title ?? coverage?.title;
  const existingImageUrl = pin?.imageUrl ?? coverage?.imageUrl;
  // Replacing an existing photo is offered from the catalogue screen and the
  // pin page (#383); the scan flow only routes here for pins with no photo.
  const isReplacement = (fromCatalogue || fromReplace) && !!existingImageUrl;
  const [reason, setReason] = useState<ContributedImageReason | null>(null);

  const [step, setStep] = useState<Step>('consent');
  const [consentChecked, setConsentChecked] = useState(false);
  const [preview, setPreview] = useState<ProcessedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const goToPin = useCallback(() => {
    router.replace({ pathname: '/pin/[id]', params: { id: pinId } });
  }, [router, pinId]);

  const leave = useCallback(() => {
    if (fromCatalogue || fromReplace || fromScan) router.back();
    else goToPin();
  }, [fromCatalogue, fromReplace, fromScan, router, goToPin]);

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

  const proposalReason = fromCatalogue || fromReplace ? (isReplacement ? reason : 'missing') : undefined;

  // Have the server clean the photo up, so the contributor confirms the
  // result rather than their raw camera shot.
  const processPhoto = useCallback(async (imageBase64: string, mimeType: string) => {
    if (!session?.access_token) return;
    setError(null);
    const returnTo: Step = preview ? 'confirm' : 'consent';
    setStep('processing');
    try {
      const res = await fetch(`${API_BASE}/pin-images/contribute/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pinId,
          imageBase64,
          mimeType,
          consentGranted: true,
          ...(proposalReason ? { proposalReason } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not process your photo.');
      setPreview({ uri: `data:image/jpeg;base64,${data.previewBase64}`, draftPath: data.draftPath });
      setStep('confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process your photo.');
      setStep(returnTo);
    }
  }, [session?.access_token, pinId, proposalReason, preview]);

  const takePhoto = useCallback(async () => {
    if (!session?.access_token) return;
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
    await processPhoto(asset.base64, asset.mimeType ?? 'image/jpeg');
  }, [session?.access_token, processPhoto]);

  // Ask before the camera opens (#501): "Not now" sends nothing. Returns at
  // once; the camera follows the answer.
  const handleTakePhoto = useCallback(() => {
    if (!session?.access_token) return;
    void ensureConsent().then(ok => { if (ok) void takePhoto(); });
  }, [session?.access_token, ensureConsent, takePhoto]);

  // The scan photo goes through the same clean-up as a new one.
  const handleUseScanPhoto = useCallback(() => {
    if (!session?.access_token || !scanPhoto) return;
    void ensureConsent().then(ok => { if (ok) void processPhoto(scanPhoto.base64, scanPhoto.mimeType); });
  }, [session?.access_token, scanPhoto, ensureConsent, processPhoto]);

  const handleSubmit = useCallback(async () => {
    if (!preview || !session?.access_token) return;
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
          draftPath: preview.draftPath,
          consentGranted: true,
          ...(proposalReason ? { proposalReason } : {}),
          ...(isAdmin && publishNow ? { publishNow: true } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not submit your photo.');
      if (data.autoApproved && data.image?.publicUrl) {
        markCoveragePublished(pinId, data.image.publicUrl);
        setPublished(true);
      } else {
        markCoveragePending(pinId);
      }
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your photo.');
      setStep('confirm');
    }
  }, [preview, session?.access_token, pinId, proposalReason, isAdmin, publishNow]);

  const canStart = consentChecked && (!isReplacement || reason !== null);

  return (
    <>
      <Stack.Screen options={{ title: isReplacement ? 'Propose a Photo' : 'Add a Photo' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.homeBackground }]}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: botPad, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 'consent' && (
          <View style={styles.block}>
            <View style={[styles.iconCircle, { backgroundColor: colors.homeAqua }]}>
              <Feather name="camera" size={28} color={colors.homeCoral} />
            </View>
            <Text style={[styles.title, { color: colors.homeInk }]}>
              {isReplacement ? 'Propose a better photo' : 'We don\u2019t have a photo of this pin yet'}
            </Text>
            {fromCatalogue || isReplacement ? (
              <View testID="current-photo-card" style={[styles.pinCard, { borderColor: colors.homeLine, backgroundColor: colors.homeSurface }]}>
                {existingImageUrl ? (
                  <Image source={{ uri: existingImageUrl }} style={styles.pinCardImage} resizeMode="contain" />
                ) : (
                  <View style={[styles.pinCardImage, styles.pinCardEmpty, { backgroundColor: colors.homeAqua }]}>
                    <Feather name="image" size={20} color={colors.homeMuted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.pinCardLabel, { color: colors.homeMuted }]}>
                    {fromCatalogue ? 'Is this your pin?' : 'Current photo'}
                  </Text>
                  <Text style={[styles.pinCardTitle, { color: colors.homeInk }]} numberOfLines={3}>{title ?? pinId}</Text>
                  <Text style={[styles.pinCardMeta, { color: colors.homeMuted }]} numberOfLines={2}>
                    {[coverage?.setName ?? pin?.collection, coverage?.releaseYear ?? pin?.releaseYear, coverage?.editionType ?? pin?.edition]
                      .filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={[styles.pinCardMeta, { color: colors.homeMuted }]}>{pinId}</Text>
                </View>
              </View>
            ) : title ? (
              <Text style={[styles.pinName, { color: colors.homeMuted }]}>{title}</Text>
            ) : null}

            {scanPhoto && (
              <View testID="scan-photo-card" style={styles.scanPhotoWrap}>
                <Image
                  source={{ uri: scanPhoto.uri }}
                  style={[styles.scanPhoto, { borderColor: colors.homeLine, backgroundColor: colors.homeAqua }]}
                  accessibilityLabel="Your scan photo"
                />
                <Text style={[styles.pinCardMeta, { color: colors.homeMuted }]}>Your scan photo</Text>
              </View>
            )}

            {isReplacement && (
              <View style={styles.reasons}>
                <Text style={[styles.reasonsLabel, { color: colors.homeInk }]}>Why replace the current photo?</Text>
                {REPLACE_REASONS.map(r => {
                  const active = reason === r.value;
                  return (
                    <TouchableOpacity
                      key={r.value}
                      onPress={() => setReason(r.value)}
                      activeOpacity={0.8}
                      style={[styles.reasonRow, { borderColor: active ? colors.homeCoral : colors.homeLine }]}
                    >
                      <Feather name={active ? 'check-circle' : 'circle'} size={18} color={active ? colors.homeCoral : colors.homeMuted} />
                      <Text style={[styles.reasonText, { color: colors.homeInk }]}>{r.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <Text style={[styles.body, { color: colors.homeMuted }]}>
              Take one clean photo — plain background, good light, pin filling the frame —
              and we&apos;ll use it as this pin&apos;s photo everywhere in PinHunt: catalogue
              browsing, set pages, and every collector&apos;s view, not just yours.
            </Text>
            <Text style={[styles.body, { color: colors.homeMuted }]}>
              {isAdmin
                ? 'As an admin, your photo goes to the review queue too, so you can check it against the Pin & Pop image before it goes live. You can choose to publish it straight away on the next step.'
                : isReplacement
                ? 'The current photo stays until a PinHunt moderator reviews yours \u2014 nothing changes unless it\u2019s approved.'
                : 'A PinHunt moderator reviews every photo before it goes live, so it won\u2019t appear anywhere until approved.'}
            </Text>

            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => setConsentChecked(v => !v)}
              activeOpacity={0.8}
            >
              <Switch value={consentChecked} onValueChange={setConsentChecked} />
              <Text style={[styles.consentText, { color: colors.homeInk }]}>
                I took this photo and I agree PinHunt can use it as this pin&apos;s public
                catalogue photo.
              </Text>
            </TouchableOpacity>

            {error && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            )}
            {scanPhoto ? (
              <>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: canStart ? colors.homeCoral : colors.homeAqua }]}
                  onPress={handleUseScanPhoto}
                  disabled={!canStart}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Feather name="check" size={18} color={canStart ? colors.homeHeroText : colors.homeMuted} />
                  <Text style={[styles.primaryBtnLabel, { color: canStart ? colors.homeHeroText : colors.homeMuted }]}>
                    Use this photo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.newPhotoBtn, { borderColor: colors.homeLine }]}
                  onPress={handleTakePhoto}
                  disabled={!canStart}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Feather name="camera" size={16} color={canStart ? colors.homeInk : colors.homeMuted} />
                  <Text style={[styles.secondaryBtnLabel, { color: canStart ? colors.homeInk : colors.homeMuted }]}>
                    Take a new photo
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: canStart ? colors.homeCoral : colors.homeAqua }]}
                onPress={handleTakePhoto}
                disabled={!canStart}
                activeOpacity={0.85}
              >
                <Feather name="camera" size={18} color={canStart ? colors.homeHeroText : colors.homeMuted} />
                <Text style={[styles.primaryBtnLabel, { color: canStart ? colors.homeHeroText : colors.homeMuted }]}>
                  Take Photo
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.skipBtn} onPress={leave} activeOpacity={0.7}>
              <Text style={[styles.skipLabel, { color: colors.homeMuted }]}>
                {fromCatalogue ? 'Not my pin \u2014 go back' : 'Maybe later'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'processing' && (
          <View style={styles.block}>
            <ActivityIndicator size="large" color={colors.homeCoral} />
            <Text style={[styles.title, { color: colors.homeInk }]}>Cleaning up your photo…</Text>
            <Text style={[styles.body, { color: colors.homeMuted }]}>
              We&apos;re removing the background and centring the pin. This takes a few seconds.
            </Text>
          </View>
        )}

        {(step === 'confirm' || step === 'submitting') && preview && (
          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.homeInk }]}>Happy with this?</Text>
            <Image source={{ uri: preview.uri }} style={[styles.preview, { borderColor: colors.homeLine }]} />
            <Text style={[styles.body, { color: colors.homeMuted }]}>
              This is exactly how it will appear in the catalogue. If the pin is cut off,
              blurry or the wrong one, retake it.
            </Text>
            {isAdmin && (
              <TouchableOpacity
                style={styles.consentRow}
                onPress={() => setPublishNow(v => !v)}
                activeOpacity={0.8}
                testID="publish-now-row"
              >
                <Switch value={publishNow} onValueChange={setPublishNow} accessibilityLabel="Publish now, skip review" />
                <Text style={[styles.consentText, { color: colors.homeInk }]}>
                  Publish now (admin). Leave this off to check it in the review queue against the Pin & Pop image first.
                </Text>
              </TouchableOpacity>
            )}
            {error && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            )}
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.homeLine }]}
                onPress={handleTakePhoto}
                disabled={step === 'submitting'}
                activeOpacity={0.85}
              >
                <Feather name="refresh-cw" size={16} color={colors.homeInk} />
                <Text style={[styles.secondaryBtnLabel, { color: colors.homeInk }]}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.homeCoral }]}
                onPress={handleSubmit}
                disabled={step === 'submitting'}
                activeOpacity={0.85}
              >
                {step === 'submitting' ? (
                  <ActivityIndicator size="small" color={colors.homeHeroText} />
                ) : (
                  <Text style={[styles.primaryBtnLabel, { color: colors.homeHeroText }]}>Submit Photo</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.block}>
            <View style={[styles.iconCircle, { backgroundColor: colors.homeAqua }]}>
              <Feather name="check" size={28} color={colors.homeCoral} />
            </View>
            <Text style={[styles.title, { color: colors.homeInk }]}>Thanks!</Text>
            <Text style={[styles.body, { color: colors.homeMuted }]}>
              {published
                ? 'Your photo is now this pin\u2019s catalogue photo.'
                : 'Your photo is being reviewed. We\u2019ll use it as this pin\u2019s catalogue photo once it\u2019s approved.'}
            </Text>
            {nextPin ? (
              <>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.homeCoral }]}
                  onPress={goToNextPin}
                  activeOpacity={0.85}
                >
                  <Feather name="camera" size={18} color={colors.homeHeroText} />
                  <Text style={[styles.primaryBtnLabel, { color: colors.homeHeroText }]}>Next pin that needs a photo</Text>
                </TouchableOpacity>
                <Text style={[styles.pinName, { color: colors.homeMuted }]} numberOfLines={2}>{nextPin.title}</Text>
                <TouchableOpacity style={styles.skipBtn} onPress={leave} activeOpacity={0.7}>
                  <Text style={[styles.skipLabel, { color: colors.homeMuted }]}>Back to the catalogue</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.homeCoral }]}
                onPress={leave}
                activeOpacity={0.85}
              >
                <Text style={[styles.primaryBtnLabel, { color: colors.homeHeroText }]}>
                  {fromCatalogue ? 'Back to the catalogue' : 'Continue'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
      {consentSheet}
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
  preview: { width: '100%', maxWidth: 340, aspectRatio: 1, borderRadius: radius.lg, borderWidth: 1 },
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
  scanPhotoWrap: { alignItems: 'center', gap: 4 },
  scanPhoto: { width: 160, height: 160, borderRadius: radius.lg, borderWidth: 1 },
  newPhotoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, width: '100%', borderWidth: 1, borderRadius: 18, paddingVertical: 13 },
  submitBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 14 },
});
