/**
 * Home (redesign "G · Your brief, tiles", approved Nov 2026).
 *
 * Top to bottom: app icon + "PinHunt", Messages and avatar; three stat tiles
 * (Total pins, ISO, For trade) that open the matching Collection view; Find a
 * pin and Submit a new pin side by side; one slim "needs you" line when
 * something is waiting; and two compact upcoming events.
 *
 * Removed from Home with the maintainer's approval (#604): Recently added,
 * the Find Trades tile, Continue Collecting, the large What's Happening
 * cards, Get started and Photograph your pins. Find Trades stays on
 * Collection (For Trade and ISO tabs) and Community.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { PinImage } from '@/components/ui/PinImage';
import { useColors } from '@/hooks/useColors';
import { fontScale } from '@/constants/theme';
import { useCollection } from '@/context/CollectionContext';
import { AddPinsWelcomeSheet } from '@/components/AddPinsWelcomeSheet';
import { useProfile } from '@/context/ProfileContext';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';
import { useTradesWaiting } from '@/hooks/useTradesWaiting';
import { useSubmissionNotifications } from '@/context/SubmissionNotificationsContext';
import { useAuth } from '@/context/AuthContext';
import { useCommunity } from '@/hooks/useCommunity';
import { useBlockedUsers } from '@/context/BlockedUsersContext';
import { withoutBlockedAuthors } from '@/utils/blockedUsers';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { Avatar } from '@/components/Avatar';
import { EVENTS } from '@/mock-data/events';
import { communityPostToEvent, formatEventDateParts, selectUpcomingEvents } from '@/utils/events';
import { getPinImageSource } from '@/utils/pinImage';
import { needsYouParts } from '@/utils/needsYou';
import { ADD_PINS_ROUTE } from '@/utils/addPinsOnboarding';
import type { PinHuntEvent } from '@/types/event';
import type { CommunityPost } from '@workspace/pin-repository';
import { tabScreenBottomPad } from '@/utils/tabBarSpace';
import { formatDayMonth } from '@/utils/format';

type Colors = ReturnType<typeof useColors>;
type IconName = React.ComponentProps<typeof Feather>['name'];

const LOGO = require('../../assets/images/pinhunt-logo.png');
const HOME_EVENTS = 2;
const THUMBS = 3;

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useProfile();
  const { user } = useAuth();
  const { collection } = useCollection();
  const { totalUnread } = useUnreadMessages();
  const { count: tradesWaiting } = useTradesWaiting();
  const { unseenCount } = useSubmissionNotifications();
  const { repo: userRepo } = useCommunity();
  const { pins, ensurePins } = usePinCatalogue();
  const [allPickupPosts, setPickupPosts] = useState<CommunityPost[]>([]);
  // Posts by collectors I blocked are hidden (B-P0-05b, #17).
  const { blockedIds } = useBlockedUsers();
  const pickupPosts = useMemo(() => withoutBlockedAuthors(allPickupPosts, blockedIds), [allPickupPosts, blockedIds]);
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = tabScreenBottomPad(insets.bottom + 92);

  useEffect(() => {
    let cancelled = false;
    setPickupPosts([]);
    if (!userRepo) return () => { cancelled = true; };
    userRepo.getCommunityFeed({ postType: 'new_pickup', limit: 2 })
      .then(posts => { if (!cancelled) setPickupPosts(posts); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userRepo, user?.id]);

  // Counting rules unchanged: Total pins = owned + for trade; ISO = wanted.
  const entries = Object.values(collection);
  const owned = useMemo(
    () => Object.values(collection).filter(entry => entry.status === 'owned' || entry.status === 'for_trade')
      .sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : a.dateAdded > b.dateAdded ? -1 : 0)),
    [collection],
  );
  const ownedCount = owned.length;
  const tradeCount = entries.filter(entry => entry.status === 'for_trade').length;
  const isoCount = entries.filter(entry => entry.status === 'wanted').length;

  // Up to three of the collector's newest pins for the Total pins tile.
  const byId = useMemo(() => new Map(pins.map(pin => [pin.id, pin])), [pins]);
  const thumbIds = owned.slice(0, THUMBS).map(entry => entry.pinId);
  const missingThumbs = thumbIds.filter(id => !byId.has(id)).join(',');
  useEffect(() => {
    if (missingThumbs) ensurePins(missingThumbs.split(',')).catch(() => {});
  }, [missingThumbs, ensurePins]);
  const thumbPins = thumbIds.map(id => byId.get(id)).filter(pin => pin !== undefined);

  const pickupPostById = useMemo(() => new Map(pickupPosts.map(post => [`community-${post.id}`, post])), [pickupPosts]);
  const events = useMemo(
    () => selectUpcomingEvents([...EVENTS, ...pickupPosts.map(communityPostToEvent)]).slice(0, HOME_EVENTS),
    [pickupPosts],
  );
  const needsYou = needsYouParts({ trades: tradesWaiting, messages: totalUnread, submissions: unseenCount });

  if (!user) return <View style={[styles.root, { backgroundColor: colors.homeBackground }]} />;

  const openPost = (post: CommunityPost) => router.push({ pathname: '/community/post/[id]', params: { id: post.id } });
  const handleViewEvent = (event: PinHuntEvent) => {
    if (event.sourceType === 'community') {
      const post = pickupPostById.get(event.id);
      if (post) openPost(post);
      return;
    }
    if (event.sourceUrl) Linking.openURL(event.sourceUrl);
  };

  return <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingTop: topPad + 12, paddingBottom: bottomPad }]}>
      <View style={styles.header}>
        <Image source={LOGO} style={styles.logo} accessible={false} />
        <Text accessibilityRole="header" style={[styles.brand, { color: colors.homeInk }]}>PinHunt</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={totalUnread > 0 ? `Messages, ${totalUnread} unread` : 'Messages'} onPress={() => router.push('/community/conversations')} style={[styles.round, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
          <Feather name="message-circle" size={20} color={colors.homeInk} />
          {totalUnread > 0 && <View style={[styles.badge, { backgroundColor: colors.homeSandInk, borderColor: colors.homeBackground }]}><Text maxFontSizeMultiplier={fontScale.badge} style={[styles.badgeText, { color: colors.homeSurface }]}>{totalUnread > 9 ? '9+' : totalUnread}</Text></View>}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push('/edit-profile')} style={styles.avatar}>
          <Avatar uri={profile?.avatarUrl ?? null} name={profile?.username ?? '?'} size={44} />
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <StatTile
          testID="home-stat-total"
          value={ownedCount}
          label="Total pins"
          a11y={`${ownedCount} total pins. Open your collection`}
          onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'all' } })}
          bg={colors.homeSurface} line={colors.homeLine} labelColor={colors.homeMuted} colors={colors}
          art={<View style={styles.thumbs}>
            {thumbPins.length > 0
              ? thumbPins.map((pin, i) => <PinImage key={pin.id} source={getPinImageSource(pin)} accessible={false} contentFit="contain" style={[styles.thumb, i > 0 && styles.thumbOverlap, { backgroundColor: colors.homeAqua, borderColor: colors.homeSurface }]} />)
              : [0, 1, 2].map(i => <View key={i} style={[styles.thumb, styles.thumbEmpty, i > 0 && styles.thumbOverlap, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]} />)}
          </View>}
        />
        <StatTile
          testID="home-stat-iso"
          value={isoCount}
          label="ISO"
          a11y={`${isoCount} ISO. Open your ISO list`}
          onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'iso' } })}
          bg={colors.homeWarmSurface} line={colors.homeWarmLine} labelColor={colors.homeSandInk} colors={colors}
          art={<TileIcon name="heart" color={colors.homeSandInk} colors={colors} />}
        />
        <StatTile
          testID="home-stat-trade"
          value={tradeCount}
          label="For trade"
          a11y={`${tradeCount} for trade. Open your For Trade list`}
          onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'traders' } })}
          bg={colors.homeAqua} line={colors.homeLine} labelColor={colors.homeCoralDeep} colors={colors}
          art={<TileIcon name="repeat" color={colors.homeCoralDeep} colors={colors} />}
        />
      </View>

      {/* A brand-new collector: the one starter line (replaces Get started on Home). Right under the
          tiles so it stays above the fold on small phones. */}
      {ownedCount === 0 && <SlimLine
        testID="home-add-first"
        text="Add the pins you own"
        a11y="Add the pins you own. Pick a set and tap Select all"
        icon="plus"
        onPress={() => router.push(ADD_PINS_ROUTE)}
        colors={colors}
      />}

      <View style={styles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Find a pin. Scan to identify and price it" onPress={() => router.push('/(tabs)/scan')} activeOpacity={0.9} style={styles.half}>
          <LinearGradient colors={[colors.homeCoral, colors.homeCoralDeep]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={[styles.action, styles.fill, { shadowColor: colors.homeShadow }]}>
            <View style={[styles.actionIcon, { backgroundColor: colors.homeSurface + '2E' }]}><Feather name="maximize" size={22} color={colors.homeSurface} /></View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: colors.homeSurface }]}>Find a pin</Text>
              <Text style={[styles.actionDetail, { color: colors.homeSurface }]}>Scan to identify and price it</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
        {/* The existing photo-first submission flow: photo, AI "already in the catalogue?" check, details, admin review. */}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Submit a new pin. Not in the catalogue? Add it" onPress={() => router.push('/add-pin')} activeOpacity={0.85} style={styles.half}>
          {/* Padding and border sit on this inner view, like Find a pin's gradient, so both cards get the same width. */}
          <View style={[styles.action, styles.submit, styles.fill, { backgroundColor: colors.homeSurface, borderColor: colors.homeCoral }]}>
            <View style={[styles.actionIcon, { backgroundColor: colors.homeAqua }]}><Feather name="plus" size={22} color={colors.homeCoralDeep} /></View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: colors.homeInk }]}>Submit a new pin</Text>
              <Text style={[styles.actionDetail, { color: colors.homeMuted }]}>Not in the catalogue? Add it</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {needsYou.length > 0 && <SlimLine
        testID="home-needs-you"
        text={needsYou.map(part => part.text).join(' · ')}
        a11y={`${needsYou.map(part => part.text).join('. ')}.`}
        onPress={() => router.push(needsYou[0].route)}
        colors={colors}
      />}

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.homeInk }]}>Events</Text>
          <Button variant="text" label="See all" accessibilityLabel="See all: Events" onPress={() => router.push('/events')} style={styles.seeAll} />
        </View>
        {events.length > 0 ? (
          <View style={styles.row}>
            {events.map(event => <EventTile key={event.id} event={event} onPress={() => handleViewEvent(event)} colors={colors} />)}
            {events.length === 1 && <View style={styles.half} />}
          </View>
        ) : (
          // Never vanish silently when the list runs out (#352).
          <TouchableOpacity testID="no-events-card" accessibilityRole="button" accessibilityLabel="No events coming up. Post an event" onPress={() => router.push({ pathname: '/community/create-post', params: { type: 'new_pickup' } })} activeOpacity={0.8} style={[styles.noEvents, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
            <View style={[styles.dateBlock, { backgroundColor: colors.homeAqua }]}><Feather name="calendar" size={20} color={colors.homeCoralDeep} /></View>
            <View style={styles.flex}>
              <Text style={[styles.eventTitle, { color: colors.homeInk }]}>No events coming up</Text>
              <Text style={[styles.eventMeta, { color: colors.homeMuted }]}>Know of a pin meet-up? Post an event</Text>
            </View>
            <Feather name="plus" size={18} color={colors.homeCoralDeep} />
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
    <AddPinsWelcomeSheet />
  </View>;
}

function StatTile({ testID, value, label, a11y, onPress, bg, line, labelColor, art, colors }: {
  testID: string; value: number; label: string; a11y: string; onPress: () => void;
  bg: string; line: string; labelColor: string; art: React.ReactNode; colors: Colors;
}) {
  return <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} activeOpacity={0.85} style={[styles.tile, { backgroundColor: bg, borderColor: line }]}>
    {art}
    <View>
      <Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={fontScale.dense} style={[styles.tileValue, { color: colors.homeInk }]}>{value}</Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={fontScale.dense} style={[styles.tileLabel, { color: labelColor }]}>{label}</Text>
    </View>
  </TouchableOpacity>;
}

function TileIcon({ name, color, colors }: { name: IconName; color: string; colors: Colors }) {
  return <View style={[styles.tileIcon, { backgroundColor: colors.homeSurface }]}><Feather name={name} size={16} color={color} /></View>;
}

function SlimLine({ testID, text, a11y, onPress, colors, icon }: { testID: string; text: string; a11y: string; onPress: () => void; colors: Colors; icon?: IconName }) {
  return <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} activeOpacity={0.8} style={[styles.slim, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
    {icon ? <Feather name={icon} size={16} color={colors.homeCoralDeep} /> : <View style={[styles.dot, { backgroundColor: colors.homeSandInk }]} />}
    <Text numberOfLines={1} style={[styles.slimText, { color: colors.homeInk }]}>{text}</Text>
    <Feather name="chevron-right" size={16} color={colors.homeMuted} />
  </TouchableOpacity>;
}

function EventTile({ event, onPress, colors }: { event: PinHuntEvent; onPress: () => void; colors: Colors }) {
  const dated = event.hasScheduledDate && !event.rumour;
  // The block has room for one date: the start. The spoken label keeps the range.
  const { day, month } = formatDayMonth(new Date(`${event.eventDate}T00:00:00`));
  const range = formatEventDateParts(event);
  const when = dated ? `${range.day} ${range.month}` : event.rumour ? (event.whenText ?? 'Date to be confirmed') : 'Community post';
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={[event.title, when, event.location].filter(Boolean).join(', ')} onPress={onPress} activeOpacity={0.85} style={[styles.half, styles.eventTile, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
    <View style={[styles.dateBlock, { backgroundColor: colors.homeAqua }]}>
      {dated ? <>
        <Text maxFontSizeMultiplier={fontScale.badge} style={[styles.dateMonth, { color: colors.homeCoralDeep }]}>{month}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={fontScale.badge} style={[styles.dateDay, { color: colors.homeCoralDeep }]}>{day}</Text>
      </> : <Feather name={event.rumour ? 'help-circle' : 'users'} size={20} color={colors.homeCoralDeep} />}
    </View>
    <View style={styles.flex}>
      <Text numberOfLines={2} maxFontSizeMultiplier={fontScale.dense} style={[styles.eventTitle, { color: colors.homeInk }]}>{event.title}</Text>
      {!!event.location && <View style={styles.place}>
        <Feather name="map-pin" size={11} color={colors.homeMuted} />
        <Text numberOfLines={1} maxFontSizeMultiplier={fontScale.dense} style={[styles.eventMeta, styles.flex, { color: colors.homeMuted }]}>{event.location}</Text>
      </View>}
    </View>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  logo: { width: 40, height: 40, borderRadius: 11 },
  brand: { flex: 1, fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, minWidth: 0 },
  // Fills the card's button, so the taller card sets the height of both.
  fill: { flexGrow: 1 },
  tile: { flex: 1, minWidth: 0, gap: 10, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
  tileValue: { fontSize: 26, lineHeight: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  tileLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  tileIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  thumbs: { flexDirection: 'row', height: 32, alignItems: 'center' },
  thumb: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, overflow: 'hidden' },
  thumbEmpty: { borderStyle: 'dashed', borderWidth: 1.5 },
  thumbOverlap: { marginLeft: -10 },
  action: { minHeight: 150, borderRadius: 24, paddingVertical: 18, paddingHorizontal: 16, gap: 14, justifyContent: 'space-between', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  submit: { borderWidth: 1.5, borderStyle: 'dashed', shadowOpacity: 0, elevation: 0 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionText: { gap: 4 },
  actionTitle: { fontSize: 17, lineHeight: 21, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  actionDetail: { fontSize: 13, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  slim: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  slimText: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  section: { marginTop: 6, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 2 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  seeAll: { marginVertical: -12, marginRight: -8 },
  eventTile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 16, borderWidth: 1 },
  noEvents: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingRight: 14, borderRadius: 16, borderWidth: 1 },
  dateBlock: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dateMonth: { fontSize: 10, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  dateDay: { fontSize: 18, lineHeight: 21, fontFamily: 'Inter_700Bold' },
  eventTitle: { fontSize: 13, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  eventMeta: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
});
