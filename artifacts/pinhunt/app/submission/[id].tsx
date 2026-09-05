/**
 * Submission Detail — full view of a single pin submission.
 * Loads front/back images as signed URLs from the private storage bucket.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { radius, spacing } from '@/constants/theme';
import type { PinSubmission, PinSubmissionStatus } from '@workspace/pin-repository';

const STATUS_LABEL: Record<PinSubmissionStatus, string> = {
  draft:         'Draft',
  submitted:     'Submitted — awaiting review',
  under_review:  'Under Review',
  approved:      'Approved ✓',
  rejected:      'Rejected',
  needs_changes: 'Needs Changes',
};

function statusColor(status: PinSubmissionStatus, colors: ReturnType<typeof useColors>): string {
  switch (status) {
    case 'draft': return colors.homeMuted;
    case 'submitted': return colors.forTrade;
    case 'under_review': return colors.homeSandInk;
    case 'approved': return colors.owned;
    case 'rejected': return colors.destructive;
    case 'needs_changes': return colors.wanted;
  }
}

function InfoRow({ label, value }: { label: string; value?: string | number | string[] }) {
  const colors = useColors();
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  const display = Array.isArray(value) ? value.join(', ') : String(value);
  return (
    <View style={[styles.row, { borderBottomColor: colors.homeLine }]}>
      <Text style={[styles.rowLabel, { color: colors.homeMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.homeInk }]}>{display}</Text>
    </View>
  );
}

/** Lifetime of signed image URLs (seconds). */
const SIGNED_URL_TTL_SECONDS = 3600;
/** Proactively re-sign URLs a comfortable margin before they expire. */
const SIGNED_URL_REFRESH_MS = (SIGNED_URL_TTL_SECONDS - 600) * 1000;

