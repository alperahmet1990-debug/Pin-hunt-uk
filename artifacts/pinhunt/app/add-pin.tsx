/**
 * Add Pin — submit a pin directly into the catalogue.
 *
 * Uses submitMissingPin which inserts into the pins table with
 * verification_status = 'community_submitted'. No storage bucket required.
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { createSupabasePinRepository } from '@workspace/pin-repository';

const EDITION_TYPES = [
  { value: 'unknown',         label: 'Unknown' },
  { value: 'open_edition',    label: 'Open Edition' },
  { value: 'limited_edition', label: 'Limited Edition' },
  { value: 'limited_release', label: 'Limited Release' },
  { value: 'mystery',         label: 'Mystery' },
  { value: 'hidden_disney',   label: 'Hidden Disney' },
] as const;

type EditionValue = (typeof EDITION_TYPES)[number]['value'];

interface FormErrors {
  proposedName?: string;
  brand?: string;
  releaseYear?: string;
  editionSize?: string;
}

export default function AddPinScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user } = useAuth();

  // Form fields
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

  const [errors,  setErrors]  = useState<FormErrors>({});
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  // ── Validation ─────────────────────────────────────────────────────────────
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

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    if (!isSupabaseConfigured) {
      Alert.alert('Not connected', 'Supabase is not configured.');
      return;
    }

    const characters = characterNames.trim()
      ? characterNames.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    try {
      setSaving(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const repo = createSupabasePinRepository(supabase as any);
      const pin  = await repo.submitMissingPin({
        title:       proposedName.trim(),
        brand:       brand.trim(),
        collection:  seriesName.trim() || brand.trim(),
        characters,
        edition:     editionType !== 'unknown' ? editionType : undefined,
        origin:      releaseLocation.trim() || undefined,
        description: [
          notes.trim(),
          facNumber.trim() ? `FAC: ${facNumber.trim()}` : '',
          sku.trim()       ? `SKU: ${sku.trim()}`       : '',
          releaseYear.trim()  ? `Year: ${releaseYear.trim()}`   : '',
          editionSize.trim()  ? `Edition size: ${editionSize.trim()}` : '',
        ].filter(Boolean).join('\n') || undefined,
        submittedBy: user?.id,
      });
      setAddedId(pin.id);
      setDone(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not add pin. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Confirmation ───────────────────────────────────────────────────────────
  if (done) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pin Added', headerBackVisible: false }} />
        <View style={[styles.confirm, { backgroundColor: colors.background, paddingBottom: botPad }]}>
          <View style={[styles.confirmIcon, { backgroundColor: colors.primary + '18' }]}>
            <Feather name="check-circle" size={52} color={colors.primary} />
          </View>
          <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Pin Added!</Text>
          <Text style={[styles.confirmSub, { color: colors.mutedForeground }]}>
            "{proposedName}" has been added to the catalogue as a community submission.
            It will appear in searches while awaiting verification.
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
              setProposedName(''); setBrand(''); setCharacterNames('');
              setSeriesName(''); setReleaseLocation(''); setReleaseYear('');
              setEditionType('unknown'); setEditionSize('');
              setFacNumber(''); setSku(''); setNotes('');
              setDone(false); setAddedId(null);
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

  // ── Form ───────────────────────────────────────────────────────────────────
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
          {/* Info banner */}
          <View style={[styles.infoBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30', borderRadius: 10 }]}>
            <Feather name="info" size={14} color={colors.primary} style={{ marginTop: 1 }} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
              Your submission will appear in the catalogue immediately as a community pin, flagged for verification.
            </Text>
          </View>

          {/* Required */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>REQUIRED</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Pin Name <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              {inp(proposedName, setProposedName, 'e.g. Mickey Mouse 50th Anniversary', { errKey: 'proposedName' })}
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Brand / Source <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              {inp(brand, setBrand, 'e.g. Disney Parks, Loungefly, WDW', { errKey: 'brand' })}
            </View>
          </View>

          {/* Optional */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>OPTIONAL</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Characters (comma-separated)</Text>
              {inp(characterNames, setCharacterNames, 'e.g. Mickey, Minnie, Goofy')}
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Series or Collection</Text>
              {inp(seriesName, setSeriesName, 'e.g. Halloween 2023, Haunted Mansion')}
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Release Location</Text>
              {inp(releaseLocation, setReleaseLocation, 'e.g. Magic Kingdom, Disney Store UK')}
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Release Year</Text>
              {inp(releaseYear, setReleaseYear, 'e.g. 2024', { keyboardType: 'numeric', errKey: 'releaseYear' })}
            </View>
          </View>

          {/* Edition */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>EDITION</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
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
                          backgroundColor: active ? colors.primary + '18' : colors.secondary,
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
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Edition Size</Text>
              {inp(editionSize, setEditionSize, 'e.g. 2500', { keyboardType: 'numeric', errKey: 'editionSize' })}
            </View>
          </View>

          {/* Identifiers */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>IDENTIFIERS</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>FAC Number</Text>
              {inp(facNumber, setFacNumber, 'e.g. 24-FAC-12345')}
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SKU / Product Number</Text>
              {inp(sku, setSku, 'e.g. 400041234567')}
            </View>
          </View>

          {/* Notes */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>NOTES</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Additional Details</Text>
              {inp(notes, setNotes, 'Anything else that might help identify this pin…', { multiline: true })}
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.85}
            style={[styles.submitBtn, { backgroundColor: colors.primary, borderRadius: 12, opacity: saving ? 0.7 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="plus-circle" size={16} color="#fff" />
                <Text style={styles.submitBtnLabel}>Add to Catalogue</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },

  infoBanner: { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 4, marginBottom: 2 },

  card: { borderWidth: 1, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  field: { padding: 14, gap: 8 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.3 },
  fieldError: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#EF4444', marginTop: -4 },

  input: {
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, fontFamily: 'Inter_400Regular',
  },

  editionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  editionBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, marginTop: 4,
  },
  submitBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },

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
