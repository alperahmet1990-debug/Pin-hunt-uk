/**
 * Admin Home — "Needs Attention" first, then tools grouped by who can use them.
 *
 * Access levels (migrations 039–041): App Creator > Admin > Contributor.
 *  - Admins moderate: community reports, pin submissions, contributed photos.
 *  - The App Creator also manages people/rollouts and owns every
 *    catalogue-editing tool (edit/add pins, images, import, validation,
 *    eBay and Vision tools). Plain admins never see those links; the
 *    layout, API server and database enforce the same rule.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useMyAccess } from '@/hooks/useMyAccess';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiBase';
import { radius, spacing } from '@/constants/theme';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

interface AttentionCounts {
  reportedContent: number;
  pendingSubmissions: number;
  /** Approved submissions with no catalogue pin yet — App Creator's queue. */
  toAdd: number;
}

interface LinkItem {
  icon: FeatherName;
  title: string;
  description: string;
  href: Href;
}

const MODERATION_LINKS: LinkItem[] = [
  { icon: 'flag',   title: 'Community',             description: 'Reported posts and comments.',                      href: '/admin/community-moderation' as Href },
  { icon: 'inbox',  title: 'Pin Submissions',       description: 'New pins collectors want added to the catalogue.',  href: '/admin/submissions' as Href },
  { icon: 'camera', title: 'Contributed Photos',    description: 'Photos collectors sent from Scan or the catalogue.', href: '/admin/contributed-images' as Href },
];

const CONTRIBUTE_LINKS: LinkItem[] = [
  { icon: 'grid',   title: 'Help Build the Catalogue', description: 'Every catalogue pin by photo status.', href: '/contribute' as Href },
];

// eBay image ingestion is no longer the catalogue image strategy, so its
// dry-run tool (/admin/ebay-image-dryrun) is intentionally not linked here.
const CREATOR_LINKS: LinkItem[] = [
  { icon: 'users',        title: 'Manage People',        description: 'Admin and contributor rights, feature rollouts.', href: '/admin/people' as Href },
  { icon: 'book-open',    title: 'Catalogue',            description: 'Search and edit catalogue records.',              href: '/admin/catalogue' as Href },
  { icon: 'image',        title: 'Missing Images',       description: 'Add front or back photos to catalogue pins.',     href: '/admin/image-backfill' as Href },
  { icon: 'upload-cloud', title: 'Catalogue Import',     description: 'Preview and run spreadsheet imports.',            href: '/admin/import' as Href },
  { icon: 'check-square', title: 'Catalogue Validation', description: 'eBay checks of catalogue details.',               href: '/admin/catalogue-validation' as Href },
  { icon: 'search',       title: 'Research Review',      description: 'Check and decide on researched pins (staging).', href: '/admin/research-review' as Href },
  { icon: 'eye',          title: 'Vision Test',          description: 'Try pin recognition on a photo.',                 href: '/admin/vision-test' as Href },
];

