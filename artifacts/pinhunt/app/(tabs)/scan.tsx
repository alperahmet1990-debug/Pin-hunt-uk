import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { identifyPin, type ImageInsights } from '@/utils/identifyPin';
import { prepareScanPhoto, type ScanPhoto } from '@/utils/scanPhoto';
import {
  RETAKE_TIPS,
  RETAKE_TIPS_KEY,
  RETAKE_TIPS_LIMIT,
  recoveryQuery,
  sharedCandidateCharacters, sharedCandidateSet,
} from '@/utils/scanRecovery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CataloguePin } from '@workspace/pin-repository';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { ScanResult } from '@/components/scan/ScanResult';
import { ScanCamera, type ScanCameraPhoto } from '@/components/scan/ScanCamera';
import { useMyAccess } from '@/hooks/useMyAccess';
import { ErrorState } from '@/components/ui/ErrorState';
import { toUserError, type UserError } from '@/utils/userError';
import { tabScreenBottomPad } from '@/utils/tabBarSpace';

/** Live camera on the Find tab (UX-009, #117); web keeps the photo picker. */
const LIVE_CAMERA = Platform.OS !== 'web';

// ─── Types ───────────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'captured' | 'identifying' | 'results';

interface CapturedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

interface Match {
  pin: CataloguePin;
  confidence: number;
  reasoning: string;
}

// ─── Corner marker ────────────────────────────────────────────────────────────

