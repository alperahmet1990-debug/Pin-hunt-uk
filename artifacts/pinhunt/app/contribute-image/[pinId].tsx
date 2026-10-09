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
 */
import React, { useCallback, useState } from 'react';
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
import { API_BASE } from '@/lib/apiBase';

type Step = 'consent' | 'confirm' | 'submitting' | 'done';

interface CapturedPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

export default function ContributeImageScreen() {
  const { pinId } = useLocalSearchParams<{ pinId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pins } = usePinCatalogue();
  const { session } = useAuth();

  const pin = pins.find(p => p.id === pinId);

  const [step, setStep] = useState<Step>('consent');
  const [consentChecked, setConsentChecked] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const goToPin = useCallback(() => {
    router.replace({ pathname: '/pin/[id]', params: { id: pinId } });
  }, [router, pinId]);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not submit your photo.');
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your photo.');
      setStep('confirm');
    }
  }, [photo, session?.access_token, pinId]);

  return (
    <>
      <Stack.Screen options={{ title: 'Add a Photo' }} />
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
              We don&apos;t have a photo of this pin yet
            </Text>
            {pin && (
              <Text style={[styles.pinName, { color: colors.mutedForeground }]}>{pin.title}</Text>
            )}
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Take one clean photo — plain background, good light, pin filling the frame —
              and we&apos;ll use it as this pin&apos;s photo everywhere in PinHunt: catalogue
              browsing, set pages, and every collector&apos;s view, not just yours.
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              A PinHunt moderator reviews every photo before it goes live, so it won&apos;t
              appear anywhere until approved.
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
              style={[styles.primaryBtn, { backgroundColor: consentChecked ? colors.primary : colors.secondary }]}
              onPress={handleTakePhoto}
              disabled={!consentChecked}
              activeOpacity={0.85}
            >
              <Feather name="camera" size={18} color={consentChecked ? '#fff' : colors.mutedForeground} />
              <Text style={[styles.primaryBtnLabel, { color: consentChecked ? '#fff' : colors.mutedForeground }]}>
                Take Photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={goToPin} activeOpacity={0.7}>
              <Text style={[styles.skipLabel, { color: colors.mutedForeground }]}>Maybe later</Text>
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
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={goToPin}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnLabel, { color: '#fff' }]}>Continue</Text>
            </TouchableOpacity>
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
  submitBtn: { flex: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 14 },
});
