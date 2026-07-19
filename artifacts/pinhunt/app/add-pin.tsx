/**
 * Add Pin — multi-step catalogue contribution flow.
 *
 * Steps:
 *  0 — Front photo (optional for now — storage bucket pending)
 *  1 — Back photo  (optional)
 *  2 — Pin details
 *  3 — Review & submit
 *  4 — Confirmation
 *
 * Submits via submitMissingPin which inserts directly into the pins
 * table with verification_status = 'community_submitted'.
 * Photos are captured locally and shown as previews; image upload
 * will be wired in once the storage bucket is created.
 */
import React, { useState } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { pickSubmissionImage, uploadLocalImageToStorage } from '@/utils/submissionImage';
import { createSupabasePinRepository } from '@workspace/pin-repository';

// ─── Constants ────────────────────────────────────────────────────────────────

const EDITION_TYPES = [
  { value: 'unknown',         label: 'Unknown' },
  { value: 'open_edition',    label: 'Open Edition' },
  { value: 'limited_edition', label: 'Limited Edition' },
  { value: 'limited_release', label: 'Limited Release' },
  { value: 'mystery',         label: 'Mystery' },
  { value: 'hidden_disney',   label: 'Hidden Disney' },
] as const;

type EditionValue = (typeof EDITION_TYPES)[number]['value'];

