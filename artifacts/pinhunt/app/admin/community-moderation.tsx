/**
 * Community Moderation — admin queue of recent community posts.
 * Lists newest posts first with author, snippet, and type; admins can
 * remove a post inline or tap through to the full post detail screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import palette from '@/constants/colors';
import { useMarketplace } from '@/hooks/useMarketplace';
import { Avatar } from '@/components/Avatar';
import type { CommunityPost, PostReportSummary, ReportedComment, UserReport, UserSuspension } from '@workspace/pin-repository';
import { SUSPENSION_REASON_MAX } from '@workspace/pin-repository';
import { useMyAccess } from '@/hooks/useMyAccess';
import {
  countReportsByUser,
  isUnderAgeReport,
  UNDER_18_CLOSURE_REASON,
  underAgeReportsFirst,
  userReportLabel,
} from '@/utils/blockedUsers';
import { formatDate } from '@/utils/format';

// Theme-independent status colours for module-level lookup tables.
const statusPalette = palette.light;

const PAGE_SIZE = 30;

type Confirming =
  | { kind: 'remove' | 'dismiss'; id: string }
  | { kind: 'removeComment'; id: string }
  | { kind: 'dismissUserReport'; id: string }
  // Account suspensions (#503): from a report card, or the suspended list.
  | { kind: 'suspend'; id: string; userId: string }
  | { kind: 'lift'; id: string }
  // "May be under 18" (LP-9, #531): suspend and mark under 18, or undo both.
  | { kind: 'closeUnder18'; id: string; userId: string }
  | { kind: 'undoUnder18'; id: string };

/** Public names for the people in user reports, resolved once per load. */
type ProfileNames = Map<string, { username?: string; avatarUrl?: string; isAdmin?: boolean }>;

const TYPE_LABEL: Record<string, string> = {
  in_search_of: 'In Search Of',
  for_trade:    'For Trade',
  for_sale:     'For Sale',
  new_pickup:   'New Pickup',
  discussion:   'Discussion',
};

const TYPE_COLOR: Record<string, string> = {
  in_search_of: statusPalette.homeSandInk,
  for_trade:    statusPalette.forTrade,
  for_sale:     statusPalette.owned,
  new_pickup:   statusPalette.homeCoral,
  discussion:   statusPalette.homeMuted,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return formatDate(iso, 'medium');
}

