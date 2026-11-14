/**
 * Admin Contributed Pin Images — review photos contributed through
 * /contribute-image/[pinId] (from the scan result's "Add your photo", the pin
 * page, the catalogue contributor screen, or a pin-submission proposal) to
 * become a catalogue pin's public display image. Admins' own photos land here
 * too unless they chose "Publish now". Approving publishes the cleaned photo
 * (watermarked) to the public pin-catalogue bucket and sets pins.image_url;
 * rejecting just marks the row — the private objects are kept for audit.
 *
 * Each card compares three images: the photo as taken (raw, admin-only
 * bucket, migration 079; missing on older rows), the Pixian-cleaned photo
 * that will be published, and the Pin & Pop image (migration 042). The pin's
 * current catalogue photo, if any, is shown under them. The raw photo and
 * the Pin & Pop image are admin-only — never shown to collectors, and the
 * Pin & Pop image is never sent to any AI service.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
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
import { radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import type {
  ContributedImageReason,
  ContributedPinImage,
  PinAndPopReference,
} from '@workspace/pin-repository';
import { formatDate } from '@/utils/format';

type PendingImage = ContributedPinImage & {
  signedUrl: string;
  /** The photo as taken; null on rows from before migration 079. */
  rawSignedUrl?: string | null;
  pinAndPop: PinAndPopReference | null;
};

const REASON_LABEL: Record<ContributedImageReason, string> = {
  missing: 'No photo',
  wrong_pin: 'Current photo is the wrong pin',
  poor_quality: 'Current photo is poor quality',
  other: 'Other',
};