const STEPS = ['Front Photo', 'Back Photo', 'Details', 'Review'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FormErrors {
  proposedName?: string;
  brand?: string;
  releaseYear?: string;
  editionSize?: string;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, colors }: { current: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.stepRow}>
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                {
                  borderColor: active || done ? colors.primary : colors.border,
                  backgroundColor: done ? colors.primary : active ? colors.primary + '22' : 'transparent',
                },
              ]}>
                {done
                  ? <Feather name="check" size={10} color="#fff" />
                  : <Text style={[styles.stepNum, { color: active ? colors.primary : colors.mutedForeground }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[styles.stepLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
                {label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, { backgroundColor: i < current ? colors.primary : colors.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Photo step ───────────────────────────────────────────────────────────────

function PhotoStep({
  title, subtitle, uri, onCamera, onLibrary, colors,
}: {
  title: string;
  subtitle: string;
  uri: string | null;
  onCamera: () => void;
  onLibrary: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.photoStep}>
      <Text style={[styles.stepTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>{subtitle}</Text>

      {uri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri }} style={styles.preview} resizeMode="contain" />
          <TouchableOpacity
            onPress={onCamera}
            activeOpacity={0.8}
            style={[styles.retakeBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8 }]}
          >
            <Feather name="refresh-cw" size={14} color={colors.foreground} />
            <Text style={[styles.retakeBtnLabel, { color: colors.foreground }]}>
              {Platform.OS === 'web' ? 'Replace' : 'Retake'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.photoBox, { borderColor: colors.border, backgroundColor: colors.secondary, borderRadius: 16 }]}>
          <Feather name="camera" size={40} color={colors.mutedForeground} />
          <Text style={[styles.photoBoxHint, { color: colors.mutedForeground }]}>No photo yet</Text>
        </View>
      )}

      <View style={styles.photoActions}>
        <TouchableOpacity
          onPress={onCamera}
          activeOpacity={0.85}
          style={[styles.photoBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
        >
          <Feather name="camera" size={18} color="#fff" />
          <Text style={styles.photoBtnLabel}>
            {Platform.OS === 'web' ? 'Choose from Library' : 'Take Photo'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onLibrary}
          activeOpacity={0.85}
          style={[styles.photoBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}
        >
          <Feather name="image" size={18} color={colors.foreground} />
          <Text style={[styles.photoBtnLabel, { color: colors.foreground }]}>Choose from Library</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AddPinScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState(0);

  // Photos (local URIs only — not uploaded)
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri,  setBackUri]  = useState<string | null>(null);

  // Details
  const [proposedName,    setProposedName]    = useState('');
  const [brand,           setBrand]           = useState('');
  const [characterNames,  setCharacterNames]  = useState('');
  const [seriesName,      setSeriesName]      = useState('');
  const [releaseLocation, setReleaseLocation] = useState('');
  const [releaseYear,     setReleaseYear]     = useState('');
  const [editionType,     setEditionType]     = useState<EditionValue>('unknown');
  const [editionSize,     setEditionSize]     = useState('');
  const [facNumber,       setFacNumber]       = useState('');
  const [sku,             setSku]             = useState('');
  const [notes,           setNotes]           = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  // ── Photo pickers ───────────────────────────────────────────────────────────
  const pickFront = async (source: 'camera' | 'library') => {
    const img = await pickSubmissionImage(source);
    if (img) setFrontUri(img.uri);
  };
  const pickBack = async (source: 'camera' | 'library') => {
    const img = await pickSubmissionImage(source);
    if (img) setBackUri(img.uri);
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!proposedName.trim()) errs.proposedName = 'Pin name is required.';
    if (!brand.trim())        errs.brand        = 'Brand is required.';
    if (releaseYear.trim()) {
      const y = parseInt(releaseYear, 10);
      if (isNaN(y) || y < 1900 || y > 2030) errs.releaseYear = 'Enter a year between 1900 and 2030.';
    }
    if (editionSize.trim()) {
      const s = parseInt(editionSize, 10);
      if (isNaN(s) || s <= 0) errs.editionSize = 'Must be a positive whole number.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goNext = () => {
    if (step === 2 && !validate()) return;
    setStep(s => s + 1);
  };
  const goBack = () => setStep(s => s - 1);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('Not connected', 'Supabase is not configured.');
      return;
    }

    const characters = characterNames.trim()
      ? characterNames.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    const description = [
      notes.trim(),
      facNumber.trim()   ? `FAC: ${facNumber.trim()}`            : '',
      sku.trim()         ? `SKU: ${sku.trim()}`                  : '',
      releaseYear.trim() ? `Year: ${releaseYear.trim()}`         : '',
      editionSize.trim() ? `Edition size: ${editionSize.trim()}` : '',
    ].filter(Boolean).join('\n') || undefined;

    try {
      setSaving(true);

      // ── Upload front image ────────────────────────────────────────────────
      let imageUrl: string | undefined;
      if (frontUri && user?.id) {
        try {
          const path = `${user.id}/${Date.now()}/front.jpg`;
          await uploadLocalImageToStorage(frontUri, 'pin-submissions', path, supabase.storage);
          const { data: urlData } = supabase.storage
            .from('pin-submissions')
            .getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        } catch (uploadErr) {
          console.warn('[add-pin] image upload failed:', uploadErr);
          Alert.alert(
            'Image upload failed',
            uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
          );
          setSaving(false);
          return;
        }
      }

      // ── Insert into catalogue ─────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const repo = createSupabasePinRepository(supabase as any);
      await repo.submitMissingPin({
        title:       proposedName.trim(),
        brand:       brand.trim(),
        collection:  seriesName.trim() || brand.trim(),
        characters,
        edition:     editionType !== 'unknown' ? editionType : undefined,
        origin:      releaseLocation.trim() || undefined,
        description,
        imageUrl,
        submittedBy: user?.id,
      });

      setDone(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not add pin. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Confirmation ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pin Added', headerBackVisible: false }} />
        <View style={[styles.confirm, { backgroundColor: colors.background, paddingBottom: botPad }]}>
          {frontUri && (
            <Image source={{ uri: frontUri }} style={styles.confirmThumb} resizeMode="cover" />
          )}
          <View style={[styles.confirmIcon, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="check-circle" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Pin Added!</Text>
          <Text style={[styles.confirmSub, { color: colors.mutedForeground }]}>
            "{proposedName}" has been added to the catalogue as a community submission and will appear in searches while awaiting verification.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={[styles.confirmBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
          >
            <Text style={styles.confirmBtnLabel}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setFrontUri(null); setBackUri(null);
              setProposedName(''); setBrand(''); setCharacterNames('');
              setSeriesName(''); setReleaseLocation(''); setReleaseYear('');
              setEditionType('unknown'); setEditionSize('');
              setFacNumber(''); setSku(''); setNotes('');
              setStep(0); setDone(false);
            }}
            activeOpacity={0.7}
            style={styles.confirmSecondary}
          >
            <Text style={[styles.confirmSecondaryLabel, { color: colors.mutedForeground }]}>Add Another Pin</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  // ── Text input helper ───────────────────────────────────────────────────────
  const inp = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    opts?: { keyboardType?: 'default' | 'numeric'; multiline?: boolean; errKey?: keyof FormErrors },
  ) => (
    <>
      <TextInput
        value={value}
        onChangeText={v => {
          onChange(v);
          if (opts?.errKey) setErrors(e => ({ ...e, [opts.errKey!]: undefined }));
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground + '88'}
        keyboardType={opts?.keyboardType ?? 'default'}
        multiline={opts?.multiline}
        style={[
          styles.input,
          opts?.multiline && { height: 88, textAlignVertical: 'top' },
          {
            color: colors.foreground,
            borderColor: opts?.errKey && errors[opts.errKey] ? '#EF4444' : colors.border,
            backgroundColor: colors.card,
            borderRadius: 10,
          },
        ]}
      />
      {opts?.errKey && errors[opts.errKey] && (
        <Text style={styles.fieldError}>{errors[opts.errKey]}</Text>
      )}
    </>
  );

  // ── Review step ─────────────────────────────────────────────────────────────
  const renderReview = () => (
    <View style={styles.reviewWrap}>
      {frontUri && (
        <Image source={{ uri: frontUri }} style={[styles.reviewHero, { borderRadius: 12 }]} resizeMode="cover" />
      )}

      <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
        {([
          ['Pin Name',    proposedName],
          ['Brand',       brand],
          ['Characters',  characterNames  || '—'],
          ['Series',      seriesName      || '—'],
          ['Location',    releaseLocation || '—'],
          ['Year',        releaseYear     || '—'],
          ['Edition',     EDITION_TYPES.find(e => e.value === editionType)?.label ?? '—'],
          ['Edition Size',editionSize     || '—'],
          ['FAC #',       facNumber       || '—'],
          ['SKU',         sku             || '—'],
          ['Back photo',  backUri ? 'Included' : 'Not provided'],
          ['Notes',       notes           || '—'],
        ] as [string, string][]).map(([label, value], i, arr) => (
          <View
            key={label}
            style={[
              styles.reviewRow,
              i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.reviewLabel, { color: colors.mutedForeground }]}>{label}</Text>
            <Text style={[styles.reviewValue, { color: colors.foreground }]} numberOfLines={3}>{value}</Text>
          </View>
        ))}
      </View>

      {saving ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
      ) : (
        <TouchableOpacity
          onPress={handleSubmit}
          activeOpacity={0.85}
          style={[styles.submitBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
        >
          <Feather name="plus-circle" size={16} color="#fff" />
          <Text style={styles.submitBtnLabel}>Add to Catalogue</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Details form ────────────────────────────────────────────────────────────
  const renderDetails = () => (
    <View style={{ gap: 14 }}>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
          Pin Name <Text style={{ color: '#EF4444' }}>*</Text>
        </Text>
        {inp(proposedName, setProposedName, 'e.g. Mickey Mouse 50th Anniversary', { errKey: 'proposedName' })}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
          Brand / Source <Text style={{ color: '#EF4444' }}>*</Text>
        </Text>
        {inp(brand, setBrand, 'e.g. Disney Parks, Loungefly, WDW', { errKey: 'brand' })}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Characters (comma-separated)</Text>
        {inp(characterNames, setCharacterNames, 'e.g. Mickey, Minnie, Goofy')}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Series or Collection</Text>
        {inp(seriesName, setSeriesName, 'e.g. Halloween 2023, Haunted Mansion')}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Release Location</Text>
        {inp(releaseLocation, setReleaseLocation, 'e.g. Magic Kingdom, Disney Store UK')}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Release Year</Text>
        {inp(releaseYear, setReleaseYear, 'e.g. 2024', { keyboardType: 'numeric', errKey: 'releaseYear' })}
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
                  {
                    backgroundColor: active ? colors.primary + '18' : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                    borderRadius: 8,
                  },
                ]}
              >
                <Text style={[styles.editionBtnLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
                  {e.label}
                </Text>
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
  );

  const stepContent = [
    <PhotoStep
      key="front"
      title="Front Photo"
      subtitle="Photograph the front of the pin clearly. You can skip this for now."
      uri={frontUri}
      onCamera={() => pickFront('camera')}
      onLibrary={() => pickFront('library')}
      colors={colors}
    />,
    <PhotoStep
      key="back"
      title="Back Photo"
      subtitle="Photograph the back of the pin to capture markings and copyright info. Optional."
      uri={backUri}
      onCamera={() => pickBack('camera')}
      onLibrary={() => pickBack('library')}
      colors={colors}
    />,
    renderDetails(),
    renderReview(),
  ][step];

  return (
    <>
      <Stack.Screen options={{ title: 'Add Pin' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepIndicator current={step} colors={colors} />

          {stepContent}

          {/* Nav — not shown on review step (has its own submit button) */}
          {step < 3 && (
            <View style={styles.navRow}>
              {step > 0 && (
                <TouchableOpacity
                  onPress={goBack}
                  activeOpacity={0.8}
                  style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}
                >
                  <Feather name="arrow-left" size={16} color={colors.foreground} />
                  <Text style={[styles.navBtnLabel, { color: colors.foreground }]}>Back</Text>
                </TouchableOpacity>
              )}
              {/* Photo steps can be skipped */}
              {step < 2 && (
                <TouchableOpacity
                  onPress={goNext}
                  activeOpacity={0.8}
                  style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}
                >
                  <Text style={[styles.navBtnLabel, { color: colors.mutedForeground }]}>Skip</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={goNext}
                activeOpacity={0.85}
                style={[styles.navBtn, styles.navBtnPrimary, { backgroundColor: colors.primary, borderRadius: 12 }]}
              >
                <Text style={[styles.navBtnLabel, { color: '#fff' }]}>
                  {step === 2 ? 'Review' : 'Next'}
                </Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 20 },

  // Step indicator
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  stepLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', maxWidth: 52, textAlign: 'center' },
  stepLine: { flex: 1, height: 1.5, marginBottom: 16 },

  // Photo step
  photoStep: { gap: 18 },
  stepTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  stepSub: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  photoBox: {
    alignSelf: 'center', width: 260, height: 220,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderStyle: 'dashed', gap: 12,
  },
  photoBoxHint: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  previewWrap: { alignItems: 'center', gap: 10 },
  preview: { width: '100%', height: 280, borderRadius: 12 },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1,
  },
  retakeBtnLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  photoActions: { gap: 10 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderWidth: 1,
  },
  photoBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // Details
  field: { gap: 7 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  fieldError: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#EF4444' },
  input: {
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  editionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  editionBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  // Review
  reviewWrap: { gap: 16 },
  reviewHero: { width: '100%', height: 200 },
  reviewCard: { borderWidth: 1, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  reviewLabel: { width: 90, fontSize: 12, fontFamily: 'Inter_400Regular', paddingTop: 1 },
  reviewValue: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },

  // Nav
  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 14, borderWidth: 1,
  },
  navBtnPrimary: { borderWidth: 0 },
  navBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15,
  },
  submitBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // Confirmation
  confirm: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  confirmThumb: { width: 120, height: 120, borderRadius: 16, marginBottom: 4 },
  confirmIcon: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  confirmSub: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  confirmBtn: { width: '100%', paddingVertical: 14, alignItems: 'center' },
  confirmBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  confirmSecondary: { paddingVertical: 12 },
  confirmSecondaryLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
