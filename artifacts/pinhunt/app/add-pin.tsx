/**
 * Add Pin — multi-step catalogue contribution flow.
 *
 * Steps:
 *  0 — Front photo (required)
 *  1 — Back photo  (optional)
 *  2 — Pin details
 *  3 — Review & save / submit
 *  4 — Confirmation
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { pickSubmissionImage } from '@/utils/submissionImage';
import type { EditionType } from '@workspace/pin-repository';

// ─── Constants ────────────────────────────────────────────────────────────────

const EDITION_TYPES: { value: EditionType; label: string }[] = [
  { value: 'unknown',        label: 'Unknown' },
  { value: 'open_edition',   label: 'Open Edition' },
  { value: 'limited_edition',label: 'Limited Edition' },
  { value: 'limited_release',label: 'Limited Release' },
  { value: 'mystery',        label: 'Mystery' },
  { value: 'hidden_disney',  label: 'Hidden Disney' },
];

const STEPS = ['Front Photo', 'Back Photo', 'Details', 'Review'];

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  frontUri:        string | null;
  backUri:         string | null;
  proposedName:    string;
  brand:           string;
  characterNames:  string;   // comma-separated → string[]
  seriesName:      string;
  releaseLocation: string;
  releaseYear:     string;
  editionType:     EditionType;
  editionSize:     string;
  facNumber:       string;
  sku:             string;
  notes:           string;
}

const BLANK: FormState = {
  frontUri:        null,
  backUri:         null,
  proposedName:    '',
  brand:           '',
  characterNames:  '',
  seriesName:      '',
  releaseLocation: '',
  releaseYear:     '',
  editionType:     'unknown',
  editionSize:     '',
  facNumber:       '',
  sku:             '',
  notes:           '',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ current, colors }: { current: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.stepRow}>
      {STEPS.map((label, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <React.Fragment key={label}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepDot,
                { borderColor: active || done ? colors.primary : colors.border,
                  backgroundColor: done ? colors.primary : active ? colors.primary + '22' : 'transparent' }
              ]}>
                {done
                  ? <Feather name="check" size={10} color="#fff" />
                  : <Text style={[styles.stepNum, { color: active ? colors.primary : colors.mutedForeground }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[styles.stepLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{label}</Text>
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

function PhotoStep({
  title, subtitle, uri, onCamera, onLibrary, colors,
}: {
  title: string; subtitle: string; uri: string | null;
  onCamera: () => void; onLibrary: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.photoStep}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.sectionSub,   { color: colors.mutedForeground }]}>{subtitle}</Text>

      {uri ? (
        <View style={styles.photoPreviewWrap}>
          <Image source={{ uri }} style={styles.photoPreview} resizeMode="contain" />
          <TouchableOpacity
            onPress={onCamera}
            activeOpacity={0.8}
            style={[styles.retakeBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 8 }]}
          >
            <Feather name="refresh-cw" size={14} color={colors.foreground} />
            <Text style={[styles.retakeBtnLabel, { color: colors.foreground }]}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.photoPlaceholder}>
          <View style={[styles.photoBox, { borderColor: colors.border, backgroundColor: colors.secondary, borderRadius: 16 }]}>
            <Feather name="image" size={48} color={colors.mutedForeground} />
            <Text style={[styles.photoBoxHint, { color: colors.mutedForeground }]}>No photo yet</Text>
          </View>
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={{ color: '#EF4444' }}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AddPinScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId } = useMarketplace();

  const [step, setStep]     = useState(0);
  const [form, setForm]     = useState<FormState>(BLANK);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  // ── Photo pickers ─────────────────────────────────────────────────────────
  const pickFront = async (source: 'camera' | 'library') => {
    const img = await pickSubmissionImage(source);
    if (img) set('frontUri', img.uri);
  };

  const pickBack = async (source: 'camera' | 'library') => {
    const img = await pickSubmissionImage(source);
    if (img) set('backUri', img.uri);
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validateDetails = (): boolean => {
    const errs: typeof errors = {};
    if (!form.proposedName.trim()) errs.proposedName = 'Pin name is required.';
    if (!form.brand.trim())        errs.brand        = 'Brand is required.';
    if (form.releaseYear.trim()) {
      const y = parseInt(form.releaseYear, 10);
      if (isNaN(y) || y < 1900 || y > 2030) errs.releaseYear = 'Enter a year between 1900 and 2030.';
    }
    if (form.editionSize.trim()) {
      const s = parseInt(form.editionSize, 10);
      if (isNaN(s) || s <= 0) errs.editionSize = 'Edition size must be a positive number.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const goNext = () => {
    if (step === 0 && !form.frontUri) {
      Alert.alert('Photo required', 'Please add a front photo of the pin before continuing.');
      return;
    }
    if (step === 2 && !validateDetails()) return;
    setStep(s => s + 1);
  };

  const goBack = () => setStep(s => s - 1);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSave = async (submitForReview: boolean) => {
    if (!repo || !userId || !form.frontUri) return;

    const characters = form.characterNames.trim()
      ? form.characterNames.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    try {
      setSaving(true);
      const submission = await repo.createPinSubmission(userId, {
        proposedName:    form.proposedName.trim(),
        brand:           form.brand.trim(),
        seriesName:      form.seriesName.trim()      || undefined,
        releaseLocation: form.releaseLocation.trim() || undefined,
        releaseYear:     form.releaseYear.trim()  ? parseInt(form.releaseYear, 10)  : undefined,
        editionType:     form.editionType,
        editionSize:     form.editionSize.trim() ? parseInt(form.editionSize, 10) : undefined,
        facNumber:       form.facNumber.trim()       || undefined,
        sku:             form.sku.trim()             || undefined,
        characterNames:  characters,
        frontImageUri:   form.frontUri,
        backImageUri:    form.backUri ?? undefined,
        notes:           form.notes.trim()           || undefined,
        status:          submitForReview ? 'submitted' : 'draft',
      });

      setSavedId(submission.id);
      setStep(4); // confirmation
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Confirmation step ─────────────────────────────────────────────────────
  if (step === 4) {
    const submitted = form.proposedName;
    return (
      <>
        <Stack.Screen options={{ title: 'Pin Submitted', headerBackVisible: false }} />
        <View style={[styles.confirm, { backgroundColor: colors.background, paddingBottom: botPad }]}>
          <View style={[styles.confirmIcon, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="check-circle" size={52} color={colors.primary} />
          </View>
          <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
            {saving ? 'Saved as draft' : 'Submitted for review'}
          </Text>
          <Text style={[styles.confirmSub, { color: colors.mutedForeground }]}>
            "{submitted}" has been {saving ? 'saved' : 'submitted'}. Our team will review it and may reach out if we need more information.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/my-submissions')}
            activeOpacity={0.85}
            style={[styles.confirmBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
          >
            <Text style={styles.confirmBtnLabel}>View My Submissions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setForm(BLANK); setStep(0); setSavedId(null); }}
            activeOpacity={0.7}
            style={styles.confirmSecondary}
          >
            <Text style={[styles.confirmSecondaryLabel, { color: colors.mutedForeground }]}>Add Another Pin</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  // ── Review step ───────────────────────────────────────────────────────────
  const renderReview = () => (
    <View style={styles.reviewWrap}>
      {form.frontUri && (
        <Image source={{ uri: form.frontUri }} style={[styles.reviewThumb, { borderRadius: 12 }]} resizeMode="cover" />
      )}
      <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
        {[
          ['Pin Name',    form.proposedName],
          ['Brand',       form.brand],
          ['Characters',  form.characterNames || '—'],
          ['Series',      form.seriesName     || '—'],
          ['Location',    form.releaseLocation|| '—'],
          ['Year',        form.releaseYear    || '—'],
          ['Edition',     EDITION_TYPES.find(e => e.value === form.editionType)?.label ?? '—'],
          ['Edition Size',form.editionSize    || '—'],
          ['FAC #',       form.facNumber      || '—'],
          ['SKU',         form.sku            || '—'],
          ['Back Photo',  form.backUri ? 'Included' : 'Not provided'],
          ['Notes',       form.notes          || '—'],
        ].map(([label, value], i) => (
          <View key={label} style={[styles.reviewRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <Text style={[styles.reviewLabel, { color: colors.mutedForeground }]}>{label}</Text>
            <Text style={[styles.reviewValue, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>

      {saving ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
      ) : (
        <View style={styles.reviewActions}>
          <TouchableOpacity
            onPress={() => handleSave(false)}
            activeOpacity={0.85}
            style={[styles.reviewBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}
          >
            <Feather name="save" size={16} color={colors.foreground} />
            <Text style={[styles.reviewBtnLabel, { color: colors.foreground }]}>Save as Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSave(true)}
            activeOpacity={0.85}
            style={[styles.reviewBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
          >
            <Feather name="send" size={16} color="#fff" />
            <Text style={[styles.reviewBtnLabel, { color: '#fff' }]}>Submit for Review</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ── Details step ──────────────────────────────────────────────────────────
  const inp = (key: keyof FormState, placeholder: string, opts?: {
    keyboardType?: 'default' | 'numeric'; multiline?: boolean;
  }) => (
    <TextInput
      value={form[key] as string}
      onChangeText={v => { set(key, v as FormState[typeof key]); if (errors[key]) setErrors(e => ({ ...e, [key]: undefined })); }}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground + '88'}
      keyboardType={opts?.keyboardType ?? 'default'}
      multiline={opts?.multiline}
      style={[
        styles.input,
        opts?.multiline && { height: 80, textAlignVertical: 'top' },
        {
          color: colors.foreground,
          borderColor: errors[key] ? '#EF4444' : colors.border,
          backgroundColor: colors.card,
          borderRadius: 10,
        },
      ]}
    />
  );

  const renderDetails = () => (
    <View style={{ gap: 4 }}>
      <Field label="Pin Name" required>
        {inp('proposedName', 'e.g. Mickey Mouse 50th Anniversary')}
        {errors.proposedName && <Text style={styles.fieldError}>{errors.proposedName}</Text>}
      </Field>
      <Field label="Brand / Source" required>
        {inp('brand', 'e.g. Disney Parks, Loungefly, WDW')}
        {errors.brand && <Text style={styles.fieldError}>{errors.brand}</Text>}
      </Field>
      <Field label="Characters (comma-separated)">
        {inp('characterNames', 'e.g. Mickey, Minnie')}
      </Field>
      <Field label="Series or Collection">
        {inp('seriesName', 'e.g. Halloween 2023')}
      </Field>
      <Field label="Release Location">
        {inp('releaseLocation', 'e.g. Magic Kingdom, Disney Store UK')}
      </Field>
      <Field label="Release Year">
        {inp('releaseYear', 'e.g. 2023', { keyboardType: 'numeric' })}
        {errors.releaseYear && <Text style={styles.fieldError}>{errors.releaseYear}</Text>}
      </Field>

      {/* Edition type */}
      <Field label="Edition Type">
        <View style={styles.editionGrid}>
          {EDITION_TYPES.map(e => {
            const active = form.editionType === e.value;
            return (
              <TouchableOpacity
                key={e.value}
                onPress={() => set('editionType', e.value)}
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
      </Field>

      <Field label="Edition Size">
        {inp('editionSize', 'e.g. 2500', { keyboardType: 'numeric' })}
        {errors.editionSize && <Text style={styles.fieldError}>{errors.editionSize}</Text>}
      </Field>
      <Field label="FAC Number">
        {inp('facNumber', 'e.g. 24-FAC-12345')}
      </Field>
      <Field label="SKU / Product Number">
        {inp('sku', 'e.g. 400041234567')}
      </Field>
      <Field label="Notes">
        {inp('notes', 'Any additional details for the reviewer…', { multiline: true })}
      </Field>
    </View>
  );

  const stepContent = [
    <PhotoStep
      key="front"
      title="Front Photo"
      subtitle="Photograph the front of the pin clearly. This is required."
      uri={form.frontUri}
      onCamera={() => pickFront('camera')}
      onLibrary={() => pickFront('library')}
      colors={colors}
    />,
    <PhotoStep
      key="back"
      title="Back Photo"
      subtitle="Photograph the back of the pin to show markings and copyright info. This is optional but recommended."
      uri={form.backUri}
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

          {/* Nav buttons (not shown on review step — review has its own CTA) */}
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
              {step === 1 && (
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
  photoStep: { gap: 16 },
  sectionTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  sectionSub: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  photoPlaceholder: { alignItems: 'center' },
  photoBox: {
    width: 260, height: 220, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderStyle: 'dashed', gap: 12,
  },
  photoBoxHint: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  photoPreviewWrap: { alignItems: 'center', gap: 10 },
  photoPreview: { width: 280, height: 280, borderRadius: 12 },
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
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#6B7280', letterSpacing: 0.4 },
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
  reviewThumb: { width: '100%', height: 200 },
  reviewCard: { borderWidth: 1, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  reviewLabel: { width: 90, fontSize: 12, fontFamily: 'Inter_400Regular' },
  reviewValue: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  reviewActions: { flexDirection: 'row', gap: 10 },
  reviewBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderWidth: 1,
  },
  reviewBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Nav
  navRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderWidth: 1,
  },
  navBtnPrimary: { borderWidth: 0 },
  navBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  // Confirmation
  confirm: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  confirmIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  confirmSub: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  confirmBtn: { width: '100%', paddingVertical: 14, alignItems: 'center' },
  confirmBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  confirmSecondary: { paddingVertical: 12 },
  confirmSecondaryLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
