/**
 * Admin Review — full view of a community submission with approve/reject/needs-changes actions.
 * Shows a duplicate-warning banner when existing catalogue pins closely match the submission.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useMarketplace } from '@/hooks/useMarketplace';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { DuplicateCandidate, PinSubmission, PinSubmissionStatus } from '@workspace/pin-repository';

import { API_BASE } from '@/lib/apiBase';

/** Lifetime of signed image URLs (seconds). */
const SIGNED_URL_TTL_SECONDS = 3600;
/** Proactively re-sign URLs a comfortable margin before they expire. */
const SIGNED_URL_REFRESH_MS = (SIGNED_URL_TTL_SECONDS - 600) * 1000;

async function getSignedUrl(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from('pin-submissions').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  } catch { return null; }
}

type ReviewAction = 'approved' | 'rejected' | 'needs_changes' | 'under_review';

const STATUS_LABEL: Record<PinSubmissionStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review',
  approved: 'Approved', rejected: 'Rejected', needs_changes: 'Needs Changes',
};
const STATUS_COLOR: Record<PinSubmissionStatus, string> = {
  draft: '#6366F1', submitted: '#3B82F6', under_review: '#F59E0B',
  approved: '#16A34A', rejected: '#EF4444', needs_changes: '#F97316',
};

function InfoRow({ label, value }: { label: string; value?: string | number | string[] }) {
  const colors = useColors();
  if (!value && value !== 0) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  const display = Array.isArray(value) ? value.join(', ') : String(value);
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.foreground }]}>{display}</Text>
    </View>
  );
}

