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
import { useCollection } from '@/context/CollectionContext';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { getPinImageSource } from '@/utils/pinImage';
import type { CataloguePin } from '@workspace/pin-repository';

// ─── API ─────────────────────────────────────────────────────────────────────

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:8080/api';

async function identifyPin(
  imageBase64: string,
  mimeType: string,
): Promise<Array<{ pinId: string; confidence: number; reasoning: string }>> {
  const res = await fetch(`${API_BASE}/scan/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Identification failed');
  }
  const data = await res.json() as { matches: Array<{ pinId: string; confidence: number; reasoning: string }> };
  return data.matches;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'captured' | 'identifying' | 'results' | 'confirmed';

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

function CornerMarker({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isRight = corner === 'tr' || corner === 'br';
  const isBottom = corner === 'bl' || corner === 'br';
  return (
    <View
      style={[
        styles.corner,
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
  const { setStatus, markViewed } = useCollection();
  const { pins, repository } = usePinCatalogue();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<CataloguePin | null>(null);
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
      const rawMatches = await identifyPin(captured.base64, captured.mimeType);

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
  }, [captured, pins, repository]);

  // ── Confirm match ─────────────────────────────────────────────────────────────
  const handleSelectMatch = (match: Match) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedMatch(match.pin);
    setStatus(match.pin.id, 'owned');
    markViewed(match.pin.id);
    setScanState('confirmed');
  };

  const handleReset = () => {
    setScanState('idle');
    setCaptured(null);
    setMatches([]);
    setSelectedMatch(null);
    setErrorMsg(null);
  };

  const confidenceColor = (score: number) => {
    if (score >= 75) return colors.owned;
    if (score >= 50) return colors.wanted;
    return colors.mutedForeground;
  };

  const confidenceLabel = (score: number) => {
    if (score >= 75) return 'Strong match';
    if (score >= 50) return 'Possible match';
    return 'Weak match';
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad, flexGrow: 1 }}
      >
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Find a Pin</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Search by name or scan with your camera
          </Text>
        </View>

        {/* ── Viewfinder ── */}
        <View style={[styles.viewfinderWrap, { marginHorizontal: 16 }]}>
          <Animated.View
            style={[
              styles.viewfinder,
              { backgroundColor: '#0a0a18', borderRadius: colors.radius, opacity: shutterAnim },
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

            {captured && scanState !== 'idle' && scanState !== 'confirmed' && (
              <Image source={{ uri: captured.uri }} style={styles.capturedImage} />
            )}

            {scanState === 'identifying' && (
              <View style={styles.overlay}>
                <View style={[styles.scanLine, { backgroundColor: colors.primary }]} />
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.overlayText}>Analysing with AI…</Text>
              </View>
            )}

            {scanState === 'confirmed' && selectedMatch && (
              <View style={styles.overlay}>
                <View style={[styles.confirmedIcon, { backgroundColor: colors.owned }]}>
                  <Feather name="check" size={32} color="#fff" />
                </View>
                <Text style={styles.overlayText}>Added to Collection!</Text>
              </View>
            )}

            <CornerMarker corner="tl" />
            <CornerMarker corner="tr" />
            <CornerMarker corner="bl" />
            <CornerMarker corner="br" />
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
                style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={handleOpenCamera}
                activeOpacity={0.85}
              >
                <Feather name={Platform.OS === 'web' ? 'image' : 'camera'} size={20} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnLabel, { color: colors.primaryForeground }]}>
                  {Platform.OS === 'web' ? 'Choose Photo' : 'Scan'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.accent, borderRadius: colors.radius }]}
                onPress={() => router.push('/search')}
                activeOpacity={0.85}
              >
                <Feather name="search" size={20} color={colors.accentForeground} />
                <Text style={[styles.primaryBtnLabel, { color: colors.accentForeground }]}>Manually Search</Text>
              </TouchableOpacity>
            </>
          )}

          {scanState === 'captured' && (
            <View style={styles.captureRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card }]}
                onPress={handleOpenCamera}
                activeOpacity={0.85}
              >
                <Feather name="refresh-cw" size={16} color={colors.foreground} />
                <Text style={[styles.secondaryBtnLabel, { color: colors.foreground }]}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.identifyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={handleIdentify}
                activeOpacity={0.85}
              >
                <Feather name="cpu" size={20} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnLabel, { color: colors.primaryForeground }]}>Identify Pin</Text>
              </TouchableOpacity>
            </View>
          )}

          {scanState === 'identifying' && (
            <View style={[styles.loadingRow, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                Searching pin database…
              </Text>
            </View>
          )}

          {scanState === 'confirmed' && selectedMatch && (
            <View style={styles.confirmedBlock}>
              <View style={[styles.confirmedCard, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}>
                <Image source={getPinImageSource(selectedMatch)} style={styles.confirmedCardImage} />
                <View style={styles.confirmedCardInfo}>
                  <Text style={[styles.confirmedCardTitle, { color: colors.foreground }]}>{selectedMatch.title}</Text>
                  <Text style={[styles.confirmedCardBrand, { color: colors.mutedForeground }]}>{selectedMatch.brand}</Text>
                  <Text style={[styles.confirmedStatus, { color: colors.owned }]}>✓ Added to Owned</Text>
                </View>
              </View>
              <View style={styles.confirmedActions}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/pin/[id]', params: { id: selectedMatch.id } })}
                  style={[styles.secondaryBtn, { flex: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryBtnLabel, { color: colors.foreground }]}>View Pin</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleReset}
                  style={[styles.identifyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryBtnLabel, { color: colors.primaryForeground }]}>Scan Another</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Match results ── */}
        {scanState === 'results' && (
          <View style={styles.matchesSection}>
            <Text style={[styles.matchesTitle, { color: colors.foreground }]}>Possible Matches</Text>
            <Text style={[styles.matchesSub, { color: colors.mutedForeground }]}>
              Tap the correct pin to add it to your collection
            </Text>

            {matches.map((match, i) => (
              <TouchableOpacity
                key={match.pin.id}
                onPress={() => handleSelectMatch(match)}
                activeOpacity={0.85}
                style={[
                  styles.matchCard,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <View style={styles.matchRankWrap}>
                  <Text style={[styles.matchRank, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                </View>
                <Image source={getPinImageSource(match.pin)} style={styles.matchImage} />
                <View style={styles.matchInfo}>
                  <Text style={[styles.matchTitle, { color: colors.foreground }]} numberOfLines={2}>
                    {match.pin.title}
                  </Text>
                  <Text style={[styles.matchBrand, { color: colors.mutedForeground }]}>{match.pin.brand}</Text>
                  <Text style={[styles.matchCollection, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {match.pin.collection}
                  </Text>
                  {match.reasoning ? (
                    <Text style={[styles.matchReasoning, { color: colors.mutedForeground }]} numberOfLines={2}>
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
              <Text style={[styles.noneMatchText, { color: colors.mutedForeground }]}>
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
    ...StyleSheet.absoluteFillObject,
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
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#C4933A', borderWidth: 3 },
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
    borderRadius: 10,
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
