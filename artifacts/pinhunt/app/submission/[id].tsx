/**
 * Submission Detail — full view of a single pin submission.
 * Loads front/back images as signed URLs from the private storage bucket.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '@/lib/supabase';
import type { PinSubmission, PinSubmissionStatus } from '@workspace/pin-repository';

const STATUS_LABEL: Record<PinSubmissionStatus, string> = {
  draft:         'Draft',
  submitted:     'Submitted — awaiting review',
  under_review:  'Under Review',
  approved:      'Approved ✓',
  rejected:      'Rejected',
  needs_changes: 'Needs Changes',
};
const STATUS_COLOR: Record<PinSubmissionStatus, string> = {
  draft:         '#6366F1',
  submitted:     '#3B82F6',
  under_review:  '#F59E0B',
  approved:      '#16A34A',
  rejected:      '#EF4444',
  needs_changes: '#F97316',
};

function InfoRow({ label, value }: { label: string; value?: string | number | string[] }) {
  const colors = useColors();
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  const display = Array.isArray(value) ? value.join(', ') : String(value);
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.foreground }]}>{display}</Text>
    </View>
  );
}

async function getSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('pin-submissions')
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
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

  useEffect(() => {
    if (!repo || !id) { setLoading(false); return; }
    (async () => {
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
    })();
  }, [id, repo]);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const isDraftOrNeedsChanges = submission?.status === 'draft' || submission?.status === 'needs_changes';

  return (
    <>
      <Stack.Screen options={{ title: 'Submission' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: botPad }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : submission ? (
          <>
            {/* Front image */}
            {frontUrl ? (
              <Image source={{ uri: frontUrl }} style={styles.heroImage} resizeMode="contain" />
            ) : (
              <View style={[styles.heroPlaceholder, { backgroundColor: colors.secondary }]}>
                <Feather name="image" size={36} color={colors.mutedForeground} />
              </View>
            )}

            <View style={{ padding: 16, gap: 16 }}>
              {/* Status banner */}
              <View style={[styles.statusBanner, { backgroundColor: STATUS_COLOR[submission.status] + '18', borderColor: STATUS_COLOR[submission.status] + '44', borderRadius: 10 }]}>
                <Text style={[styles.statusText, { color: STATUS_COLOR[submission.status] }]}>
                  {STATUS_LABEL[submission.status]}
                </Text>
              </View>

              {/* Reviewer notes */}
              {submission.reviewerNotes && (
                <View style={[styles.reviewerBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderRadius: 10 }]}>
                  <Feather name="message-circle" size={14} color="#92400E" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.reviewerBoxTitle}>Reviewer note</Text>
                    <Text style={styles.reviewerBoxText}>{submission.reviewerNotes}</Text>
                  </View>
                </View>
              )}

              {/* Details card */}
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14 }]}>
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
                  <Image source={{ uri: backUrl }} style={[styles.backImage, { borderRadius: 12 }]} resizeMode="contain" />
                </View>
              )}

              {/* Edit button for draft / needs-changes */}
              {isDraftOrNeedsChanges && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/edit-submission/[id]', params: { id: submission.id } })}
                  activeOpacity={0.85}
                  style={[styles.editBtn, { backgroundColor: colors.primary, borderRadius: 12 }]}
                >
                  <Feather name="edit-2" size={15} color="#fff" />
                  <Text style={styles.editBtnLabel}>
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
  statusBanner: { padding: 12, borderWidth: 1, alignItems: 'center' },
  statusText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  reviewerBox: { flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1 },
  reviewerBoxTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#92400E' },
  reviewerBoxText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#92400E', lineHeight: 18 },
  card: { borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  rowLabel: { width: 90, fontSize: 12, fontFamily: 'Inter_400Regular', paddingTop: 1 },
  rowValue: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  backImage: { width: '100%', height: 240 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  editBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
