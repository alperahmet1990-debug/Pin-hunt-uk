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
import { radius, spacing } from '@/constants/theme';
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
                  borderColor: active || done ? colors.homeCoral : colors.homeLine,
                  backgroundColor: done ? colors.homeCoral : active ? colors.homeCoral + '22' : 'transparent',
                },
              ]}>
                {done
                  ? <Feather name="check" size={10} color={colors.homeSurface} />
                  : <Text style={[styles.stepNum, { color: active ? colors.homeCoral : colors.homeMuted }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[styles.stepLabel, { color: active ? colors.homeCoral : colors.homeMuted }]}>
                {label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, { backgroundColor: i < current ? colors.homeCoral : colors.homeLine }]} />
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
      <Text style={[styles.stepTitle, { color: colors.homeInk }]}>{title}</Text>
      <Text style={[styles.stepSub, { color: colors.homeMuted }]}>{subtitle}</Text>

      {uri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri }} style={styles.preview} resizeMode="contain" />
          <TouchableOpacity
            onPress={onCamera}
            activeOpacity={0.8}
            style={[styles.retakeBtn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
          >
            <Feather name="refresh-cw" size={14} color={colors.homeInk} />
            <Text style={[styles.retakeBtnLabel, { color: colors.homeInk }]}>
              {Platform.OS === 'web' ? 'Replace' : 'Retake'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.photoBox, { borderColor: colors.homeLine, backgroundColor: colors.homeAqua }]}>
          <Feather name="camera" size={40} color={colors.homeMuted} />
          <Text style={[styles.photoBoxHint, { color: colors.homeMuted }]}>No photo yet</Text>
        </View>
      )}

      <View style={styles.photoActions}>
        <TouchableOpacity
          onPress={onCamera}
          activeOpacity={0.85}
          style={[styles.photoBtn, { backgroundColor: colors.homeCoral }]}
        >
          <Feather name="camera" size={18} color={colors.homeSurface} />
          <Text style={[styles.photoBtnLabel, { color: colors.homeSurface }]}>
            {Platform.OS === 'web' ? 'Choose from Library' : 'Take Photo'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onLibrary}
          activeOpacity={0.85}
          style={[styles.photoBtn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
        >
          <Feather name="image" size={18} color={colors.homeInk} />
          <Text style={[styles.photoBtnLabel, { color: colors.homeInk }]}>Choose from Library</Text>
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
        <View style={[styles.confirm, { backgroundColor: colors.homeBackground, paddingBottom: botPad }]}>
          {frontUri && (
            <Image source={{ uri: frontUri }} style={styles.confirmThumb} resizeMode="cover" />
          )}
          <View style={[styles.confirmIcon, { backgroundColor: colors.homeCoral + '18' }]}>
            <Feather name="check-circle" size={48} color={colors.homeCoral} />
          </View>
          <Text style={[styles.confirmTitle, { color: colors.homeInk }]}>Pin Added!</Text>
          <Text style={[styles.confirmSub, { color: colors.homeMuted }]}>
            "{proposedName}" has been added to the catalogue as a community submission and will appear in searches while awaiting verification.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={[styles.confirmBtn, { backgroundColor: colors.homeCoral, borderRadius: radius.md, shadowColor: colors.homeShadow }]}
          >
            <Text style={[styles.confirmBtnLabel, { color: colors.homeSurface }]}>Done</Text>
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
            <Text style={[styles.confirmSecondaryLabel, { color: colors.homeMuted }]}>Add Another Pin</Text>
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
        placeholderTextColor={colors.homeMuted}
        keyboardType={opts?.keyboardType ?? 'default'}
        multiline={opts?.multiline}
        style={[
          styles.input,
          opts?.multiline && { height: 88, textAlignVertical: 'top' },
          {
            color: colors.homeInk,
            borderColor: opts?.errKey && errors[opts.errKey] ? colors.destructive : colors.homeLine,
            backgroundColor: colors.homeSurface,
            borderRadius: radius.sm,
          },
        ]}
      />
      {opts?.errKey && errors[opts.errKey] && (
        <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors[opts.errKey]}</Text>
      )}
    </>
  );

  // ── Review step ─────────────────────────────────────────────────────────────
  const renderReview = () => (
    <View style={styles.reviewWrap}>
      {frontUri && (
        <Image source={{ uri: frontUri }} style={[styles.reviewHero, { borderRadius: radius.md }]} resizeMode="cover" />
      )}

      <View style={[styles.reviewCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.md }]}>
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
              i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.homeLine },
            ]}
          >
            <Text style={[styles.reviewLabel, { color: colors.homeMuted }]}>{label}</Text>
            <Text style={[styles.reviewValue, { color: colors.homeInk }]} numberOfLines={3}>{value}</Text>
          </View>
        ))}
      </View>

      {saving ? (
        <ActivityIndicator color={colors.homeCoral} style={{ marginTop: spacing.sm }} />
      ) : (
        <TouchableOpacity
          onPress={handleSubmit}
          activeOpacity={0.85}
          style={[styles.submitBtn, { backgroundColor: colors.homeCoral, borderRadius: radius.md, shadowColor: colors.homeShadow }]}
        >
          <Feather name="plus-circle" size={16} color={colors.homeSurface} />
          <Text style={[styles.submitBtnLabel, { color: colors.homeSurface }]}>Add to Catalogue</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Details form ────────────────────────────────────────────────────────────
  const renderDetails = () => (
    <View style={{ gap: spacing.md + 2 }}>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>
          Pin Name <Text style={{ color: colors.destructive }}>*</Text>
        </Text>
        {inp(proposedName, setProposedName, 'e.g. Mickey Mouse 50th Anniversary', { errKey: 'proposedName' })}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>
          Brand / Source <Text style={{ color: colors.destructive }}>*</Text>
        </Text>
        {inp(brand, setBrand, 'e.g. Disney Parks, Loungefly, WDW', { errKey: 'brand' })}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Characters (comma-separated)</Text>
        {inp(characterNames, setCharacterNames, 'e.g. Mickey, Minnie, Goofy')}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Series or Collection</Text>
        {inp(seriesName, setSeriesName, 'e.g. Halloween 2023, Haunted Mansion')}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Release Location</Text>
        {inp(releaseLocation, setReleaseLocation, 'e.g. Magic Kingdom, Disney Store UK')}
      </View>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>Release Year</Text>
        {inp(releaseYear, setReleaseYear, 'e.g. 2024', { keyboardType: 'numeric', errKey: 'releaseYear' })}
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
                  {
                    backgroundColor: active ? colors.homeCoral + '18' : colors.homeSurface,
                    borderColor: active ? colors.homeCoral : colors.homeLine,
                  },
                ]}
              >
                <Text style={[styles.editionBtnLabel, { color: active ? colors.homeCoral : colors.homeMuted }]}>
                  {e.label}
                </Text>
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
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
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
                  style={[styles.navBtn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                >
                  <Feather name="arrow-left" size={16} color={colors.homeInk} />
                  <Text style={[styles.navBtnLabel, { color: colors.homeInk }]}>Back</Text>
                </TouchableOpacity>
              )}
              {/* Photo steps can be skipped */}
              {step < 2 && (
                <TouchableOpacity
                  onPress={goNext}
                  activeOpacity={0.8}
                  style={[styles.navBtn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                >
                  <Text style={[styles.navBtnLabel, { color: colors.homeMuted }]}>Skip</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={goNext}
                activeOpacity={0.85}
                style={[styles.navBtn, styles.navBtnPrimary, { backgroundColor: colors.homeCoral }]}
              >
                <Text style={[styles.navBtnLabel, { color: colors.homeSurface }]}>
                  {step === 2 ? 'Review' : 'Next'}
                </Text>
                <Feather name="arrow-right" size={16} color={colors.homeSurface} />
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
  scroll: { padding: spacing.lg, gap: spacing.xl },

  // Step indicator
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  stepItem: { alignItems: 'center', gap: spacing.xs },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  stepLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', maxWidth: 52, textAlign: 'center' },
  stepLine: { flex: 1, height: 1.5, marginBottom: spacing.lg },

  // Photo step
  photoStep: { gap: spacing.xl - 2 },
  stepTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  stepSub: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  photoBox: {
    alignSelf: 'center', width: 260, height: 220,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderStyle: 'dashed', gap: spacing.md, borderRadius: radius.xl,
  },
  photoBoxHint: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  previewWrap: { alignItems: 'center', gap: spacing.sm + 2 },
  preview: { width: '100%', height: 280, borderRadius: radius.md },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2,
    paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm, borderWidth: 1, borderRadius: radius.sm - 2,
  },
  retakeBtnLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  photoActions: { gap: spacing.sm + 2 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.lg - 2, borderWidth: 1, borderRadius: radius.md,
  },
  photoBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  // Details
  field: { gap: spacing.xs + 3 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  fieldError: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  input: {
    borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 3,
    fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  editionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  editionBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderRadius: radius.sm - 2 },
  editionBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  // Review
  reviewWrap: { gap: spacing.lg },
  reviewHero: { width: '100%', height: 200 },
  reviewCard: { borderWidth: 1, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2, gap: spacing.md },
  reviewLabel: { width: 90, fontSize: 12, fontFamily: 'Inter_400Regular', paddingTop: 1 },
  reviewValue: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },

  // Nav
  navRow: { flexDirection: 'row', gap: spacing.sm + 2, marginTop: spacing.xs },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm - 2, paddingVertical: spacing.lg - 2, borderWidth: 1, borderRadius: radius.md,
  },
  navBtnPrimary: { borderWidth: 0 },
  navBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.lg - 1,
    shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  submitBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  // Confirmation
  confirm: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  confirmThumb: { width: 120, height: 120, borderRadius: radius.xl, marginBottom: spacing.xs },
  confirmIcon: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  confirmSub: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  confirmBtn: { width: '100%', paddingVertical: spacing.lg - 2, alignItems: 'center' },
  confirmBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  confirmSecondary: { paddingVertical: spacing.md },
  confirmSecondaryLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
