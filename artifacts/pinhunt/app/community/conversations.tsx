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

function initials(name: string): string {
  return name.split(' ').map(n => n[0]?.toUpperCase() ?? '').join('').slice(0, 2);
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

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      {/* Avatar */}
      <Avatar uri={other?.avatarUrl} name={name} size={46} />

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowName, { color: colors.foreground }]}>@{name}</Text>
          <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>{timeAgo(ts)}</Text>
        </View>
        {lastMsg ? (
          <Text style={[styles.rowPreview, { color: colors.mutedForeground }]} numberOfLines={1}>
            {lastMsg.body}
          </Text>
        ) : (
          <Text style={[styles.rowPreview, { color: colors.mutedForeground }]}>No messages yet</Text>
        )}
      </View>

      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
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
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: 12, paddingBottom: botPad, gap: 8 }}
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
        ) : convs.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="mail" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No messages yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
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
  center: { paddingTop: 60, alignItems: 'center', gap: 12 },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderWidth: 1,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  rowContent: { flex: 1, gap: 3 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowTime: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  rowPreview: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
