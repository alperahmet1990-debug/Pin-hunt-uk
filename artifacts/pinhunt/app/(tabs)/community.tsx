/**
 * Community tab — feed of collector posts filterable by category chips,
 * with a Collectors Nearby entry point.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
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
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Avatar } from '@/components/Avatar';
import { useCommunity } from '@/hooks/useCommunity';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { CommunityPost, CommunityPostType } from '@workspace/pin-repository';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
// Card has 12px margin on each side + 14px internal padding each side
const CARD_INNER_WIDTH = SCREEN_WIDTH - 24 - 28;

const POST_TYPES: Array<{ key: CommunityPostType | 'all'; label: string; emoji: string }> = [
  { key: 'all',          label: 'All',       emoji: '✨' },
  { key: 'in_search_of', label: 'ISO',       emoji: '🔍' },
  { key: 'for_trade',    label: 'Trade',     emoji: '🔄' },
  { key: 'for_sale',     label: 'For Sale',  emoji: '🏷️' },
  { key: 'new_pickup',   label: 'Pickup',    emoji: '📦' },
  { key: 'discussion',   label: 'Chat',      emoji: '💬' },
];

const TYPE_COLOR: Record<CommunityPostType | 'all', string> = {
  all:          '#6366F1',
  in_search_of: '#F59E0B',
  for_trade:    '#3B82F6',
  for_sale:     '#16A34A',
  new_pickup:   '#8B5CF6',
  discussion:   '#64748B',
};

const TYPE_LABEL: Record<CommunityPostType, string> = {
  in_search_of: 'In Search Of',
  for_trade:    'For Trade',
  for_sale:     'For Sale',
  new_pickup:   'New Pickup',
  discussion:   'Discussion',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** True when updatedAt is later than createdAt (small tolerance for timestamp serialization), i.e. edited after publishing. */
function wasEdited(createdAt: string, updatedAt?: string): boolean {
  if (!updatedAt) return false;
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1_000;
}

// ─── Photo preview grid (up to 4 cells) ──────────────────────────────────────

