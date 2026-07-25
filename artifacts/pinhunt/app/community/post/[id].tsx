/**
 * Community Post Detail — shows the post body, photos, linked pin, and comments.
 * Users can tap photos to view them full-screen, add comments, and message the author.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { Avatar } from '@/components/Avatar';
import { useCommunity } from '@/hooks/useCommunity';
import { useProfile } from '@/context/ProfileContext';
import type { CommunityPost, PostComment } from '@workspace/pin-repository';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

function initials(username: string): string {
  return username.split(' ').map(n => n[0]?.toUpperCase() ?? '').join('').slice(0, 2);
}

// ─── Full-screen photo lightbox ───────────────────────────────────────────────

function PhotoLightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: string[];
  startIndex: number;
  onClose(): void;
}) {
  const listRef = useRef<FlatList>(null);
  const [current, setCurrent] = useState(startIndex);

  useEffect(() => {
    if (photos.length > 1) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: startIndex, animated: false });
      }, 50);
    }
  }, [startIndex, photos.length]);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={lb.root}>
        {/* Close button */}
        <TouchableOpacity onPress={onClose} style={lb.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="x" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Counter */}
        {photos.length > 1 && (
          <View style={lb.counter}>
            <Text style={lb.counterText}>{current + 1} / {photos.length}</Text>
          </View>
        )}

        {/* Paging list */}
        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
          onMomentumScrollEnd={e => {
            const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setCurrent(page);
          }}
          renderItem={({ item }) => (
            <View style={lb.page}>
              <Image
                source={{ uri: item }}
                style={lb.image}
                resizeMode="contain"
              />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

// ─── Photo grid (full detail view) ───────────────────────────────────────────

function DetailPhotoGrid({ photos, onPress }: { photos: string[]; onPress(i: number): void }) {
  const count = photos.length;
  if (count === 0) return null;

  const gap = 2;

  if (count === 1) {
    return (
      <TouchableOpacity onPress={() => onPress(0)} activeOpacity={0.9} style={dg.single}>
        <Image source={{ uri: photos[0] }} style={dg.singleImage} />
      </TouchableOpacity>
    );
  }

  if (count === 2) {
    return (
      <View style={[dg.row, { gap }]}>
        {photos.map((uri, i) => (
          <TouchableOpacity key={i} onPress={() => onPress(i)} activeOpacity={0.9} style={{ flex: 1 }}>
            <Image source={{ uri }} style={{ height: 180, borderRadius: 6, width: '100%' }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  // 3+ — masonry-style: full-width first, then 3-col grid
  return (
    <View style={{ gap }}>
      <TouchableOpacity onPress={() => onPress(0)} activeOpacity={0.9} style={dg.single}>
        <Image source={{ uri: photos[0] }} style={dg.singleImage} />
      </TouchableOpacity>
      <View style={[dg.row, { gap, flexWrap: 'wrap' }]}>
        {photos.slice(1).map((uri, i) => {
          const realIndex = i + 1;
          const isLast = realIndex === Math.min(count - 1, 5);
          const extra = count - 6;
          return (
            <TouchableOpacity
              key={realIndex}
              onPress={() => onPress(realIndex)}
              activeOpacity={0.9}
              style={{ position: 'relative', flex: 1, minWidth: (SCREEN_WIDTH - 32 - gap * 2) / 3 }}
            >
              <Image
                source={{ uri }}
                style={{ height: 100, borderRadius: 6, width: '100%' }}
                resizeMode="cover"
              />
              {isLast && extra > 0 && (
                <View style={dg.overlay}>
                  <Text style={dg.overlayText}>+{extra}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Comment row ─────────────────────────────────────────────────────────────

function CommentRow({ comment, isMe, isAdmin, onDelete, colors }: {
  comment: PostComment;
  isMe: boolean;
  isAdmin: boolean;
  onDelete: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const name = comment.authorProfile?.username ?? '…';
  return (
    <View style={[styles.commentRow, { borderBottomColor: colors.border }]}>
      <Avatar uri={comment.authorProfile?.avatarUrl} name={name} size={32} />
      <View style={styles.commentBody}>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentAuthor, { color: colors.foreground }]}>@{name}</Text>
          <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(comment.createdAt)}</Text>
          {(isMe || isAdmin) && (
            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="trash-2" size={13} color={colors.destructive} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.commentText, { color: colors.foreground }]}>{comment.body}</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ id: string; openPhotoIndex?: string }>();
  const id = params.id;
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId } = useCommunity();
  const { profile } = useProfile();
  const isAdmin = profile?.isAdmin === true;

  const [post,        setPost]        = useState<CommunityPost | null>(null);
  const [comments,    setComments]    = useState<PostComment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [sending,     setSending]     = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!repo || !id) { setLoading(false); return; }
    try {
      const [p, c] = await Promise.all([
        repo.getCommunityPost(id),
        repo.getPostComments(id),
      ]);
      setPost(p);
      setComments(c);

      // Auto-open lightbox if navigated from feed photo tap
      const openIdx = params.openPhotoIndex ? parseInt(params.openPhotoIndex, 10) : null;
      if (openIdx !== null && !isNaN(openIdx) && (p?.photos ?? []).length > 0) {
        setLightboxIndex(openIdx);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load post.');
    } finally {
      setLoading(false);
    }
  }, [repo, id]);

  useEffect(() => { load(); }, [load]);

  const handleSendComment = async () => {
    if (!repo || !userId || !id || !commentText.trim()) return;
    try {
      setSending(true);
      const c = await repo.createPostComment(id, userId, commentText.trim());
      setComments(prev => [...prev, c]);
      setCommentText('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not post comment.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!repo) return;
    Alert.alert('Delete comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await repo.deletePostComment(commentId);
            setComments(prev => prev.filter(c => c.id !== commentId));
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete comment.');
          }
        },
      },
    ]);
  };

  const handleDeletePost = async () => {
    if (!repo || !post) return;
    const title   = isAdmin && !isAuthor ? 'Remove post?' : 'Delete post?';
    const message = isAdmin && !isAuthor
      ? 'This will permanently remove the post from the community feed.'
      : 'This cannot be undone.';
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isAdmin && !isAuthor ? 'Remove' : 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await repo.deleteCommunityPost(post.id);
            router.back();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete post.');
          }
        },
      },
    ]);
  };

  const handleMessage = () => {
    if (!userId) { Alert.alert('Sign in to message'); return; }
    if (!post) return;
    if (post.authorId === userId) { Alert.alert('That\'s you!'); return; }
    router.push({
      pathname: '/community/start-conversation' as any,
      params: {
        recipientId: post.authorId,
        recipientName: post.authorProfile?.username ?? '',
        contextPostId: post.id,
        contextPostTitle: post.body.slice(0, 60),
      },
    });
  };

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 8;
  const isAuthor = post?.authorId === userId;
  const canDeletePost = isAuthor || isAdmin;
  const photos = post?.photos ?? [];

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Post' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </>
    );
  }

  if (error || !post) {
    return (
      <>
        <Stack.Screen options={{ title: 'Post' }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error ?? 'Post not found.'}</Text>
        </View>
      </>
    );
  }

  const typeColor = TYPE_COLOR[post.postType] ?? '#64748B';
  const authorName = post.authorProfile?.username ?? '…';

  return (
    <>
      <Stack.Screen
        options={{
          title: TYPE_LABEL[post.postType] ?? 'Post',
          headerRight: canDeletePost
            ? () => (
                <TouchableOpacity onPress={handleDeletePost} style={{ padding: 8 }}>
                  <Feather name="trash-2" size={18} color={colors.destructive} />
                </TouchableOpacity>
              )
            : undefined,
        }}
      />

      {/* Photo lightbox */}
      {lightboxIndex !== null && photos.length > 0 && (
        <PhotoLightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: botPad }}
          showsVerticalScrollIndicator={false}
        >
          {/* Post card */}
          <View style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Type badge */}
            <View style={[styles.typeBadge, { backgroundColor: typeColor + '18', borderColor: typeColor + '44' }]}>
              <Text style={[styles.typeBadgeLabel, { color: typeColor }]}>{TYPE_LABEL[post.postType]}</Text>
            </View>

            {/* Author row */}
            <View style={styles.authorRow}>
              <Avatar uri={post.authorProfile?.avatarUrl} name={authorName} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.authorName, { color: colors.foreground }]}>@{authorName}</Text>
                <Text style={[styles.postTime, { color: colors.mutedForeground }]}>{timeAgo(post.createdAt)}</Text>
              </View>
              {!isAuthor && userId && (
                <TouchableOpacity
                  onPress={handleMessage}
                  style={[styles.messageBtn, { backgroundColor: colors.primary, borderRadius: 8 }]}
                  activeOpacity={0.85}
                >
                  <Feather name="mail" size={14} color="#fff" />
                  <Text style={styles.messageBtnLabel}>Message</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Body */}
            <Text style={[styles.postBody, { color: colors.foreground }]}>{post.body}</Text>

            {/* Photos */}
            {photos.length > 0 && (
              <DetailPhotoGrid
                photos={photos}
                onPress={i => setLightboxIndex(i)}
              />
            )}

            {/* Linked pin */}
            {post.linkedPin && (
              <View style={[styles.pinChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                {post.linkedPin.imageUrl
                  ? <Image source={{ uri: post.linkedPin.imageUrl }} style={styles.pinChipImage} />
                  : <Feather name="tag" size={13} color={colors.mutedForeground} />
                }
                <View>
                  <Text style={[styles.pinChipName, { color: colors.foreground }]} numberOfLines={1}>
                    {post.linkedPin.title}
                  </Text>
                  <Text style={[styles.pinChipBrand, { color: colors.mutedForeground }]}>{post.linkedPin.brand}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Comments section */}
          <View style={[styles.commentsSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.commentsHeading, { color: colors.mutedForeground }]}>
              {comments.length} COMMENT{comments.length !== 1 ? 'S' : ''}
            </Text>

            {comments.length === 0 ? (
              <View style={styles.noComments}>
                <Text style={[styles.noCommentsText, { color: colors.mutedForeground }]}>
                  No comments yet. Be the first!
                </Text>
              </View>
            ) : (
              comments.map(c => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  isMe={c.authorId === userId}
                  isAdmin={isAdmin}
                  onDelete={() => handleDeleteComment(c.id)}
                  colors={colors}
                />
              ))
            )}
          </View>
        </ScrollView>

        {/* Comment input */}
        {userId ? (
          <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: botPad }]}>
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment…"
              placeholderTextColor={colors.mutedForeground + '88'}
              style={[styles.commentInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary, borderRadius: 20 }]}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              onPress={handleSendComment}
              disabled={!commentText.trim() || sending}
              activeOpacity={0.85}
              style={[styles.sendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.secondary, borderRadius: 20 }]}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Feather name="send" size={16} color={commentText.trim() ? '#fff' : colors.mutedForeground} />
              }
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </>
  );
}