export default function CommunityModerationScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId: myId } = useMarketplace();
  const { isAppCreator } = useMyAccess();

  const [posts,      setPosts]      = useState<CommunityPost[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,    setHasMore]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reports,    setReports]    = useState<Map<string, PostReportSummary>>(new Map());
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [reportedOnly, setReportedOnly] = useState(false);
  const [reportedComments, setReportedComments] = useState<ReportedComment[]>([]);
  const [removingCommentId, setRemovingCommentId] = useState<string | null>(null);
  // User and message reports (B-P0-05b, #17).
  const [userReports, setUserReports] = useState<UserReport[]>([]);
  const [reportNames, setReportNames] = useState<ProfileNames>(new Map());
  const [dismissingUserReportId, setDismissingUserReportId] = useState<string | null>(null);
  // Account suspensions (#503).
  const [suspensions, setSuspensions] = useState<UserSuspension[]>([]);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspensionBusy, setSuspensionBusy] = useState<string | null>(null);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const [rows, summaries, commentRows, userReportRows, suspensionRows] = await Promise.all([
        repo.getCommunityFeed({ limit: PAGE_SIZE, offset: 0 }),
        repo.getPostReportSummaries(),
        repo.getReportedComments(),
        // A failure here must not hide the post and comment queues.
        repo.getUserReports().catch(() => [] as UserReport[]),
        repo.getSuspensions().catch(() => [] as UserSuspension[]),
      ]);
      setPosts(rows);
      setReports(new Map(summaries.map(s => [s.postId, s])));
      setReportedComments(commentRows);
      setUserReports(userReportRows);
      setSuspensions(suspensionRows);
      const ids = [...new Set([
        ...userReportRows.flatMap(r => [r.reportedUserId, r.reporterId]),
        ...suspensionRows.map(x => x.userId),
      ])];
      const profiles = await Promise.all(ids.map(id => repo.getProfile(id).catch(() => null)));
      const names: ProfileNames = new Map();
      ids.forEach((id, i) => {
        const p = profiles[i];
        if (p) names.set(id, { username: p.username, avatarUrl: p.avatarUrl, isAdmin: p.isAdmin });
      });
      setReportNames(names);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load posts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo]);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (!repo || loadingMore || loading || refreshing || !hasMore) return;
    try {
      setLoadingMore(true);
      const rows = await repo.getCommunityFeed({ limit: PAGE_SIZE, offset: posts.length });
      setPosts(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...rows.filter(r => !seen.has(r.id))];
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      // Silent — the user can pull to refresh.
    } finally {
      setLoadingMore(false);
    }
  }, [repo, loadingMore, loading, refreshing, hasMore, posts.length]);

  // Destructive actions confirm in-app (InlineConfirm) rather than via
  // Alert — native alert callbacks don't reliably fire on Expo web.
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRemove = useCallback(async (post: CommunityPost) => {
    if (!repo) return;
    try {
      setRemovingId(post.id);
      setActionError(null);
      await repo.deleteCommunityPost(post.id);
      setPosts(prev => prev.filter(p => p.id !== post.id));
      setConfirming(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not remove post.');
    } finally {
      setRemovingId(null);
    }
  }, [repo]);

  const handleDismiss = useCallback(async (post: CommunityPost) => {
    if (!repo) return;
    try {
      setDismissingId(post.id);
      setActionError(null);
      await repo.dismissPostReports(post.id);
      setReports(prev => {
        const next = new Map(prev);
        next.delete(post.id);
        return next;
      });
      setConfirming(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not dismiss the report.');
    } finally {
      setDismissingId(null);
    }
  }, [repo]);

  const handleRemoveComment = useCallback(async (rc: ReportedComment) => {
    if (!repo) return;
    try {
      setRemovingCommentId(rc.comment.id);
      setActionError(null);
      await repo.deletePostComment(rc.comment.id);
      setReportedComments(prev => prev.filter(c => c.comment.id !== rc.comment.id));
      setConfirming(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not remove comment.');
    } finally {
      setRemovingCommentId(null);
    }
  }, [repo]);

  const handleDismissUserReport = useCallback(async (report: UserReport) => {
    if (!repo) return;
    try {
      setDismissingUserReportId(report.id);
      setActionError(null);
      await repo.dismissUserReport(report.id);
      setUserReports(prev => prev.filter(r => r.id !== report.id));
      setConfirming(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not dismiss the report.');
    } finally {
      setDismissingUserReportId(null);
    }
  }, [repo]);

  const reportsPerUser = React.useMemo(() => countReportsByUser(userReports), [userReports]);
  // "May be under 18" reports first (LP-9, #531).
  const orderedUserReports = React.useMemo(() => underAgeReportsFirst(userReports), [userReports]);

  // ── Account suspensions (#503) ───────────────────────────────────────────────
  const suspendedIds = React.useMemo(() => new Set(suspensions.map(x => x.userId)), [suspensions]);

  /** Why this admin can't suspend an account, or null when they can (rules from migration 050). */
  const cannotSuspend = useCallback((userId: string): string | null => {
    if (userId === myId) return 'You can\u2019t suspend your own account.';
    if (reportNames.get(userId)?.isAdmin && !isAppCreator) return 'Only the App Creator can suspend an admin.';
    return null;
  }, [myId, reportNames, isAppCreator]);

  const canLift = useCallback((userId: string) => userId !== myId || isAppCreator, [myId, isAppCreator]);

  const handleSuspend = useCallback(async (userId: string) => {
    if (!repo || !myId) return;
    try {
      setSuspensionBusy(userId);
      setActionError(null);
      const reason = suspendReason.trim() || undefined;
      await repo.suspendUser(myId, userId, reason);
      setSuspensions(prev => prev.some(x => x.userId === userId)
        ? prev
        : [{ userId, suspendedBy: myId, reason, createdAt: new Date().toISOString() }, ...prev]);
      setSuspendReason('');
      setConfirming(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not suspend the account.');
    } finally {
      setSuspensionBusy(null);
    }
  }, [repo, myId, suspendReason]);

  const handleLift = useCallback(async (userId: string) => {
    if (!repo) return;
    try {
      setSuspensionBusy(userId);
      setActionError(null);
      await repo.liftSuspension(userId);
      setSuspensions(prev => prev.filter(x => x.userId !== userId));
      setConfirming(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not lift the suspension.');
    } finally {
      setSuspensionBusy(null);
    }
  }, [repo]);

  // ── Close as under 18 (LP-9, #531) ───────────────────────────────────────────
  // The existing suspension, with a fixed reason, plus the admin-only decline
  // (migration 072): the collector sees "PinHunt is for adults" next launch.
  const closedUnder18Ids = React.useMemo(
    () => new Set(suspensions.filter(x => x.reason === UNDER_18_CLOSURE_REASON).map(x => x.userId)),
    [suspensions],
  );

  const handleCloseUnder18 = useCallback(async (userId: string) => {
    if (!repo || !myId) return;
    try {
      setSuspensionBusy(userId);
      setActionError(null);
      if (!suspendedIds.has(userId)) await repo.suspendUser(myId, userId, UNDER_18_CLOSURE_REASON);
      await repo.setAgeDeclined(userId, true);
      setSuspensions(prev => [
        { userId, suspendedBy: myId, reason: UNDER_18_CLOSURE_REASON, createdAt: new Date().toISOString() },
        ...prev.filter(x => x.userId !== userId),
      ]);
      setConfirming(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not close the account.');
    } finally {
      setSuspensionBusy(null);
    }
  }, [repo, myId, suspendedIds]);

  const handleUndoUnder18 = useCallback(async (userId: string) => {
    if (!repo) return;
    try {
      setSuspensionBusy(userId);
      setActionError(null);
      await repo.setAgeDeclined(userId, false);
      await repo.liftSuspension(userId);
      setSuspensions(prev => prev.filter(x => x.userId !== userId));
      setConfirming(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not restore the account.');
    } finally {
      setSuspensionBusy(null);
    }
  }, [repo]);

  const nameOf = useCallback((userId: string) => {
    const u = reportNames.get(userId)?.username;
    return u ? `@${u}` : 'this collector';
  }, [reportNames]);

  // Reported posts first (most recently reported at top), then newest posts.
  const displayPosts = React.useMemo(() => {
    const reported = posts.filter(p => reports.has(p.id));
    reported.sort((a, b) =>
      (reports.get(b.id)!.latestReportAt).localeCompare(reports.get(a.id)!.latestReportAt),
    );
    if (reportedOnly) return reported;
    const rest = posts.filter(p => !reports.has(p.id));
    return [...reported, ...rest];
  }, [posts, reports, reportedOnly]);

  const reportedCount = React.useMemo(
    () => posts.reduce((n, p) => n + (reports.has(p.id) ? 1 : 0), 0),
    [posts, reports],
  );

  const renderItem = useCallback(({ item }: { item: CommunityPost }) => {
    const typeColor  = TYPE_COLOR[item.postType] ?? colors.homeMuted;
    const authorName = item.authorProfile?.username ?? '…';
    const removing   = removingId === item.id;
    const dismissing = dismissingId === item.id;
    const report     = reports.get(item.id);
    const confirmingThis = confirming && (confirming.kind === 'remove' || confirming.kind === 'dismiss') && confirming.id === item.id ? confirming : null;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/community/post/[id]' as any, params: { id: item.id } })}
        style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
      >
        {report && (
          <View style={[styles.reportedBanner, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
            <Feather name="flag" size={12} color={colors.destructive} />
            <Text style={[styles.reportedBannerText, { color: colors.destructive }]} numberOfLines={1}>
              Reported {report.reportCount > 1 ? `${report.reportCount}× ` : ''}
              {report.reasons.length > 0 ? `· ${report.reasons.join(', ')}` : ''}
            </Text>
          </View>
        )}
        <View style={styles.cardTop}>
          <Avatar uri={item.authorProfile?.avatarUrl} name={authorName} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.author, { color: colors.homeInk }]} numberOfLines={1}>@{authorName}</Text>
            <Text style={[styles.time, { color: colors.homeMuted }]}>{timeAgo(item.createdAt)}</Text>
          </View>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '18', borderColor: typeColor + '44' }]}>
            <Text style={[styles.typeBadgeLabel, { color: typeColor }]}>{TYPE_LABEL[item.postType] ?? item.postType}</Text>
          </View>
        </View>

        <Text style={[styles.snippet, { color: colors.homeInk }]} numberOfLines={3}>
          {item.body}
        </Text>

        {confirmingThis ? (
          <InlineConfirm
            message={confirmingThis.kind === 'remove'
              ? 'Permanently remove this post from the community feed?'
              : 'Clear all reports on this post? It stays in the feed.'}
            confirmLabel={confirmingThis.kind === 'remove' ? 'Remove' : 'Dismiss'}
            destructive={confirmingThis.kind === 'remove'}
            busy={removing || dismissing}
            error={actionError}
            onCancel={() => { setConfirming(null); setActionError(null); }}
            onConfirm={() => (confirmingThis.kind === 'remove' ? handleRemove(item) : handleDismiss(item))}
          />
        ) : (
          <View style={styles.cardBottom}>
            {item.photos.length > 0 && (
              <View style={styles.metaChip}>
                <Feather name="image" size={12} color={colors.homeMuted} />
                <Text style={[styles.metaChipLabel, { color: colors.homeMuted }]}>
                  {item.photos.length} photo{item.photos.length !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {report && (
              <TouchableOpacity
                onPress={() => setConfirming({ kind: 'dismiss', id: item.id })}
                disabled={dismissing}
                activeOpacity={0.85}
                style={[styles.removeBtn, { backgroundColor: colors.homeMuted + '12', borderColor: colors.homeLine }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                {dismissing ? (
                  <ActivityIndicator size="small" color={colors.homeMuted} />
                ) : (
                  <>
                    <Feather name="check" size={13} color={colors.homeMuted} />
                    <Text style={[styles.removeBtnLabel, { color: colors.homeMuted }]}>Dismiss</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setConfirming({ kind: 'remove', id: item.id })}
              disabled={removing}
              activeOpacity={0.85}
              style={[styles.removeBtn, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              {removing ? (
                <ActivityIndicator size="small" color={colors.destructive} />
              ) : (
                <>
                  <Feather name="trash-2" size={13} color={colors.destructive} />
                  <Text style={[styles.removeBtnLabel, { color: colors.destructive }]}>Remove</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [colors, removingId, dismissingId, router, handleRemove, handleDismiss, reports, confirming, actionError]);

  return (
    <>
      <Stack.Screen options={{ title: 'Community Moderation' }} />
      <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
              <Feather name="alert-circle" size={14} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
            <TouchableOpacity onPress={() => load()} style={[styles.retryBtn, { borderColor: colors.homeLine }]}>
              <Text style={[styles.retryLabel, { color: colors.homeCoral }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={displayPosts}
            ListHeaderComponent={
              <View style={{ gap: 12 }}>
                {suspensions.length > 0 && (
                  <View style={{ gap: 8 }} testID="admin-suspensions">
                    <Text style={[styles.sectionHeading, { color: colors.homeMuted }]}>
                      SUSPENDED ACCOUNTS ({suspensions.length})
                    </Text>
                    {suspensions.map(sus => {
                      const who = reportNames.get(sus.userId);
                      const name = nameOf(sus.userId);
                      const lifting = confirming?.kind === 'lift' && confirming.id === `list:${sus.userId}`;
                      return (
                        <View key={sus.userId} style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                          <View style={styles.cardTop}>
                            <Avatar uri={who?.avatarUrl} name={who?.username ?? '?'} size={32} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.author, { color: colors.homeInk }]} numberOfLines={1}>{name}</Text>
                              <Text style={[styles.time, { color: colors.homeMuted }]} numberOfLines={1}>
                                Suspended {timeAgo(sus.createdAt)}{sus.suspendedBy ? ` by ${nameOf(sus.suspendedBy)}` : ''}
                              </Text>
                            </View>
                            {!lifting && canLift(sus.userId) && (
                              <TouchableOpacity
                                onPress={() => { setActionError(null); setConfirming({ kind: 'lift', id: `list:${sus.userId}` }); }}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={`Lift suspension for ${name}`}
                                style={[styles.removeBtn, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Feather name="unlock" size={13} color={colors.homeCoralDeep} />
                                <Text style={[styles.removeBtnLabel, { color: colors.homeCoralDeep }]}>Lift</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          {sus.reason ? (
                            <Text style={[styles.metaChipLabel, { color: colors.homeMuted }]}>Reason: {sus.reason}</Text>
                          ) : null}
                          {lifting && (
                            <InlineConfirm
                              message={`Lift the suspension for ${name}? They can post, comment, message and trade again.`}
                              confirmLabel="Lift"
                              busy={suspensionBusy === sus.userId}
                              error={actionError}
                              onCancel={() => { setConfirming(null); setActionError(null); }}
                              onConfirm={() => handleLift(sus.userId)}
                            />
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
                {(reportedCount > 0 || reportedOnly) && (
                  <TouchableOpacity
                    onPress={() => setReportedOnly(v => !v)}
                    activeOpacity={0.85}
                    style={[
                      styles.filterChip,
                      reportedOnly
                        ? { backgroundColor: colors.destructive, borderColor: colors.destructive }
                        : { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' },
                    ]}
                  >
                    <Feather name="flag" size={13} color={reportedOnly ? '#fff' : colors.destructive} />
                    <Text style={[styles.filterChipLabel, { color: reportedOnly ? '#fff' : colors.destructive }]}>
                      Reported ({reportedCount})
                    </Text>
                  </TouchableOpacity>
                )}

                {userReports.length > 0 && (
                  <View style={{ gap: 8 }} testID="admin-user-reports">
                    <Text style={[styles.sectionHeading, { color: colors.homeMuted }]}>
                      REPORTED USERS AND MESSAGES ({userReports.length})
                    </Text>
                    {orderedUserReports.map(report => {
                      const reported = reportNames.get(report.reportedUserId);
                      const reporter = reportNames.get(report.reporterId);
                      const reportedUsername = reported?.username;
                      const reportedName = reportedUsername ? `@${reportedUsername}` : 'Unknown collector';
                      const reporterName = reporter?.username ? `@${reporter.username}` : 'a collector';
                      const againstCount = reportsPerUser.get(report.reportedUserId) ?? 1;
                      const dismissing = dismissingUserReportId === report.id;
                      const underAge = isUnderAgeReport(report);
                      const closedUnder18 = closedUnder18Ids.has(report.reportedUserId);
                      return (
                        <View
                          key={report.id}
                          style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                        >
                          {underAge ? (
                            <View
                              style={[styles.underAgeLabel, { backgroundColor: colors.destructive }]}
                              accessibilityLabel="Report: may be under 18"
                            >
                              <Feather name="alert-triangle" size={12} color={colors.homeHeroText} />
                              <Text style={[styles.underAgeLabelText, { color: colors.homeHeroText }]}>MAY BE UNDER 18</Text>
                            </View>
                          ) : null}
                          <View style={[styles.reportedBanner, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
                            <Feather name={report.target === 'message' ? 'message-square' : 'user-x'} size={12} color={colors.destructive} />
                            <Text style={[styles.reportedBannerText, { color: colors.destructive }]} numberOfLines={2}>
                              {userReportLabel(report)}{report.reason ? ` · ${report.reason}` : ''}
                            </Text>
                          </View>
                          <View style={styles.cardTop}>
                            <Avatar uri={reported?.avatarUrl} name={reportedUsername ?? '?'} size={32} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.author, { color: colors.homeInk }]} numberOfLines={1}>{reportedName}</Text>
                              <Text style={[styles.time, { color: colors.homeMuted }]} numberOfLines={1}>
                                Reported by {reporterName} · {timeAgo(report.createdAt)}
                              </Text>
                            </View>
                          </View>
                          {againstCount > 1 && (
                            <Text style={[styles.metaChipLabel, { color: colors.homeMuted }]}>
                              {againstCount} open reports against {reportedName}
                            </Text>
                          )}
                          {!suspendedIds.has(report.reportedUserId) && cannotSuspend(report.reportedUserId) ? (
                            <Text style={[styles.metaChipLabel, { color: colors.homeMuted }]}>{cannotSuspend(report.reportedUserId)}</Text>
                          ) : null}
                          {report.target === 'message' && report.messageId ? (
                            <Text style={[styles.metaChipLabel, { color: colors.homeMuted }]} selectable>
                              Message ID {report.messageId}
                            </Text>
                          ) : null}
                          {confirming?.kind === 'closeUnder18' && confirming.id === report.id ? (
                            <InlineConfirm
                              message={`Close ${reportedName} as under 18? The account is suspended, and next time they open PinHunt they see \u201cPinHunt is for adults\u201d with only Delete account and Sign out.`}
                              confirmLabel="Close account"
                              destructive
                              busy={suspensionBusy === report.reportedUserId}
                              error={actionError}
                              onCancel={() => { setConfirming(null); setActionError(null); }}
                              onConfirm={() => handleCloseUnder18(report.reportedUserId)}
                            />
                          ) : confirming?.kind === 'undoUnder18' && confirming.id === report.reportedUserId && closedUnder18 ? (
                            <InlineConfirm
                              message={`Undo closing ${reportedName}? The suspension is lifted and they can use PinHunt again.`}
                              confirmLabel="Undo"
                              busy={suspensionBusy === report.reportedUserId}
                              error={actionError}
                              onCancel={() => { setConfirming(null); setActionError(null); }}
                              onConfirm={() => handleUndoUnder18(report.reportedUserId)}
                            />
                          ) : confirming?.kind === 'suspend' && confirming.id === report.id ? (
                            <View style={{ gap: 8 }}>
                              <TextInput
                                value={suspendReason}
                                onChangeText={t => setSuspendReason(t.slice(0, SUSPENSION_REASON_MAX))}
                                placeholder="Reason (optional, for admins only)"
                                placeholderTextColor={colors.homeMuted}
                                multiline
                                maxLength={SUSPENSION_REASON_MAX}
                                accessibilityLabel="Suspension reason"
                                style={[styles.reasonInput, { color: colors.homeInk, borderColor: colors.homeLine, backgroundColor: colors.homeBackground }]}
                              />
                              <Text style={[styles.reasonCount, { color: colors.homeMuted }]}>
                                {suspendReason.length}/{SUSPENSION_REASON_MAX}
                              </Text>
                              <InlineConfirm
                                message={`Suspend ${reportedName}? They won\u2019t be able to post, comment, message or start a trade until the suspension is lifted.`}
                                confirmLabel="Suspend"
                                destructive
                                busy={suspensionBusy === report.reportedUserId}
                                error={actionError}
                                onCancel={() => { setConfirming(null); setActionError(null); setSuspendReason(''); }}
                                onConfirm={() => handleSuspend(report.reportedUserId)}
                              />
                            </View>
                          ) : confirming?.kind === 'lift' && confirming.id === report.reportedUserId && suspendedIds.has(report.reportedUserId) ? (
                            <InlineConfirm
                              message={`Lift the suspension for ${reportedName}? They can post, comment, message and trade again.`}
                              confirmLabel="Lift"
                              busy={suspensionBusy === report.reportedUserId}
                              error={actionError}
                              onCancel={() => { setConfirming(null); setActionError(null); }}
                              onConfirm={() => handleLift(report.reportedUserId)}
                            />
                          ) : confirming?.kind === 'dismissUserReport' && confirming.id === report.id ? (
                            <InlineConfirm
                              message="Dismiss this report? Nothing else changes."
                              confirmLabel="Dismiss"
                              busy={dismissing}
                              error={actionError}
                              onCancel={() => { setConfirming(null); setActionError(null); }}
                              onConfirm={() => handleDismissUserReport(report)}
                            />
                          ) : (
                            <View style={styles.cardBottom}>
                              {reportedUsername ? (
                                <TouchableOpacity
                                  onPress={() => router.push({ pathname: '/collector/[username]', params: { username: reportedUsername } })}
                                  accessibilityRole="link"
                                  accessibilityLabel={`View ${reportedName}'s profile`}
                                  hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                                  style={styles.metaChip}
                                >
                                  <Feather name="user" size={12} color={colors.homeCoralDeep} />
                                  <Text style={[styles.metaChipLabel, { color: colors.homeCoralDeep }]}>View profile</Text>
                                </TouchableOpacity>
                              ) : null}
                              <View style={{ flex: 1 }} />
                              {closedUnder18 ? (
                                <>
                                  <View style={[styles.suspendedChip, { backgroundColor: colors.destructive + '12' }]}>
                                    <Text style={[styles.removeBtnLabel, { color: colors.destructive }]}>Closed as under 18</Text>
                                  </View>
                                  {canLift(report.reportedUserId) && (
                                    <TouchableOpacity
                                      onPress={() => { setActionError(null); setConfirming({ kind: 'undoUnder18', id: report.reportedUserId }); }}
                                      activeOpacity={0.85}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Undo closing ${reportedName}`}
                                      style={[styles.removeBtn, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}
                                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                      <Feather name="rotate-ccw" size={13} color={colors.homeCoralDeep} />
                                      <Text style={[styles.removeBtnLabel, { color: colors.homeCoralDeep }]}>Undo</Text>
                                    </TouchableOpacity>
                                  )}
                                </>
                              ) : underAge && !cannotSuspend(report.reportedUserId) ? (
                                <TouchableOpacity
                                  onPress={() => { setActionError(null); setConfirming({ kind: 'closeUnder18', id: report.id, userId: report.reportedUserId }); }}
                                  activeOpacity={0.85}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Close ${reportedName} as under 18`}
                                  style={[styles.removeBtn, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <Feather name="lock" size={13} color={colors.destructive} />
                                  <Text style={[styles.removeBtnLabel, { color: colors.destructive }]}>Close as under 18</Text>
                                </TouchableOpacity>
                              ) : suspendedIds.has(report.reportedUserId) ? (
                                <>
                                  <View style={[styles.suspendedChip, { backgroundColor: colors.destructive + '12' }]}>
                                    <Text style={[styles.removeBtnLabel, { color: colors.destructive }]}>Suspended</Text>
                                  </View>
                                  {canLift(report.reportedUserId) && (
                                    <TouchableOpacity
                                      onPress={() => { setActionError(null); setConfirming({ kind: 'lift', id: report.reportedUserId }); }}
                                      activeOpacity={0.85}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Lift suspension for ${reportedName}`}
                                      style={[styles.removeBtn, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}
                                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                      <Feather name="unlock" size={13} color={colors.homeCoralDeep} />
                                      <Text style={[styles.removeBtnLabel, { color: colors.homeCoralDeep }]}>Lift</Text>
                                    </TouchableOpacity>
                                  )}
                                </>
                              ) : cannotSuspend(report.reportedUserId) ? null : (
                                <TouchableOpacity
                                  onPress={() => { setActionError(null); setSuspendReason(''); setConfirming({ kind: 'suspend', id: report.id, userId: report.reportedUserId }); }}
                                  activeOpacity={0.85}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Suspend ${reportedName}`}
                                  style={[styles.removeBtn, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <Feather name="slash" size={13} color={colors.destructive} />
                                  <Text style={[styles.removeBtnLabel, { color: colors.destructive }]}>Suspend</Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                onPress={() => setConfirming({ kind: 'dismissUserReport', id: report.id })}
                                disabled={dismissing}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                                accessibilityLabel={`Dismiss report about ${reportedName}`}
                                style={[styles.removeBtn, { backgroundColor: colors.homeMuted + '12', borderColor: colors.homeLine }]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Feather name="check" size={13} color={colors.homeMuted} />
                                <Text style={[styles.removeBtnLabel, { color: colors.homeMuted }]}>Dismiss</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {reportedComments.length === 0 && (
                      <Text style={[styles.sectionHeading, { color: colors.homeMuted, marginTop: 4 }]}>
                        POSTS
                      </Text>
                    )}
                  </View>
                )}

                {reportedComments.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Text style={[styles.sectionHeading, { color: colors.homeMuted }]}>
                      REPORTED COMMENTS ({reportedComments.length})
                    </Text>
                    {reportedComments.map(rc => {
                      const removing = removingCommentId === rc.comment.id;
                      const name = rc.comment.authorProfile?.username ?? '…';
                      return (
                        <TouchableOpacity
                          key={rc.comment.id}
                          activeOpacity={0.85}
                          onPress={() => router.push({ pathname: '/community/post/[id]' as any, params: { id: rc.comment.postId } })}
                          style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                        >
                          <View style={[styles.reportedBanner, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
                            <Feather name="flag" size={12} color={colors.destructive} />
                            <Text style={[styles.reportedBannerText, { color: colors.destructive }]} numberOfLines={1}>
                              Comment reported {rc.reportCount > 1 ? `${rc.reportCount}× ` : ''}
                              {rc.reasons.length > 0 ? `· ${rc.reasons.join(', ')}` : ''}
                            </Text>
                          </View>
                          <View style={styles.cardTop}>
                            <Avatar uri={rc.comment.authorProfile?.avatarUrl} name={name} size={32} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.author, { color: colors.homeInk }]} numberOfLines={1}>@{name}</Text>
                              <Text style={[styles.time, { color: colors.homeMuted }]}>{timeAgo(rc.comment.createdAt)}</Text>
                            </View>
                          </View>
                          <Text style={[styles.snippet, { color: colors.homeInk }]} numberOfLines={3}>
                            {rc.comment.body}
                          </Text>
                          {confirming?.kind === 'removeComment' && confirming.id === rc.comment.id ? (
                            <InlineConfirm
                              message="Permanently remove this comment from the post?"
                              confirmLabel="Remove"
                              destructive
                              busy={removing}
                              error={actionError}
                              onCancel={() => { setConfirming(null); setActionError(null); }}
                              onConfirm={() => handleRemoveComment(rc)}
                            />
                          ) : (
                            <View style={styles.cardBottom}>
                              <View style={styles.metaChip}>
                                <Feather name="message-circle" size={12} color={colors.homeMuted} />
                                <Text style={[styles.metaChipLabel, { color: colors.homeMuted }]}>View post</Text>
                              </View>
                              <View style={{ flex: 1 }} />
                              <TouchableOpacity
                                onPress={() => setConfirming({ kind: 'removeComment', id: rc.comment.id })}
                                disabled={removing}
                                activeOpacity={0.85}
                                style={[styles.removeBtn, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                {removing ? (
                                  <ActivityIndicator size="small" color={colors.destructive} />
                                ) : (
                                  <>
                                    <Feather name="trash-2" size={13} color={colors.destructive} />
                                    <Text style={[styles.removeBtnLabel, { color: colors.destructive }]}>Remove</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    <Text style={[styles.sectionHeading, { color: colors.homeMuted, marginTop: 4 }]}>
                      POSTS
                    </Text>
                  </View>
                )}
              </View>
            }
            keyExtractor={p => p.id}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: botPad, gap: 12 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.homeCoral} />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <View style={styles.center}>
                <Feather name="check-circle" size={28} color={colors.homeMuted} />
                <Text style={[styles.emptyText, { color: colors.homeMuted }]}>
                  {reportedOnly ? 'No reported posts. All clear!' : 'No community posts yet.'}
                </Text>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator color={colors.homeCoral} />
                </View>
              ) : null
            }
          />
        )}
      </View>
    </>
  );
}

function InlineConfirm({
  message, confirmLabel, destructive, busy, error, onCancel, onConfirm,
}: {
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const colors = useColors();
  const tone = destructive ? colors.destructive : colors.homeCoral;
  return (
    <View style={[styles.confirmBar, { backgroundColor: colors.homeAqua }]}>
      <Text style={[styles.confirmText, { color: colors.homeInk }]}>{message}</Text>
      {error && <Text style={[styles.confirmError, { color: colors.destructive }]}>{error}</Text>}
      <View style={styles.confirmButtons}>
        <TouchableOpacity onPress={onCancel} disabled={busy} style={styles.confirmBtn}>
          <Text style={[styles.confirmBtnLabel, { color: colors.homeMuted }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onConfirm} disabled={busy} style={[styles.confirmBtn, { backgroundColor: tone }]}>
          {busy
            ? <ActivityIndicator size="small" color={colors.homeHeroText} />
            : <Text style={[styles.confirmBtnLabel, { color: colors.homeHeroText }]}>{confirmLabel}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  confirmBar:    { borderRadius: 12, padding: 12, gap: 8 },
  confirmText:   { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  confirmError:  { fontSize: 12, fontFamily: 'Inter_400Regular' },
  confirmButtons:{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  confirmBtn:    { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, minWidth: 84, alignItems: 'center' },
  confirmBtnLabel:{ fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  root:          { flex: 1 },
  center:        { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorBox:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderRadius: 12 },
  errorText:     { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  retryBtn:      { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderRadius: 8 },
  retryLabel:    { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyText:     { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  card:          { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  reportedBanner:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 8 },
  reportedBannerText: { flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  sectionHeading:{ fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  filterChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderRadius: 20 },
  filterChipLabel:{ fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cardTop:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author:        { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  time:          { fontSize: 11, fontFamily: 'Inter_400Regular' },
  typeBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  typeBadgeLabel:{ fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  snippet:       { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  cardBottom:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaChip:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChipLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  removeBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: 8, minWidth: 84, justifyContent: 'center' },
  removeBtnLabel:{ fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  suspendedChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  underAgeLabel: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  underAgeLabelText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  reasonInput:   { borderWidth: 1, borderRadius: 10, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  reasonCount:   { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: -4 },
});