function PhotoGrid({ photos, onPress }: { photos: string[]; onPress(index: number): void }) {
  const count = photos.length;
  if (count === 0) return null;

  const gap = 2;

  if (count === 1) {
    return (
      <TouchableOpacity onPress={() => onPress(0)} activeOpacity={0.9} style={styles.photoGrid1}>
        <Image source={{ uri: photos[0] }} style={styles.photoGrid1Image} />
      </TouchableOpacity>
    );
  }

  if (count === 2) {
    const cellW = (CARD_INNER_WIDTH - gap) / 2;
    return (
      <View style={[styles.photoGridRow, { gap }]}>
        {photos.slice(0, 2).map((uri, i) => (
          <TouchableOpacity key={i} onPress={() => onPress(i)} activeOpacity={0.9}>
            <Image source={{ uri }} style={{ width: cellW, height: 140, borderRadius: 6 }} />
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  if (count === 3) {
    const rightW = (CARD_INNER_WIDTH - gap) / 2;
    const leftW = CARD_INNER_WIDTH - rightW - gap;
    return (
      <View style={[styles.photoGridRow, { gap }]}>
        <TouchableOpacity onPress={() => onPress(0)} activeOpacity={0.9}>
          <Image source={{ uri: photos[0] }} style={{ width: leftW, height: 180, borderRadius: 6 }} />
        </TouchableOpacity>
        <View style={{ gap, flexDirection: 'column' }}>
          {photos.slice(1, 3).map((uri, i) => (
            <TouchableOpacity key={i} onPress={() => onPress(i + 1)} activeOpacity={0.9}>
              <Image source={{ uri }} style={{ width: rightW, height: (180 - gap) / 2, borderRadius: 6 }} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // 4+ photos — 2×2 grid, last cell shows "+N more" overlay
  const cellW = (CARD_INNER_WIDTH - gap) / 2;
  const cellH = 130;
  const extra = count - 4;

  return (
    <View style={{ gap }}>
      <View style={[styles.photoGridRow, { gap }]}>
        {[0, 1].map(i => (
          <TouchableOpacity key={i} onPress={() => onPress(i)} activeOpacity={0.9}>
            <Image source={{ uri: photos[i] }} style={{ width: cellW, height: cellH, borderRadius: 6 }} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.photoGridRow, { gap }]}>
        {[2, 3].map(i => (
          <TouchableOpacity key={i} onPress={() => onPress(i)} activeOpacity={0.9} style={{ position: 'relative' }}>
            <Image source={{ uri: photos[i] }} style={{ width: cellW, height: cellH, borderRadius: 6 }} />
            {i === 3 && extra > 0 && (
              <View style={[styles.moreOverlay, { width: cellW, height: cellH, borderRadius: 6 }]}>
                <Text style={styles.moreOverlayText}>+{extra}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Category chip ────────────────────────────────────────────────────────────

function Chip({ label, emoji, color, active, onPress }: {
  label: string; emoji: string; color: string; active: boolean; onPress(): void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.chip,
        {
          backgroundColor: active ? color : colors.secondary,
          borderColor: active ? color : colors.border,
        },
      ]}
    >
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text style={[styles.chipLabel, { color: active ? '#fff' : colors.mutedForeground }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({ post, onPress, onPhotoPress, colors }: {
  post: CommunityPost;
  onPress(): void;
  onPhotoPress(index: number): void;
  colors: ReturnType<typeof useColors>;
}) {
  const color = TYPE_COLOR[post.postType];
  const authorName = post.authorProfile?.username ?? '…';
  const photos = post.photos ?? [];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[styles.typeBadgeLabel, { color }]}>{TYPE_LABEL[post.postType]}</Text>
        </View>
        <View style={styles.cardMeta}>
          <Avatar uri={post.authorProfile?.avatarUrl} name={authorName} size={22} />
          <Text style={[styles.cardAuthor, { color: colors.foreground }]}>@{authorName}</Text>
          <Text style={[styles.cardTime, { color: colors.mutedForeground }]}>
            {timeAgo(post.createdAt)}
            {wasEdited(post.createdAt, post.updatedAt) ? ' · Edited' : ''}
          </Text>
        </View>
      </View>

      {/* Body */}
      <Text style={[styles.cardBody, { color: colors.foreground }]} numberOfLines={photos.length > 0 ? 2 : 4}>
        {post.body}
      </Text>

      {/* Photo grid */}
      {photos.length > 0 && (
        <PhotoGrid photos={photos} onPress={onPhotoPress} />
      )}

      {/* Linked pin */}
      {post.linkedPin && (
        <View style={[styles.pinChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          {post.linkedPin.imageUrl
            ? <Image source={{ uri: post.linkedPin.imageUrl }} style={styles.pinChipImage} />
            : <Feather name="tag" size={12} color={colors.mutedForeground} />
          }
          <Text style={[styles.pinChipLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
            {post.linkedPin.title}
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Feather name="message-circle" size={13} color={colors.mutedForeground} />
        <Text style={[styles.cardCommentCount, { color: colors.mutedForeground }]}>
          {post.commentCount ?? 0} comment{post.commentCount !== 1 ? 's' : ''}
        </Text>
        <Feather name="chevron-right" size={14} color={colors.mutedForeground} style={{ marginLeft: 'auto' }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId } = useCommunity();
  const { totalUnread } = useUnreadMessages();

  const [filter, setFilter]     = useState<CommunityPostType | 'all'>('all');
  const [posts, setPosts]       = useState<CommunityPost[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [newPostCount, setNewPostCount] = useState(0);
  const scrollRef               = useRef<ScrollView>(null);
  const scrollOffsetRef         = useRef(0);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  const load = useCallback(async (isRefresh = false) => {
    if (!repo) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const data = await repo.getCommunityFeed({
        postType: filter === 'all' ? undefined : filter,
        limit: 40,
      });
      setPosts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, filter]);

  useEffect(() => { load(); }, [load]);

  // Keep a stable reference to `load` so the realtime subscriptions and the
  // AppState listener below don't tear down and resubscribe every time the
  // callback identity changes.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Realtime sockets are suspended while the app is backgrounded, so events
  // sent during that window are lost. Run one catch-up fetch whenever the app
  // returns to the foreground (no polling).
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') { loadRef.current(); }
    });
    return () => { sub.remove(); };
  }, []);

  // ── Realtime: prepend new posts as they arrive ─────────────────────────────
  useEffect(() => {
    if (!repo || !isSupabaseConfigured) return;

    const channel = supabase
      .channel('community_posts_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_posts' },
        async (payload) => {
          const newRow = payload.new as { id: string; post_type: string };
          // Only prepend if it matches the active filter (or filter is 'all')
          if (filter !== 'all' && newRow.post_type !== filter) return;
          try {
            const fullPost = await repo.getCommunityPost(newRow.id);
            if (!fullPost) return;
            setPosts(prev => {
              // Guard against duplicates (e.g. if the user created the post themselves)
              if (prev.some(p => p.id === fullPost.id)) return prev;
              // If the user is scrolled down, show a nudge instead of shifting silently
              if (scrollOffsetRef.current > 8) {
                setNewPostCount(c => c + 1);
              }
              return [fullPost, ...prev];
            });
          } catch {
            // Silently ignore fetch errors for realtime updates;
            // pull-to-refresh is still available as a fallback.
          }
        },
      )
      .subscribe(status => {
        // On (re)connect, run one catch-up fetch so posts created while the
        // channel was down are picked up.
        if (status === 'SUBSCRIBED') { loadRef.current(); }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [repo, filter]);

  // ── Realtime: bump comment counts on cards as comments arrive ──────────────
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('post_comments_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments' },
        (payload) => {
          const newRow = payload.new as { post_id: string };
          // Only update the affected card, if it's currently in the feed.
          setPosts(prev => {
            if (!prev.some(p => p.id === newRow.post_id)) return prev;
            return prev.map(p =>
              p.id === newRow.post_id
                ? { ...p, commentCount: (p.commentCount ?? 0) + 1 }
                : p,
            );
          });
        },
      )
      .subscribe(status => {
        // On (re)connect, refresh the feed so comment counts that changed
        // while the channel was down are corrected.
        if (status === 'SUBSCRIBED') { loadRef.current(); }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleFilterChange = (key: CommunityPostType | 'all') => {
    setFilter(key);
    setNewPostCount(0);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleNewPostsPress = () => {
    setNewPostCount(0);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handlePhotoPress = (post: CommunityPost, _index: number) => {
    // Tapping a photo on the feed opens the post detail (no lightbox) —
    // the lightbox is available from the detail screen itself.
    router.push({
      pathname: '/community/post/[id]' as any,
      params: { id: post.id },
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Community</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push('/community/conversations' as any)}
              style={[styles.headerIconBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              activeOpacity={0.75}
            >
              <Feather name="mail" size={18} color={colors.foreground} />
              {totalUnread > 0 && (
                <View style={styles.mailBadge}>
                  <Text style={styles.mailBadgeText}>{totalUnread > 9 ? '9+' : totalUnread}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!userId) { Alert.alert('Sign in to post'); return; }
                router.push('/community/create-post' as any);
              }}
              style={[styles.headerIconBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Collectors Nearby banner */}
        <TouchableOpacity
          onPress={() => router.push('/nearby')}
          activeOpacity={0.85}
          style={[styles.nearbyBanner, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        >
          <View style={[styles.nearbyIconWrap, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Feather name="map-pin" size={18} color="#fff" />
          </View>
          <Text style={styles.nearbyBannerLabel}>Collectors Nearby</Text>
          <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {POST_TYPES.map(pt => (
            <Chip
              key={pt.key}
              label={pt.label}
              emoji={pt.emoji}
              color={TYPE_COLOR[pt.key]}
              active={filter === pt.key}
              onPress={() => handleFilterChange(pt.key)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
      {/* New-posts nudge */}
      {newPostCount > 0 && (
        <View style={styles.newPostsWrap} pointerEvents="box-none">
          <TouchableOpacity
            onPress={handleNewPostsPress}
            activeOpacity={0.85}
            style={[styles.newPostsBanner, { backgroundColor: colors.primary }]}
          >
            <Feather name="arrow-up" size={13} color="#fff" />
            <Text style={styles.newPostsLabel}>
              {newPostCount} new post{newPostCount !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Feed */}
      <ScrollView
        ref={scrollRef}
        style={styles.feed}
        contentContainerStyle={{ padding: 12, paddingBottom: botPad, gap: 10 }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          // Dismiss the nudge if the user scrolls back to the top themselves
          if (e.nativeEvent.contentOffset.y <= 8) setNewPostCount(0);
        }}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.primary}
          />
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
        ) : posts.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="rss" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No posts yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {filter === 'all'
                ? 'Be the first to post in the community!'
                : `No ${TYPE_LABEL[filter as CommunityPostType]} posts yet.`}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (!userId) { Alert.alert('Sign in to post'); return; }
                router.push('/community/create-post' as any);
              }}
              style={[styles.emptyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={14} color="#fff" />
              <Text style={styles.emptyBtnLabel}>Create Post</Text>
            </TouchableOpacity>
          </View>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              colors={colors}
              onPress={() => router.push({ pathname: '/community/post/[id]' as any, params: { id: post.id } })}
              onPhotoPress={(index) => handlePhotoPress(post, index)}
            />
          ))
        )}
      </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  mailBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mailBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' },
  root: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerIconBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },

  nearbyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nearbyIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  nearbyBannerLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  chips: { gap: 7, paddingVertical: 2, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  feed: { flex: 1 },

  newPostsWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  newPostsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  newPostsLabel: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  card: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  typeBadgeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  cardMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  cardAuthor: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cardTime: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  cardBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },

  // Photo grid helpers
  photoGridRow: { flexDirection: 'row' },
  photoGrid1: { width: '100%', height: 200, borderRadius: 8, overflow: 'hidden' },
  photoGrid1Image: { width: '100%', height: '100%', resizeMode: 'cover' },
  moreOverlay: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center', justifyContent: 'center',
  },
  moreOverlayText: { color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold' },

  pinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  pinChipImage: { width: 20, height: 20, borderRadius: 4 },
  pinChipLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', maxWidth: 200 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardCommentCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  center: { paddingTop: 60, alignItems: 'center', gap: 12 },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10, marginTop: 4,
  },
  emptyBtnLabel: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
