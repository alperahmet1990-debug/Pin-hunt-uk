/**
 * Conversations list — all private DM threads for the current user.
 */
import React, { useCallback, useEffect, useState } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Avatar } from '@/components/Avatar';
import { useCommunity } from '@/hooks/useCommunity';
import { radius, spacing } from '@/constants/theme';
import type { Conversation } from '@workspace/pin-repository';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function ConversationRow({ conv, onPress, colors }: {
  conv: Conversation;
  onPress(): void;
  colors: ReturnType<typeof useColors>;
}) {
  const other = conv.otherParticipant;
  const name  = other?.username ?? '…';
  const lastMsg = conv.lastMessage;
  const ts = conv.lastMessageAt ?? conv.createdAt;
  const unread = conv.unreadCount ?? 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.row, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine, borderRadius: radius.lg }]}
    >
      {/* Avatar */}
      <Avatar uri={other?.avatarUrl} name={name} size={46} seaGlass />

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowName, { color: colors.homeInk }]}>@{name}</Text>
          <Text style={[styles.rowTime, { color: unread ? colors.homeCoral : colors.homeMuted }]}>{timeAgo(ts)}</Text>
        </View>
        {lastMsg ? (
          <Text
            style={[
              styles.rowPreview,
              unread
                ? { color: colors.homeInk, fontFamily: 'Inter_600SemiBold' }
                : { color: colors.homeMuted },
            ]}
            numberOfLines={1}
          >
            {lastMsg.body}
          </Text>
        ) : (
          <Text style={[styles.rowPreview, { color: colors.homeMuted }]}>No messages yet</Text>
        )}
      </View>

      {unread ? (
        <View style={[styles.unreadBadge, { backgroundColor: colors.homeCoral }]}>
          <Text style={[styles.unreadBadgeText, { color: colors.homeSurface }]}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : (
        <Feather name="chevron-right" size={16} color={colors.homeMuted} />
      )}
    </TouchableOpacity>
  );
}

export default function ConversationsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { repo, userId } = useCommunity();

  const [convs,      setConvs]      = useState<Conversation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!repo || !userId) { setLoading(false); return; }
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const data = await repo.getConversations(userId);
      setConvs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, userId]);

  useEffect(() => { load(); }, [load]);

  const botPad = Platform.OS === 'web' ? 24 : insets.bottom + 16;

  return (
    <>
      <Stack.Screen options={{ title: 'Messages' }} />
      <ScrollView
        style={[styles.root, { backgroundColor: colors.homeBackground }]}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: botPad, gap: spacing.sm }}
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
            <TouchableOpacity onPress={() => load()} style={{ padding: spacing.sm }}>
              <Text style={{ color: colors.homeCoral, fontFamily: 'Inter_500Medium' }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : convs.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="mail" size={40} color={colors.homeMuted} />
            <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>No messages yet</Text>
            <Text style={[styles.emptySub, { color: colors.homeMuted }]}>
              Start a conversation from a community post or a collector's profile.
            </Text>
          </View>
        ) : (
          convs.map(conv => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              colors={colors}
              onPress={() => router.push({ pathname: '/community/chat/[id]' as any, params: { id: conv.id } })}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { paddingTop: 60, alignItems: 'center', gap: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg - 2, borderWidth: 1,
  },
  rowContent: { flex: 1, gap: 3 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowTime: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  rowPreview: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});
