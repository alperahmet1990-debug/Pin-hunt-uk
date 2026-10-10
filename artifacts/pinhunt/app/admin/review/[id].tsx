/**
 * Admin Review — full view of a community submission with approve/reject/needs-changes actions.
 * Shows a duplicate-warning banner when existing catalogue pins closely match the submission.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import palette from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useMyAccess } from '@/hooks/useMyAccess';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { DuplicateCandidate, PinSubmission, PinSubmissionStatus } from '@workspace/pin-repository';

import { API_BASE } from '@/lib/apiBase';

// Theme-independent status colours for module-level lookup tables.
const statusPalette = palette.light;

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
type PendingConfirm =
  | { kind: 'status'; action: ReviewAction }
  | { kind: 'merge'; candidate: DuplicateCandidate };

const ACTION_LABEL: Record<ReviewAction, string> = {
  approved:      'Approve',
  rejected:      'Reject',
  needs_changes: 'Request Changes',
  under_review:  'Mark Under Review',
};

const STATUS_LABEL: Record<PinSubmissionStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review',
  approved: 'Approved', rejected: 'Rejected', needs_changes: 'Needs Changes',
};
const STATUS_COLOR: Record<PinSubmissionStatus, string> = {
  draft: statusPalette.homeMuted, submitted: statusPalette.forTrade, under_review: statusPalette.homeSandInk,
  approved: statusPalette.owned, rejected: statusPalette.destructive, needs_changes: statusPalette.wanted,
};

function InfoRow({ label, value }: { label: string; value?: string | number | string[] }) {
  const colors = useColors();
  if (!value && value !== 0) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  const display = Array.isArray(value) ? value.join(', ') : String(value);
  return (
    <View style={[styles.row, { borderBottomColor: colors.homeLine }]}>
      <Text style={[styles.rowLabel, { color: colors.homeMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.homeInk }]}>{display}</Text>
    </View>
  );
}

export default function AdminReviewScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  // Creating/editing catalogue pins is App Creator only (migration 041);
  // plain admins approve, reject, or merge into an existing pin.
  const { isAppCreator } = useMyAccess();
  const { repo } = useMarketplace();
  const { session } = useAuth();

  const [submission, setSubmission] = useState<PinSubmission | null>(null);
  const [frontUrl, setFrontUrl]     = useState<string | null>(null);
  const [backUrl,  setBackUrl]      = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Confirmations render in-app (see ConfirmBar) rather than via Alert —
  // native alert callbacks don't reliably fire on Expo web.
  const requestAction = (action: ReviewAction) => {
    if (!submission) return;
    setActionError(null);
    const needsNotes = action === 'needs_changes' || action === 'rejected';
    if (needsNotes && !reviewerNotes.trim()) {
      setActionError(`Add a reviewer note before ${action === 'needs_changes' ? 'requesting changes' : 'rejecting'}.`);
      return;
    }
    setPendingConfirm({ kind: 'status', action });
  };

  const markUnderReview = () => requestAction('under_review');

  const confirmPending = async () => {
    if (!repo || !submission || !pendingConfirm) return;
    try {
      setSaving(true);
      setActionError(null);
      if (pendingConfirm.kind === 'status') {
        await repo.reviewPinSubmission(submission.id, {
          status: pendingConfirm.action,
          reviewerNotes: reviewerNotes.trim() || undefined,
        });
      } else {
        const { candidate } = pendingConfirm;
        await repo.reviewPinSubmission(submission.id, {
          status: 'approved',
          reviewerNotes: reviewerNotes.trim() || `Merged into existing catalogue pin ${candidate.pinhuntId}.`,
          approvedPinhuntId: candidate.pinhuntId,
        });
      }
      setPendingConfirm(null);
      router.back();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setSaving(false);
    }
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
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
          <ActivityIndicator color={colors.homeCoral} />
        </View>
      </>
    );
  }

  if (error || !submission) {
    return (
      <>
        <Stack.Screen options={{ title: 'Review Submission' }} />
        <View style={[styles.center, { backgroundColor: colors.homeBackground }]}>
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
        style={{ flex: 1, backgroundColor: colors.homeBackground }}
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
            <View style={[styles.heroPlaceholder, { backgroundColor: colors.homeAqua }]}>
              <Feather name="image" size={36} color={colors.homeMuted} />
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
              <View style={[styles.dupBanner, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine }]}>
                <ActivityIndicator size="small" color={colors.homeSandInk} style={{ marginRight: 8 }} />
                <Text style={[styles.dupBannerText, { color: colors.homeSandInk }]}>Checking for existing catalogue matches…</Text>
              </View>
            )}

            {showDuplicateWarning && (
              <View style={[styles.dupBanner, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeSandInk, borderRadius: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Feather name="alert-triangle" size={15} color={colors.homeSandInk} />
                    <Text style={[styles.dupBannerTitle, { color: colors.homeSandInk }]}>
                      Possible duplicate{candidates.length > 1 ? 's' : ''} found
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDuplicateBannerDismissed(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={14} color={colors.homeSandInk} />
                  </TouchableOpacity>
                </View>

                {candidates.map(c => (
                  <View
                    key={c.pinhuntId}
                    style={[styles.dupCandidate, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dupCandidateName, { color: colors.homeInk }]} numberOfLines={1}>{c.title}</Text>
                      <Text style={[styles.dupCandidateMeta, { color: colors.homeMuted }]}>
                        {c.pinhuntId}{c.releaseYear ? ` · ${c.releaseYear}` : ''} · {c.matchReason}
                      </Text>
                    </View>
                    {c.imageUrl ? (
                      <Image source={{ uri: c.imageUrl }} style={styles.dupThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.dupThumb, { backgroundColor: colors.homeWarmLine, alignItems: 'center', justifyContent: 'center' }]}>
                        <Feather name="image" size={12} color={colors.homeSandInk} />
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => { setActionError(null); setPendingConfirm({ kind: 'merge', candidate: c }); }}
                      disabled={saving}
                      style={[styles.mergeBtn, { backgroundColor: colors.homeSandInk }]}
                    >
                      <Text style={styles.mergeBtnLabel}>Merge</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {pendingConfirm?.kind === 'merge' && (
                  <ConfirmBar
                    message={`Approve and credit the submitter against "${pendingConfirm.candidate.title}" (${pendingConfirm.candidate.pinhuntId})?`}
                    confirmLabel="Merge"
                    saving={saving}
                    onCancel={() => setPendingConfirm(null)}
                    onConfirm={confirmPending}
                  />
                )}

                <Text style={[styles.dupBannerHint, { color: colors.homeSandInk }]}>
                  Tap Merge to approve and link this submission to the existing pin, or dismiss to create a new entry.
                </Text>
              </View>
            )}

            {/* Submission detail */}
            <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: 14 }]}>
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
              <View style={[styles.row, { borderBottomColor: colors.homeLine }]}>
                <Text style={[styles.rowLabel, { color: colors.homeMuted }]}>Submitted</Text>
                <Text style={[styles.rowValue, { color: colors.homeInk }]}>
                  {new Date(submission.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </View>

            {/* Back image */}
            {backUrl && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>BACK OF PIN</Text>
                <Image source={{ uri: backUrl }} style={[styles.backImage, { borderRadius: 12 }]} resizeMode="contain" onError={refreshImageUrls} />
              </View>
            )}

            {/* Mark under review (if submitted) */}
            {submission.status === 'submitted' && (
              <TouchableOpacity
                onPress={markUnderReview}
                disabled={saving}
                activeOpacity={0.85}
                style={[styles.outlineBtn, { borderColor: colors.homeLine, borderRadius: 12, backgroundColor: colors.homeSurface }]}
              >
                <Feather name="eye" size={15} color={colors.homeInk} />
                <Text style={[styles.outlineBtnLabel, { color: colors.homeInk }]}>Mark Under Review</Text>
              </TouchableOpacity>
            )}

            {/* Reviewer notes */}
            {isActionable && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>REVIEWER NOTE</Text>
                <TextInput
                  value={reviewerNotes}
                  onChangeText={setReviewerNotes}
                  placeholder="Add a note for the submitter (required for Reject / Needs Changes)…"
                  placeholderTextColor={colors.homeMuted + '88'}
                  multiline
                  style={[
                    styles.noteInput,
                    {
                      color: colors.homeInk,
                      borderColor: colors.homeLine,
                      backgroundColor: colors.homeSurface,
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
                  router.push(isAppCreator
                    ? { pathname: '/admin/pin/[id]', params: { id: submission.approvedPinhuntId! } }
                    : { pathname: '/pin/[id]', params: { id: submission.approvedPinhuntId! } })
                }
                activeOpacity={0.85}
                style={[styles.outlineBtn, { borderColor: colors.owned, borderRadius: 12, backgroundColor: colors.homeSurface }]}
              >
                <Feather name="book-open" size={15} color={colors.owned} />
                <Text style={[styles.outlineBtnLabel, { color: colors.owned }]}>View in Catalogue</Text>
              </TouchableOpacity>
            )}

            {/* Approved by an admin but not catalogued yet — only the App
                Creator can create the catalogue pin (migration 041). */}
            {submission.status === 'approved' && !submission.approvedPinId && (
              isAppCreator ? (
                <TouchableOpacity
                  onPress={approveAndAddToCatalogue}
                  activeOpacity={0.85}
                  style={[styles.actionBtn, { backgroundColor: colors.owned, borderRadius: 12 }]}
                >
                  <Feather name="book-open" size={16} color="#fff" />
                  <Text style={styles.actionBtnLabel}>Add to Catalogue</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.homeMuted, textAlign: 'center' }}>
                  Approved — waiting for the App Creator to add it to the catalogue.
                </Text>
              )
            )}

            {actionError && (
              <Text style={[styles.inlineError, { color: colors.destructive }]}>{actionError}</Text>
            )}

            {/* Action buttons — replaced by an in-app confirmation once one is tapped */}
            {isActionable && pendingConfirm?.kind === 'status' ? (
              <ConfirmBar
                message={`Set this submission to "${STATUS_LABEL[pendingConfirm.action]}"?`}
                confirmLabel={ACTION_LABEL[pendingConfirm.action]}
                destructive={pendingConfirm.action === 'rejected'}
                saving={saving}
                onCancel={() => setPendingConfirm(null)}
                onConfirm={confirmPending}
              />
            ) : isActionable && (
              saving ? (
                <ActivityIndicator color={colors.homeCoral} style={{ marginTop: 8 }} />
              ) : (
                <View style={{ gap: 10 }}>
                  {/* Primary CTA: approve and open pre-filled pin editor.
                      Hidden when this submission already has a linked catalogue pin. */}
                  {!submission.approvedPinId && isAppCreator && (
                    <TouchableOpacity
                      onPress={approveAndAddToCatalogue}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, { backgroundColor: colors.owned, borderRadius: 12 }]}
                    >
                      <Feather name="book-open" size={16} color="#fff" />
                      <Text style={styles.actionBtnLabel}>Approve &amp; Add to Catalogue</Text>
                    </TouchableOpacity>
                  )}

                  {/* Secondary: approve without creating a catalogue entry */}
                  <TouchableOpacity
                    onPress={() => requestAction('approved')}
                    activeOpacity={0.85}
                    style={[styles.outlineBtn, { borderColor: colors.owned, borderRadius: 12, backgroundColor: colors.homeSurface }]}
                  >
                    <Feather name="check-circle" size={15} color={colors.owned} />
                    <Text style={[styles.outlineBtnLabel, { color: colors.owned }]}>
                      {isAppCreator ? 'Approve Only' : 'Approve'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => requestAction('needs_changes')}
                    activeOpacity={0.85}
                    style={[styles.actionBtn, { backgroundColor: colors.wanted, borderRadius: 12 }]}
                  >
                    <Feather name="edit-2" size={16} color="#fff" />
                    <Text style={styles.actionBtnLabel}>Needs Changes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => requestAction('rejected')}
                    activeOpacity={0.85}
                    style={[styles.actionBtn, { backgroundColor: colors.destructive, borderRadius: 12 }]}
                  >
                    <Feather name="x-circle" size={16} color="#fff" />
                    <Text style={styles.actionBtnLabel}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {/* Previous reviewer note (read-only when not actionable) */}
            {!isActionable && submission.reviewerNotes && (
              <View style={[styles.reviewerBox, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeSandInk, borderRadius: 10 }]}>
                <Feather name="message-circle" size={14} color={colors.homeSandInk} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.reviewerTitle, { color: colors.homeSandInk }]}>Reviewer note</Text>
                  <Text style={[styles.reviewerText, { color: colors.homeSandInk }]}>{submission.reviewerNotes}</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function ConfirmBar({
  message, confirmLabel, destructive, saving, onCancel, onConfirm,
}: {
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const colors = useColors();
  const tone = destructive ? colors.destructive : colors.homeCoral;
  return (
    <View style={[styles.confirmBar, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
      <Text style={[styles.confirmText, { color: colors.homeInk }]}>{message}</Text>
      <View style={styles.confirmButtons}>
        <TouchableOpacity onPress={onCancel} disabled={saving} style={styles.confirmBtn}>
          <Text style={[styles.confirmBtnLabel, { color: colors.homeMuted }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onConfirm} disabled={saving} style={[styles.confirmBtn, { backgroundColor: tone }]}>
          {saving
            ? <ActivityIndicator size="small" color={colors.homeHeroText} />
            : <Text style={[styles.confirmBtnLabel, { color: colors.homeHeroText }]}>{confirmLabel}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineError:     { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  confirmBar:      { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  confirmText:     { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 20 },
  confirmButtons:  { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  confirmBtn:      { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, minWidth: 88, alignItems: 'center' },
  confirmBtnLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
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
  reviewerTitle:   { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  reviewerText:    { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  // ── Duplicate warning ────────────────────────────────────────────────────
  dupBanner:       { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8, flexDirection: 'column' },
  dupBannerTitle:  { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dupBannerText:   { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  dupBannerHint:   { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: 4 },
  dupCandidate:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 8 },
  dupCandidateName:{ fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dupCandidateMeta:{ fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  dupThumb:        { width: 40, height: 40, borderRadius: 6, flexShrink: 0 },
  mergeBtn:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  mergeBtnLabel:   { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
