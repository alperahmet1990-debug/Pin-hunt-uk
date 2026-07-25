/**
 * Community Moderation — admin queue of recent community posts.
 * Lists newest posts first with author, snippet, and type; admins can
 * remove a post inline or tap through to the full post detail screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useMarketplace } from '@/hooks/useMarketplace';
import { Avatar } from '@/components/Avatar';
import type { CommunityPost, PostReportSummary, ReportedComment } from '@workspace/pin-repository';

const PAGE_SIZE = 30;

const TYPE_LABEL: Record<string, string> = {
  in_search_of: 'In Search Of',
  for_trade:    'For Trade',
  for_sale:     'For Sale',
  new_pickup:   'New Pickup',
  discussion:   'Discussion',
};

const TYPE_COLOR: Record<string, string> = {
  in_search_of: '#F59E0B',
  for_trade:    '#3B82F6',
  for_sale:     '#16A34A',
  new_pickup:   '#8B5CF6',
  discussion:   '#64748B',
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

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const [rows, summaries, commentRows] = await Promise.all([
        repo.getCommunityFeed({ limit: PAGE_SIZE, offset: 0 }),
        repo.getPostReportSummaries(),
        repo.getReportedComments(),
      ]);
      setPosts(rows);
      setReports(new Map(summaries.map(s => [s.postId, s])));
      setReportedComments(commentRows);
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

  const handleRemove = useCallback((post: CommunityPost) => {
    if (!repo) return;
    Alert.alert(
      'Remove post?',
      'This will permanently remove the post from the community feed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingId(post.id);
              await repo.deleteCommunityPost(post.id);
              setPosts(prev => prev.filter(p => p.id !== post.id));
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not remove post.');
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  }, [repo]);

  const handleDismiss = useCallback((post: CommunityPost) => {
    if (!repo) return;
    Alert.alert(
      'Dismiss report?',
      'This clears all reports on this post. The post stays in the feed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          onPress: async () => {
            try {
              setDismissingId(post.id);
              await repo.dismissPostReports(post.id);
              setReports(prev => {
                const next = new Map(prev);
                next.delete(post.id);
                return next;
              });
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not dismiss the report.');
            } finally {
              setDismissingId(null);
            }
          },
        },
      ],
    );
  }, [repo]);

  const handleRemoveComment = useCallback((rc: ReportedComment) => {
    if (!repo) return;
    Alert.alert(
      'Remove comment?',
      'This will permanently remove the comment from the post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingCommentId(rc.comment.id);
              await repo.deletePostComment(rc.comment.id);
              setReportedComments(prev => prev.filter(c => c.comment.id !== rc.comment.id));
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not remove comment.');
            } finally {
              setRemovingCommentId(null);
            }
          },
        },
      ],
    );
  }, [repo]);

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
    const typeColor  = TYPE_COLOR[item.postType] ?? '#64748B';
    const authorName = item.authorProfile?.username ?? '…';
    const removing   = removingId === item.id;
    const dismissing = dismissingId === item.id;
    const report     = reports.get(item.id);
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/community/post/[id]' as any, params: { id: item.id } })}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
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
            <Text style={[styles.author, { color: colors.foreground }]} numberOfLines={1}>@{authorName}</Text>
            <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
          </View>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '18', borderColor: typeColor + '44' }]}>
            <Text style={[styles.typeBadgeLabel, { color: typeColor }]}>{TYPE_LABEL[item.postType] ?? item.postType}</Text>
          </View>
        </View>

        <Text style={[styles.snippet, { color: colors.foreground }]} numberOfLines={3}>
          {item.body}
        </Text>

        <View style={styles.cardBottom}>
          {item.photos.length > 0 && (
            <View style={styles.metaChip}>
              <Feather name="image" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaChipLabel, { color: colors.mutedForeground }]}>
                {item.photos.length} photo{item.photos.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {report && (
            <TouchableOpacity
              onPress={() => handleDismiss(item)}
              disabled={dismissing}
              activeOpacity={0.85}
              style={[styles.removeBtn, { backgroundColor: colors.mutedForeground + '12', borderColor: colors.border }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              {dismissing ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <>
                  <Feather name="check" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.removeBtnLabel, { color: colors.mutedForeground }]}>Dismiss</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => handleRemove(item)}
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
      </TouchableOpacity>
    );
  }, [colors, removingId, dismissingId, router, handleRemove, handleDismiss, reports]);

  return (
    <>
      <Stack.Screen options={{ title: 'Community Moderation' }} />
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + '12', borderColor: colors.destructive + '30' }]}>
              <Feather name="alert-circle" size={14} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
            <TouchableOpacity onPress={() => load()} style={[styles.retryBtn, { borderColor: colors.border }]}>
              <Text style={[styles.retryLabel, { color: colors.primary }]}>Try again</Text>
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

                {reportedComments.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Text style={[styles.sectionHeading, { color: colors.mutedForeground }]}>
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
                          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
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
                              <Text style={[styles.author, { color: colors.foreground }]} numberOfLines={1}>@{name}</Text>
                              <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(rc.comment.createdAt)}</Text>
                            </View>
                          </View>
                          <Text style={[styles.snippet, { color: colors.foreground }]} numberOfLines={3}>
                            {rc.comment.body}
                          </Text>
                          <View style={styles.cardBottom}>
                            <View style={styles.metaChip}>
                              <Feather name="message-circle" size={12} color={colors.mutedForeground} />
                              <Text style={[styles.metaChipLabel, { color: colors.mutedForeground }]}>View post</Text>
                            </View>
                            <View style={{ flex: 1 }} />
                            <TouchableOpacity
                              onPress={() => handleRemoveComment(rc)}
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
                        </TouchableOpacity>
                      );
                    })}
                    <Text style={[styles.sectionHeading, { color: colors.mutedForeground, marginTop: 4 }]}>
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
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <View style={styles.center}>
                <Feather name="check-circle" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {reportedOnly ? 'No reported posts. All clear!' : 'No community posts yet.'}
                </Text>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