export default function AdminContributedImagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [images, setImages] = useState<PendingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [enlarged, setEnlarged] = useState<{ uri: string; label: string } | null>(null);
  // The pin gained another photo since this was submitted: ask before replacing.
  const [replaceAsk, setReplaceAsk] = useState<Record<string, string>>({});

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const load = useCallback(async (isRefresh = false) => {
    if (!session?.access_token) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/admin/pending-pin-images`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load pending images.');
      setImages(data.images as PendingImage[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending images.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.access_token]);

  useEffect(() => { load(); }, [load]);

  const review = useCallback(async (imageId: string, action: 'approve' | 'reject', replaceExisting = false) => {
    if (!session?.access_token) return;
    setBusyId(imageId);
    try {
      const res = await fetch(`${API_BASE}/admin/pin-images/${imageId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(action === 'reject' ? { reviewerNotes: notesById[imageId] } : { replaceExisting }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === 'has_image') {
        setReplaceAsk(prev => ({ ...prev, [imageId]: data.existingImageUrl ?? '' }));
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `Could not ${action} image.`);
      setImages(prev => prev.filter(img => img.id !== imageId));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : `Could not ${action} image.`);
    } finally {
      setBusyId(null);
    }
  }, [session?.access_token, notesById]);

  return (
    <>
      <Stack.Screen options={{ title: 'Contributed Photos' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.homeBackground }]}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.homeCoral} />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={{ padding: 8 }}>
              <Text style={{ color: colors.homeCoral, fontFamily: 'Inter_500Medium' }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : images.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="camera" size={40} color={colors.homeMuted} />
            <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>Nothing to review</Text>
            <Text style={[styles.emptySub, { color: colors.homeMuted }]}>
              Contributed photos will show up here as collectors submit them.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.countLabel, { color: colors.homeMuted }]}>
              {images.length} pending photo{images.length !== 1 ? 's' : ''}
            </Text>
            {images.map(img => (
              <View
                key={img.id}
                style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
              >
                <View style={{ gap: 4 }}>
                  <Text style={[styles.cardTitle, { color: colors.homeInk }]} numberOfLines={2}>
                    {img.pinTitle ?? 'Unknown pin'}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.homeMuted }]}>
                    {img.pinhuntId}
                    {img.pinAndPop?.externalId ? `  ·  Pin & Pop #${img.pinAndPop.externalId}` : ''}
                  </Text>
                  {img.proposalReason && img.proposalReason !== 'missing' && (
                    <Text style={[styles.cardMeta, { color: colors.destructive }]}>
                      Replacement · {REASON_LABEL[img.proposalReason]}
                    </Text>
                  )}
                </View>

                <View style={styles.compareRow}>
                  <ComparePanel
                    label="Raw"
                    caption="As taken · admin only"
                    uri={img.rawSignedUrl ?? undefined}
                    emptyText="Not kept"
                    onPress={setEnlarged}
                  />
                  <ComparePanel
                    label="Cleaned"
                    caption="Published on approve"
                    uri={img.signedUrl}
                    highlight
                    onPress={setEnlarged}
                  />
                  <ComparePanel
                    label="Pin & Pop"
                    caption="Admin reference only"
                    uri={img.pinAndPop?.imageUrl}
                    emptyText={img.pinAndPop?.pageUrl ? 'Open on Pin & Pop' : 'Not linked'}
                    onEmptyPress={img.pinAndPop?.pageUrl ? () => Linking.openURL(img.pinAndPop!.pageUrl!) : undefined}
                    onPress={setEnlarged}
                  />
                </View>

                {(img.pinImageUrl || replaceAsk[img.id]) && (
                  <TouchableOpacity
                    style={[styles.currentRow, { borderColor: colors.homeLine }]}
                    onPress={() => setEnlarged({ uri: replaceAsk[img.id] || img.pinImageUrl!, label: 'Current catalogue photo' })}
                    activeOpacity={0.85}
                    accessibilityLabel="Current catalogue photo"
                  >
                    <Image
                      source={{ uri: replaceAsk[img.id] || img.pinImageUrl }}
                      style={[styles.currentImg, { backgroundColor: colors.homeAqua }]}
                      resizeMode="contain"
                    />
                    <Text style={[styles.cardMeta, { color: colors.homeMuted, flex: 1 }]}>
                      Current catalogue photo · replaced on approve
                    </Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.cardMeta, { color: colors.homeMuted }]}>
                  Consented {formatDate(img.contributorConsentAt, 'medium')}
                </Text>

                <TextInput
                  style={[styles.notesInput, { borderColor: colors.homeLine, color: colors.homeInk }]}
                  placeholder="Reason for rejecting (optional)"
                  placeholderTextColor={colors.homeMuted}
                  value={notesById[img.id] ?? ''}
                  onChangeText={text => setNotesById(prev => ({ ...prev, [img.id]: text }))}
                />

                {replaceAsk[img.id] !== undefined && (
                  <View testID="replace-confirm" style={{ gap: 6 }}>
                    <Text style={[styles.cardMeta, { color: colors.destructive }]}>
                      This pin has gained a catalogue photo since this was submitted. Approving will replace it.
                    </Text>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.destructive }]}
                      onPress={() => review(img.id, 'approve', true)}
                      disabled={busyId === img.id}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.actionLabel, { color: colors.destructive }]}>Replace and approve</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: colors.destructive }]}
                    onPress={() => review(img.id, 'reject')}
                    disabled={busyId === img.id}
                    activeOpacity={0.85}
                  >
                    {busyId === img.id ? (
                      <ActivityIndicator size="small" color={colors.destructive} />
                    ) : (
                      <Text style={[styles.actionLabel, { color: colors.destructive }]}>Reject</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn, { backgroundColor: colors.homeCoral }]}
                    onPress={() => review(img.id, 'approve')}
                    disabled={busyId === img.id}
                    activeOpacity={0.85}
                  >
                    {busyId === img.id ? (
                      <ActivityIndicator size="small" color={colors.homeHeroText} />
                    ) : (
                      <Text style={[styles.actionLabel, { color: colors.homeHeroText }]}>Approve</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!enlarged} transparent animationType="fade" onRequestClose={() => setEnlarged(null)}>
        <Pressable style={styles.lightbox} onPress={() => setEnlarged(null)}>
          {enlarged && (
            <>
              <Image source={{ uri: enlarged.uri }} style={styles.lightboxImg} resizeMode="contain" />
              <Text style={styles.lightboxLabel}>{enlarged.label} · tap to close</Text>
            </>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

function ComparePanel({
  label,
  caption,
  uri,
  highlight,
  emptyText = 'No photo',
  onEmptyPress,
  onPress,
}: {
  label: string;
  caption: string;
  uri?: string;
  highlight?: boolean;
  emptyText?: string;
  onEmptyPress?: () => void;
  onPress: (img: { uri: string; label: string }) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.panel}>
      <Text style={[styles.panelLabel, { color: highlight ? colors.homeCoral : colors.homeInk }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.panelImgWrap,
          { backgroundColor: colors.homeAqua, borderColor: highlight ? colors.homeCoral : colors.homeLine },
        ]}
        onPress={uri ? () => onPress({ uri, label }) : onEmptyPress}
        disabled={!uri && !onEmptyPress}
        activeOpacity={0.85}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.panelImg} resizeMode="contain" accessibilityLabel={`${label} photo`} />
        ) : (
          <View style={styles.panelEmpty}>
            <Feather name={onEmptyPress ? 'external-link' : 'image'} size={16} color={colors.homeMuted} />
            <Text style={[styles.panelEmptyText, { color: onEmptyPress ? colors.homeCoral : colors.homeMuted }]}>
              {emptyText}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      <Text style={[styles.panelCaption, { color: colors.homeMuted }]} numberOfLines={1}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  center:      { alignItems: 'center', paddingTop: 60, gap: 12 },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle:  { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub:    { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  errorText:   { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  countLabel:  { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  card:        { padding: 12, marginBottom: 12, borderWidth: 1, gap: 10 },
  compareRow:  { flexDirection: 'row', gap: 8 },
  panel:       { flex: 1, gap: 4 },
  panelLabel:  { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  panelImgWrap: { aspectRatio: 1, borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  panelImg:    { width: '100%', height: '100%' },
  panelEmpty:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4 },
  panelEmptyText: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  panelCaption: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  lightbox:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 },
  lightboxImg: { width: '100%', height: '80%' },
  lightboxLabel: { color: '#fff', fontSize: 13, fontFamily: 'Inter_500Medium' },
  cardTitle:   { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  cardMeta:    { fontSize: 11, fontFamily: 'Inter_400Regular' },
  notesInput:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: 'Inter_400Regular' },
  actionRow:   { flexDirection: 'row', gap: 10 },
  currentRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.sm, padding: 6 },
  currentImg:  { width: 44, height: 44, borderRadius: 6 },
  actionBtn:   { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveBtn:  { borderWidth: 0 },
  actionLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
