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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { getPinImageSource } from '@/utils/pinImage';
import { API_BASE } from '@/lib/apiBase';
import type { CataloguePin } from '@workspace/pin-repository';

/** What the scan understood from the photo (AI description + Google Vision). */
interface ImageInsights {
  characters: string[];
  keywords: string[];
  textOnPin: string | null;
  logos: string[];
  webGuesses: string[];
}

async function identifyPin(
  imageBase64: string,
  mimeType: string,
  accessToken?: string,
): Promise<{
  matches: Array<{ pinId: string; confidence: number; reasoning: string }>;
  imageInsights: ImageInsights | null;
}> {
  const res = await fetch(`${API_BASE}/scan/identify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Identification failed');
  }
  const data = await res.json() as {
    matches: Array<{ pinId: string; confidence: number; reasoning: string }>;
    imageInsights?: ImageInsights;
  };
  return { matches: data.matches, imageInsights: data.imageInsights ?? null };
}

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

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { markViewed } = useCollection();
  const { pins, repository } = usePinCatalogue();
  const { session } = useAuth();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [insights, setInsights] = useState<ImageInsights | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const shutterAnim = useRef(new Animated.Value(1)).current;

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

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

  // ── Open camera ──────────────────────────────────────────────────────────────
  const handleOpenCamera = useCallback(async () => {
    setErrorMsg(null);

    // On web, fall back to image library (camera not available in browser)
    const launcher = Platform.OS === 'web'
      ? ImagePicker.launchImageLibraryAsync
      : ImagePicker.launchCameraAsync;

    // Request permission
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
      quality: 0.7,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Could not read image', 'Please try again.');
      return;
    }

    flashShutter(() => {
      setCaptured({
        uri: asset.uri,
        base64: asset.base64!,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setScanState('captured');
    });
  }, [flashShutter]);

  // ── Identify ─────────────────────────────────────────────────────────────────
  const handleIdentify = useCallback(async () => {
    if (!captured) return;
    setErrorMsg(null);
    setScanState('identifying');

    try {
      const { matches: rawMatches, imageInsights } = await identifyPin(
        captured.base64,
        captured.mimeType,
        session?.access_token,
      );
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

      if (resolved.length === 0) {
        setErrorMsg('No matches found. Try a clearer photo with good lighting.');
        setScanState('captured');
        return;
      }

      setMatches(resolved);
      setScanState('results');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setErrorMsg(msg);
      setScanState('captured');
    }
  }, [captured, pins, repository, session?.access_token]);

  // ── Confirm match ─────────────────────────────────────────────────────────────
  const handleSelectMatch = (match: Match) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    markViewed(match.pin.id);
    router.push({ pathname: '/pin/[id]', params: { id: match.pin.id } });
  };

  const handleReset = () => {
    setScanState('idle');
    setCaptured(null);
    setMatches([]);
    setInsights(null);
    setErrorMsg(null);
  };

  const confidenceColor = (score: number) => {
    if (score >= 75) return colors.owned;
    if (score >= 50) return colors.wanted;
    return colors.homeMuted;
  };

  const confidenceLabel = (score: number) => {
    if (score >= 75) return 'Strong match';
    if (score >= 50) return 'Possible match';
    return 'Weak match';
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad, flexGrow: 1 }}
      >
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.homeInk }]}>Find a Pin</Text>
          <Text style={[styles.headerSub, { color: colors.homeMuted }]}>
            Search by name or scan with your camera
          </Text>
        </View>

        {/* ── Viewfinder ── */}
        <View style={[styles.viewfinderWrap, { marginHorizontal: 16 }]}>
          <Animated.View
            style={[
              styles.viewfinder,
              { backgroundColor: '#0a0a18', borderRadius: 18, opacity: shutterAnim },
            ]}
          >
            {scanState === 'idle' && (
              <View style={styles.viewfinderPlaceholder}>
                <Feather name="camera" size={48} color="rgba(255,255,255,0.25)" />
                <Text style={styles.viewfinderHint}>Point camera at your pin</Text>
                <Text style={styles.viewfinderHintSub}>
                  {Platform.OS === 'web' ? 'Select a photo from your library' : 'Works best in good light on a plain background'}
                </Text>
              </View>
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

            <CornerMarker corner="tl" color={colors.homeSand} />
            <CornerMarker corner="tr" color={colors.homeSand} />
            <CornerMarker corner="bl" color={colors.homeSand} />
            <CornerMarker corner="br" color={colors.homeSand} />
          </Animated.View>
        </View>

        {/* ── Error banner ── */}
        {errorMsg && (
          <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '40' }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMsg}</Text>
          </View>
        )}

        {/* ── Controls ── */}
        <View style={styles.controls}>
          {scanState === 'idle' && (
            <>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.homeCoral, borderRadius: 18 }]}
                onPress={handleOpenCamera}
                activeOpacity={0.85}
              >
                <Feather name={Platform.OS === 'web' ? 'image' : 'camera'} size={20} color={colors.homeSurface} />
                <Text style={[styles.primaryBtnLabel, { color: colors.homeSurface }]}>
                  {Platform.OS === 'web' ? 'Choose Photo' : 'Scan'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.homeTeal, borderRadius: 18 }]}
                onPress={() => router.push('/search')}
                activeOpacity={0.85}
              >
                <Feather name="search" size={20} color={colors.homeSurface} />
                <Text style={[styles.primaryBtnLabel, { color: colors.homeSurface }]}>Manually Search</Text>
              </TouchableOpacity>
            </>
          )}

          {scanState === 'captured' && (
            <View style={styles.captureRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.homeLine, borderRadius: 18, backgroundColor: colors.homeSurface }]}
                onPress={handleOpenCamera}
                activeOpacity={0.85}
              >
                <Feather name="refresh-cw" size={16} color={colors.homeInk} />
                <Text style={[styles.secondaryBtnLabel, { color: colors.homeInk }]}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.identifyBtn, { backgroundColor: colors.homeCoral, borderRadius: 18 }]}
                onPress={handleIdentify}
                activeOpacity={0.85}
              >
                <Feather name="cpu" size={20} color={colors.homeSurface} />
                <Text style={[styles.primaryBtnLabel, { color: colors.homeSurface }]}>Identify Pin</Text>
              </TouchableOpacity>
            </View>
          )}

          {scanState === 'identifying' && (
            <View style={[styles.loadingRow, { backgroundColor: colors.homeSurface, borderRadius: 18, borderColor: colors.homeLine }]}>
              <ActivityIndicator color={colors.homeCoral} />
              <Text style={[styles.loadingText, { color: colors.homeMuted }]}>
                Searching pin database…
              </Text>
            </View>
          )}

        </View>

        {/* ── Match results ── */}
        {scanState === 'results' && (
          <View style={styles.matchesSection}>
            {/* ── What the scan understood from the photo ── */}
            {insights &&
              (insights.textOnPin ||
                insights.characters.length > 0 ||
                insights.keywords.length > 0 ||
                insights.logos.length > 0 ||
                insights.webGuesses.length > 0) && (
              <View
                style={[
                  styles.insightsCard,
                  { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: 18 },
                ]}
              >
                <View style={styles.insightsHeader}>
                  <Feather name="eye" size={14} color={colors.homeCoral} />
                  <Text style={[styles.insightsTitle, { color: colors.homeInk }]}>
                    What we saw in your photo
                  </Text>
                </View>
                {insights.textOnPin ? (
                  <View style={styles.insightRow}>
                    <Text style={[styles.insightLabel, { color: colors.homeMuted }]}>Text on pin</Text>
                    <Text style={[styles.insightValue, { color: colors.homeInk }]} numberOfLines={3}>
                      “{insights.textOnPin}”
                    </Text>
                  </View>
                ) : null}
                {insights.characters.length > 0 && (
                  <View style={styles.insightRow}>
                    <Text style={[styles.insightLabel, { color: colors.homeMuted }]}>Characters</Text>
                    <Text style={[styles.insightValue, { color: colors.homeInk }]}>
                      {insights.characters.join(', ')}
                    </Text>
                  </View>
                )}
                {insights.logos.length > 0 && (
                  <View style={styles.insightRow}>
                    <Text style={[styles.insightLabel, { color: colors.homeMuted }]}>Logos</Text>
                    <Text style={[styles.insightValue, { color: colors.homeInk }]}>
                      {insights.logos.join(', ')}
                    </Text>
                  </View>
                )}
                {insights.keywords.length > 0 && (
                  <View style={styles.insightRow}>
                    <Text style={[styles.insightLabel, { color: colors.homeMuted }]}>Looks like</Text>
                    <Text style={[styles.insightValue, { color: colors.homeInk }]} numberOfLines={2}>
                      {insights.keywords.join(', ')}
                    </Text>
                  </View>
                )}
                {insights.webGuesses.length > 0 && (
                  <View style={styles.insightRow}>
                    <Text style={[styles.insightLabel, { color: colors.homeMuted }]}>Web matches</Text>
                    <Text style={[styles.insightValue, { color: colors.homeInk }]} numberOfLines={2}>
                      {insights.webGuesses.join(', ')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <Text style={[styles.matchesTitle, { color: colors.homeInk }]}>Possible Matches</Text>
            <Text style={[styles.matchesSub, { color: colors.homeMuted }]}>
              Tap the correct pin to see its details and value
            </Text>

            {matches.map((match, i) => (
              <TouchableOpacity
                key={`${match.pin.id}-${i}`}
                onPress={() => handleSelectMatch(match)}
                activeOpacity={0.85}
                style={[
                  styles.matchCard,
                  { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: 18 },
                ]}
              >
                <View style={styles.matchRankWrap}>
                  <Text style={[styles.matchRank, { color: colors.homeMuted }]}>#{i + 1}</Text>
                </View>
                <Image source={getPinImageSource(match.pin)} style={styles.matchImage} />
                <View style={styles.matchInfo}>
                  <Text style={[styles.matchTitle, { color: colors.homeInk }]} numberOfLines={2}>
                    {match.pin.title}
                  </Text>
                  <Text style={[styles.matchBrand, { color: colors.homeMuted }]}>{match.pin.brand}</Text>
                  <Text style={[styles.matchCollection, { color: colors.homeMuted }]} numberOfLines={1}>
                    {match.pin.collection}
                  </Text>
                  {match.reasoning ? (
                    <Text style={[styles.matchReasoning, { color: colors.homeMuted }]} numberOfLines={2}>
                      {match.reasoning}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.confidenceWrap}>
                  <Text style={[styles.confidenceScore, { color: confidenceColor(match.confidence) }]}>
                    {match.confidence}%
                  </Text>
                  <Text style={[styles.confidenceLabel, { color: confidenceColor(match.confidence) }]}>
                    {confidenceLabel(match.confidence)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity onPress={handleReset} style={styles.noneMatch} activeOpacity={0.7}>
              <Text style={[styles.noneMatchText, { color: colors.homeMuted }]}>
                None of these — try again
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { paddingHorizontal: 16, marginBottom: 12 },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  // Search
  // Or divider
  // Viewfinder
  viewfinderWrap: { marginBottom: 16 },
  viewfinder: {
    height: 300,
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
  // Controls
  controls: { paddingHorizontal: 16, gap: 12 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  primaryBtnLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  captureRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 8,
    borderWidth: 1,
  },
  secondaryBtnLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  identifyBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
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
  // Insights ("what we saw")
  insightsCard: { borderWidth: 1, padding: 12, gap: 8, marginBottom: 4 },
  insightsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insightsTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  insightRow: { flexDirection: 'row', gap: 8 },
  insightLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', width: 82 },
  insightValue: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  // Matches
  matchesSection: { marginTop: 20, paddingHorizontal: 16, gap: 10 },
  matchesTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  matchesSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    overflow: 'hidden',
  },
  matchRankWrap: { width: 32, alignItems: 'center', paddingTop: 14 },
  matchRank: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  matchImage: { width: 72, height: 72, resizeMode: 'cover', alignSelf: 'center' },
  matchInfo: { flex: 1, padding: 10, gap: 2 },
  matchTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 17 },
  matchBrand: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  matchCollection: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  matchReasoning: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 15 },
  confidenceWrap: { paddingRight: 12, paddingTop: 10, alignItems: 'center', minWidth: 68 },
  confidenceScore: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  confidenceLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', textAlign: 'center', marginTop: 2 },
  noneMatch: { alignItems: 'center', paddingVertical: 14 },
  noneMatchText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  // Tips
});
