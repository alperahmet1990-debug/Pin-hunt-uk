import React, { useMemo, useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useProfile } from '@/context/ProfileContext';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';
import { useSubmissionNotifications } from '@/context/SubmissionNotificationsContext';
import { useAuth } from '@/context/AuthContext';
import { useCommunity } from '@/hooks/useCommunity';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { Avatar } from '@/components/Avatar';
import type { PinSetSummary, CommunityPost } from '@workspace/pin-repository';

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { profile } = useProfile();
  const { user } = useAuth();
  const { collection } = useCollection();
  const { totalUnread } = useUnreadMessages();
  const { unseenCount } = useSubmissionNotifications();
  const { repo: userRepo } = useCommunity();
  const { repository: catRepo, pins, ensureCollections } = usePinCatalogue();

  const [feed, setFeed] = useState<CommunityPost[]>([]);
  const [activeSet, setActiveSet] = useState<PinSetSummary | null>(null);
  const [activeSetOwnerId, setActiveSetOwnerId] = useState<string | null>(null);
  const [activeSetLoading, setActiveSetLoading] = useState(false);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom + 80;

  const firstName = profile?.displayName?.split(' ')[0] ?? profile?.username ?? null;

  useEffect(() => {
    let cancelled = false;
    setFeed([]);
    if (!userRepo) return () => { cancelled = true; };
    userRepo.getCommunityFeed({ postType: 'new_pickup', limit: 2 }).then(posts => {
      if (!cancelled) setFeed(posts);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userRepo]);

  useEffect(() => {
    let cancelled = false;
    setActiveSet(null);
    setActiveSetOwnerId(null);
    setActiveSetLoading(false);
    if (!catRepo || !user?.id) return () => { cancelled = true; };

    const ownedEntries = Object.values(collection)
      .filter(entry => entry.status === 'owned' || entry.status === 'for_trade')
      .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));

    if (ownedEntries.length === 0) return () => { cancelled = true; };

    Promise.all([
      catRepo.getPinsByIds(ownedEntries.map(entry => entry.pinId)),
      catRepo.getSetSummaries(),
    ]).then(([ownedPins, summaries]) => {
      if (cancelled) return;
      const pinsById = new Map(ownedPins.map(pin => [pin.id, pin]));
      const summaryByName = new Map(summaries.map(summary => [summary.setName, summary]));
      const automaticSet = ownedEntries
        .map(entry => pinsById.get(entry.pinId)?.collection)
        .filter((name): name is string => Boolean(name))
        .map(name => summaryByName.get(name))
        .find((summary): summary is PinSetSummary => Boolean(summary));

      if (automaticSet) {
        setActiveSet(automaticSet);
        setActiveSetOwnerId(user.id);
        setActiveSetLoading(true);
        ensureCollections([automaticSet.setName])
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setActiveSetLoading(false);
          });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [catRepo, user?.id, collection, ensureCollections]);

  const ownedCount = Object.values(collection).filter(e => e.status === 'owned' || e.status === 'for_trade').length;
  const forTradeCount = Object.values(collection).filter(e => e.status === 'for_trade').length;
  const isoCount = Object.values(collection).filter(e => e.status === 'wanted').length;

  const forYouItems = useMemo(() => {
    const items = [];
    if (totalUnread > 0) {
      items.push({
        id: 'messages',
        icon: 'message-circle' as const,
        title: 'New messages',
        subtitle: `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`,
        onPress: () => router.push('/community/conversations'),
        color: colors.primary,
      });
    }
    if (unseenCount > 0) {
      items.push({
        id: 'submissions',
        icon: 'bell' as const,
        title: 'Submission update',
        subtitle: `${unseenCount} unseen update${unseenCount === 1 ? '' : 's'}`,
        onPress: () => router.push('/my-submissions'),
        color: colors.gold,
      });
    }
    return items.slice(0, 3);
  }, [totalUnread, unseenCount, router, colors.primary, colors.gold]);

  const visibleActiveSet = activeSetOwnerId === user?.id ? activeSet : null;

  const setProgress = useMemo(() => {
    if (!visibleActiveSet) return null;
    const setPins = pins.filter(p => p.collection === visibleActiveSet.setName);
    const total = setPins.length;
    const owned = setPins.filter(p => {
      const e = collection[p.id];
      return e && (e.status === 'owned' || e.status === 'for_trade');
    }).length;
    return { owned, total };
  }, [visibleActiveSet, pins, collection]);

  if (!user) {
    return <View style={[styles.root, { backgroundColor: colors.background }]} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad, paddingHorizontal: 16 }}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/edit-profile')} activeOpacity={0.8} style={styles.headerLeft}>
            <Avatar uri={profile?.avatarUrl ?? null} name={profile?.username ?? '?'} size={44} />
            <Text style={[styles.greeting, { color: colors.foreground }]}>
              {firstName ? `Hi, ${firstName} 👋` : 'Hi there 👋'}
            </Text>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => router.push('/community/conversations')} style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="message-square" size={20} color={colors.foreground} />
              {totalUnread > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
                  <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{totalUnread > 9 ? '9+' : totalUnread}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/my-submissions')} style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="bell" size={20} color={colors.foreground} />
              {unseenCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
                  <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{unseenCount > 9 ? '9+' : unseenCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* COLLECTION SNAPSHOT */}
        <View style={styles.snapshot}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'boards' } })} activeOpacity={0.7}>
            <Text style={[styles.snapshotText, { color: colors.mutedForeground }]}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{ownedCount}</Text> pins
            </Text>
          </TouchableOpacity>
          <Text style={[styles.snapshotDot, { color: colors.border }]}>·</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'traders' } })} activeOpacity={0.7}>
            <Text style={[styles.snapshotText, { color: colors.mutedForeground }]}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{forTradeCount}</Text> traders
            </Text>
          </TouchableOpacity>
          <Text style={[styles.snapshotDot, { color: colors.border }]}>·</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'iso' } })} activeOpacity={0.7}>
            <Text style={[styles.snapshotText, { color: colors.mutedForeground }]}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{isoCount}</Text> ISO
            </Text>
          </TouchableOpacity>
        </View>

        {/* QUICK ACTIONS */}
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/scan')} activeOpacity={0.85} style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.actionIcon, { backgroundColor: colors.primary + '15' }]}>
              <Feather name="camera" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.actionText, { color: colors.foreground }]}>Scan Pin</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/search')} activeOpacity={0.85} style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.actionIcon, { backgroundColor: colors.primary + '15' }]}>
              <Feather name="plus" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.actionText, { color: colors.foreground }]}>Add Pin</Text>
          </TouchableOpacity>
        </View>

        {/* FOR YOU */}
        {forYouItems.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>For You</Text>
            <View style={styles.sectionContent}>
              {forYouItems.map((item) => (
                <TouchableOpacity key={item.id} onPress={item.onPress} activeOpacity={0.8} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.cardIcon, { backgroundColor: item.color + '15' }]}>
                    <Feather name={item.icon} size={16} color={item.color} />
                  </View>
                  <View style={styles.cardTextCol}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>{item.subtitle}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* WHAT'S HAPPENING */}
        {feed.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>What’s Happening</Text>
            <View style={styles.sectionContent}>
              {feed.map((post) => (
                <TouchableOpacity key={post.id} onPress={() => router.push({ pathname: '/community/post/[id]', params: { id: post.id } })} activeOpacity={0.8} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.cardIcon, { backgroundColor: colors.secondary }]}>
                    <Feather name={post.postType === 'for_trade' ? 'repeat' : post.postType === 'in_search_of' ? 'bookmark' : 'message-square'} size={16} color={colors.foreground} />
                  </View>
                  <View style={styles.cardTextCol}>
                    <Text style={[styles.cardSubtitle, { color: colors.mutedForeground, fontSize: 11, marginBottom: 2 }]}>
                      {post.authorProfile?.displayName || post.authorProfile?.username || 'Unknown'} · {timeAgo(post.createdAt)}
                    </Text>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {post.body}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* CONTINUE COLLECTING */}
        {visibleActiveSet && !activeSetLoading && setProgress && setProgress.total > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Continue Collecting</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/set/[collection]', params: { collection: visibleActiveSet.setName } })} activeOpacity={0.8} style={[styles.setCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.setTextCol}>
                <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: 16 }]} numberOfLines={1}>{visibleActiveSet.setName}</Text>
                <Text style={[styles.cardSubtitle, { color: colors.mutedForeground, marginTop: 4 }]}>
                  {setProgress.owned} / {setProgress.total} collected
                </Text>
              </View>
              {setProgress.total > 0 && (
                <View style={[styles.progressRing, { backgroundColor: colors.primary + '15' }]}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.primary }}>
                    {Math.round((setProgress.owned / setProgress.total) * 100)}%
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  greeting: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  snapshot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    paddingLeft: 2,
  },
  snapshotText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  snapshotDot: {
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.2,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    opacity: 0.8,
  },
  sectionContent: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  setCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  setTextCol: {
    flex: 1,
  },
  progressRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
