/**
 * Add Pin — "Suggest a missing pin" in three short steps (UX-011, #121).
 *
 * Steps:
 *  0 — About: what happens to a suggestion (admin review, you're notified)
 *  1 — Front photo (required; back photo is a later addition)
 *  2 — Details: only the name is required. Set (with suggestions from the
 *      catalogue's sets), year and characters (pre-filled from a scan) are
 *      optional; everything else sits under "More details". An "Already in the catalogue?" check runs on the name.
 *  then — Confirmation
 *
 * Submits via POST /pin-submissions on the API server rather than talking
 * to Supabase directly — the server runs the front photo through Pixian.ai
 * to normalize it (uniform white background, cropped and centered) before
 * storing it, the same way contribute-pin-image.ts does for existing pins.
 * That normalized photo is what becomes the pin's public catalogue image
 * if an admin approves the submission. The submission lands in the
 * pin_submissions review queue (status 'submitted') — an admin must
 * approve it before it becomes a real, publicly visible catalogue pin.
 *
 * Can be reached directly, or from the scan screen's "can't find it" flow
 * (which pre-fills a captured photo and any characters the AI scan
 * recognised via the frontUri / characters route params). Search, the
 * catalogue, and the contributor screen also link here when a pin is
 * missing, passing what the user typed as the `name` param.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
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
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/context/AuthContext';
import { compressSubmissionImage, pickSubmissionImage, type PickedImage } from '@/utils/submissionImage';
import { API_BASE } from '@/lib/apiBase';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { PinImage } from '@/components/ui/PinImage';
import { getPinImageSource } from '@/utils/pinImage';
import { localDuplicateCandidates, MIN_DUPLICATE_QUERY, scanHint, setSuggestions, UNKNOWN_BRAND } from '@/utils/suggestPin';
import type { CataloguePin } from '@workspace/pin-repository';
import { radius, spacing } from '@/constants/theme';

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

const STEPS = ['About', 'Photo', 'Details'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FormErrors {
  proposedName?: string;
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

// ─── About step ───────────────────────────────────────────────────────────────

const NEXT_STEPS: Array<{ icon: React.ComponentProps<typeof Feather>['name']; text: string }> = [
  { icon: 'camera', text: 'Add a clear photo of the front of the pin.' },
  { icon: 'edit-3', text: 'Give it a name. Everything else is optional.' },
  { icon: 'check-circle', text: "An admin checks it. We'll let you know when it's in the catalogue." },
];

function IntroStep({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.photoStep}>
      <Text accessibilityRole="header" style={[styles.stepTitle, { color: colors.homeInk }]}>Help build the catalogue</Text>
      <Text style={[styles.stepSub, { color: colors.homeMuted }]}>
        Can{"\u2019"}t find a pin? Suggest it and it{"\u2019"}ll be added for every collector.
      </Text>
      <View style={[styles.introCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
        <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>WHAT HAPPENS NEXT</Text>
        {NEXT_STEPS.map(({ icon, text }) => (
          <View key={icon} style={styles.introRow}>
            <View style={[styles.introIcon, { backgroundColor: colors.homeCoral + '18' }]}>
              <Feather name={icon} size={14} color={colors.homeCoral} />
            </View>
            <Text style={[styles.introText, { color: colors.homeInk }]}>{text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Photo step ───────────────────────────────────────────────────────────────

function PhotoStep({
  title, subtitle, uri, status, onCamera, onLibrary, colors,
}: {
  title: string;
  subtitle: string;
  uri: string | null;
  /** Clean-up progress for the picked photo (see previewFront). */
  status: PreviewStatus;
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
          {/* Stretch, so the 100%-wide preview isn't sized to nothing. */}
          <View style={styles.previewFrame}>
            <Image source={{ uri }} style={styles.preview} resizeMode="contain" accessibilityLabel="Your photo" />
            {status === 'processing' && (
              <View style={[styles.processingOverlay, { backgroundColor: colors.homeSurface + 'CC' }]}>
                <ActivityIndicator color={colors.homeCoral} />
                <Text style={[styles.processingText, { color: colors.homeInk }]}>Cleaning up your photo…</Text>
              </View>
            )}
          </View>
          {status === 'ready' && (
            <Text style={[styles.previewNote, { color: colors.homeMuted }]}>
              This is how your photo will look in the catalogue.
            </Text>
          )}
          {status === 'raw' && (
            <Text style={[styles.previewNote, { color: colors.homeMuted }]}>
              We couldn{"\u2019"}t clean up this photo, so it{"\u2019"}ll be reviewed as taken. A plain background and good light help.
            </Text>
          )}
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
        {/* Web has no camera, so the first button already opens the library. */}
        {Platform.OS !== 'web' && (
          <TouchableOpacity
            onPress={onLibrary}
            activeOpacity={0.85}
            style={[styles.photoBtn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
          >
            <Feather name="image" size={18} color={colors.homeInk} />
            <Text style={[styles.photoBtnLabel, { color: colors.homeInk }]}>Choose from Library</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

type PreviewStatus = 'none' | 'processing' | 'ready' | 'raw';

interface FrontPreview {
  /** Watermarked, cleaned-up JPEG as a data URI — exactly what will publish. */
  uri: string;
  /** Server-side draft submitted in place of the raw photo. */
  draftPath: string;
  cleaned: boolean;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AddPinScreen() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { session } = useAuth();
  const { pins, series, repository } = usePinCatalogue();
  const {
    frontUri: handoffUri, characters: handoffCharacters, name: handoffName,
    nameHint: rawNameHint, brandHint: rawBrandHint, setHint: rawSetHint,
  } = useLocalSearchParams<{
    frontUri?: string;
    characters?: string;
    name?: string;
    /** Scan guesses, offered as tap-to-use suggestions, never filled in (UX-011). */
    nameHint?: string;
    brandHint?: string;
    setHint?: string;
  }>();
  const nameHint = scanHint(rawNameHint);
  const brandHint = scanHint(rawBrandHint);
  const setHint = scanHint(rawSetHint);

  const [step, setStep] = useState(0);

  // Photo (front only for now — back photo is a later addition)
  const [front, setFront] = useState<PickedImage | null>(null);
  // Cleaned-up preview of `front` from the server (Pixian + watermark).
  const [frontPreview, setFrontPreview] = useState<FrontPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewSeq = useRef(0);

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

  // Brand, characters, edition and the rest: optional, folded away.
  const [showMore, setShowMore] = useState(false);
  // Pins already in the catalogue whose title matches the typed name.
  const [duplicates, setDuplicates] = useState<CataloguePin[]>([]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  // ── Scan handoff ─────────────────────────────────────────────────────────────
  // Arriving from the scan screen's "can't find it" link: carry the photo the
  // user already captured forward, and prefill characters the AI scan
  // recognised (editable — it's a guess, not a confirmed match).
  useEffect(() => {
    if (handoffUri && !front) {
      Image.getSize(
        handoffUri,
        (width, height) => {
          compressSubmissionImage(handoffUri, width, height).then(setFront).catch(() => {});
        },
        () => {
          // Handoff photo couldn't be read (e.g. a stale temp file) — fall
          // back to letting the user pick one on the front-photo step.
        },
      );
    }
    if (handoffCharacters && !characterNames) {
      setCharacterNames(handoffCharacters);
    }
    if (handoffName && !proposedName) {
      setProposedName(handoffName);
    }
    // Only ever consume the handoff once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Clean-up preview ────────────────────────────────────────────────────────
  // As soon as a photo is chosen, run it through the server's clean-up
  // (Pixian background removal + the PinHunt watermark) and show the result,
  // so the collector sees exactly what will appear in the catalogue before
  // submitting. If it fails, the raw photo is still submitted as before.
  useEffect(() => {
    if (!front || !session?.access_token) { setFrontPreview(null); return; }
    const seq = ++previewSeq.current;
    setFrontPreview(null);
    setPreviewing(true);
    fetch(`${API_BASE}/pin-submissions/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ frontImageBase64: front.base64, mimeType: 'image/jpeg' }),
    })
      .then(r => r.json().then(d => (r.ok ? d : null)))
      .then((d: { draftPath: string; previewBase64: string; cleaned: boolean } | null) => {
        if (seq !== previewSeq.current || !d) return;
        setFrontPreview({ uri: `data:image/jpeg;base64,${d.previewBase64}`, draftPath: d.draftPath, cleaned: d.cleaned });
      })
      .catch(() => {})
      .finally(() => { if (seq === previewSeq.current) setPreviewing(false); });
  }, [front, session?.access_token]);

  const previewStatus: PreviewStatus = !front ? 'none'
    : previewing ? 'processing'
    : frontPreview?.cleaned ? 'ready'
    : 'raw';
  const shownFrontUri = frontPreview?.uri ?? front?.uri ?? null;

  // ── Already in the catalogue? ────────────────────────────────────────────────
  // A light check on the typed name, so a collector can spot a pin that's
  // already there before suggesting it again. Never blocks submitting.
  useEffect(() => {
    const name = proposedName.trim();
    if (name.length < MIN_DUPLICATE_QUERY) { setDuplicates([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      const search = repository
        ? repository.searchPinsPage(name, { limit: 3, offset: 0 }).then(r => r.pins)
        : Promise.resolve(localDuplicateCandidates(pins, name));
      search
        .then(found => { if (!cancelled) setDuplicates(found.slice(0, 3)); })
        .catch(() => { if (!cancelled) setDuplicates([]); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [proposedName, repository, pins]);

  const setOptions = setSuggestions(series, seriesName);

  // ── Photo picker ─────────────────────────────────────────────────────────────
  const pickFront = async (source: 'camera' | 'library') => {
    const img = await pickSubmissionImage(source);
    if (img) setFront(img);
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!proposedName.trim()) errs.proposedName = 'Give the pin a name.';
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
    if (step === 1 && !front) {
      Alert.alert('Front photo required', 'Please add a front photo before continuing.');
      return;
    }
    if (step === 1 && previewing) return;
    setStep(s => s + 1);
  };
  const goBack = () => setStep(s => s - 1);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!session?.access_token) {
      Alert.alert('Sign in required', 'Please sign in to submit a pin.');
      return;
    }
    if (!front) {
      Alert.alert('Front photo required', 'Please add a front photo before submitting.');
      return;
    }
    if (!validate()) return;

    const characters = characterNames.trim()
      ? characterNames.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    try {
      setSaving(true);

      const res = await fetch(`${API_BASE}/pin-submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          proposedName:     proposedName.trim(),
          // Required by the server; optional for collectors (UX-011).
          brand:            brand.trim() || UNKNOWN_BRAND,
          seriesName:       seriesName.trim() || undefined,
          releaseLocation:  releaseLocation.trim() || undefined,
          releaseYear:      releaseYear.trim() ? parseInt(releaseYear, 10) : undefined,
          editionType,
          editionSize:      editionSize.trim() ? parseInt(editionSize, 10) : undefined,
          facNumber:        facNumber.trim() || undefined,
          sku:              sku.trim() || undefined,
          characterNames:   characters,
          // Submit the previewed (already cleaned) photo when there is one.
          ...(frontPreview
            ? { frontDraftPath: frontPreview.draftPath }
            : { frontImageBase64: front.base64 }),
          notes:            notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not submit pin.');

      setDone(true);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not submit pin. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Confirmation ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <>
        <Stack.Screen options={{ title: 'Pin Submitted', headerBackVisible: false }} />
        <View style={[styles.confirm, { backgroundColor: colors.homeBackground, paddingBottom: botPad }]}>
          {front && (
            <Image source={{ uri: shownFrontUri ?? front.uri }} style={styles.confirmThumb} resizeMode="cover" />
          )}
          <View style={[styles.confirmIcon, { backgroundColor: colors.homeCoral + '18' }]}>
            <Feather name="check-circle" size={48} color={colors.homeCoral} />
          </View>
          <Text style={[styles.confirmTitle, { color: colors.homeInk }]}>Pin Submitted!</Text>
          <Text style={[styles.confirmSub, { color: colors.homeMuted }]}>
            "{proposedName}" has been submitted for review. We'll let you know once an admin has checked it — you can track its status under My Submissions.
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
              setFront(null);
              setProposedName(''); setBrand(''); setCharacterNames('');
              setSeriesName(''); setReleaseLocation(''); setReleaseYear('');
              setEditionType('unknown'); setEditionSize('');
              setFacNumber(''); setSku(''); setNotes('');
              // Another suggestion skips the About step.
              setShowMore(false); setStep(1); setDone(false);
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

  /** "From your scan: …" — tap to use the scan's guess for this field. */
  const scanChip = (hint: string, current: string, label: string, onUse: () => void) =>
    hint && current.trim() !== hint ? (
      <TouchableOpacity
        onPress={onUse}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Use ${label} from your scan: ${hint}`}
        style={[styles.scanChip, { backgroundColor: colors.homeCoral + '14', borderColor: colors.homeCoral + '55' }]}
      >
        <Feather name="camera" size={12} color={colors.homeCoral} />
        <Text style={[styles.editionBtnLabel, { color: colors.homeInk, flexShrink: 1 }]} numberOfLines={1}>
          From your scan: {hint}
        </Text>
      </TouchableOpacity>
    ) : null;

  const field = (label: string, required: boolean, input: React.ReactNode) => (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.homeMuted }]}>
        {label}{required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
      </Text>
      {input}
    </View>
  );

  // ── Details: name required; set and year optional; the rest folded away ────
  const renderDetails = () => (
    <View style={{ gap: spacing.md + 2 }}>
      {front && (
        <View style={styles.detailsHead}>
          <Image source={{ uri: shownFrontUri ?? front.uri }} style={[styles.detailsThumb, { borderRadius: radius.md }]} resizeMode="cover" />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[styles.stepTitle, { color: colors.homeInk }]}>About this pin</Text>
            <Text style={[styles.stepSub, { color: colors.homeMuted }]}>Only the name is needed. Add anything else you know.</Text>
          </View>
        </View>
      )}

      {field('Pin name', true, (
        <>
          {inp(proposedName, setProposedName, 'e.g. Dumbo Blue Sky', { errKey: 'proposedName' })}
          {scanChip(nameHint, proposedName, 'name', () => {
            setProposedName(nameHint);
            setErrors(e => ({ ...e, proposedName: undefined }));
          })}
        </>
      ))}

      {duplicates.length > 0 && (
        <View
          style={[styles.dupeCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
          accessibilityLabel="Already in the catalogue?"
        >
          <Text style={[styles.dupeTitle, { color: colors.homeInk }]}>Already in the catalogue?</Text>
          {duplicates.map(p => (
            <TouchableOpacity
              key={p.id}
              onPress={() => router.push({ pathname: '/pin/[id]', params: { id: p.id } })}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${p.title}. Open pin details`}
              style={styles.dupeRow}
            >
              <PinImage source={getPinImageSource(p)} style={[styles.dupeThumb, { backgroundColor: colors.homeAqua }]} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.dupeName, { color: colors.homeInk }]} numberOfLines={1}>{p.title}</Text>
                {p.collection ? <Text style={[styles.dupeSet, { color: colors.homeMuted }]} numberOfLines={1}>{p.collection}</Text> : null}
              </View>
              <Feather name="chevron-right" size={16} color={colors.homeMuted} />
            </TouchableOpacity>
          ))}
          <Text style={[styles.dupeNote, { color: colors.homeMuted }]}>Not one of these? Carry on below.</Text>
        </View>
      )}

      {field('Set or collection', false, (
        <>
          {inp(seriesName, setSeriesName, 'e.g. Park Icons')}
          {scanChip(setHint, seriesName, 'set', () => setSeriesName(setHint))}
          {setOptions.length > 0 && (
            <View style={styles.chipRow}>
              {setOptions.map(name => (
                <TouchableOpacity
                  key={name}
                  onPress={() => setSeriesName(name)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Use set ${name}`}
                  style={[styles.editionBtn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                >
                  <Text style={[styles.editionBtnLabel, { color: colors.homeInk }]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      ))}

      {field('Release year', false, inp(releaseYear, setReleaseYear, 'e.g. 2024', { keyboardType: 'numeric', errKey: 'releaseYear' }))}

      {/* Always in view: a scan hands over the characters it recognised. */}
      {field('Characters (comma-separated)', false, inp(characterNames, setCharacterNames, 'e.g. Mickey, Minnie, Goofy'))}

      <TouchableOpacity
        onPress={() => setShowMore(m => !m)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="More details (optional)"
        accessibilityState={{ expanded: showMore }}
        style={styles.moreToggle}
      >
        <Text style={[styles.moreLabel, { color: colors.homeInk }]}>More details (optional)</Text>
        <Feather name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={colors.homeMuted} />
      </TouchableOpacity>

      {showMore && (
        <View style={{ gap: spacing.md + 2 }}>
          {field('Brand or source', false, (
            <>
              {inp(brand, setBrand, 'e.g. Disney Parks, Loungefly')}
              {scanChip(brandHint, brand, 'brand', () => setBrand(brandHint))}
            </>
          ))}
          {field('Release location', false, inp(releaseLocation, setReleaseLocation, 'e.g. Disneyland Paris, Disney Store UK'))}
          {field('Edition type', false, (
            <View style={styles.editionGrid}>
              {EDITION_TYPES.map(e => {
                const active = editionType === e.value;
                return (
                  <TouchableOpacity
                    key={e.value}
                    onPress={() => setEditionType(e.value)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={e.label}
                    accessibilityState={{ selected: active }}
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
          ))}
          {field('Edition size', false, inp(editionSize, setEditionSize, 'e.g. 2500', { keyboardType: 'numeric', errKey: 'editionSize' }))}
          {field('FAC number', false, inp(facNumber, setFacNumber, 'e.g. 24-FAC-12345'))}
          {field('SKU / product number', false, inp(sku, setSku, 'e.g. 400041234567'))}
          {field('Notes', false, inp(notes, setNotes, 'Any additional details…', { multiline: true }))}
        </View>
      )}
    </View>
  );

  const stepContent = [
    <IntroStep key="intro" colors={colors} />,
    <PhotoStep
      key="front"
      title="Front photo"
      subtitle="Photograph the front of the pin clearly, so an admin can check it."
      uri={shownFrontUri}
      status={previewStatus}
      onCamera={() => pickFront('camera')}
      onLibrary={() => pickFront('library')}
      colors={colors}
    />,
    renderDetails(),
  ][step];

  return (
    <>
      <Stack.Screen options={{ title: 'Suggest a pin' }} />
      {/* Scrolls the focused field above the keyboard (UX-011). */}
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
          <StepIndicator current={step} colors={colors} />

          {stepContent}

          <View style={styles.navRow}>
            {step > 0 && (
              <TouchableOpacity
                onPress={goBack}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={[styles.navBtn, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
              >
                <Feather name="arrow-left" size={16} color={colors.homeInk} />
                <Text style={[styles.navBtnLabel, { color: colors.homeInk }]}>Back</Text>
              </TouchableOpacity>
            )}
            {step < 2 ? (
              <TouchableOpacity
                onPress={goNext}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={step === 0 ? 'Get started' : 'Next'}
                style={[styles.navBtn, styles.navBtnPrimary, { backgroundColor: colors.homeCoral }]}
              >
                <Text style={[styles.navBtnLabel, { color: colors.homeSurface }]}>
                  {step === 0 ? 'Get started' : 'Next'}
                </Text>
                <Feather name="arrow-right" size={16} color={colors.homeSurface} />
              </TouchableOpacity>
            ) : saving ? (
              <View style={[styles.navBtn, styles.navBtnPrimary]}>
                <ActivityIndicator color={colors.homeCoral} />
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleSubmit}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Submit for review"
                style={[styles.navBtn, styles.navBtnPrimary, { backgroundColor: colors.homeCoral }]}
              >
                <Feather name="send" size={16} color={colors.homeSurface} />
                <Text style={[styles.navBtnLabel, { color: colors.homeSurface }]}>Submit</Text>
              </TouchableOpacity>
            )}
          </View>
      </KeyboardAwareScrollViewCompat>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 },
  processingText:    { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  previewNote:       { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center' },
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
  previewFrame: { alignSelf: 'stretch' },
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

  // About
  introCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md + 2, gap: spacing.md },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  introIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_500Medium' },

  // Details
  detailsHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailsThumb: { width: 72, height: 72 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  scanChip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs + 2, maxWidth: '100%',
    marginTop: spacing.xs, minHeight: 36, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radius.sm - 2,
  },
  dupeCard: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  dupeTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  dupeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  dupeThumb: { width: 44, height: 44, borderRadius: radius.sm },
  dupeName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  dupeSet: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dupeNote: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  moreToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  moreLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Nav
  navRow: { flexDirection: 'row', gap: spacing.sm + 2, marginTop: spacing.xs },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm - 2, paddingVertical: spacing.lg - 2, borderWidth: 1, borderRadius: radius.md,
  },
  navBtnPrimary: { borderWidth: 0 },
  navBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },


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
