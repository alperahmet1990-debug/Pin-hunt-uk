/**
 * My Submissions — list of the authenticated user's pin catalogue contributions.
 * Shows front-image thumbnail, proposed name, status, date, and reviewer notes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { PinSubmission, PinSubmissionStatus } from '@workspace/pin-repository';
import { useSubmissionNotifications } from '@/context/SubmissionNotificationsContext';

const STATUS_LABEL: Record<PinSubmissionStatus, string> = {
  draft:          'Draft',
  submitted:      'Submitted',
  under_review:   'Under Review',
  approved:       'Approved',
  rejected:       'Rejected',
  needs_changes:  'Needs Changes',
};

const STATUS_COLOR: Record<PinSubmissionStatus, string> = {
  draft:          '#6366F1',
  submitted:      '#3B82F6',
  under_review:   '#F59E0B',
  approved:       '#16A34A',
  rejected:       '#EF4444',
  needs_changes:  '#F97316',
};

function SubmissionCard({
  submission,
  imageUrl,
  colors,
  onPress,
  onDelete,
  onCreditedPinPress,
  isUnseen,
}: {
  submission: PinSubmission;
  imageUrl?: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  onDelete?: () => void;
  onCreditedPinPress?: () => void;
  isUnseen?: boolean;
}) {
  const statusColor = STATUS_COLOR[submission.status];
  const canDelete   = submission.status === 'draft';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isUnseen ? statusColor : colors.border,
          borderRadius: colors.radius,
          borderWidth: isUnseen ? 2 : 1,
        },
      ]}
    >
      {/* Thumbnail */}
      <View style={[styles.thumb, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.thumbImg} resizeMode="cover" />
        ) : (
          <Feather name="image" size={24} color={colors.mutedForeground} />
        )}
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={[styles.cardName, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>
            {submission.proposedName}
          </Text>
          {isUnseen && (
            <View style={[styles.newBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.newBadgeLabel}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardBrand, { color: colors.mutedForeground }]}>
          {submission.brand}
        </Text>
        <View style={styles.cardMeta}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Text style={[styles.statusLabel, { color: statusColor }]}>
              {STATUS_LABEL[submission.status]}
            </Text>
          </View>
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            {new Date(submission.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>

        {/* Credited pin (merged into existing catalogue pin) */}
        {submission.status === 'approved' && submission.approvedPinhuntId && (
          <TouchableOpacity
            onPress={onCreditedPinPress}
            hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.creditedRow, { backgroundColor: '#16A34A14', borderRadius: 6 }]}
          >
            <Feather name="link" size={11} color="#16A34A" />
            <Text style={styles.creditedRowText} numberOfLines={1}>
              Credited on {submission.approvedPinTitle ?? submission.approvedPinhuntId}
            </Text>
            <Feather name="chevron-right" size={12} color="#16A34A" />
          </TouchableOpacity>
        )}

        {/* Reviewer notes */}
        {submission.reviewerNotes && (
          <View style={[styles.reviewerNoteBox, { backgroundColor: colors.secondary, borderRadius: 6 }]}>
            <Feather name="message-circle" size={11} color={colors.mutedForeground} />
            <Text style={[styles.reviewerNote, { color: colors.mutedForeground }]} numberOfLines={2}>
              {submission.reviewerNotes}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        {canDelete && onDelete && (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="trash-2" size={16} color={colors.destructive} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function MySubmissionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { repo, userId } = useMarketplace();
  const { unseenIds, markAllSeen } = useSubmissionNotifications();

  const [submissions, setSubmissions] = useState<PinSubmission[]>([]);
  const [imageUrls, setImageUrls]     = useState<Record<string, string>>({});
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const loadImageUrl = async (path: string): Promise<string | null> => {
    try {
      const { data } = await supabase.storage
        .from('pin-submissions')
        .createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    } catch {
      return null;
    }
  };

  const load = useCallback(async (isRefresh = false) => {
    if (!repo || !userId) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const data = await repo.getMyPinSubmissions(userId);
      setSubmissions(data);

      // Load signed thumbnail URLs in background
      const urls: Record<string, string> = {};
      await Promise.all(
        data.map(async s => {
          const url = await loadImageUrl(s.frontImagePath);
          if (url) urls[s.id] = url;
        }),
      );
      setImageUrls(urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load submissions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, userId]);

  useEffect(() => { load(); }, [load]);

  // Keep a stable reference to `load` so the realtime subscription and the
  // AppState listener below don't tear down and resubscribe every time the
  // callback identity changes.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Realtime sockets are suspended while the app is backgrounded, so events
  // sent during that window are lost. Run one catch-up fetch whenever the app
  // returns to the foreground (no polling).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') { loadRef.current(); }
    });
    return () => { sub.remove(); };
  }, []);

  // Realtime: patch statuses live while the screen is open
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`my_submissions_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pin_submissions',
          filter: `submitted_by=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            status?: PinSubmissionStatus;
            reviewer_notes?: string | null;
          };
          if (!row?.id || !row?.status) return;
          setSubmissions(prev =>
            prev.map(s =>
              s.id === row.id
                ? {
                    ...s,
                    status: row.status as PinSubmissionStatus,
                    reviewerNotes:
                      row.reviewer_notes !== undefined
                        ? row.reviewer_notes ?? undefined
                        : s.reviewerNotes,
                  }
                : s,
            ),
          );
        },
      )
      .subscribe(status => {
        // On (re)connect, run one catch-up fetch so status changes that
        // happened while the channel was down are picked up.
        if (status === 'SUBSCRIBED') { loadRef.current(); }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Mark all unseen submissions as seen when this screen mounts
  useEffect(() => {
    markAllSeen();
  // We only want to run this once on mount — markAllSeen is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = (submission: PinSubmission) => {
    Alert.alert(
      'Delete Draft',
      `Delete "${submission.proposedName}"? This also removes the uploaded photos and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await repo?.deleteDraftSubmission(submission.id);
              load();
            } catch {
              Alert.alert('Error', 'Could not delete submission. Try again.');
            }
          },
        },
      ],
    );
  };

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  return (
    <>
      <Stack.Screen options={{ title: 'My Submissions' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: botPad, paddingTop: 16, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
      >
        {/* Add button */}
        <TouchableOpacity
          onPress={() => router.push('/add-pin')}
          activeOpacity={0.85}
          style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.addBtnLabel}>Add a New Pin</Text>
        </TouchableOpacity>

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
        ) : submissions.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No submissions yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Found a pin that's not in the catalogue? Tap "Add a New Pin" above to contribute.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>
              {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            </Text>
            {submissions.map(s => (
              <SubmissionCard
                key={s.id}
                submission={s}
                imageUrl={imageUrls[s.id]}
                colors={colors}
                onPress={() => router.push({ pathname: '/submission/[id]', params: { id: s.id } })}
                onDelete={s.status === 'draft' ? () => handleDelete(s) : undefined}
                onCreditedPinPress={
                  s.approvedPinhuntId
                    ? () => router.push({ pathname: '/pin/[id]', params: { id: s.approvedPinhuntId! } })
                    : undefined
                }
                isUnseen={unseenIds.has(s.id)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, marginBottom: 16 },
  addBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  countLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 12, marginBottom: 12, gap: 12,
  },
  thumb: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  thumbImg: { width: 70, height: 70 },
  cardInfo: { flex: 1, gap: 4 },
  cardNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  cardName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  newBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 2 },
  newBadgeLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.5 },
  cardBrand: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  cardDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  creditedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 6, marginTop: 2 },
  creditedRowText: { flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#16A34A' },
  reviewerNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, padding: 7, marginTop: 2 },
  reviewerNote: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  cardActions: { gap: 12, alignItems: 'center', justifyContent: 'space-between' },
});
