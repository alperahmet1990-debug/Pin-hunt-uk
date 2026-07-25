/**
 * Admin Image Backfill — surface all pins missing front or back images
 * so admins can attach photos or paste URLs in bulk after an import.
 *
 * Features:
 *  - Lists pins where needs_front_image OR needs_back_image is true
 *  - Filter by brand or collection
 *  - Tap a pin to open an inline editor: paste URL or pick from library/camera
 *  - Saving updates the pin record and clears the needs_*_image flags
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { createSupabasePinRepository } from '@workspace/pin-repository';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { pickSubmissionImage } from '@/utils/submissionImage';
import type { CataloguePin } from '@workspace/pin-repository';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Badge ────────────────────────────────────────────────────────────────────

function MissingBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Pin row ─────────────────────────────────────────────────────────────────

function PinRow({
  pin,
  onEdit,
  colors,
}: {
  pin: CataloguePin;
  onEdit: (pin: CataloguePin) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={() => onEdit(pin)}
      activeOpacity={0.8}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Thumbnail or placeholder */}
      {pin.imageUrl ? (
        <Image source={{ uri: pin.imageUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumbPlaceholder, { backgroundColor: colors.secondary }]}>
          <Feather name="image" size={18} color={colors.mutedForeground} />
        </View>
      )}

      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
          {pin.title}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {pin.brand} · {pin.collection}
        </Text>
        <View style={styles.badgeRow}>
          {pin.needsFrontImage && <MissingBadge label="Front" color="#EF4444" />}
          {pin.needsBackImage  && <MissingBadge label="Back"  color="#F59E0B" />}
        </View>
      </View>

      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  pin,
  visible,
  onClose,
  onSaved,
  colors,
}: {
  pin: CataloguePin | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (updated: CataloguePin) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const insets = useSafeAreaInsets();

  // Front image state
  const [frontUrl,    setFrontUrl]    = useState('');
  const [frontUri,    setFrontUri]    = useState<string | null>(null);
  // Back image state
  const [backUrl,     setBackUrl]     = useState('');
  const [backUri,     setBackUri]     = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Sync fields when pin changes
  useEffect(() => {
    if (!pin) return;
    setFrontUrl(pin.imageUrl ?? '');
    setFrontUri(null);
    setBackUrl(pin.backImageUrl ?? '');
    setBackUri(null);
    setSaving(false);
  }, [pin]);

  const repo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabasePinRepository(supabase as any);
  }, []);

  const pickImage = useCallback(async (side: 'front' | 'back', src: 'camera' | 'library') => {
    const img = await pickSubmissionImage(src);
    if (!img) return;
    if (side === 'front') { setFrontUri(img.uri); setFrontUrl(''); }
    else                  { setBackUri(img.uri);  setBackUrl('');  }
  }, []);

  const handleSave = async () => {
    if (!repo || !pin) return;

    const hasFrontChange = frontUri || frontUrl.trim();
    const hasBackChange  = backUri  || backUrl.trim();

    if (!hasFrontChange && !hasBackChange) {
      Alert.alert('Nothing to save', 'Paste a URL or pick an image first.');
      return;
    }

    try {
      setSaving(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: any = {};

      if (hasFrontChange) {
        let url = frontUrl.trim();
        if (frontUri) {
          url = await uploadImage(frontUri, `pins/${pin.id}/front.jpg`);
        }
        update.imageUrl       = url;
        update.needsFrontImage = false;
      }

      if (hasBackChange) {
        let url = backUrl.trim();
        if (backUri) {
          url = await uploadImage(backUri, `pins/${pin.id}/back.jpg`);
        }
        update.backImageUrl  = url;
        update.needsBackImage = false;
      }

      const updated = await repo.updatePin(pin.id, update);
      onSaved(updated);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save images.');
    } finally {
      setSaving(false);
    }
  };

  if (!pin) return null;

  const showFront = pin.needsFrontImage || !!pin.imageUrl;
  const showBack  = pin.needsBackImage  || !!pin.backImageUrl;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalRoot, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
            {pin.title}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.modalMeta, { color: colors.mutedForeground }]}>
            {pin.brand} · {pin.collection} · {pin.id}
          </Text>

          <View style={styles.missingRow}>
            {pin.needsFrontImage && <MissingBadge label="Front image missing" color="#EF4444" />}
            {pin.needsBackImage  && <MissingBadge label="Back image missing"  color="#F59E0B" />}
          </View>

          {/* Front image section */}
          {(showFront || pin.needsFrontImage) && (
            <ImageSection
              label="Front Image"
              currentUrl={pin.imageUrl}
              pastedUrl={frontUrl}
              localUri={frontUri}
              onUrlChange={v => { setFrontUrl(v); setFrontUri(null); }}
              onPick={src => pickImage('front', src)}
              colors={colors}
            />
          )}

          {/* Back image section */}
          {(showBack || pin.needsBackImage) && (
            <ImageSection
              label="Back Image"
              currentUrl={pin.backImageUrl}
              pastedUrl={backUrl}
              localUri={backUri}
              onUrlChange={v => { setBackUrl(v); setBackUri(null); }}
              onPick={src => pickImage('back', src)}
              colors={colors}
            />
          )}

          {/* Save */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="save" size={16} color="#fff" />
                <Text style={styles.saveBtnLabel}>Save Images</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Image section ────────────────────────────────────────────────────────────

function ImageSection({
  label,
  currentUrl,
  pastedUrl,
  localUri,
  onUrlChange,
  onPick,
  colors,
}: {
  label: string;
  currentUrl?: string;
  pastedUrl: string;
  localUri: string | null;
  onUrlChange: (v: string) => void;
  onPick: (src: 'camera' | 'library') => void;
  colors: ReturnType<typeof useColors>;
}) {
  const preview = localUri ?? (pastedUrl.trim() || currentUrl) ?? null;

  return (
    <View style={[styles.imageSection, { borderColor: colors.border }]}>
      <Text style={[styles.imageSectionLabel, { color: colors.foreground }]}>{label}</Text>

      {/* Preview */}
      <View style={styles.previewRow}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={[styles.previewPlaceholder, { backgroundColor: colors.secondary }]}>
            <Feather name="image" size={24} color={colors.mutedForeground} />
          </View>
        )}

        {/* Pick buttons */}
        <View style={styles.pickButtons}>
          <TouchableOpacity
            onPress={() => onPick('camera')}
            style={[styles.pickBtn, { backgroundColor: colors.secondary }]}
          >
            <Feather name="camera" size={13} color={colors.foreground} />
            <Text style={[styles.pickBtnLabel, { color: colors.foreground }]}>
              {Platform.OS === 'web' ? 'Choose' : 'Camera'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onPick('library')}
            style={[styles.pickBtn, { backgroundColor: colors.secondary }]}
          >
            <Feather name="image" size={13} color={colors.foreground} />
            <Text style={[styles.pickBtnLabel, { color: colors.foreground }]}>Library</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* URL paste field */}
      <Text style={[styles.urlLabel, { color: colors.mutedForeground }]}>Or paste a URL</Text>
      <TextInput
        value={pastedUrl}
        onChangeText={onUrlChange}
        placeholder="https://example.com/image.jpg"
        placeholderTextColor={colors.mutedForeground + '88'}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={[styles.urlInput, {
          color: colors.foreground,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }]}
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ImageBackfillScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const repo = useMemo(() => {
    if (!isSupabaseConfigured) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createSupabasePinRepository(supabase as any);
  }, []);

  // ── Data ─────────────────────────────────────────────────────────────────
  const [pins,       setPins]       = useState<CataloguePin[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState('');
  const [brandFilter,    setBrandFilter]    = useState('');
  const [collFilter,     setCollFilter]     = useState('');

  // ── Modal ─────────────────────────────────────────────────────────────────
  const [editPin,  setEditPin]  = useState<CataloguePin | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Debounced search ref
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const results = await repo.searchPins('', {
        needsAnyImage: true,
        ...(brandFilter.trim() ? { brand: brandFilter.trim() } : {}),
        ...(collFilter.trim()  ? { collection: collFilter.trim() } : {}),
        limit: 300,
      });
      setPins(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pins.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, brandFilter, collFilter]);

  useEffect(() => { load(); }, [load]);

  // ── Client-side text search ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pins;
    return pins.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.collection.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q),
    );
  }, [pins, search]);

  // Counters
  const totalMissingFront = pins.filter(p => p.needsFrontImage).length;
  const totalMissingBack  = pins.filter(p => p.needsBackImage).length;

  const openEdit = (pin: CataloguePin) => {
    setEditPin(pin);
    setModalVisible(true);
  };

  const handleSaved = (updated: CataloguePin) => {
    // Remove from list if no longer missing images, otherwise update in place
    if (!updated.needsFrontImage && !updated.needsBackImage) {
      setPins(prev => prev.filter(p => p.id !== updated.id));
    } else {
      setPins(prev => prev.map(p => p.id === updated.id ? updated : p));
    }
    setModalVisible(false);
    setEditPin(null);
  };

  // Filter debounce re-load on brand/collection changes is handled by useEffect on load.
  // The search input filters locally for speed.

  return (
    <>
      <Stack.Screen options={{ title: 'Image Backfill' }} />

      <View style={[styles.root, { backgroundColor: colors.background }]}>

        {/* ── Summary bar ── */}
        <View style={[styles.summaryBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: '#EF4444' }]}>{totalMissingFront}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Missing front</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: '#F59E0B' }]}>{totalMissingBack}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Missing back</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryCount, { color: colors.foreground }]}>{pins.length}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total</Text>
          </View>
        </View>

        {/* ── Filters ── */}
        <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
          {/* Search */}
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={14} color={colors.mutedForeground} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search pins…"
              placeholderTextColor={colors.mutedForeground + '88'}
              style={[styles.searchInput, { color: colors.foreground }]}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Brand filter */}
          <View style={[styles.filterInput, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              value={brandFilter}
              onChangeText={v => {
                setBrandFilter(v);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => load(), 600);
              }}
              placeholder="Brand…"
              placeholderTextColor={colors.mutedForeground + '88'}
              style={[styles.filterInputText, { color: colors.foreground }]}
            />
          </View>

          {/* Collection filter */}
          <View style={[styles.filterInput, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              value={collFilter}
              onChangeText={v => {
                setCollFilter(v);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => load(), 600);
              }}
              placeholder="Series…"
              placeholderTextColor={colors.mutedForeground + '88'}
              style={[styles.filterInputText, { color: colors.foreground }]}
            />
          </View>
        </View>

        {/* ── List ── */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingLabel, { color: colors.mutedForeground }]}>Loading…</Text>
          </View>
        ) : error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            <TouchableOpacity onPress={() => load()}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={p => p.id}
            contentContainerStyle={{ padding: 12, paddingBottom: botPad, gap: 8 }}
            renderItem={({ item }) => (
              <PinRow pin={item} onEdit={openEdit} colors={colors} />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="check-circle" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All images filled in</Text>
                <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
                  {brandFilter || collFilter
                    ? 'No pins missing images match your filters.'
                    : 'No pins are currently missing front or back images.'}
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* ── Edit modal ── */}
      <EditModal
        pin={editPin}
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditPin(null); }}
        onSaved={handleSaved}
        colors={colors}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:            { flex: 1 },

  // Summary bar
  summaryBar:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1 },
  summaryItem:     { flex: 1, alignItems: 'center', gap: 2 },
  summaryCount:    { fontSize: 20, fontFamily: 'Inter_700Bold' },
  summaryLabel:    { fontSize: 11, fontFamily: 'Inter_400Regular' },
  summaryDivider:  { width: 1, height: 32, marginHorizontal: 8 },

  // Filter bar
  filterBar:       { gap: 8, padding: 12, borderBottomWidth: 1 },
  searchBox:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  searchInput:     { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', padding: 0 },
  filterInput:     { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  filterInputText: { fontSize: 14, fontFamily: 'Inter_400Regular', padding: 0 },

  // Pin row
  row:             { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  thumb:           { width: 56, height: 56, borderRadius: 8, flexShrink: 0 },
  thumbPlaceholder:{ width: 56, height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowTitle:        { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowMeta:         { fontSize: 12, fontFamily: 'Inter_400Regular' },
  badgeRow:        { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  badgeText:       { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // States
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingLabel:    { fontSize: 13, fontFamily: 'Inter_400Regular' },
  errorBox:        { margin: 16, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorText:       { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  retryText:       { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  empty:           { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 10 },
  emptyTitle:      { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyDesc:       { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },

  // Modal
  modalRoot:       { flex: 1 },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  modalClose:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle:      { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  modalScroll:     { padding: 16, gap: 16 },
  modalMeta:       { fontSize: 12, fontFamily: 'Inter_400Regular' },
  missingRow:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  // Image section
  imageSection:    { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  imageSectionLabel:{ fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  previewRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview:         { width: 80, height: 80, borderRadius: 8, flexShrink: 0 },
  previewPlaceholder:{ width: 80, height: 80, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pickButtons:     { flex: 1, gap: 8 },
  pickBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  pickBtnLabel:    { fontSize: 13, fontFamily: 'Inter_500Medium' },
  urlLabel:        { fontSize: 11, fontFamily: 'Inter_500Medium' },
  urlInput:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular' },

  // Save button
  saveBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  saveBtnLabel:    { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