function CornerMarker({ corner, color }: { corner: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const isRight = corner === 'tr' || corner === 'br';
  const isBottom = corner === 'bl' || corner === 'br';
  return (
    <View
      style={[
        styles.corner,
        { borderColor: color },
        isRight ? styles.cornerRight : styles.cornerLeft,
        isBottom ? styles.cornerBottom : styles.cornerTop,
      ]}
    />
  );
}

// ─── Recovery option row ─────────────────────────────────────────────────────

function RecoveryOption({ icon, label, detail, onPress, colors }: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  detail?: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      style={[styles.recoveryOption, { borderTopColor: colors.homeLine }]}
    >
      <Feather name={icon} size={18} color={colors.homeCoral} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.recoveryLabel, { color: colors.homeInk }]}>{label}</Text>
        {detail ? (
          <Text style={[styles.recoveryDetail, { color: colors.homeMuted }]} numberOfLines={1}>{detail}</Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={16} color={colors.homeMuted} />
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { markViewed } = useCollection();
  const { pins, repository } = usePinCatalogue();
  const { session } = useAuth();
  const access = useMyAccess();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [insights, setInsights] = useState<ImageInsights | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // A failed identify (offline, timeout, server…) in plain words (UX-046).
  const [failure, setFailure] = useState<UserError | null>(null);
  const [noMatchFound, setNoMatchFound] = useState(false);
  // "None of these" keeps the photo and offers ways forward instead of resetting.
  const [showRecovery, setShowRecovery] = useState(false);
  const [showRetakeTips, setShowRetakeTips] = useState(false);
  // "That's it" adds the pin in place (UX-005); a new scan starts a fresh result.
  const [quickAddPin, setQuickAddPin] = useState<CataloguePin | null>(null);
  // "Scan next" (UX-061, #264): pins added from this visit to the scan
  // screen, and which result the latest add came from.
  const [sessionAdded, setSessionAdded] = useState<string[]>([]);
  const [addedOnResult, setAddedOnResult] = useState<number | null>(null);
  // The live camera only runs while this tab is on screen.
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => {
      setFocused(false);
      // Leaving the scan screen ends the session.
      setSessionAdded([]);
      setAddedOnResult(null);
    };
  }, []));
  const scrollRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();
  // Square live preview, as wide as the screen allows (capped for tall phones).
  const viewfinderHeight = LIVE_CAMERA ? Math.min(screenWidth - 32, 420) : 300;
  const [resultKey, setResultKey] = useState(0);
  const shutterAnim = useRef(new Animated.Value(1)).current;
  // Each identification run has an id; a cancelled or superseded run's
  // result is ignored when it arrives (UX-008a).
  const identifyRun = useRef(0);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  // Clears the floating web tab bar (#260).
  const botPad = tabScreenBottomPad(insets.bottom + 80);

  const flashShutter = useCallback(
    (cb?: () => void) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.sequence([
        Animated.timing(shutterAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
        Animated.timing(shutterAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start(() => cb?.());
    },
    [shutterAnim],
  );

  // ── Shared: accept a picked/captured asset ───────────────────────────────────
  async function handlePickerResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets?.[0]) return;
    await handleAsset(result.assets[0]);
  }

  /** A photo from the picker or the live camera (already cropped to its frame). */
  async function handleAsset(asset: ScanCameraPhoto) {
    // Identify straight away, no separate tap (UX-008a). The photo shows
    // with the progress overlay while it is shrunk and sent.
    const run = ++identifyRun.current;
    flashShutter();
    clearResult();
    setCaptured({ uri: asset.uri, base64: '', mimeType: 'image/jpeg' });
    setScanState('identifying');

    // Shrink before upload (UX-050): the preview keeps the original photo.
    let photo: ScanPhoto;
    try {
      photo = await prepareScanPhoto(asset.uri, asset.width, asset.height);
    } catch (err) {
      if (run !== identifyRun.current) return;
      toUserError(err, 'scan-photo');
      setCaptured(null);
      setScanState('idle');
      Alert.alert('Could not read image', 'Please try again.');
      return;
    }
    if (run !== identifyRun.current) return;

    const image: CapturedImage = { uri: asset.uri, base64: photo.base64, mimeType: photo.mimeType };
    setCaptured(image);
    runIdentify(image, run);
  }

  // ── Scan Pin (camera) — falls back to the photo library on web, where no
  // camera is available. ──────────────────────────────────────────────────────
  async function handleScanPin() {
    setErrorMsg(null);
    setFailure(null);

    // With the live camera, scanning again means back to the preview.
    if (LIVE_CAMERA) {
      identifyRun.current += 1;
      clearResult();
      setCaptured(null);
      setMatches([]);
      setScanState('idle');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const launcher = Platform.OS === 'web'
      ? ImagePicker.launchImageLibraryAsync
      : ImagePicker.launchCameraAsync;

    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera access needed',
          'Please allow camera access in Settings so PinHunt can scan your pins.',
        );
        return;
      }
    }

    const result = await launcher({
      mediaTypes: 'images',
      // Full quality here: prepareScanPhoto does the one lossy re-encode.
      quality: 1,
      allowsEditing: true,
      aspect: [1, 1],
    });

    await handlePickerResult(result);
  }

  // ── Choose Photo (library) ───────────────────────────────────────────────────
  async function handleChoosePhoto() {
    setErrorMsg(null);
    setFailure(null);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      // Full quality here: prepareScanPhoto does the one lossy re-encode.
      quality: 1,
      allowsEditing: true,
      aspect: [1, 1],
    });

    await handlePickerResult(result);
  }

  // ── Identify ─────────────────────────────────────────────────────────────────
  function clearResult() {
    setErrorMsg(null);
    setFailure(null);
    setNoMatchFound(false);
    setShowRecovery(false);
  }

  async function runIdentify(image: CapturedImage, run = ++identifyRun.current) {
    clearResult();
    setScanState('identifying');

    try {
      const { matches: rawMatches, imageInsights } = await identifyPin(
        image.base64,
        image.mimeType,
        session?.access_token,
      );
      if (run !== identifyRun.current) return;
      setInsights(imageInsights);

      // The cached list only holds part of the catalogue — fetch any matched
      // pin that isn't cached directly from the repository.
      const resolved: Match[] = (
        await Promise.all(
          rawMatches.map(async m => {
            let pin = pins.find(p => p.id === m.pinId) ?? null;
            if (!pin && repository) {
              try {
                pin = await repository.getPinById(m.pinId);
              } catch {
                pin = null;
              }
            }
            if (!pin) return null;
            return { pin, confidence: m.confidence, reasoning: m.reasoning };
          }),
        )
      ).filter(Boolean) as Match[];
      if (run !== identifyRun.current) return;

      if (resolved.length === 0) {
        setErrorMsg('No matches found in our catalogue. Try a clearer photo, or add this pin yourself.');
        setNoMatchFound(true);
        setScanState('captured');
        return;
      }

      setMatches(resolved);
      setResultKey(k => k + 1);
      setScanState('results');
    } catch (err) {
      if (run !== identifyRun.current) return;
      setFailure(toUserError(err, 'scan'));
      setScanState('captured');
    }
  }

  /** Identify the current photo again (after Cancel, or Try again). */
  const handleIdentify = () => {
    if (captured?.base64) runIdentify(captured);
  };

  /** Stop waiting for this identification; the photo is kept if it's ready. */
  const cancelIdentify = () => {
    identifyRun.current += 1;
    if (captured?.base64) {
      setScanState('captured');
    } else {
      setCaptured(null);
      setScanState('idle');
    }
  };

  const retakeWhileIdentifying = () => {
    cancelIdentify();
    handleScanPin();
  };

  // ── Confirm match: "That's it" adds the pin without leaving the scan ─────────
  const handleConfirm = (pin: CataloguePin) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markViewed(pin.id);
    setQuickAddPin(pin);
  };

  // A pin without a catalogue photo opens Pin detail like any other: a scan
  // never routes collectors into the photo-contribution flow.
  const handleOpenPin = (pin: CataloguePin) => {
    markViewed(pin.id);
    router.push({ pathname: '/pin/[id]', params: { id: pin.id } });
  };

  const handleReset = () => {
    setScanState('idle');
    setCaptured(null);
    setMatches([]);
    setInsights(null);
    setErrorMsg(null);
    setFailure(null);
    setNoMatchFound(false);
    setShowRecovery(false);
  };

  // ── "None of these": recovery that keeps the photo ───────────────────────────
  const openRecovery = async () => {
    setShowRecovery(true);
    try {
      const seen = Number(await AsyncStorage.getItem(RETAKE_TIPS_KEY)) || 0;
      setShowRetakeTips(seen < RETAKE_TIPS_LIMIT);
      if (seen < RETAKE_TIPS_LIMIT) await AsyncStorage.setItem(RETAKE_TIPS_KEY, String(seen + 1));
    } catch {
      setShowRetakeTips(false);
    }
  };

  const searchFromScan = () => {
    const q = recoveryQuery(insights);
    router.push(q ? { pathname: '/search', params: { q } } : '/search');
  };

  const recoverySet = sharedCandidateSet(matches.map(m => m.pin.collection));

  // ── Hand off to Add Pin ───────────────────────────────────────────────────────
  // Carries the already-captured photo forward, plus any characters the AI
  // scan recognised, so the user doesn't have to start from scratch. The
  // text, logo and shared set it saw go as tap-to-use hints (UX-011).
  const handleAddPinInstead = () => {
    if (!captured) return;
    router.push({
      pathname: '/add-pin',
      params: {
        frontUri: captured.uri,
        characters: (insights?.characters.length
          ? insights.characters
          : sharedCandidateCharacters(matches.map(m => m.pin.characters))).join(', '),
        nameHint: insights?.textOnPin ?? '',
        brandHint: insights?.logos[0] ?? '',
        setHint: recoverySet ?? '',
      },
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad, flexGrow: 1 }}
      >
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.homeInk }]}>Find a Pin</Text>
          <Text style={[styles.headerSub, { color: colors.homeMuted }]}>
            Scan, upload or search for a pin
          </Text>
        </View>

        {/* ── Viewfinder (hidden once there's a result: the comparison shows the photo) ── */}
        {scanState !== 'results' && (
        <View style={[styles.viewfinderWrap, { marginHorizontal: 16 }]}>
          <Animated.View
            style={[
              styles.viewfinder,
              { height: viewfinderHeight, backgroundColor: '#0a0a18', borderRadius: 18, opacity: shutterAnim },
            ]}
          >
            {scanState === 'idle' && LIVE_CAMERA && (
              <ScanCamera
                active={focused && scanState === 'idle'}
                onCapture={photo => { void handleAsset(photo); }}
                onError={() => Alert.alert('Could not take the photo', 'Please try again, or choose a photo.')}
              />
            )}

            {scanState === 'idle' && !LIVE_CAMERA && (
              <TouchableOpacity
                style={styles.viewfinderPlaceholder}
                onPress={handleScanPin}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Scan a pin with the camera"
              >
                <Feather name="camera" size={48} color="rgba(255,255,255,0.25)" />
                <Text style={styles.viewfinderHint}>Point camera at your pin</Text>
                <Text style={styles.viewfinderHintSub}>
                  {Platform.OS === 'web' ? 'Select a photo from your library' : 'Works best in good light on a plain background'}
                </Text>
              </TouchableOpacity>
            )}

            {captured && scanState !== 'idle' && (
              <Image source={{ uri: captured.uri }} style={styles.capturedImage} />
            )}

            {scanState === 'identifying' && (
              <View style={styles.overlay}>
                <View style={[styles.scanLine, { backgroundColor: colors.homeCoral }]} />
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.overlayText}>Analysing with AI…</Text>
              </View>
            )}

            {!(LIVE_CAMERA && scanState === 'idle') && (
              <>
                <CornerMarker corner="tl" color={colors.homeSand} />
                <CornerMarker corner="tr" color={colors.homeSand} />
                <CornerMarker corner="bl" color={colors.homeSand} />
                <CornerMarker corner="br" color={colors.homeSand} />
              </>
            )}
          </Animated.View>
        </View>
        )}

        {/* ── Error banner ── */}
        {errorMsg && (
          <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '40' }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMsg}</Text>
          </View>
        )}

        {/* ── A failed identify: plain words, Try again + Search instead ── */}
        {failure && scanState === 'captured' && (
          <ErrorState
            compact
            error={failure}
            onRetry={handleIdentify}
            secondary={{ label: 'Search instead', icon: 'search', onPress: searchFromScan }}
            style={styles.failure}
          />
        )}

        {/* ── No match: Search instead ── */}
        {errorMsg && noMatchFound && scanState === 'captured' && (
          <View style={styles.errorActions}>
            <Button label="Search instead" icon="search" size="compact" variant="secondary" onPress={searchFromScan} style={styles.errorActionBtn} />
          </View>
        )}

        {/* ── Not in our catalogue? Offer to add it ── */}
        {noMatchFound && (
          <Button
            label="Can't find it? Add this pin yourself"
            icon="plus-circle"
            variant="secondary"
            onPress={handleAddPinInstead}
            style={styles.addPinCta}
          />
        )}

        {/* ── Controls ── */}
        <View style={styles.controls}>
          {scanState === 'idle' && (
            <>
              {/* With the live camera, its shutter is the scan button. */}
              {!LIVE_CAMERA && <Button label="Scan Pin" icon="camera" onPress={handleScanPin} />}
              <Button label="Choose Photo" icon="image" variant="secondary" onPress={handleChoosePhoto} />
              <Button label="Manually Search" icon="search" variant="text" fullWidth onPress={() => router.push('/search')} />
            </>
          )}

          {scanState === 'captured' && (
            <View style={styles.captureRow}>
              <Button label="Retake" icon="refresh-cw" variant="secondary" onPress={handleScanPin} style={styles.retakeBtn} />
              <Button label="Identify Pin" icon="cpu" onPress={handleIdentify} style={styles.identifyBtn} />
            </View>
          )}

          {/* The photo's overlay shows progress; Retake or stop at any point (UX-008a). */}
          {scanState === 'identifying' && (
            <View style={styles.captureRow}>
              <Button label="Retake" icon="refresh-cw" variant="secondary" onPress={retakeWhileIdentifying} style={styles.halfBtn} />
              <Button label="Cancel" icon="x" variant="secondary" onPress={cancelIdentify} style={styles.halfBtn} />
            </View>
          )}

        </View>

        {/* ── Match results ── */}
        {scanState === 'results' && (
          <View style={styles.matchesSection}>
            {captured && (
              <ScanResult
                key={resultKey}
                photoUri={captured.uri}
                candidates={matches}
                insights={insights}
                showDetails={access.isAdmin || access.isAppCreator}
                onConfirm={handleConfirm}
                onOpenPin={handleOpenPin}
                onNoneOfThese={openRecovery}
                recoveryOpen={showRecovery}
              />
            )}
            {addedOnResult === resultKey ? (
              // Sorting a pile of pins: the next scan is one tap (UX-061).
              <View style={styles.scanNext}>
                <Button label="Scan next pin" icon="camera" fullWidth onPress={handleScanPin} />
                <Text accessibilityLiveRegion="polite" style={[styles.scanNextCount, { color: colors.homeMuted }]}>
                  {sessionAdded.length} {sessionAdded.length === 1 ? 'pin' : 'pins'} added this session
                </Text>
              </View>
            ) : (
              <Button label="Scan another pin" icon="camera" variant="text" fullWidth onPress={handleScanPin} />
            )}

            {showRecovery && (
              <View
                style={[styles.recoveryCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                accessibilityLabel="Not the right pin? Options"
              >
                <Text style={[styles.recoveryTitle, { color: colors.homeInk }]}>Not the right pin?</Text>
                <Text style={[styles.recoverySub, { color: colors.homeMuted }]}>Your photo is kept. Try one of these:</Text>

                <RecoveryOption
                  icon="search"
                  label="Search the catalogue"
                  detail={recoveryQuery(insights) ? `for “${recoveryQuery(insights)}”` : undefined}
                  onPress={searchFromScan}
                  colors={colors}
                />
                {recoverySet && (
                  <RecoveryOption
                    icon="grid"
                    label="Browse this set"
                    detail={recoverySet}
                    onPress={() => router.push({ pathname: '/set/[collection]', params: { collection: recoverySet } })}
                    colors={colors}
                  />
                )}
                <RecoveryOption
                  icon="camera"
                  label="Retake the photo"
                  onPress={handleScanPin}
                  colors={colors}
                />
                {showRetakeTips && (
                  <View style={styles.tips} accessibilityLabel={`Tips: ${RETAKE_TIPS.join(', ')}`}>
                    {RETAKE_TIPS.map(tip => (
                      <View key={tip} style={styles.tipRow}>
                        <Feather name="check" size={12} color={colors.homeMuted} />
                        <Text style={[styles.tipText, { color: colors.homeMuted }]}>{tip}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <RecoveryOption
                  icon="plus-circle"
                  label="Suggest this pin"
                  detail="Add it to the catalogue with your photo"
                  onPress={handleAddPinInstead}
                  colors={colors}
                />
              </View>
            )}
          </View>
        )}

      </ScrollView>

      <QuickAddSheet
        pin={quickAddPin}
        onClose={() => setQuickAddPin(null)}
        onAdded={pinId => {
          setSessionAdded(prev => (prev.includes(pinId) ? prev : [...prev, pinId]));
          setAddedOnResult(resultKey);
        }}
      />

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scanNext: { gap: 6, marginTop: 4, marginHorizontal: 16 },
  scanNextCount: { fontSize: 12.5, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  root: { flex: 1 },
  headerRow: { paddingHorizontal: 16, marginBottom: 12 },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  // Search
  // Or divider
  // Viewfinder
  viewfinderWrap: { marginBottom: 16 },
  viewfinder: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  viewfinderPlaceholder: { alignItems: 'center', gap: 10, paddingHorizontal: 32 },
  viewfinderHint: { color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter_500Medium', fontSize: 15 },
  viewfinderHintSub: { color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center' },
  capturedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  overlayText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  scanLine: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    height: 2,
    opacity: 0.7,
    borderRadius: 1,
  },
  confirmedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Corner markers
  corner: { position: 'absolute', width: 24, height: 24, borderWidth: 3 },
  cornerTop: { top: 12, borderBottomWidth: 0 },
  cornerBottom: { bottom: 12, borderTopWidth: 0 },
  cornerLeft: { left: 12, borderRightWidth: 0 },
  cornerRight: { right: 12, borderLeftWidth: 0 },
  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  errorActions: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 12 },
  errorActionBtn: { flex: 1 },
  addPinCta: { marginHorizontal: 16, marginBottom: 12 },
  failure: { marginHorizontal: 16, marginBottom: 12 },
  // Controls
  controls: { paddingHorizontal: 16, gap: 12 },
  captureRow: { flexDirection: 'row', gap: 12 },
  // Retake keeps its natural width so its label never wraps at 320 pt;
  // Identify Pin takes the rest (UX-058, #261).
  retakeBtn: { flexShrink: 0 },
  identifyBtn: { flex: 1 },
  halfBtn: { flex: 1 },

  // Confirmed
  confirmedBlock: { gap: 12 },
  confirmedCard: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
  },
  confirmedCardImage: { width: 80, height: 80, resizeMode: 'cover' },
  confirmedCardInfo: { flex: 1, padding: 12, gap: 4 },
  confirmedCardTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  confirmedCardBrand: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  confirmedStatus: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  confirmedActions: { flexDirection: 'row', gap: 12 },
  boardsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    paddingVertical: 12,
    marginBottom: 12,
  },
  boardsBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  // Matches
  matchesSection: { marginTop: 4, gap: 10 },
  recoveryCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingTop: 14, marginTop: 4, marginBottom: 12, marginHorizontal: 16 },
  recoveryTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  recoverySub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2, marginBottom: 8 },
  recoveryOption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  recoveryLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  recoveryDetail: { fontSize: 12.5, fontFamily: 'Inter_400Regular', marginTop: 1 },
  tips: { paddingLeft: 30, paddingBottom: 8, gap: 4 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipText: { fontSize: 12.5, fontFamily: 'Inter_400Regular' },
  // Tips
});
