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
import type { CommunityPost, PostReportSummary, ReportedComment, UserReport } from '@workspace/pin-repository';
import { countReportsByUser, userReportLabel } from '@/utils/blockedUsers';

// Theme-independent status colours for module-level lookup tables.
const statusPalette = palette.light;

const PAGE_SIZE = 30;

type Confirming =
  | { kind: 'remove' | 'dismiss'; id: string }
  | { kind: 'removeComment'; id: string }
  | { kind: 'dismissUserReport'; id: string };

/** Public names for the people in user reports, resolved once per load. */
type ProfileNames = Map<string, { username?: string; avatarUrl?: string }>;

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
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CommunityModerationScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo } = useMarketplace();

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

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const [rows, summaries, commentRows, userReportRows] = await Promise.all([
        repo.getCommunityFeed({ limit: PAGE_SIZE, offset: 0 }),
        repo.getPostReportSummaries(),
        repo.getReportedComments(),
        // A failure here must not hide the post and comment queues.
        repo.getUserReports().catch(() => [] as UserReport[]),
      ]);
      setPosts(rows);
      setReports(new Map(summaries.map(s => [s.postId, s])));
      setReportedComments(commentRows);
      setUserReports(userReportRows);
      const ids = [...new Set(userReportRows.flatMap(r => [r.reportedUserId, r.reporterId]))];
      const profiles = await Promise.all(ids.map(id => repo.getProfile(id).catch(() => null)));
      const names: ProfileNames = new Map();
      ids.forEach((id, i) => {
        const p = profiles[i];
        if (p) names.set(id, { username: p.username, avatarUrl: p.avatarUrl });
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
                    {userReports.map(report => {
                      const reported = reportNames.get(report.reportedUserId);
                      const reporter = reportNames.get(report.reporterId);
                      const reportedUsername = reported?.username;
                      const reportedName = reportedUsername ? `@${reportedUsername}` : 'Unknown collector';
                      const reporterName = reporter?.username ? `@${reporter.username}` : 'a collector';
                      const againstCount = reportsPerUser.get(report.reportedUserId) ?? 1;
                      const dismissing = dismissingUserReportId === report.id;
                      return (
                        <View
                          key={report.id}
                          style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
                        >
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
                          {report.target === 'message' && report.messageId ? (
                            <Text style={[styles.metaChipLabel, { color: colors.homeMuted }]} selectable>
                              Message ID {report.messageId}
                            </Text>
                          ) : null}
                          {confirming?.kind === 'dismissUserReport' && confirming.id === report.id ? (
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
});
