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
import { radius, spacing } from '@/constants/theme';
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
        placeholderTextColor={colors.homeMuted}
        keyboardType={opts?.keyboardType ?? 'default'}
        multiline={opts?.multiline}
        style={[
          styles.input,
          opts?.multiline && { height: 80, textAlignVertical: 'top' },
          {
            color: colors.homeInk,
            borderColor: opts?.errKey && fieldErrors[opts.errKey] ? colors.destructive : colors.homeLine,
            backgroundColor: colors.homeSurface,
            borderRadius: radius.sm,
          },
        ]}
      />
      {opts?.errKey && fieldErrors[opts.errKey] && (
        <Text style={[styles.fieldError, { color: colors.destructive }]}>{fieldErrors[opts.errKey]}</Text>
      )}
    </>
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit Submission' }} />
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <ActivityIndicator color={colors.homeCoral} />
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit Submission' }} />
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: submission?.status === 'needs_changes' ? 'Make Changes' : 'Edit Draft' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Reviewer note */}
          {submission?.reviewerNotes && (
            <View style={[styles.reviewerBox, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine, borderRadius: radius.sm }]}>
              <Feather name="message-circle" size={14} color={colors.homeSandInk} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.reviewerTitle, { color: colors.homeSandInk }]}>Reviewer note</Text>
                <Text style={[styles.reviewerText, { color: colors.homeSandInk }]}>{submission.reviewerNotes}</Text>
              </View>
            </View>
          )}

          {/* Front photo */}
          <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>FRONT PHOTO</Text>
          <View style={[styles.photoCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.md }]}>
            <Image
              source={{ uri: newFrontUri ?? frontUrl ?? undefined }}
              style={styles.thumbImg}
              resizeMode="cover"
              onError={newFrontUri ? undefined : refreshImageUrls}
            />
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={() => pickFront('camera')} style={[styles.photoBtn, { backgroundColor: colors.homeAqua, borderRadius: radius.sm - 2 }]}>
                <Feather name="camera" size={14} color={colors.homeInk} />
                <Text style={[styles.photoBtnLabel, { color: colors.homeInk }]}>
                  {Platform.OS === 'web' ? 'Replace' : 'Retake'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickFront('library')} style={[styles.photoBtn, { backgroundColor: colors.homeAqua, borderRadius: radius.sm - 2 }]}>
                <Feather name="image" size={14} color={colors.homeInk} />
                <Text style={[styles.photoBtnLabel, { color: colors.homeInk }]}>Library</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Back photo */}
          <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>BACK PHOTO (OPTIONAL)</Text>
          <View style={[styles.photoCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.md }]}>
            {(newBackUri ?? backUrl) ? (
              <Image source={{ uri: newBackUri ?? backUrl ?? undefined }} style={styles.thumbImg} resizeMode="cover" onError={newBackUri ? undefined : refreshImageUrls} />
            ) : (
              <View style={[styles.thumbPlaceholder, { backgroundColor: colors.homeAqua }]}>
                <Feather name="image" size={24} color={colors.homeMuted} />
              </View>
            )}
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={() => pickBack('camera')} style={[styles.photoBtn, { backgroundColor: colors.homeAqua, borderRadius: radius.sm - 2 }]}>
                <Feather name="camera" size={14} color={colors.homeInk} />
                <Text style={[styles.photoBtnLabel, { color: colors.homeInk }]}>
                  {Platform.OS === 'web' ? 'Add/Replace' : 'Take Photo'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickBack('library')} style={[styles.photoBtn, { backgroundColor: colors.homeAqua, borderRadius: radius.sm - 2 }]}>
                <Feather name="image" size={14} color={colors.homeInk} />
                <Text style={[styles.photoBtnLabel, { color: colors.homeInk }]}>Library</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Fields */}
          <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>PIN DETAILS</Text>
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Pin Name <Text style={{ color: colors.destructive }}>*</Text></Text>
              {inp(proposedName, setProposedName, 'e.g. Mickey Mouse 50th Anniversary', { errKey: 'proposedName' })}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Brand / Source <Text style={{ color: colors.destructive }}>*</Text></Text>
              {inp(brand, setBrand, 'e.g. Disney Parks, Loungefly', { errKey: 'brand' })}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Characters (comma-separated)</Text>
              {inp(characterNames, setCharacterNames, 'e.g. Mickey, Minnie')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Series or Collection</Text>
              {inp(seriesName, setSeriesName, 'e.g. Halloween 2023')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Release Location</Text>
              {inp(releaseLocation, setReleaseLocation, 'e.g. Magic Kingdom')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Release Year</Text>
              {inp(releaseYear, setReleaseYear, 'e.g. 2023', { keyboardType: 'numeric', errKey: 'releaseYear' })}
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Edition Type</Text>
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
                        { backgroundColor: active ? colors.homeCoral + '18' : colors.homeSurface, borderColor: active ? colors.homeCoral : colors.homeLine, borderRadius: radius.sm - 2 },
                      ]}
                    >
                      <Text style={[styles.editionBtnLabel, { color: active ? colors.homeCoral : colors.homeMuted }]}>{e.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Edition Size</Text>
              {inp(editionSize, setEditionSize, 'e.g. 2500', { keyboardType: 'numeric', errKey: 'editionSize' })}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>FAC Number</Text>
              {inp(facNumber, setFacNumber, 'e.g. 24-FAC-12345')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>SKU / Product Number</Text>
              {inp(sku, setSku, 'e.g. 400041234567')}
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Notes</Text>
              {inp(notes, setNotes, 'Any additional details…', { multiline: true })}
            </View>
          </View>

          {/* Actions */}
          {saving ? (
            <ActivityIndicator color={colors.homeCoral} style={{ marginTop: spacing.lg }} />
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={() => handleSave(false)}
                activeOpacity={0.85}
                style={[styles.actionBtn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.md }]}
              >
                <Feather name="save" size={16} color={colors.homeInk} />
                <Text style={[styles.actionBtnLabel, { color: colors.homeInk }]}>Save Draft</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSave(true)}
                activeOpacity={0.85}
                style={[styles.actionBtn, { backgroundColor: colors.homeCoral, borderColor: colors.homeCoral, borderRadius: radius.md }]}
              >
                <Feather name="send" size={16} color={colors.homeSurface} />
                <Text style={[styles.actionBtnLabel, { color: colors.homeSurface }]}>Submit for Review</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  reviewerBox: { flexDirection: 'row', gap: spacing.sm + 2, padding: spacing.md, borderWidth: 1, marginBottom: spacing.xs },
  reviewerTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  reviewerText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: spacing.xs },
  photoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm + 2, borderWidth: 1 },
  thumbImg: { width: 72, height: 72, borderRadius: radius.sm - 2 },
  thumbPlaceholder: { width: 72, height: 72, borderRadius: radius.sm - 2, alignItems: 'center', justifyContent: 'center' },
  photoActions: { gap: spacing.sm },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm - 1 },
  photoBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  fields: { gap: spacing.sm + 2 },
  field: { gap: spacing.xs + 2 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  fieldError: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  input: { borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 3, fontSize: 14, fontFamily: 'Inter_400Regular' },
  editionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  editionBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1 },
  editionBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  actionRow: { flexDirection: 'row', gap: spacing.sm + 2, marginTop: spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm - 2, paddingVertical: spacing.lg - 2, borderWidth: 1 },
  actionBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
