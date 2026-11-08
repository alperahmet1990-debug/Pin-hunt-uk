/**
 * Home → What's Happening → See all (#382, TestFlight feedback).
 *
 * "See all" used to open Community filtered to event posts, which left out
 * the curated pin events Home had just shown and was often empty. This page
 * lists every upcoming event Home draws from: curated events (opening their
 * source) and community event posts (opening the post), grouped by when they
 * are, with a way to post an event and an empty state that never goes blank.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { CommunityPost } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { useCommunity } from '@/hooks/useCommunity';
import { useBlockedUsers } from '@/context/BlockedUsersContext';
import { withoutBlockedAuthors } from '@/utils/blockedUsers';
import { EVENTS } from '@/mock-data/events';
import {
  communityPostToEvent,
  countryFlag,
  formatEventDateParts,
  groupEventsByWhen,
  selectUpcomingEvents,
  timeAgo,
} from '@/utils/events';
import type { PinHuntEvent } from '@/types/event';
import { radius, spacing } from '@/constants/theme';

const POST_EVENT = { pathname: '/community/create-post', params: { type: 'new_pickup' } } as const;

export default function EventsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { repo } = useCommunity();
  const { blockedIds } = useBlockedUsers();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(Boolean(repo));
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!repo) { setLoading(false); return; }
    try {
      setPosts(await repo.getCommunityFeed({ postType: 'new_pickup', limit: 30 }));
    } catch {
      // Curated events still show; community posts come back on refresh.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo]);

  useEffect(() => { void load(); }, [load]);

  const visiblePosts = useMemo(() => withoutBlockedAuthors(posts, blockedIds), [posts, blockedIds]);
  const postById = useMemo(() => new Map(visiblePosts.map(p => [`community-${p.id}`, p])), [visiblePosts]);
  const groups = useMemo(
    () => groupEventsByWhen(selectUpcomingEvents([...EVENTS, ...visiblePosts.map(communityPostToEvent)])),
    [visiblePosts],
  );

  const open = (event: PinHuntEvent) => {
    if (event.sourceType === 'community') {
      const post = postById.get(event.id);
      if (post) router.push({ pathname: '/community/post/[id]', params: { id: post.id } });
      return;
    }
    if (event.sourceUrl) void Linking.openURL(event.sourceUrl);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'What’s Happening' }} />
      <ScrollView
        style={{ backgroundColor: colors.homeBackground }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={styles.intro}>
          <Text style={[styles.introText, { color: colors.homeMuted }]}>
            Pin drops, trading events and community meet-ups.
          </Text>
          <TouchableOpacity
            onPress={() => router.push(POST_EVENT)}
            accessibilityRole="button"
            accessibilityLabel="Post an event"
            activeOpacity={0.85}
            style={[styles.post, { backgroundColor: colors.homeCoral }]}
          >
            <Feather name="plus" size={16} color={colors.homeSurface} />
            <Text style={[styles.postLabel, { color: colors.homeSurface }]}>Post an event</Text>
          </TouchableOpacity>
        </View>

        {groups.map(group => (
          <View key={group.title} style={styles.group}>
            <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.homeMuted }]}>{group.title.toUpperCase()}</Text>
            {group.events.map(event => <EventRow key={event.id} event={event} onPress={() => open(event)} />)}
          </View>
        ))}

        {loading && <ActivityIndicator color={colors.homeCoral} style={styles.loading} />}

        {!loading && groups.length === 0 && (
          <TouchableOpacity
            testID="no-events"
            onPress={() => router.push(POST_EVENT)}
            accessibilityRole="button"
            accessibilityLabel="No events coming up. Post an event"
            activeOpacity={0.85}
            style={[styles.empty, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
              <Feather name="calendar" size={18} color={colors.homeCoral} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.title, { color: colors.homeInk }]}>No events coming up</Text>
              <Text style={[styles.meta, { color: colors.homeMuted }]}>Know of a pin meet-up? Post an event</Text>
            </View>
            <Feather name="plus" size={18} color={colors.homeCoral} />
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

function EventRow({ event, onPress }: { event: PinHuntEvent; onPress: () => void }) {
  const colors = useColors();
  const community = event.sourceType === 'community';
  const { day, month } = formatEventDateParts(event);
  const where = [event.location, countryFlag(event.country)].filter(Boolean).join(' ');
  const meta = [event.time, where].filter(Boolean).join(' · ');
  const source = community ? `Community post · ${timeAgo(event.createdAt)}` : event.sourceName ? `Via ${event.sourceName}` : event.eventType;
  const dated = event.hasScheduledDate && !event.rumour;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole={community ? 'button' : 'link'}
      accessibilityLabel={[event.title, dated ? `${day} ${month}` : null, meta || null, source].filter(Boolean).join('. ')}
      style={[styles.row, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={[styles.datePill, { backgroundColor: dated ? colors.homeWarmSurface : colors.homeAqua }]}>
        {dated ? (
          <>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.day, { color: colors.homeSandInk }]}>{day}</Text>
            <Text style={[styles.month, { color: colors.homeSandInk }]}>{month}</Text>
          </>
        ) : (
          <Feather name={community ? 'users' : 'help-circle'} size={18} color={colors.homeCoralDeep} />
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.badge, { color: colors.homeCoralDeep }]}>{event.badgeLabel}</Text>
        <Text numberOfLines={2} style={[styles.title, { color: colors.homeInk }]}>{event.title}</Text>
        {meta ? <Text numberOfLines={1} style={[styles.meta, { color: colors.homeInk }]}>{meta}</Text> : null}
        <Text numberOfLines={1} style={[styles.meta, { color: colors.homeMuted }]}>{source}</Text>
      </View>
      <Feather name={community ? 'chevron-right' : 'external-link'} size={16} color={colors.homeMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  intro: { gap: spacing.md },
  introText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  post: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  postLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  datePill: { width: 54, minHeight: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  day: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  month: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  badge: { fontSize: 9.5, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  title: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: spacing.md },
});
