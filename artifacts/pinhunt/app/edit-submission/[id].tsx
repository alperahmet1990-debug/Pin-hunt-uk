/**
 * Edit Draft Submission — re-open a draft or needs-changes submission for editing.
 * Users can update all metadata fields, replace images, and re-submit or save.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { supabase } from '@/lib/supabase';
import { pickSubmissionImage } from '@/utils/submissionImage';
import type { EditionType, PinSubmission } from '@workspace/pin-repository';

const EDITION_TYPES: { value: EditionType; label: string }[] = [
  { value: 'unknown',        label: 'Unknown' },
  { value: 'open_edition',   label: 'Open Edition' },
  { value: 'limited_edition',label: 'Limited Edition' },
  { value: 'limited_release',label: 'Limited Release' },
  { value: 'mystery',        label: 'Mystery' },
  { value: 'hidden_disney',  label: 'Hidden Disney' },
];

/** Lifetime of signed image URLs (seconds). */
const SIGNED_URL_TTL_SECONDS = 3600;
/** Proactively re-sign URLs a comfortable margin before they expire. */
const SIGNED_URL_REFRESH_MS = (SIGNED_URL_TTL_SECONDS - 600) * 1000;

async function getSignedUrl(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage
      .from('pin-submissions')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export default function EditSubmissionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo } = useMarketplace();

  const [submission, setSubmission] = useState<PinSubmission | null>(null);
  const [frontUrl, setFrontUrl]     = useState<string | null>(null);
  const [backUrl,  setBackUrl]      = useState<string | null>(null);
  const [newFrontUri, setNewFrontUri] = useState<string | null>(null);
  const [newBackUri,  setNewBackUri]  = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Form fields
  const [proposedName,    setProposedName]    = useState('');
  const [brand,           setBrand]           = useState('');
  const [characterNames,  setCharacterNames]  = useState('');
  const [seriesName,      setSeriesName]      = useState('');
  const [releaseLocation, setReleaseLocation] = useState('');
  const [releaseYear,     setReleaseYear]     = useState('');
  const [editionType,     setEditionType]     = useState<EditionType>('unknown');
  const [editionSize,     setEditionSize]     = useState('');
  const [facNumber,       setFacNumber]       = useState('');
  const [sku,             setSku]             = useState('');
  const [notes,           setNotes]           = useState('');
  const [fieldErrors,     setFieldErrors]     = useState<Record<string, string>>({});

  useEffect(() => {
    if (!repo || !id) { setLoading(false); return; }
    (async () => {
      try {
        const sub = await repo.getPinSubmission(id);
        if (!sub) { setError('Submission not found.'); setLoading(false); return; }
        if (sub.status !== 'draft' && sub.status !== 'needs_changes') {
          setError('Only draft or needs-changes submissions can be edited.');
          setLoading(false);
          return;
        }
        setSubmission(sub);
        setProposedName(sub.proposedName);
        setBrand(sub.brand);
        setCharacterNames(sub.characterNames?.join(', ') ?? '');
        setSeriesName(sub.seriesName ?? '');
        setReleaseLocation(sub.releaseLocation ?? '');
        setReleaseYear(sub.releaseYear?.toString() ?? '');
        setEditionType(sub.editionType);
        setEditionSize(sub.editionSize?.toString() ?? '');
        setFacNumber(sub.facNumber ?? '');
        setSku(sub.sku ?? '');
        setNotes(sub.notes ?? '');

        const [front, back] = await Promise.all([
          getSignedUrl(sub.frontImagePath),
          sub.backImagePath ? getSignedUrl(sub.backImagePath) : Promise.resolve(null),
        ]);
        setFrontUrl(front);
        setBackUrl(back);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load submission.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, repo]);

  // Signed URLs expire after SIGNED_URL_TTL_SECONDS. Re-sign them when an
  // image fails to load, and proactively before expiry, so photos never go
  // blank while the screen stays open for over an hour. Newly picked local
  // images (newFrontUri / newBackUri) never expire, so they're left alone.
  const submissionRef = useRef<PinSubmission | null>(null);
  useEffect(() => { submissionRef.current = submission; }, [submission]);

  const lastErrorRefreshRef = useRef(0);

  const refreshImageUrls = useCallback(async () => {
    // Throttle so a genuinely broken image can't trigger an endless
    // re-sign loop (each new URL failing fires onError again).
    const now = Date.now();
    if (now - lastErrorRefreshRef.current < 30_000) return;
    lastErrorRefreshRef.current = now;

    const sub = submissionRef.current;
    if (!sub) return;
    const [front, back] = await Promise.all([
      getSignedUrl(sub.frontImagePath),
      sub.backImagePath ? getSignedUrl(sub.backImagePath) : Promise.resolve(null),
    ]);
    if (front) setFrontUrl(front);
    if (back) setBackUrl(back);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { refreshImageUrls(); }, SIGNED_URL_REFRESH_MS);
    return () => { clearInterval(timer); };
  }, [refreshImageUrls]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!proposedName.trim()) errs.proposedName = 'Pin name is required.';
    if (!brand.trim())        errs.brand        = 'Brand is required.';
    if (releaseYear.trim()) {
      const y = parseInt(releaseYear, 10);
      if (isNaN(y) || y < 1900 || y > 2030) errs.releaseYear = 'Enter a year between 1900 and 2030.';
    }
    if (editionSize.trim()) {
      const s = parseInt(editionSize, 10);
      if (isNaN(s) || s <= 0) errs.editionSize = 'Must be a positive number.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (submitForReview: boolean) => {
    if (!repo || !submission) return;
    if (!validate()) return;

    try {
      setSaving(true);

      // Update metadata
      await repo.updatePinSubmission(submission.id, {
        proposedName:    proposedName.trim(),
        brand:           brand.trim(),
        characterNames:  characterNames.trim()   ? characterNames.split(',').map(s => s.trim()).filter(Boolean) : null,
        seriesName:      seriesName.trim()        || null,
        releaseLocation: releaseLocation.trim()   || null,
        releaseYear:     releaseYear.trim()       ? parseInt(releaseYear, 10) : null,
        editionType,
        editionSize:     editionSize.trim()       ? parseInt(editionSize, 10) : null,
        facNumber:       facNumber.trim()         || null,
        sku:             sku.trim()               || null,
        notes:           notes.trim()             || null,
      });

      // Upload replacement images if chosen
      if (newFrontUri) await repo.uploadSubmissionFrontImage(submission.id, newFrontUri);
      if (newBackUri)  await repo.uploadSubmissionBackImage(submission.id, newBackUri);

      // Submit for review if requested
      if (submitForReview) await repo.submitPinForReview(submission.id);

      router.replace({ pathname: '/submission/[id]', params: { id: submission.id } });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const pickFront = async (source: 'camera' | 'library') => {
    const img = await pickSubmissionImage(source);
    if (img) setNewFrontUri(img.uri);
  };

  const pickBack = async (source: 'camera' | 'library') => {
    const img = await pickSubmissionImage(source);
    if (img) setNewBackUri(img.uri);
  };

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const inp = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    opts?: { keyboardType?: 'default' | 'numeric'; multiline?: boolean; errKey?: string },
  ) => (
    <>
      <TextInput
        value={value}
        onChangeText={v => { onChange(v); if (opts?.errKey) setFieldErrors(e => ({ ...e, [opts.errKey!]: undefined as unknown as string })); }}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground + '88'}
        keyboardType={opts?.keyboardType ?? 'default'}
        multiline={opts?.multiline}
        style={[
          styles.input,
          opts?.multiline && { height: 80, textAlignVertical: 'top' },
          {
            color: colors.foreground,
            borderColor: opts?.errKey && fieldErrors[opts.errKey] ? '#EF4444' : colors.border,
            backgroundColor: colors.card,
            borderRadius: 10,
          },
        ]}
      />
      {opts?.errKey && fieldErrors[opts.errKey] && (
        <Text style={styles.fieldError}>{fieldErrors[opts.errKey]}</Text>
      )}
    </>
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit Submission' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit Submission' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: submission?.status === 'needs_changes' ? 'Make Changes' : 'Edit Draft' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Reviewer note */}
          {submission?.reviewerNotes && (
            <View style={[styles.reviewerBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderRadius: 10 }]}>
              <Feather name="message-circle" size={14} color="#92400E" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.reviewerTitle}>Reviewer note</Text>
                <Text style={styles.reviewerText}>{submission.reviewerNotes}</Text>
              </View>
            </View>
          )}

          {/* Front photo */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FRONT PHOTO</Text>
          <View style={[styles.photoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            <Image
              source={{ uri: newFrontUri ?? frontUrl ?? undefined }}
              style={styles.thumbImg}
              resizeMode="cover"
              onError={newFrontUri ? undefined : refreshImageUrls}
            />
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={() => pickFront('camera')} style={[styles.photoBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                <Feather name="camera" size={14} color={colors.foreground} />
                <Text style={[styles.photoBtnLabel, { color: colors.foreground }]}>
                  {Platform.OS === 'web' ? 'Replace' : 'Retake'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickFront('library')} style={[styles.photoBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                <Feather name="image" size={14} color={colors.foreground} />
                <Text style={[styles.photoBtnLabel, { color: colors.foreground }]}>Library</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Back photo */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BACK PHOTO (OPTIONAL)</Text>
          <View style={[styles.photoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
            {(newBackUri ?? backUrl) ? (
              <Image source={{ uri: newBackUri ?? backUrl ?? undefined }} style={styles.thumbImg} resizeMode="cover" onError={newBackUri ? undefined : refreshImageUrls} />
            ) : (
              <View style={[styles.thumbPlaceholder, { backgroundColor: colors.secondary }]}>
                <Feather name="image" size={24} color={colors.mutedForeground} />
              </View>
            )}
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={() => pickBack('camera')} style={[styles.photoBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                <Feather name="camera" size={14} color={colors.foreground} />
                <Text style={[styles.photoBtnLabel, { color: colors.foreground }]}>
                  {Platform.OS === 'web' ? 'Add/Replace' : 'Take Photo'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickBack('library')} style={[styles.photoBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                <Feather name="image" size={14} color={colors.foreground} />
                <Text style={[styles.photoBtnLabel, { color: colors.foreground }]}>Library</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Fields */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PIN DETAILS</Text>
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Pin Name <Text style={{ color: '#EF4444' }}>*</Text></Text>
              {inp(proposedName, setProposedName, 'e.g. Mickey Mouse 50th Anniversary', { errKey: 'proposedName' })}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Brand / Source <Text style={{ color: '#EF4444' }}>*</Text></Text>
              {inp(brand, setBrand, 'e.g. Disney Parks, Loungefly', { errKey: 'brand' })}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Characters (comma-separated)</Text>
              {inp(characterNames, setCharacterNames, 'e.g. Mickey, Minnie')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Series or Collection</Text>
              {inp(seriesName, setSeriesName, 'e.g. Halloween 2023')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Release Location</Text>
              {inp(releaseLocation, setReleaseLocation, 'e.g. Magic Kingdom')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Release Year</Text>
              {inp(releaseYear, setReleaseYear, 'e.g. 2023', { keyboardType: 'numeric', errKey: 'releaseYear' })}
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Edition Type</Text>
              <View style={styles.editionGrid}>
                {EDITION_TYPES.map(e => {
                  const active = editionType === e.value;
                  return (
                    <TouchableOpacity
                      key={e.value}
                      onPress={() => setEditionType(e.value)}
                      activeOpacity={0.8}
                      style={[
                        styles.editionBtn,
                        { backgroundColor: active ? colors.primary + '18' : colors.card, borderColor: active ? colors.primary : colors.border, borderRadius: 8 },
                      ]}
                    >
                      <Text style={[styles.editionBtnLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{e.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Edition Size</Text>
              {inp(editionSize, setEditionSize, 'e.g. 2500', { keyboardType: 'numeric', errKey: 'editionSize' })}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>FAC Number</Text>
              {inp(facNumber, setFacNumber, 'e.g. 24-FAC-12345')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SKU / Product Number</Text>
              {inp(sku, setSku, 'e.g. 400041234567')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Notes</Text>
              {inp(notes, setNotes, 'Any additional details…', { multiline: true })}
            </View>
          </View>

          {/* Actions */}
          {saving ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={() => handleSave(false)}
                activeOpacity={0.85}
                style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}
              >
                <Feather name="save" size={16} color={colors.foreground} />
                <Text style={[styles.actionBtnLabel, { color: colors.foreground }]}>Save Draft</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSave(true)}
                activeOpacity={0.85}
                style={[styles.actionBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
              >
                <Feather name="send" size={16} color="#fff" />
                <Text style={[styles.actionBtnLabel, { color: '#fff' }]}>Submit for Review</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  reviewerBox: { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1, marginBottom: 4 },
  reviewerTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#92400E' },
  reviewerText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#92400E', lineHeight: 18 },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 4 },
  photoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: 1 },
  thumbImg: { width: 72, height: 72, borderRadius: 8 },
  thumbPlaceholder: { width: 72, height: 72, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  photoActions: { gap: 8 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  photoBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  fields: { gap: 10 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  fieldError: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#EF4444' },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular' },
  editionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  editionBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderWidth: 1 },
  actionBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