export default function AdminReviewScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo } = useMarketplace();
  const { session } = useAuth();

  const [submission, setSubmission] = useState<PinSubmission | null>(null);
  const [frontUrl, setFrontUrl]     = useState<string | null>(null);
  const [backUrl,  setBackUrl]      = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState('');

  const [candidates, setCandidates]         = useState<DuplicateCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [duplicateBannerDismissed, setDuplicateBannerDismissed] = useState(false);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  useEffect(() => {
    if (!repo || !id) { setLoading(false); return; }
    (async () => {
      try {
        const sub = await repo.getPinSubmission(id);
        if (!sub) { setError('Submission not found.'); setLoading(false); return; }
        setSubmission(sub);
        setReviewerNotes(sub.reviewerNotes ?? '');
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
    })();
  }, [id, repo]);

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

  // Load duplicate candidates once submission is available and actionable
  useEffect(() => {
    if (!submission) return;
    const actionable = submission.status === 'submitted' || submission.status === 'under_review';
    if (!actionable) return;

    setCandidatesLoading(true);
    fetch(`${API_BASE}/admin/submissions/${submission.id}/duplicate-candidates`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
      .then(r => r.json())
      .then((body: { candidates?: DuplicateCandidate[]; error?: string }) => {
        if (body.candidates) setCandidates(body.candidates);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => setCandidatesLoading(false));
  }, [submission, session?.access_token]);

  const takeAction = async (action: ReviewAction) => {
    if (!repo || !submission) return;

    const actionLabels: Record<ReviewAction, string> = {
      approved:      'Approve',
      rejected:      'Reject',
      needs_changes: 'Request Changes',
      under_review:  'Mark Under Review',
    };

    const needsNotes = action === 'needs_changes' || action === 'rejected';
    if (needsNotes && !reviewerNotes.trim()) {
      Alert.alert(
        'Note Required',
        `Please add a reviewer note before ${action === 'needs_changes' ? 'requesting changes' : 'rejecting'}.`,
      );
      return;
    }

    Alert.alert(
      actionLabels[action],
      `Set this submission to "${STATUS_LABEL[action]}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabels[action],
          style: action === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setSaving(true);
              await repo.reviewPinSubmission(submission.id, {
                status: action,
                reviewerNotes: reviewerNotes.trim() || undefined,
              });
              router.back();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Action failed.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const markUnderReview = () => takeAction('under_review');

  const mergeIntoExisting = (candidate: DuplicateCandidate) => {
    if (!repo || !submission) return;
    Alert.alert(
      'Merge into Existing Pin',
      `Approve this submission and credit the submitter against the existing catalogue pin "${candidate.title}" (${candidate.pinhuntId})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          onPress: async () => {
            try {
              setSaving(true);
              await repo.reviewPinSubmission(submission.id, {
                status: 'approved',
                reviewerNotes: reviewerNotes.trim() || `Merged into existing catalogue pin ${candidate.pinhuntId}.`,
                approvedPinhuntId: candidate.pinhuntId,
              });
              router.back();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Merge failed.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const approveAndAddToCatalogue = () => {
    if (!submission) return;
    router.push({
      pathname: '/admin/pin/[id]',
      params: {
        id: 'new',
        submissionId:       submission.id,
        prefillTitle:       submission.proposedName ?? '',
        prefillBrand:       submission.brand ?? '',
        prefillSeries:      submission.seriesName ?? '',
        prefillOrigin:      submission.releaseLocation ?? '',
        prefillYear:        submission.releaseYear?.toString() ?? '',
        prefillEditionType: submission.editionType ?? 'unknown',
        prefillEditionSize: submission.editionSize?.toString() ?? '',
        prefillFacNumber:   submission.facNumber ?? '',
        prefillSku:         submission.sku ?? '',
        prefillCharacters:  (submission.characterNames ?? []).join(', '),
        prefillNotes:       submission.notes ?? '',
        prefillFrontPath:   submission.frontImagePath ?? '',
        prefillBackPath:    submission.backImagePath ?? '',
      },
    });
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Review Submission' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </>
    );
  }

  if (error || !submission) {
    return (
      <>
        <Stack.Screen options={{ title: 'Review Submission' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error ?? 'Not found.'}</Text>
        </View>
      </>
    );
  }

  const isActionable = submission.status === 'submitted' || submission.status === 'under_review';
  const showDuplicateWarning = isActionable && candidates.length > 0 && !duplicateBannerDismissed;

  return (
    <>
      <Stack.Screen options={{ title: submission.proposedName ?? 'Review Submission' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: botPad }}
          showsVerticalScrollIndicator={false}
        >
          {/* Front image */}
          {frontUrl ? (
            <Image source={{ uri: frontUrl }} style={styles.heroImage} resizeMode="contain" onError={refreshImageUrls} />
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.secondary }]}>
              <Feather name="image" size={36} color={colors.mutedForeground} />
            </View>
          )}

          <View style={{ padding: 16, gap: 16 }}>
            {/* Status */}
            <View style={[styles.statusBanner, {
              backgroundColor: STATUS_COLOR[submission.status] + '18',
              borderColor:     STATUS_COLOR[submission.status] + '44',
              borderRadius: 10,
            }]}>
              <Text style={[styles.statusText, { color: STATUS_COLOR[submission.status] }]}>
                {STATUS_LABEL[submission.status]}
              </Text>
            </View>

            {/* ── Duplicate warning banner ── */}
            {candidatesLoading && isActionable && (
              <View style={[styles.dupBanner, { backgroundColor: '#FEF9C3', borderColor: '#FDE047' }]}>
                <ActivityIndicator size="small" color="#92400E" style={{ marginRight: 8 }} />
                <Text style={styles.dupBannerText}>Checking for existing catalogue matches…</Text>
              </View>
            )}

            {showDuplicateWarning && (
              <View style={[styles.dupBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderRadius: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Feather name="alert-triangle" size={15} color="#92400E" />
                    <Text style={[styles.dupBannerTitle, { color: '#92400E' }]}>
                      Possible duplicate{candidates.length > 1 ? 's' : ''} found
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDuplicateBannerDismissed(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={14} color="#92400E" />
                  </TouchableOpacity>
                </View>

                {candidates.map(c => (
                  <View
                    key={c.pinhuntId}
                    style={[styles.dupCandidate, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dupCandidateName} numberOfLines={1}>{c.title}</Text>
                      <Text style={styles.dupCandidateMeta}>
                        {c.pinhuntId}{c.releaseYear ? ` · ${c.releaseYear}` : ''} · {c.matchReason}
                      </Text>
                    </View>
                    {c.imageUrl ? (
                      <Image source={{ uri: c.imageUrl }} style={styles.dupThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.dupThumb, { backgroundColor: '#FDE68A', alignItems: 'center', justifyContent: 'center' }]}>
                        <Feather name="image" size={12} color="#92400E" />
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => mergeIntoExisting(c)}
                      disabled={saving}
                      style={[styles.mergeBtn, { backgroundColor: '#92400E' }]}
                    >
                      <Text style={styles.mergeBtnLabel}>Merge</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <Text style={[styles.dupBannerHint, { color: '#92400E' }]}>
                  Tap Merge to approve and link this submission to the existing pin, or dismiss to create a new entry.
                </Text>
              </View>
            )}

            {/* Submission detail */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
              <InfoRow label="Pin Name"     value={submission.proposedName} />
              <InfoRow label="Brand"        value={submission.brand} />
              <InfoRow label="Characters"   value={submission.characterNames} />
              <InfoRow label="Series"       value={submission.seriesName} />
              <InfoRow label="Location"     value={submission.releaseLocation} />
              <InfoRow label="Year"         value={submission.releaseYear} />
              <InfoRow label="Edition"      value={submission.editionType?.replace(/_/g, ' ')} />
              <InfoRow label="Edition Size" value={submission.editionSize} />
              <InfoRow label="FAC #"        value={submission.facNumber} />
              <InfoRow label="SKU"          value={submission.sku} />
              <InfoRow label="Notes"        value={submission.notes} />
              <View style={[styles.row, { borderBottomColor: colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Submitted</Text>
                <Text style={[styles.rowValue, { color: colors.foreground }]}>
                  {new Date(submission.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </View>

            {/* Back image */}
            {backUrl && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BACK OF PIN</Text>
                <Image source={{ uri: backUrl }} style={[styles.backImage, { borderRadius: 12 }]} resizeMode="contain" onError={refreshImageUrls} />
              </View>
            )}

            {/* Mark under review (if submitted) */}
            {submission.status === 'submitted' && (
              <TouchableOpacity
                onPress={markUnderReview}
                disabled={saving}
                activeOpacity={0.85}
                style={[styles.outlineBtn, { borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card }]}
              >
                <Feather name="eye" size={15} color={colors.foreground} />
                <Text style={[styles.outlineBtnLabel, { color: colors.foreground }]}>Mark Under Review</Text>
              </TouchableOpacity>
            )}

            {/* Reviewer notes */}
            {isActionable && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>REVIEWER NOTE</Text>
                <TextInput
                  value={reviewerNotes}
                  onChangeText={setReviewerNotes}
                  placeholder="Add a note for the submitter (required for Reject / Needs Changes)…"
                  placeholderTextColor={colors.mutedForeground + '88'}
                  multiline
                  style={[
                    styles.noteInput,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      borderRadius: 10,
                    },
                  ]}
                />
              </View>
            )}

            {/* View in Catalogue (already approved + linked) */}
            {submission.approvedPinId && submission.approvedPinhuntId && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/admin/pin/[id]',
                    params: { id: submission.approvedPinhuntId! },
                  })
                }
                activeOpacity={0.85}
                style={[styles.outlineBtn, { borderColor: '#16A34A', borderRadius: 12, backgroundColor: colors.card }]}
              >
                <Feather name="book-open" size={15} color="#16A34A" />
                <Text style={[styles.outlineBtnLabel, { color: '#16A34A' }]}>View in Catalogue</Text>
              </TouchableOpacity>
            )}

            {/* Action buttons */}
            {isActionable && (
              saving ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
              ) : (
                <View style={{ gap: 10 }}>
                  {/* Primary CTA: approve and open pre-filled pin editor.
                      Hidden when this submission already has a linked catalogue pin. */}
                  {!submission.approvedPinId && (
                    <TouchableOpacity
                      onPress={approveAndAddToCatalogue}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, { backgroundColor: '#16A34A', borderRadius: 12 }]}
                    >
                      <Feather name="book-open" size={16} color="#fff" />
                      <Text style={styles.actionBtnLabel}>Approve &amp; Add to Catalogue</Text>
                    </TouchableOpacity>
                  )}

                  {/* Secondary: approve without creating a catalogue entry */}
                  <TouchableOpacity
                    onPress={() => takeAction('approved')}
                    activeOpacity={0.85}
                    style={[styles.outlineBtn, { borderColor: '#16A34A', borderRadius: 12, backgroundColor: colors.card }]}
                  >
                    <Feather name="check-circle" size={15} color="#16A34A" />
                    <Text style={[styles.outlineBtnLabel, { color: '#16A34A' }]}>Approve Only</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => takeAction('needs_changes')}
                    activeOpacity={0.85}
                    style={[styles.actionBtn, { backgroundColor: '#F97316', borderRadius: 12 }]}
                  >
                    <Feather name="edit-2" size={16} color="#fff" />
                    <Text style={styles.actionBtnLabel}>Needs Changes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => takeAction('rejected')}
                    activeOpacity={0.85}
                    style={[styles.actionBtn, { backgroundColor: colors.destructive, borderRadius: 12 }]}
                  >
                    <Feather name="x-circle" size={16} color="#fff" />
                    <Text style={styles.actionBtnLabel}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {/* View in Catalogue — shown once approved and linked to a pin */}
            {submission.status === 'approved' && submission.approvedPinhuntId && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/admin/pin/[id]',
                    params: { id: submission.approvedPinhuntId! },
                  })
                }
                activeOpacity={0.85}
                style={[
                  styles.outlineBtn,
                  { borderColor: '#16A34A', borderRadius: 12, backgroundColor: colors.card },
                ]}
              >
                <Feather name="external-link" size={15} color="#16A34A" />
                <Text style={[styles.outlineBtnLabel, { color: '#16A34A' }]}>View in Catalogue</Text>
              </TouchableOpacity>
            )}

            {/* Previous reviewer note (read-only when not actionable) */}
            {!isActionable && submission.reviewerNotes && (
              <View style={[styles.reviewerBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderRadius: 10 }]}>
                <Feather name="message-circle" size={14} color="#92400E" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.reviewerTitle}>Reviewer note</Text>
                  <Text style={styles.reviewerText}>{submission.reviewerNotes}</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText:       { fontSize: 14, fontFamily: 'Inter_400Regular' },
  heroImage:       { width: '100%', height: 300 },
  heroPlaceholder: { width: '100%', height: 200, alignItems: 'center', justifyContent: 'center' },
  statusBanner:    { padding: 12, borderWidth: 1, alignItems: 'center' },
  statusText:      { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  card:            { borderWidth: 1, overflow: 'hidden' },
  row:             { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  rowLabel:        { width: 90, fontSize: 12, fontFamily: 'Inter_400Regular', paddingTop: 1 },
  rowValue:        { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionLabel:    { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  backImage:       { width: '100%', height: 240 },
  outlineBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderWidth: 1 },
  outlineBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  noteInput:       { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular', height: 100, textAlignVertical: 'top' },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  actionBtnLabel:  { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  reviewerBox:     { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1 },
  reviewerTitle:   { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#92400E' },
  reviewerText:    { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#92400E', lineHeight: 18 },
  // ── Duplicate warning ────────────────────────────────────────────────────
  dupBanner:       { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8, flexDirection: 'column' },
  dupBannerTitle:  { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dupBannerText:   { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#92400E', flex: 1 },
  dupBannerHint:   { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: 4 },
  dupCandidate:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 8 },
  dupCandidateName:{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1917' },
  dupCandidateMeta:{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#78716C', marginTop: 2 },
  dupThumb:        { width: 40, height: 40, borderRadius: 6, flexShrink: 0 },
  mergeBtn:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  mergeBtnLabel:   { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