// ─── Lightbox styles ──────────────────────────────────────────────────────────

const lb = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 56, right: 20,
    zIndex: 10,
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    zIndex: 10,
  },
  counterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  page: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
});

// ─── Detail grid styles ───────────────────────────────────────────────────────

const dg = StyleSheet.create({
  single: { height: 260, borderRadius: 8, overflow: 'hidden' },
  singleImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  row: { flexDirection: 'row' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 6,
  },
  overlayText: { color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold' },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  scroll: { flex: 1 },

  postCard: {
    borderBottomWidth: 1,
    padding: 16,
    gap: 12,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  typeBadgeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  authorName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  postTime: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  messageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  messageBtnLabel: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  postBody: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  pinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 10, borderWidth: 1,
  },
  pinChipImage: { width: 36, height: 36, borderRadius: 6 },
  pinChipName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  pinChipBrand: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  commentsSection: { padding: 16, gap: 0, borderTopWidth: StyleSheet.hairlineWidth },
  commentsHeading: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 12 },
  noComments: { paddingVertical: 24, alignItems: 'center' },
  noCommentsText: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  commentRow: {
    flexDirection: 'row', gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  commentAvatarText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_700Bold' },
  commentBody: { flex: 1, gap: 3 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentAuthor: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  commentTime: { fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 },
  commentText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 19 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular',
    maxHeight: 100, borderWidth: 1,
  },
  sendBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
});
