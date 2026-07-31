/**
 * Admin — Vision Test (isolated proof of concept).
 *
 * Upload a photo of a pin and see raw Google Cloud Vision results:
 * OCR text, logo detection, web detection, and suggested search terms.
 * Does not touch the catalogue, collection, or the normal scan flow.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : 'http://localhost:8080/api';

interface VisionResult {
  ocrText: string;
  logos: Array<{ description: string; score: number | null }>;
  webDetection: {
    bestGuessLabels: string[];
    webEntities: Array<{ description: string; score: number | null }>;
    pagesWithMatchingImages: Array<{ url: string; title: string }>;
    similarImages: string[];
  };
  suggestedSearchTerms: string[];
}

export default function VisionTestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisionResult | null>(null);

  const pickImage = useCallback(async () => {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      base64: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    if (!asset.base64) {
      setError('Could not read that image — please try another.');
      return;
    }
    setImageUri(asset.uri);
    setImageBase64(asset.base64);
    setResult(null);
  }, []);

  const analyse = useCallback(async () => {
    if (!imageBase64) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/vision-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      setResult(data as VisionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision request failed');
    } finally {
      setLoading(false);
    }
  }, [imageBase64, session?.access_token]);

  return (
    <>
      <Stack.Screen options={{ title: 'Vision Test', headerShown: true }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          Proof of concept — sends a photo to Google Cloud Vision and shows the raw
          results. Nothing here changes the catalogue or your collection.
        </Text>

        {/* Image picker */}
        <TouchableOpacity
          onPress={pickImage}
          activeOpacity={0.85}
          style={[styles.pickBox, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <View style={styles.pickEmpty}>
              <Feather name="upload" size={28} color={colors.mutedForeground} />
              <Text style={[styles.pickText, { color: colors.mutedForeground }]}>
                {Platform.OS === 'web' ? 'Choose a photo of a pin' : 'Pick a photo of a pin'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={analyse}
          disabled={!imageBase64 || loading}
          activeOpacity={0.85}
          style={[
            styles.analyseBtn,
            { backgroundColor: colors.primary, opacity: !imageBase64 || loading ? 0.5 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Feather name="eye" size={18} color={colors.primaryForeground} />
          )}
          <Text style={[styles.analyseLabel, { color: colors.primaryForeground }]}>
            {loading ? 'Analysing…' : 'Analyse with Google Vision'}
          </Text>
        </TouchableOpacity>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        )}

        {result && (
          <>
            {/* Suggested search terms */}
            <Section title="Suggested Search Terms" colors={colors}>
              {result.suggestedSearchTerms.length === 0 ? (
                <Empty colors={colors} />
              ) : (
                <View style={styles.chipWrap}>
                  {result.suggestedSearchTerms.map((t, i) => (
                    <View key={i} style={[styles.chip, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '40' }]}>
                      <Text style={[styles.chipText, { color: colors.primary }]}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* OCR */}
            <Section title="OCR Text" colors={colors}>
              {result.ocrText ? (
                <Text style={[styles.mono, { color: colors.foreground }]}>{result.ocrText}</Text>
              ) : (
                <Empty colors={colors} label="No text detected" />
              )}
            </Section>

            {/* Logos */}
            <Section title="Logo Detection" colors={colors}>
              {result.logos.length === 0 ? (
                <Empty colors={colors} label="No logos detected" />
              ) : (
                result.logos.map((l, i) => (
                  <View key={i} style={styles.row}>
                    <Text style={[styles.rowText, { color: colors.foreground }]}>{l.description}</Text>
                    {l.score != null && (
                      <Text style={[styles.rowScore, { color: colors.mutedForeground }]}>{l.score}%</Text>
                    )}
                  </View>
                ))
              )}
            </Section>

            {/* Web detection */}
            <Section title="Web Detection" colors={colors}>
              {result.webDetection.bestGuessLabels.length > 0 && (
                <>
                  <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>BEST GUESS</Text>
                  {result.webDetection.bestGuessLabels.map((l, i) => (
                    <Text key={i} style={[styles.rowText, { color: colors.foreground }]}>{l}</Text>
                  ))}
                </>
              )}
              {result.webDetection.webEntities.length > 0 && (
                <>
                  <Text style={[styles.subLabel, { color: colors.mutedForeground, marginTop: 10 }]}>WEB ENTITIES</Text>
                  {result.webDetection.webEntities.map((e, i) => (
                    <View key={i} style={styles.row}>
                      <Text style={[styles.rowText, { color: colors.foreground }]}>{e.description}</Text>
                      {e.score != null && (
                        <Text style={[styles.rowScore, { color: colors.mutedForeground }]}>{e.score}</Text>
                      )}
                    </View>
                  ))}
                </>
              )}
              {result.webDetection.pagesWithMatchingImages.length > 0 && (
                <>
                  <Text style={[styles.subLabel, { color: colors.mutedForeground, marginTop: 10 }]}>PAGES WITH THIS IMAGE</Text>
                  {result.webDetection.pagesWithMatchingImages.map((p, i) => (
                    <TouchableOpacity key={i} onPress={() => Linking.openURL(p.url)}>
                      <Text style={[styles.link, { color: colors.primary }]} numberOfLines={2}>
                        {p.title || p.url}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {result.webDetection.similarImages.length > 0 && (
                <>
                  <Text style={[styles.subLabel, { color: colors.mutedForeground, marginTop: 10 }]}>VISUALLY SIMILAR IMAGES</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
                    {result.webDetection.similarImages.map((u, i) => (
                      <Image key={i} source={{ uri: u }} style={[styles.similarImg, { borderColor: colors.border }]} />
                    ))}
                  </ScrollView>
                </>
              )}
              {result.webDetection.bestGuessLabels.length === 0 &&
                result.webDetection.webEntities.length === 0 &&
                result.webDetection.pagesWithMatchingImages.length === 0 &&
                result.webDetection.similarImages.length === 0 && (
                  <Empty colors={colors} label="No web matches found" />
                )}
            </Section>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Section({ title, colors, children }: { title: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Empty({ colors, label = 'Nothing found' }: { colors: ReturnType<typeof useColors>; label?: string }) {
  return <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 19, marginBottom: 16 },
  pickBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pickEmpty: { alignItems: 'center', gap: 8 },
  pickText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  preview: { width: '100%', height: '100%' },
  analyseBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  analyseLabel: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  section: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 14 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 10 },
  subLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  mono: { fontSize: 13, fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier', lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 },
  rowText: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },
  rowScore: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginLeft: 8 },
  link: { fontSize: 13, fontFamily: 'Inter_500Medium', paddingVertical: 3 },
  similarImg: { width: 84, height: 84, borderRadius: 10, borderWidth: 1 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