async function getSignedUrl(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage
      .from('pin-submissions')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export default function SubmissionDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo } = useMarketplace();

  const [submission, setSubmission] = useState<PinSubmission | null>(null);
  const [frontUrl, setFrontUrl]     = useState<string | null>(null);
  const [backUrl,  setBackUrl]      = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repo || !id) { setLoading(false); return; }
    try {
      const sub = await repo.getPinSubmission(id);
      if (!sub) { setError('Submission not found.'); setLoading(false); return; }
      setSubmission(sub);
      // Load images in parallel
      const [front, back] = await Promise.all([
        getSignedUrl(sub.frontImagePath),
        sub.backImagePath ? getSignedUrl(sub.backImagePath) : Promise.resolve(null),
      ]);
      setFrontUrl(front);
      setBackUrl(back);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load submission.');
    } finally {
      setLoading(false);
    }
  }, [id, repo]);

  useEffect(() => { load(); }, [load]);

  // Keep a stable reference to `load` so the realtime subscription and the
  // AppState listener below don't tear down and resubscribe every time the
  // callback identity changes.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Realtime: refresh this submission when its row changes (status,
  // reviewer notes, etc.) while the screen is open.
  useEffect(() => {
    if (!isSupabaseConfigured || !id) return;

    const channel = supabase
      .channel(`submission-detail-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pin_submissions', filter: `id=eq.${id}` },
        () => { loadRef.current(); },
      )
      .subscribe(status => {
        // On (re)connect, run one catch-up fetch so changes that happened
        // while the channel was down are picked up.
        if (status === 'SUBSCRIBED') { loadRef.current(); }
      });

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Realtime sockets are suspended while the app is backgrounded, so events
  // sent during that window are lost. Run one catch-up fetch whenever the app
  // returns to the foreground (no polling).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') { loadRef.current(); }
    });
    return () => { sub.remove(); };
  }, []);

  // Signed URLs expire after SIGNED_URL_TTL_SECONDS. Re-sign them when an
  // image fails to load, and proactively before expiry, so photos never go
  // blank while the screen stays open for over an hour.
  const submissionRef = useRef<PinSubmission | null>(null);
  useEffect(() => { submissionRef.current = submission; }, [submission]);

  const lastErrorRefreshRef = useRef(0);

  const refreshImageUrls = useCallback(async () => {
    // Throttle so a genuinely broken image can't trigger an endless
    // re-sign loop (each new URL failing fires onError again).
    const now = Date.now();
    if (now - lastErrorRefreshRef.current < 30_000) return;
    lastErrorRefreshRef.current = now;

    const sub = submissionRef.current;
    if (!sub) return;
    const [front, back] = await Promise.all([
      getSignedUrl(sub.frontImagePath),
      sub.backImagePath ? getSignedUrl(sub.backImagePath) : Promise.resolve(null),
    ]);
    if (front) setFrontUrl(front);
    if (back) setBackUrl(back);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { refreshImageUrls(); }, SIGNED_URL_REFRESH_MS);
    return () => { clearInterval(timer); };
  }, [refreshImageUrls]);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const isDraftOrNeedsChanges = submission?.status === 'draft' || submission?.status === 'needs_changes';

  return (
    <>
      <Stack.Screen options={{ title: 'Submission' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.homeBackground }]}
        contentContainerStyle={{ paddingBottom: botPad }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : submission ? (
          <>
            {/* Front image */}
            {frontUrl ? (
              <Image source={{ uri: frontUrl }} style={styles.heroImage} resizeMode="contain" onError={refreshImageUrls} />
            ) : (
              <View style={[styles.heroPlaceholder, { backgroundColor: colors.homeAqua }]}>
                <Feather name="image" size={36} color={colors.homeMuted} />
              </View>
            )}

            <View style={{ padding: spacing.lg, gap: spacing.lg }}>
              {/* Status banner */}
              <View style={[styles.statusBanner, { backgroundColor: statusColor(submission.status, colors) + '18', borderColor: statusColor(submission.status, colors) + '44', borderRadius: radius.sm }]}>
                <Text style={[styles.statusText, { color: statusColor(submission.status, colors) }]}>
                  {STATUS_LABEL[submission.status]}
                </Text>
              </View>

              {/* Credited pin (merged into existing catalogue pin) */}
              {submission.status === 'approved' && submission.approvedPinhuntId && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/pin/[id]', params: { id: submission.approvedPinhuntId! } })}
                  activeOpacity={0.8}
                  style={[styles.creditedBox, { backgroundColor: colors.owned + '14', borderColor: colors.owned + '44', borderRadius: radius.sm }]}
                >
                  <Feather name="link" size={14} color={colors.owned} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.creditedTitle, { color: colors.owned }]}>Credited on</Text>
                    <Text style={[styles.creditedText, { color: colors.owned }]} numberOfLines={2}>
                      {submission.approvedPinTitle ?? submission.approvedPinhuntId}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.owned} />
                </TouchableOpacity>
              )}

              {/* Reviewer notes */}
              {submission.reviewerNotes && (
                <View style={[styles.reviewerBox, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine, borderRadius: radius.sm }]}>
                  <Feather name="message-circle" size={14} color={colors.homeSandInk} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.reviewerBoxTitle, { color: colors.homeSandInk }]}>Reviewer note</Text>
                    <Text style={[styles.reviewerBoxText, { color: colors.homeSandInk }]}>{submission.reviewerNotes}</Text>
                  </View>
                </View>
              )}

              {/* Details card */}
              <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.md }]}>
                <InfoRow label="Pin Name"    value={submission.proposedName} />
                <InfoRow label="Brand"       value={submission.brand} />
                <InfoRow label="Characters"  value={submission.characterNames} />
                <InfoRow label="Series"      value={submission.seriesName} />
                <InfoRow label="Location"    value={submission.releaseLocation} />
                <InfoRow label="Year"        value={submission.releaseYear} />
                <InfoRow label="Edition"     value={submission.editionType.replace(/_/g, ' ')} />
                <InfoRow label="Edition Size"value={submission.editionSize} />
                <InfoRow label="FAC #"       value={submission.facNumber} />
                <InfoRow label="SKU"         value={submission.sku} />
                <InfoRow label="Notes"       value={submission.notes} />
                <View style={[styles.row, { borderBottomColor: colors.homeLine }]}>
                  <Text style={[styles.rowLabel, { color: colors.homeMuted }]}>Submitted</Text>
                  <Text style={[styles.rowValue, { color: colors.homeInk }]}>
                    {new Date(submission.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
              </View>

              {/* Back image */}
              {backUrl && (
                <View style={{ gap: spacing.sm }}>
                  <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>BACK OF PIN</Text>
                  <Image source={{ uri: backUrl }} style={[styles.backImage, { borderRadius: radius.md }]} resizeMode="contain" onError={refreshImageUrls} />
                </View>
              )}

              {/* Edit button for draft / needs-changes */}
              {isDraftOrNeedsChanges && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/edit-submission/[id]', params: { id: submission.id } })}
                  activeOpacity={0.85}
                  style={[styles.editBtn, { backgroundColor: colors.homeCoral, borderRadius: radius.md, shadowColor: colors.homeShadow }]}
                >
                  <Feather name="edit-2" size={15} color={colors.homeSurface} />
                  <Text style={[styles.editBtnLabel, { color: colors.homeSurface }]}>
                    {submission.status === 'needs_changes' ? 'Make Changes & Resubmit' : 'Edit Draft'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  heroImage: { width: '100%', height: 300 },
  heroPlaceholder: { width: '100%', height: 240, alignItems: 'center', justifyContent: 'center' },
  statusBanner: { padding: spacing.md, borderWidth: 1, alignItems: 'center' },
  statusText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  reviewerBox: { flexDirection: 'row', gap: spacing.sm + 2, padding: spacing.md, borderWidth: 1 },
  creditedBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, padding: spacing.md, borderWidth: 1 },
  creditedTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  creditedText: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  reviewerBoxTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  reviewerBoxText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  card: { borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.md },
  rowLabel: { width: 90, fontSize: 12, fontFamily: 'Inter_400Regular', paddingTop: 1 },
  rowValue: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  backImage: { width: '100%', height: 240 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg - 2,
    shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  editBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