export default function AdminIndexScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo } = useMarketplace();
  const { session } = useAuth();
  const { isAppCreator } = useMyAccess();

  const [counts, setCounts]         = useState<AttentionCounts | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;
  const token = session?.access_token;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      // The photo queue lives behind the API server, which may be slow or
      // unreachable (e.g. a LAN API_BASE). Fetch it alongside, with a
      // timeout, so it never holds up the Supabase-backed counts.
      if (token) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        fetch(`${API_BASE}/admin/pending-pin-images`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        })
          .then(r => (r.ok ? r.json() : null))
          .then((d: { images?: unknown[] } | null) => setPendingPhotos(d?.images?.length ?? 0))
          .catch(() => setPendingPhotos(0))
          .finally(() => clearTimeout(timer));
      }
      const [reportedPosts, reportedComments, submissions] = await Promise.all([
        repo.getPostReportSummaries(),
        repo.getReportedComments(),
        repo.getAllPinSubmissions(),
      ]);
      setCounts({
        reportedContent: reportedPosts.length + reportedComments.length,
        pendingSubmissions: submissions.filter(
          s => s.status === 'submitted' || s.status === 'under_review',
        ).length,
        toAdd: submissions.filter(s => s.status === 'approved' && !s.approvedPinId).length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, token]);

  // Reload on focus so counts refresh after a moderation/review session.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  type AttentionItem = { icon: FeatherName; label: string; count: number; href: Href };
  const attention: AttentionItem[] = counts ? ([
    { icon: 'flag',   label: 'Reported content',   count: counts.reportedContent,    href: '/admin/community-moderation' as Href },
    { icon: 'inbox',  label: 'Pin submissions',    count: counts.pendingSubmissions, href: '/admin/submissions' as Href },
    { icon: 'camera', label: 'Contributed photos', count: pendingPhotos,             href: '/admin/contributed-images' as Href },
    ...(isAppCreator ? [{
      icon: 'plus-circle' as FeatherName,
      label: 'Approved pins to add',
      count: counts.toAdd,
      href: { pathname: '/admin/submissions', params: { tab: 'to_add' } } as unknown as Href,
    }] : []),
  ] as AttentionItem[]).filter(a => a.count > 0) : [];

  return (
    <>
      <Stack.Screen options={{ title: 'Admin' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.homeBackground }]}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: botPad, gap: spacing.xl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.homeCoral} />
        }
      >
        {/* Role */}
        <View style={styles.header}>
          <View style={[styles.roleBadge, { backgroundColor: isAppCreator ? colors.homeWarmSurface : colors.homeAqua }]}>
            <Feather name={isAppCreator ? 'star' : 'shield'} size={13} color={isAppCreator ? colors.homeSandInk : colors.homeCoralDeep} />
            <Text style={[styles.roleBadgeLabel, { color: isAppCreator ? colors.homeSandInk : colors.homeCoralDeep }]}>
              {isAppCreator ? 'App Creator' : 'Admin'}
            </Text>
          </View>
          <Text style={[styles.headerSub, { color: colors.homeMuted }]}>
            {isAppCreator
              ? 'You moderate, manage people, and own the catalogue.'
              : 'You review reports, pin submissions and contributed photos.'}
          </Text>
        </View>

        {/* Needs Attention */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.homeMuted }]}>NEEDS ATTENTION</Text>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.homeCoral} />
            </View>
          ) : error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
              <Feather name="alert-circle" size={14} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : attention.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
              <Feather name="check-circle" size={20} color={colors.owned} />
              <Text style={[styles.emptyText, { color: colors.homeInk }]}>
                Nothing needs your attention right now.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {attention.map(a => (
                <TouchableOpacity
                  key={a.label}
                  onPress={() => router.push(a.href)}
                  activeOpacity={0.85}
                  style={[styles.attentionRow, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, shadowColor: colors.homeShadow }]}
                >
                  <View style={[styles.attentionIcon, { backgroundColor: colors.homeWarmSurface }]}>
                    <Feather name={a.icon} size={17} color={colors.homeSandInk} />
                  </View>
                  <Text style={[styles.attentionLabel, { color: colors.homeInk }]}>{a.label}</Text>
                  <View style={[styles.countPill, { backgroundColor: colors.homeSand }]}>
                    <Text style={[styles.countPillLabel, { color: colors.homeHeroText }]}>{a.count > 99 ? '99+' : a.count}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.homeMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <LinkSection title="Moderation" items={MODERATION_LINKS} />
        <LinkSection title="Contribute" items={CONTRIBUTE_LINKS} />
        {isAppCreator && (
          <>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/admin/pin/[id]' as any, params: { id: 'new' } })}
              activeOpacity={0.85}
              style={[styles.primaryBtn, { backgroundColor: colors.homeCoral, shadowColor: colors.homeShadow }]}
            >
              <Feather name="plus" size={16} color={colors.homeHeroText} />
              <Text style={[styles.primaryBtnLabel, { color: colors.homeHeroText }]}>Add a Catalogue Pin</Text>
            </TouchableOpacity>
            <LinkSection title="App Creator" items={CREATOR_LINKS} />
          </>
        )}
      </ScrollView>
    </>
  );
}

function LinkSection({ title, items }: { title: string; items: LinkItem[] }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.homeMuted }]}>{title.toUpperCase()}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
        {items.map((item, i) => (
          <TouchableOpacity
            key={item.title}
            onPress={() => router.push(item.href)}
            activeOpacity={0.7}
            style={[styles.linkRow, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.homeLine }]}
          >
            <View style={[styles.linkIcon, { backgroundColor: colors.homeAqua }]}>
              <Feather name={item.icon} size={16} color={colors.homeCoralDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkTitle, { color: colors.homeInk }]}>{item.title}</Text>
              <Text style={[styles.linkDesc, { color: colors.homeMuted }]} numberOfLines={2}>{item.description}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.homeMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1 },
  center:         { alignItems: 'center', paddingVertical: spacing.xxl },
  header:         { gap: spacing.sm },
  roleBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  roleBadgeLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  headerSub:      { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  section:        { gap: spacing.sm },
  sectionTitle:   { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  sectionCard:    { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  errorBox:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderRadius: radius.md },
  errorText:      { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  emptyCard:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.lg, borderWidth: 1, borderRadius: radius.md },
  emptyText:      { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  attentionRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14, borderWidth: 1, borderRadius: radius.md, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  attentionIcon:  { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  attentionLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  countPill:      { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countPillLabel: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  linkRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 14, paddingVertical: 12 },
  linkIcon:       { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  linkTitle:      { fontSize: 15, fontFamily: 'Inter_500Medium' },
  linkDesc:       { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: 1 },
  primaryBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: 14, borderRadius: radius.lg, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  primaryBtnLabel:{ fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
