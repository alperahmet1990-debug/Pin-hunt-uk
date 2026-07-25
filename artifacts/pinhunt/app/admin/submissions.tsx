/**
 * Admin Submission Queue — lists all community pin submissions.
 * Filter tabs: Pending Review | Under Review | All
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '@/lib/supabase';
import type { PinSubmission, PinSubmissionStatus } from '@workspace/pin-repository';

type TabKey = 'pending' | 'under_review' | 'all';

const TABS: { key: TabKey; label: string; statuses?: PinSubmissionStatus[] }[] = [
  { key: 'pending',      label: 'Pending',      statuses: ['submitted'] },
  { key: 'under_review', label: 'Under Review',  statuses: ['under_review'] },
  { key: 'all',          label: 'All',           statuses: undefined },
];

const STATUS_LABEL: Record<PinSubmissionStatus, string> = {
  draft:         'Draft',
  submitted:     'Submitted',
  under_review:  'Under Review',
  approved:      'Approved',
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

async function getSignedUrl(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from('pin-submissions').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch { return null; }
}

export default function AdminSubmissionsScreen() {
  const colors     = useColors();
  const insets     = useSafeAreaInsets();
  const router     = useRouter();
  const { repo }   = useMarketplace();

  const [tab, setTab]               = useState<TabKey>('pending');
  const [submissions, setSubmissions] = useState<PinSubmission[]>([]);
  const [imageUrls, setImageUrls]   = useState<Record<string, string>>({});
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const currentTab = TABS.find(t => t.key === tab)!;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const data = await repo.getAllPinSubmissions(
        currentTab.statuses ? { statuses: currentTab.statuses } : undefined,
      );
      setSubmissions(data);

      // Load thumbnails in background
      const urls: Record<string, string> = {};
      await Promise.all(
        data.map(async s => {
          const url = await getSignedUrl(s.frontImagePath);
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
  }, [repo, currentTab.statuses]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Stack.Screen options={{ title: 'Submission Queue' }} />

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
              style={[styles.tab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
        ) : submissions.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {tab === 'pending' ? 'No pending submissions' : tab === 'under_review' ? 'Nothing under review' : 'No submissions yet'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {tab === 'pending' ? "You're all caught up." : 'Check back later.'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>
              {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            </Text>
            {submissions.map(s => (
              <TouchableOpacity
                key={s.id}
                onPress={() => router.push({ pathname: '/admin/review/[id]' as any, params: { id: s.id } })}
                activeOpacity={0.85}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                {/* Thumbnail */}
                <View style={[styles.thumb, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                  {imageUrls[s.id] ? (
                    <Image source={{ uri: imageUrls[s.id] }} style={styles.thumbImg} resizeMode="cover" />
                  ) : (
                    <Feather name="image" size={24} color={colors.mutedForeground} />
                  )}
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>
                    {s.proposedName}
                  </Text>
                  <Text style={[styles.cardBrand, { color: colors.mutedForeground }]}>{s.brand}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[s.status] + '18' }]}>
                      <Text style={[styles.statusLabel, { color: STATUS_COLOR[s.status] }]}>
                        {STATUS_LABEL[s.status]}
                      </Text>
                    </View>
                    <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                      {new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  {s.reviewerNotes && (
                    <View style={[styles.noteBox, { backgroundColor: colors.secondary, borderRadius: 6 }]}>
                      <Text style={[styles.noteText, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {s.reviewerNotes}
                      </Text>
                    </View>
                  )}
                </View>

                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  tabBar:      { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:         { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel:    { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  center:      { alignItems: 'center', paddingTop: 60, gap: 12 },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle:  { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub:    { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  errorText:   { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  countLabel:  { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  card:        { flexDirection: 'row', alignItems: 'flex-start', padding: 12, marginBottom: 12, borderWidth: 1, gap: 12 },
  thumb:       { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  thumbImg:    { width: 70, height: 70 },
  cardName:    { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 19 },
  cardBrand:   { fontSize: 12, fontFamily: 'Inter_400Regular' },
  cardDate:    { fontSize: 11, fontFamily: 'Inter_400Regular' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  noteBox:     { padding: 6 },
  noteText:    { fontSize: 11, fontFamily: 'Inter_400Regular' },
});
