/**
 * Admin Pin Editor — create (id='new') or edit an existing catalogue pin.
 *
 * Fields: name, images, brand, series/collection, characters, release
 * year/date/location, edition type/size, product type (categories), description,
 * source notes (FAC, SKU, external IDs), verification status, catalogue status.
 *
 * "Save and Add Another" path is available on create.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { createSupabasePinRepository, createSupabaseUserRepository } from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { pickSubmissionImage } from '@/utils/submissionImage';
import type {
  CataloguePin,
  CataloguePinStatus,
  PinVerificationStatus,
} from '@workspace/pin-repository';

// ─── Constants ────────────────────────────────────────────────────────────────

const EDITION_TYPES = [
  { value: 'open_edition',    label: 'Open Edition' },
  { value: 'limited_edition', label: 'Limited Edition' },
  { value: 'limited_release', label: 'Limited Release' },
  { value: 'mystery',         label: 'Mystery' },
  { value: 'hidden_disney',   label: 'Hidden Disney' },
  { value: 'unknown',         label: 'Unknown' },
] as const;

const VERIFICATION_STATUSES: { value: PinVerificationStatus; label: string; color: string }[] = [
  { value: 'verified',                  label: 'Verified',         color: '#16A34A' },
  { value: 'needs_source_verification', label: 'Needs Source',     color: '#F59E0B' },
  { value: 'community_submitted',       label: 'Community',        color: '#3B82F6' },
  { value: 'unverified',                label: 'Unverified',       color: '#6B7280' },
];

const CATALOGUE_STATUSES: { value: CataloguePinStatus; label: string; color: string }[] = [
  { value: 'active',         label: 'Active',         color: '#16A34A' },
  { value: 'pending_review', label: 'Pending Review', color: '#F59E0B' },
  { value: 'archived',       label: 'Archived',       color: '#6B7280' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePinhuntId(): string {
  const n = Math.floor(Math.random() * 99_999_999) + 1;
  return `PHUK-${String(n).padStart(8, '0')}`;
}

async function uploadImage(localUri: string, storagePath: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from('pin-catalogue')
    .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from('pin-catalogue').getPublicUrl(storagePath);
  return data.publicUrl;
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  label, required, error, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4, color: colors.mutedForeground }}>
        {label}{required && <Text style={{ color: '#EF4444' }}> *</Text>}
      </Text>
      {children}
      {error && <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#EF4444' }}>{error}</Text>}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AdminPinEditorScreen() {
  const {
    id: routeId,
    // Prefill params from "Approve & Add to Catalogue" flow
    submissionId,
    prefillTitle,
    prefillBrand,
    prefillSeries,
    prefillOrigin,
    prefillYear,
    prefillEditionType,
    prefillEditionSize,
    prefillFacNumber,
    prefillSku,
    prefillCharacters,
    prefillNotes,
    prefillFrontPath,
    prefillBackPath,
  } = useLocalSearchParams<{
    id: string;
    submissionId?: string;
    prefillTitle?: string;
    prefillBrand?: string;
    prefillSeries?: string;
    prefillOrigin?: string;
    prefillYear?: string;
    prefillEditionType?: string;
    prefillEditionSize?: string;
    prefillFacNumber?: string;
    prefillSku?: string;
    prefillCharacters?: string;
    prefillNotes?: string;
    prefillFrontPath?: string;
    prefillBackPath?: string;
  }>();
  const isNew = routeId === 'new';
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const repo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabasePinRepository(supabase as any);
  }, []);

  const userRepo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabaseUserRepository(supabase as any);
  }, []);

  // ── Loading existing pin ────────────────────────────────────────────────────
  const [loadingPin, setLoadingPin] = useState(!isNew);
  const [loadError, setLoadError]   = useState<string | null>(null);

  // ── Form fields ─────────────────────────────────────────────────────────────
  const [pinhuntId,       setPinhuntId]       = useState(isNew ? generatePinhuntId() : '');
  const [title,           setTitle]           = useState('');
  const [brand,           setBrand]           = useState('');
  const [collection,      setCollection]      = useState('');
  const [characters,      setCharacters]      = useState('');   // comma-separated
  const [categories,      setCategories]      = useState('');   // comma-separated
  const [releaseYear,     setReleaseYear]     = useState('');
  const [releaseDate,     setReleaseDate]     = useState('');
  const [origin,          setOrigin]          = useState('');
  const [editionType,     setEditionType]     = useState<string>('unknown');
  const [editionSize,     setEditionSize]     = useState('');
  const [description,     setDescription]     = useState('');
  const [sourceNotes,     setSourceNotes]     = useState('');
  const [facNumber,       setFacNumber]       = useState('');
  const [sku,             setSku]             = useState('');
  const [retailPrice,     setRetailPrice]     = useState('');
  const [verificationStatus, setVerificationStatus] = useState<PinVerificationStatus>('unverified');
  const [catalogueStatus,    setCatalogueStatus]    = useState<CataloguePinStatus>('active');

  // ── Images ──────────────────────────────────────────────────────────────────
  const [imageUrl,     setImageUrl]     = useState<string | undefined>(undefined);
  const [backImageUrl, setBackImageUrl] = useState<string | undefined>(undefined);
  const [newFrontUri,  setNewFrontUri]  = useState<string | null>(null);
  const [newBackUri,   setNewBackUri]   = useState<string | null>(null);

  // ── Duplicate search ────────────────────────────────────────────────────────
  const [duplicates,       setDuplicates]       = useState<CataloguePin[]>([]);
  const [searchingDups,    setSearchingDups]    = useState(false);
  const dupSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── State ───────────────────────────────────────────────────────────────────
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  // ── Already-approved submission guard ───────────────────────────────────────
  // If the editor was opened directly (bookmark/history) with a submissionId
  // that already has a catalogue entry, block saving to avoid creating a
  // duplicate pin and overwriting the existing approved_pin_id link.
  const [alreadyApprovedPinhuntId, setAlreadyApprovedPinhuntId] = useState<string | null>(null);
  const [checkingSubmission, setCheckingSubmission] = useState(Boolean(isNew && submissionId));

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  // ── Pre-fill from submission params (Approve & Add to Catalogue flow) ───────
  useEffect(() => {
    if (!isNew || !submissionId) return;
    if (prefillTitle)       setTitle(prefillTitle);
    if (prefillBrand)       setBrand(prefillBrand);
    if (prefillSeries)      setCollection(prefillSeries);
    if (prefillOrigin)      setOrigin(prefillOrigin);
    if (prefillYear)        setReleaseYear(prefillYear);
    if (prefillEditionType) setEditionType(prefillEditionType);
    if (prefillEditionSize) setEditionSize(prefillEditionSize);
    if (prefillFacNumber)   setFacNumber(prefillFacNumber);
    if (prefillSku)         setSku(prefillSku);
    if (prefillCharacters)  setCharacters(prefillCharacters);
    if (prefillNotes)       setDescription(prefillNotes);
    // Submissions approved by an admin are marked verified — the admin is
    // asserting the data is correct before adding it to the catalogue.
    setVerificationStatus('verified');

    // Fetch signed URLs for submission images so admin can review them.
    // They will be re-uploaded to the pin-catalogue bucket on save.
    (async () => {
      if (prefillFrontPath) {
        try {
          const { data } = await supabase.storage.from('pin-submissions').createSignedUrl(prefillFrontPath, 3600);
          if (data?.signedUrl) setNewFrontUri(data.signedUrl);
        } catch { /* best-effort */ }
      }
      if (prefillBackPath) {
        try {
          const { data } = await supabase.storage.from('pin-submissions').createSignedUrl(prefillBackPath, 3600);
          if (data?.signedUrl) setNewBackUri(data.signedUrl);
        } catch { /* best-effort */ }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  // ── Guard: check whether the submission is already linked to a pin ─────────
  useEffect(() => {
    if (!isNew || !submissionId || !userRepo) { setCheckingSubmission(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const submission = await userRepo.getPinSubmission(submissionId);
        if (!cancelled && submission?.approvedPinId) {
          setAlreadyApprovedPinhuntId(submission.approvedPinhuntId ?? '');
        }
      } catch { /* best-effort — do not block editing if the check fails */ }
      if (!cancelled) setCheckingSubmission(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, userRepo]);

  const submissionAlreadyApproved = alreadyApprovedPinhuntId !== null;

  // ── Load existing pin ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew || !repo || !routeId) { setLoadingPin(false); return; }
    (async () => {
      try {
        const pin = await repo.getPinByPinhuntId(routeId);
        if (!pin) { setLoadError('Pin not found.'); return; }
        setPinhuntId(pin.id);
        setTitle(pin.title);
        setBrand(pin.brand);
        setCollection(pin.collection);
        setCharacters(pin.characters.join(', '));
        setCategories(pin.categories.join(', '));
        setReleaseYear(pin.releaseYear?.toString() ?? '');
        setReleaseDate(pin.releaseDate ?? '');
        setOrigin(pin.origin ?? '');
        setEditionType(pin.edition ?? 'unknown');
        setEditionSize(pin.limitedEditionSize?.toString() ?? '');
        setDescription(pin.description ?? '');
        setRetailPrice(pin.retailPriceGBP?.toString() ?? '');
        setVerificationStatus(pin.verificationStatus ?? 'unverified');
        setCatalogueStatus(pin.status);
        setImageUrl(pin.imageUrl);
        setBackImageUrl(pin.backImageUrl);
        setSku(pin.externalIdentifiers?.sku ?? '');
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load pin.');
      } finally {
        setLoadingPin(false);
      }
    })();
  }, [isNew, repo, routeId]);

  // ── Duplicate search on title change ────────────────────────────────────────
  useEffect(() => {
    if (!isNew || !title.trim() || !repo) { setDuplicates([]); return; }
    if (dupSearchTimer.current) clearTimeout(dupSearchTimer.current);
    dupSearchTimer.current = setTimeout(async () => {
      setSearchingDups(true);
      try {
        const results = await repo.searchPins(title.trim(), { limit: 5 });
        setDuplicates(results);
      } catch { setDuplicates([]); }
      setSearchingDups(false);
    }, 600);
    return () => { if (dupSearchTimer.current) clearTimeout(dupSearchTimer.current); };
  }, [title, isNew, repo]);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!title.trim())      errs.title      = 'Pin name is required.';
    if (!brand.trim())      errs.brand      = 'Brand is required.';
    if (!collection.trim()) errs.collection = 'Collection/series is required.';
    if (!pinhuntId.trim())  errs.pinhuntId  = 'PinHunt ID is required.';
    if (releaseYear.trim()) {
      const y = parseInt(releaseYear, 10);
      if (isNaN(y) || y < 1900 || y > 2030) errs.releaseYear = 'Enter a year between 1900–2030.';
    }
    if (editionSize.trim()) {
      const s = parseInt(editionSize, 10);
      if (isNaN(s) || s <= 0) errs.editionSize = 'Must be a positive whole number.';
    }
    if (retailPrice.trim()) {
      const p = parseFloat(retailPrice);
      if (isNaN(p) || p < 0) errs.retailPrice = 'Must be a positive number.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Upload helpers ──────────────────────────────────────────────────────────
  const uploadImages = useCallback(async () => {
    let front = imageUrl;
    let back  = backImageUrl;
    if (newFrontUri) {
      front = await uploadImage(newFrontUri, `pins/${pinhuntId}/front.jpg`);
    }
    if (newBackUri) {
      back = await uploadImage(newBackUri, `pins/${pinhuntId}/back.jpg`);
    }
    return { front, back };
  }, [newFrontUri, newBackUri, imageUrl, backImageUrl, pinhuntId]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async (andAddAnother = false) => {
    if (!repo) { Alert.alert('Not configured', 'Supabase is not configured.'); return; }
    if (submissionAlreadyApproved) {
      Alert.alert(
        'Already in catalogue',
        'This submission already has a catalogue entry. Saving again would create a duplicate pin.',
      );
      return;
    }
    if (!validate()) return;

    try {
      setSaving(true);

      let uploadedFront: string | undefined;
      let uploadedBack:  string | undefined;

      try {
        const uploaded = await uploadImages();
        uploadedFront = uploaded.front;
        uploadedBack  = uploaded.back;
      } catch (uploadErr) {
        Alert.alert('Upload failed', uploadErr instanceof Error ? uploadErr.message : 'Image upload error.');
        setSaving(false);
        return;
      }

      const externalIdentifiers: Record<string, string> = {};
      if (sku.trim())       externalIdentifiers.sku       = sku.trim();
      if (facNumber.trim()) externalIdentifiers.facNumber  = facNumber.trim();

      const input = {
        pinhuntId:          pinhuntId.trim(),
        title:              title.trim(),
        brand:              brand.trim(),
        collection:         collection.trim(),
        characters:         characters.trim() ? characters.split(',').map(s => s.trim()).filter(Boolean) : [],
        categories:         categories.trim() ? categories.split(',').map(s => s.trim()).filter(Boolean) : [],
        releaseYear:        releaseYear.trim() ? parseInt(releaseYear, 10) : undefined,
        releaseDate:        releaseDate.trim() || undefined,
        origin:             origin.trim() || undefined,
        edition:            editionType !== 'unknown' ? editionType : undefined,
        limitedEditionSize: editionSize.trim() ? parseInt(editionSize, 10) : undefined,
        description:        description.trim() || undefined,
        imageUrl:           uploadedFront,
        backImageUrl:       uploadedBack,
        verificationStatus,
        status:             catalogueStatus,
        retailPriceGBP:     retailPrice.trim() ? parseFloat(retailPrice) : undefined,
        catalogueSource:    sourceNotes.trim() || undefined,
        externalIdentifiers: Object.keys(externalIdentifiers).length > 0 ? externalIdentifiers : undefined,
      };

      if (isNew) {
        await repo.createPin(input);

        // ── Approve & Add to Catalogue: link submission → catalogue pin ──────
        // Must run after createPin so the pinhunt_id is guaranteed to exist.
        if (submissionId) {
          if (!userRepo) throw new Error('Repository not available. Cannot approve submission.');
          // reviewPinSubmission resolves the pinhunt_id → UUID internally and
          // writes both status and approved_pin_id atomically.
          await userRepo.reviewPinSubmission(submissionId, {
            status: 'approved',
            approvedPinhuntId: pinhuntId.trim(),
          });
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pinhuntId: _pid, ...updateInput } = input;
        await repo.updatePin(pinhuntId.trim(), updateInput);
      }

      if (andAddAnother) {
        // Reset for next entry
        setPinhuntId(generatePinhuntId());
        setTitle(''); setBrand(''); setCollection(''); setCharacters('');
        setCategories(''); setReleaseYear(''); setReleaseDate('');
        setOrigin(''); setEditionType('unknown'); setEditionSize('');
        setDescription(''); setSourceNotes(''); setFacNumber(''); setSku('');
        setRetailPrice(''); setVerificationStatus('unverified'); setCatalogueStatus('active');
        setImageUrl(undefined); setBackImageUrl(undefined);
        setNewFrontUri(null); setNewBackUri(null);
        setErrors({}); setDuplicates([]);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        Alert.alert('Saved!', `"${title}" saved. Add the next pin.`);
      } else {
        router.back();
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save pin.');
    } finally {
      setSaving(false);
    }
  };

  // ── Input helper ────────────────────────────────────────────────────────────
  const inp = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    opts?: { keyboardType?: 'default' | 'numeric' | 'decimal-pad'; multiline?: boolean; errKey?: string },
  ) => (
    <TextInput
      value={value}
      onChangeText={v => { onChange(v); if (opts?.errKey) setErrors(e => ({ ...e, [opts.errKey!]: '' })); }}
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
  );

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loadingPin || checkingSubmission) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading…' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </>
    );
  }
  if (loadError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_400Regular', fontSize: 14 }}>{loadError}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Add New Pin' : `Edit ${title || 'Pin'}` }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: botPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Already-approved submission warning ── */}
          {submissionAlreadyApproved && (
            <View style={[styles.dupBox, { backgroundColor: '#FEE2E2', borderColor: '#EF4444', borderRadius: 10 }]}>
              <Feather name="alert-octagon" size={14} color="#991B1B" />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#991B1B' }}>
                  This submission already has a catalogue entry
                </Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#991B1B' }}>
                  Saving is disabled to prevent creating a duplicate pin.
                </Text>
                {!!alreadyApprovedPinhuntId && (
                  <TouchableOpacity
                    onPress={() => router.replace(`/admin/pin/${alreadyApprovedPinhuntId}`)}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Feather name="external-link" size={12} color="#991B1B" />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#991B1B', textDecorationLine: 'underline' }}>
                      View in Catalogue ({alreadyApprovedPinhuntId})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ── PinHunt ID ── */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>IDENTIFIER</Text>
          <Field label="PinHunt ID" required error={errors.pinhuntId}>
            {inp(pinhuntId, setPinhuntId, 'e.g. PHUK-00000001', { errKey: 'pinhuntId' })}
          </Field>

          {/* ── Images ── */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>IMAGES</Text>
          <View style={{ gap: 10 }}>
            <ImagePickerCard
              label="Front Image"
              uri={newFrontUri ?? imageUrl ?? null}
              onPick={async (src) => {
                const img = await pickSubmissionImage(src);
                if (img) setNewFrontUri(img.uri);
              }}
              colors={colors}
            />
            <ImagePickerCard
              label="Back Image (optional)"
              uri={newBackUri ?? backImageUrl ?? null}
              onPick={async (src) => {
                const img = await pickSubmissionImage(src);
                if (img) setNewBackUri(img.uri);
              }}
              colors={colors}
            />
          </View>

          {/* ── Core details ── */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DETAILS</Text>
          <View style={{ gap: 12 }}>
            <Field label="Pin Name" required error={errors.title}>
              {inp(title, setTitle, 'e.g. Mickey Mouse 50th Anniversary', { errKey: 'title' })}
            </Field>

            {/* Duplicate search results */}
            {isNew && searchingDups && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground }}>
                  Checking for duplicates…
                </Text>
              </View>
            )}
            {isNew && !searchingDups && duplicates.length > 0 && (
              <View style={[styles.dupBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderRadius: 10 }]}>
                <Feather name="alert-triangle" size={14} color="#92400E" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#92400E' }}>
                    Possible duplicates found:
                  </Text>
                  {duplicates.map(d => (
                    <Text key={d.id} style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#92400E' }}>
                      • {d.title} ({d.brand}) — {d.id}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            <Field label="Brand / Source" required error={errors.brand}>
              {inp(brand, setBrand, 'e.g. Disney Parks, Loungefly', { errKey: 'brand' })}
            </Field>
            <Field label="Collection / Series" required error={errors.collection}>
              {inp(collection, setCollection, 'e.g. Halloween 2023, Haunted Mansion', { errKey: 'collection' })}
            </Field>
            <Field label="Characters (comma-separated)">
              {inp(characters, setCharacters, 'e.g. Mickey, Minnie, Goofy')}
            </Field>
            <Field label="Categories / Product Type (comma-separated)">
              {inp(categories, setCategories, 'e.g. Open Edition, Starter, Attraction')}
            </Field>
          </View>

          {/* ── Release info ── */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RELEASE INFO</Text>
          <View style={{ gap: 12 }}>
            <Field label="Release Year" error={errors.releaseYear}>
              {inp(releaseYear, setReleaseYear, 'e.g. 2024', { keyboardType: 'numeric', errKey: 'releaseYear' })}
            </Field>
            <Field label="Release Date (YYYY-MM-DD)">
              {inp(releaseDate, setReleaseDate, 'e.g. 2024-03-15')}
            </Field>
            <Field label="Release Location / Origin">
              {inp(origin, setOrigin, 'e.g. Magic Kingdom, Disney Store UK')}
            </Field>
          </View>

          {/* ── Edition ── */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>EDITION</Text>
          <View style={{ gap: 12 }}>
            <Field label="Edition Type">
              <View style={styles.chipRow}>
                {EDITION_TYPES.map(e => {
                  const active = editionType === e.value;
                  return (
                    <TouchableOpacity
                      key={e.value}
                      onPress={() => setEditionType(e.value)}
                      activeOpacity={0.8}
                      style={[styles.chip, {
                        backgroundColor: active ? colors.primary + '18' : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                        borderRadius: 8,
                      }]}
                    >
                      <Text style={[styles.chipLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
                        {e.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
            <Field label="Edition / Limited Size" error={errors.editionSize}>
              {inp(editionSize, setEditionSize, 'e.g. 2500', { keyboardType: 'numeric', errKey: 'editionSize' })}
            </Field>
          </View>

          {/* ── Description ── */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
          <Field label="Description">
            {inp(description, setDescription, 'Catalogue description…', { multiline: true })}
          </Field>

          {/* ── Source notes ── */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SOURCE & IDENTIFIERS</Text>
          <View style={{ gap: 12 }}>
            <Field label="FAC Number">
              {inp(facNumber, setFacNumber, 'e.g. 24-FAC-12345')}
            </Field>
            <Field label="SKU / Product Number">
              {inp(sku, setSku, 'e.g. 400041234567')}
            </Field>
            <Field label="Retail Price (GBP)" error={errors.retailPrice}>
              {inp(retailPrice, setRetailPrice, 'e.g. 14.99', { keyboardType: 'decimal-pad', errKey: 'retailPrice' })}
            </Field>
            <Field label="Source Notes">
              {inp(sourceNotes, setSourceNotes, 'Where this data came from…', { multiline: true })}
            </Field>
          </View>

          {/* ── Status ── */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>STATUS</Text>
          <View style={{ gap: 12 }}>
            <Field label="Verification Status">
              <View style={styles.chipRow}>
                {VERIFICATION_STATUSES.map(v => {
                  const active = verificationStatus === v.value;
                  return (
                    <TouchableOpacity
                      key={v.value}
                      onPress={() => setVerificationStatus(v.value)}
                      activeOpacity={0.8}
                      style={[styles.chip, {
                        backgroundColor: active ? v.color + '18' : colors.card,
                        borderColor: active ? v.color : colors.border,
                        borderRadius: 8,
                      }]}
                    >
                      <Text style={[styles.chipLabel, { color: active ? v.color : colors.mutedForeground }]}>
                        {v.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
            <Field label="Catalogue Status">
              <View style={styles.chipRow}>
                {CATALOGUE_STATUSES.map(s => {
                  const active = catalogueStatus === s.value;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      onPress={() => setCatalogueStatus(s.value)}
                      activeOpacity={0.8}
                      style={[styles.chip, {
                        backgroundColor: active ? s.color + '18' : colors.card,
                        borderColor: active ? s.color : colors.border,
                        borderRadius: 8,
                      }]}
                    >
                      <Text style={[styles.chipLabel, { color: active ? s.color : colors.mutedForeground }]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>
          </View>

          {/* ── Actions ── */}
          {saving ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => handleSave(false)}
                activeOpacity={0.85}
                disabled={submissionAlreadyApproved}
                style={[styles.btn, {
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  opacity: submissionAlreadyApproved ? 0.4 : 1,
                }]}
              >
                <Feather name="save" size={16} color="#fff" />
                <Text style={styles.btnLabel}>{isNew ? 'Add to Catalogue' : 'Save Changes'}</Text>
              </TouchableOpacity>

              {isNew && !submissionAlreadyApproved && (
                <TouchableOpacity
                  onPress={() => handleSave(true)}
                  activeOpacity={0.85}
                  style={[styles.btn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}
                >
                  <Feather name="plus" size={16} color={colors.foreground} />
                  <Text style={[styles.btnLabel, { color: colors.foreground }]}>Save and Add Another</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── Image picker card ────────────────────────────────────────────────────────

function ImagePickerCard({
  label, uri, onPick, colors,
}: {
  label: string;
  uri: string | null;
  onPick: (src: 'camera' | 'library') => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.photoCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12 }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.photoPlaceholder, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
          <Feather name="image" size={22} color={colors.mutedForeground} />
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>{label}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={() => onPick('camera')}
            style={[styles.photoBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}
          >
            <Feather name="camera" size={13} color={colors.foreground} />
            <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.foreground }}>
              {Platform.OS === 'web' ? 'Choose' : 'Camera'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onPick('library')}
            style={[styles.photoBtn, { backgroundColor: colors.secondary, borderRadius: 8 }]}
          >
            <Feather name="image" size={13} color={colors.foreground} />
            <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.foreground }}>Library</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll:       { padding: 16, gap: 12 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginTop: 8 },
  input:        { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular' },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  chipLabel:    { fontSize: 12, fontFamily: 'Inter_500Medium' },
  dupBox:       { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1 },
  photoCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: 1 },
  photoThumb:   { width: 64, height: 64, borderRadius: 8 },
  photoPlaceholder: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  photoBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderWidth: 1, borderColor: 'transparent' },
  btnLabel:     { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
