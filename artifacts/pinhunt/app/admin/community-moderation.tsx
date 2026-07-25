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
import type { CommunityPost } from '@workspace/pin-repository';

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

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const rows = await repo.getCommunityFeed({ limit: PAGE_SIZE, offset: 0 });
      setPosts(rows);
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

  const renderItem = useCallback(({ item }: { item: CommunityPost }) => {
    const typeColor  = TYPE_COLOR[item.postType] ?? '#64748B';
    const authorName = item.authorProfile?.username ?? '…';
    const removing   = removingId === item.id;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/community/post/[id]' as any, params: { id: item.id } })}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
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
  }, [colors, removingId, router, handleRemove]);

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
            data={posts}
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
                  No community posts yet.
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
