/**
 * Admin Submission Queue — lists all community pin submissions.
 * Filter tabs: Pending Review | Under Review | To Add | All
 *
 * "To Add" = approved by an admin but not yet in the catalogue — only the
 * App Creator can create the catalogue pin (migration 041), so these wait
 * here until they do.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import palette from '@/constants/colors';
import { radius } from '@/constants/theme';
import { useMarketplace } from '@/hooks/useMarketplace';
import { supabase } from '@/lib/supabase';
import type { PinSubmission, PinSubmissionStatus } from '@workspace/pin-repository';

// Theme-independent status colours for module-level lookup tables.
const statusPalette = palette.light;

type TabKey = 'pending' | 'under_review' | 'to_add' | 'all';

const TABS: { key: TabKey; label: string; statuses?: PinSubmissionStatus[]; uncataloguedOnly?: boolean }[] = [
  { key: 'pending',      label: 'Pending',      statuses: ['submitted'] },
  { key: 'under_review', label: 'Under Review',  statuses: ['under_review'] },
  { key: 'to_add',       label: 'To Add',        statuses: ['approved'], uncataloguedOnly: true },
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
  draft:         statusPalette.homeMuted,
  submitted:     statusPalette.forTrade,
  under_review:  statusPalette.homeSandInk,
  approved:      statusPalette.owned,
  rejected:      statusPalette.destructive,
  needs_changes: statusPalette.wanted,
};

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

export default function AdminSubmissionsScreen() {
  const colors     = useColors();
  const insets     = useSafeAreaInsets();
  const router     = useRouter();
  const { repo }   = useMarketplace();

  // Admin home deep-links straight to a tab (e.g. "Approved pins to add").
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab]               = useState<TabKey>(
    TABS.some(t => t.key === initialTab) ? (initialTab as TabKey) : 'pending',
  );
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
      const fetched = await repo.getAllPinSubmissions(
        currentTab.statuses ? { statuses: currentTab.statuses } : undefined,
      );
      const data = currentTab.uncataloguedOnly ? fetched.filter(s => !s.approvedPinId) : fetched;
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
  }, [repo, currentTab.statuses, currentTab.uncataloguedOnly]);

  useEffect(() => { load(); }, [load]);

  // Signed URLs expire after SIGNED_URL_TTL_SECONDS. Re-sign a thumbnail's
  // URL when its image fails to load (typically because the URL expired
  // while the screen stayed open), and proactively before expiry.
  const submissionsRef = useRef<PinSubmission[]>([]);
  useEffect(() => { submissionsRef.current = submissions; }, [submissions]);

  const lastErrorRefreshRef = useRef<Record<string, number>>({});

  const refreshImageUrl = useCallback(async (submissionId: string) => {
    // Throttle per submission so a genuinely broken image can't trigger an
    // endless re-sign loop (each new URL failing fires onError again).
    const now = Date.now();
    const last = lastErrorRefreshRef.current[submissionId] ?? 0;
    if (now - last < 30_000) return;
    lastErrorRefreshRef.current[submissionId] = now;

    const sub = submissionsRef.current.find(s => s.id === submissionId);
    if (!sub) return;
    const url = await getSignedUrl(sub.frontImagePath);
    setImageUrls(prev => {
      if (!url) {
        if (!(submissionId in prev)) return prev;
        const { [submissionId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [submissionId]: url };
    });
  }, []);

  // Proactively re-sign all thumbnail URLs before they expire so images
  // never go blank while the screen stays open for over an hour.
  useEffect(() => {
    const timer = setInterval(async () => {
      const subs = submissionsRef.current;
      if (subs.length === 0) return;
      const urls: Record<string, string> = {};
      await Promise.all(
        subs.map(async s => {
          const url = await getSignedUrl(s.frontImagePath);
          if (url) urls[s.id] = url;
        }),
      );
      setImageUrls(prev => ({ ...prev, ...urls }));
    }, SIGNED_URL_REFRESH_MS);
    return () => { clearInterval(timer); };
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: 'Submission Queue' }} />

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.homeBackground, borderBottomColor: colors.homeLine }]}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
              style={[styles.tab, active && { borderBottomColor: colors.homeCoral, borderBottomWidth: 2 }]}
            >
              <Text style={[styles.tabLabel, { color: active ? colors.homeCoral : colors.homeMuted }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
        ) : submissions.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="inbox" size={40} color={colors.homeMuted} />
            <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>
              {tab === 'pending' ? 'No pending submissions'
                : tab === 'under_review' ? 'Nothing under review'
                : tab === 'to_add' ? 'Nothing waiting to be added'
                : 'No submissions yet'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.homeMuted }]}>
              {tab === 'pending' || tab === 'to_add' ? "You're all caught up." : 'Check back later.'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.countLabel, { color: colors.homeMuted }]}>
              {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            </Text>
            {submissions.map(s => (
              <TouchableOpacity
                key={s.id}
                onPress={() => router.push({ pathname: '/admin/review/[id]' as any, params: { id: s.id } })}
                activeOpacity={0.85}
                style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
              >
                {/* Thumbnail */}
                <View style={[styles.thumb, { backgroundColor: colors.homeAqua, borderRadius: 8 }]}>
                  {imageUrls[s.id] ? (
                    <Image source={{ uri: imageUrls[s.id] }} style={styles.thumbImg} resizeMode="cover" onError={() => refreshImageUrl(s.id)} />
                  ) : (
                    <Feather name="image" size={24} color={colors.homeMuted} />
                  )}
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.cardName, { color: colors.homeInk }]} numberOfLines={2}>
                    {s.proposedName}
                  </Text>
                  <Text style={[styles.cardBrand, { color: colors.homeMuted }]}>{s.brand}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[s.status] + '18' }]}>
                      <Text style={[styles.statusLabel, { color: STATUS_COLOR[s.status] }]}>
                        {STATUS_LABEL[s.status]}
                      </Text>
                    </View>
                    <Text style={[styles.cardDate, { color: colors.homeMuted }]}>
                      {new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  {s.reviewerNotes && (
                    <View style={[styles.noteBox, { backgroundColor: colors.homeAqua, borderRadius: 6 }]}>
                      <Text style={[styles.noteText, { color: colors.homeMuted }]} numberOfLines={1}>
                        {s.reviewerNotes}
                      </Text>
                    </View>
                  )}
                </View>

                <Feather name="chevron-right" size={18} color={colors.homeMuted} />
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
