/**
 * Admin Contributed Pin Images — review photos collectors submitted from
 * the scan flow (scan.tsx → /contribute-image/[pinId]) to become a
 * catalogue pin's public display image. Approving promotes the image into
 * the public pin-catalogue bucket and sets pins.image_url; rejecting just
 * marks the row — the pending object is left in private storage for audit.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import type { ContributedImageReason, ContributedPinImage } from '@workspace/pin-repository';

type PendingImage = ContributedPinImage & { signedUrl: string };

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

  const review = useCallback(async (imageId: string, action: 'approve' | 'reject') => {
    if (!session?.access_token) return;
    setBusyId(imageId);
    try {
      const res = await fetch(`${API_BASE}/admin/pin-images/${imageId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: action === 'reject' ? JSON.stringify({ reviewerNotes: notesById[imageId] }) : undefined,
      });
      const data = await res.json();
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
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: 16, paddingBottom: botPad }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={{ padding: 8 }}>
              <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium' }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : images.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="camera" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing to review</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Contributed photos will show up here as collectors submit them.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>
              {images.length} pending photo{images.length !== 1 ? 's' : ''}
            </Text>
            {images.map(img => (
              <View
                key={img.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.thumb, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                    <Image source={{ uri: img.signedUrl }} style={styles.thumbImg} resizeMode="cover" />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {img.pinTitle ?? 'Unknown pin'}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>{img.pinhuntId}</Text>
                    {img.proposalReason && img.proposalReason !== 'missing' && (
                      <Text style={[styles.cardMeta, { color: colors.destructive }]}>
                        Replacement · {REASON_LABEL[img.proposalReason]}
                      </Text>
                    )}
                    {img.pinImageUrl && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Image source={{ uri: img.pinImageUrl }} style={{ width: 32, height: 32, borderRadius: 6 }} resizeMode="contain" />
                        <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>Current photo (replaced on approve)</Text>
                      </View>
                    )}
                    <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                      Consented {new Date(img.contributorConsentAt).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>

                <TextInput
                  style={[styles.notesInput, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Reason for rejecting (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  value={notesById[img.id] ?? ''}
                  onChangeText={text => setNotesById(prev => ({ ...prev, [img.id]: text }))}
                />

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
                    style={[styles.actionBtn, styles.approveBtn, { backgroundColor: colors.primary }]}
                    onPress={() => review(img.id, 'approve')}
                    disabled={busyId === img.id}
                    activeOpacity={0.85}
                  >
                    {busyId === img.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.actionLabel, { color: '#fff' }]}>Approve</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </>
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
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb:       { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  thumbImg:    { width: 70, height: 70 },
  cardTitle:   { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  cardMeta:    { fontSize: 11, fontFamily: 'Inter_400Regular' },
  notesInput:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: 'Inter_400Regular' },
  actionRow:   { flexDirection: 'row', gap: 10 },
  actionBtn:   { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveBtn:  { borderWidth: 0 },
  actionLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
