import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { PINS } from '@/mock-data/pins';
import type { Pin } from '@/types/pin';

type ScanState = 'idle' | 'front-captured' | 'identifying' | 'results' | 'confirmed';

interface Match {
  pin: Pin;
  confidence: number;
}

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

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setStatus, markViewed } = useCollection();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [capturedPin, setCapturedPin] = useState<Pin | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Pin | null>(null);
  const shutterAnim = useRef(new Animated.Value(1)).current;

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  const simulateShutter = useCallback((cb: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(shutterAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(shutterAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start(cb);
  }, [shutterAnim]);

  const handleCaptureFront = () => {
    simulateShutter(() => {
      // Pick a random pin to "show" in the viewfinder
      const randomPin = PINS[Math.floor(Math.random() * PINS.length)];
      setCapturedPin(randomPin);
      setScanState('front-captured');
    });
  };

  const handleIdentify = () => {
    setScanState('identifying');
    setTimeout(() => {
      // Generate 3 plausible matches from PINS
      const shuffled = [...PINS].sort(() => Math.random() - 0.5);
      const top3 = shuffled.slice(0, 3);
      const confidences = [94, 78, 61].sort(() => Math.random() - 0.5).sort((a, b) => b - a);
      setMatches(top3.map((p, i) => ({ pin: p, confidence: confidences[i] })));
      setScanState('results');
    }, 2200);
  };

  const handleSelectMatch = (match: Match) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedMatch(match.pin);
    setStatus(match.pin.id, 'owned');
    markViewed(match.pin.id);
    setScanState('confirmed');
  };

  const handleReset = () => {
    setScanState('idle');
    setCapturedPin(null);
    setMatches([]);
    setSelectedMatch(null);
  };

  const confidenceColor = (score: number) => {
    if (score >= 85) return colors.owned;
    if (score >= 70) return colors.wanted;
    return colors.mutedForeground;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad, flexGrow: 1 }}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Scan Pin</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Prototype recognition — sample matches only</Text>
          </View>
        </View>

        {/* Viewfinder */}
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
              </View>
            )}
            {(scanState === 'front-captured' || scanState === 'identifying' || scanState === 'results') && capturedPin && (
              <Image source={capturedPin.image} style={styles.capturedImage} />
            )}
            {scanState === 'identifying' && (
              <View style={styles.identifyingOverlay}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.identifyingText}>Analysing pin…</Text>
              </View>
            )}
            {scanState === 'confirmed' && selectedMatch && (
              <View style={styles.confirmedOverlay}>
                <View style={[styles.confirmedIcon, { backgroundColor: colors.owned }]}>
                  <Feather name="check" size={32} color="#fff" />
                </View>
                <Text style={styles.confirmedText}>Added to Collection!</Text>
              </View>
            )}
            {/* Corner markers */}
            <CornerMarker corner="tl" />
            <CornerMarker corner="tr" />
            <CornerMarker corner="bl" />
            <CornerMarker corner="br" />
          </Animated.View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {scanState === 'idle' && (
            <TouchableOpacity
              style={[styles.captureBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              onPress={handleCaptureFront}
              activeOpacity={0.85}
            >
              <Feather name="camera" size={20} color={colors.primaryForeground} />
              <Text style={[styles.captureBtnLabel, { color: colors.primaryForeground }]}>Capture Front</Text>
            </TouchableOpacity>
          )}

          {scanState === 'front-captured' && (
            <View style={styles.captureRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card }]}
                onPress={() => simulateShutter(() => {})}
                activeOpacity={0.85}
              >
                <Feather name="refresh-cw" size={16} color={colors.foreground} />
                <Text style={[styles.secondaryBtnLabel, { color: colors.foreground }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.identifyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                onPress={handleIdentify}
                activeOpacity={0.85}
              >
                <Feather name="search" size={20} color={colors.primaryForeground} />
                <Text style={[styles.captureBtnLabel, { color: colors.primaryForeground }]}>Identify Pin</Text>
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
                <Image source={selectedMatch.image} style={styles.confirmedCardImage} />
                <View style={styles.confirmedCardInfo}>
                  <Text style={[styles.confirmedCardTitle, { color: colors.foreground }]}>{selectedMatch.title}</Text>
                  <Text style={[styles.confirmedCardBrand, { color: colors.mutedForeground }]}>{selectedMatch.brand}</Text>
                  <Text style={[styles.confirmedStatus, { color: colors.owned }]}>Added to Owned</Text>
                </View>
              </View>
              <View style={styles.confirmedActions}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/pin/[id]', params: { id: selectedMatch.id } })}
                  style={[styles.viewBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.viewBtnLabel, { color: colors.foreground }]}>View Pin</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleReset}
                  style={[styles.identifyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.captureBtnLabel, { color: colors.primaryForeground }]}>Scan Another</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Match Results */}
        {scanState === 'results' && (
          <View style={styles.matchesSection}>
            <Text style={[styles.matchesTitle, { color: colors.foreground }]}>Possible Matches</Text>
            <Text style={[styles.matchesSub, { color: colors.mutedForeground }]}>Select the correct pin to add to your collection</Text>
            {matches.map((match, i) => (
              <TouchableOpacity
                key={match.pin.id}
                onPress={() => handleSelectMatch(match)}
                activeOpacity={0.85}
                style={[styles.matchCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <View style={styles.matchRankWrap}>
                  <Text style={[styles.matchRank, { color: colors.mutedForeground }]}>#{i + 1}</Text>
                </View>
                <Image source={match.pin.image} style={styles.matchImage} />
                <View style={styles.matchInfo}>
                  <Text style={[styles.matchTitle, { color: colors.foreground }]} numberOfLines={2}>{match.pin.title}</Text>
                  <Text style={[styles.matchBrand, { color: colors.mutedForeground }]}>{match.pin.brand}</Text>
                  <Text style={[styles.matchCollection, { color: colors.mutedForeground }]}>{match.pin.collection}</Text>
                </View>
                <View style={styles.confidenceWrap}>
                  <Text style={[styles.confidenceScore, { color: confidenceColor(match.confidence) }]}>
                    {match.confidence}%
                  </Text>
                  <Text style={[styles.confidenceLabel, { color: colors.mutedForeground }]}>match</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={handleReset} style={styles.noneMatch} activeOpacity={0.7}>
              <Text style={[styles.noneMatchText, { color: colors.mutedForeground }]}>None of these — try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  viewfinderWrap: { marginBottom: 20 },
  viewfinder: {
    height: 300,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  viewfinderPlaceholder: {
    alignItems: 'center',
    gap: 12,
  },
  viewfinderHint: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  capturedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  identifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  identifyingText: {
    color: '#fff',
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  confirmedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  confirmedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmedText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  // Corner markers
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#C4933A',
    borderWidth: 3,
  },
  cornerTop: { top: 12, borderBottomWidth: 0 },
  cornerBottom: { bottom: 12, borderTopWidth: 0 },
  cornerLeft: { left: 12, borderRightWidth: 0 },
  cornerRight: { right: 12, borderLeftWidth: 0 },
  // Controls
  controls: { paddingHorizontal: 16, gap: 12 },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  captureBtnLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  captureRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
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
  confirmedStatus: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  confirmedActions: { flexDirection: 'row', gap: 12 },
  viewBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  viewBtnLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  // Matches
  matchesSection: { marginTop: 24, paddingHorizontal: 16, gap: 10 },
  matchesTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  matchesSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  matchRankWrap: { width: 32, alignItems: 'center' },
  matchRank: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  matchImage: { width: 72, height: 72, resizeMode: 'cover' },
  matchInfo: { flex: 1, padding: 12, gap: 3 },
  matchTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 17 },
  matchBrand: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  matchCollection: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  confidenceWrap: { paddingRight: 14, alignItems: 'center' },
  confidenceScore: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  confidenceLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  noneMatch: { alignItems: 'center', paddingVertical: 12 },
  noneMatchText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
