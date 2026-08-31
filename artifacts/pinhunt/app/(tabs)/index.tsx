import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useCollection } from '@/context/CollectionContext';
import { useProfile } from '@/context/ProfileContext';
import { useUnreadMessages } from '@/context/UnreadMessagesContext';
import { useSubmissionNotifications } from '@/context/SubmissionNotificationsContext';
import { useAuth } from '@/context/AuthContext';
import { useCommunity } from '@/hooks/useCommunity';
import { usePinCatalogue } from '@/context/PinCatalogueContext';
import { Avatar } from '@/components/Avatar';
import type { CommunityPost, PinSetSummary } from '@workspace/pin-repository';

function timeAgo(value: string) {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
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
  const [pickupPosts, setPickupPosts] = useState<CommunityPost[]>([]);
  const [officialPost, setOfficialPost] = useState<CommunityPost | null>(null);
  const [activeSet, setActiveSet] = useState<PinSetSummary | null>(null);
  const [activeSetOwnerId, setActiveSetOwnerId] = useState<string | null>(null);
  const [activeSetLoading, setActiveSetLoading] = useState(false);
  const orbit = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const firstName = profile?.displayName?.split(' ')[0] ?? profile?.username ?? null;
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === 'web' ? 104 : insets.bottom + 92;

  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    const stopAnimation = () => {
      animation?.stop();
      animation = undefined;
      orbit.stopAnimation();
      drift.stopAnimation();
      orbit.setValue(0);
      drift.setValue(0);
    };
    const updateMotion = (reduced: boolean) => {
      if (!mounted) return;
      stopAnimation();
      if (reduced) return;
      const useNativeDriver = Platform.OS !== 'web';
      animation = Animated.loop(Animated.parallel([
        Animated.sequence([Animated.timing(orbit, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.ease), useNativeDriver }), Animated.timing(orbit, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.ease), useNativeDriver })]),
        Animated.sequence([Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver }), Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver })]),
      ]));
      animation.start();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(updateMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', updateMotion);
    return () => {
      mounted = false;
      subscription.remove();
      stopAnimation();
    };
  }, [drift, orbit]);

  useEffect(() => {
    let cancelled = false;
    setPickupPosts([]);
    setOfficialPost(null);
    if (!userRepo) return () => { cancelled = true; };
    Promise.all([
      userRepo.getCommunityFeed({ postType: 'new_pickup', limit: 2 }),
      userRepo.getCommunityFeed({ limit: 20 }),
    ]).then(([pickups, general]) => {
      if (cancelled) return;
      setPickupPosts(pickups);
      setOfficialPost(general.find(post => post.authorProfile?.isAdmin) ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userRepo, user?.id]);

  useEffect(() => {
    let cancelled = false;
    setActiveSet(null); setActiveSetOwnerId(null); setActiveSetLoading(false);
    if (!catRepo || !user?.id) return () => { cancelled = true; };
    const ownedEntries = Object.values(collection).filter(entry => entry.status === 'owned' || entry.status === 'for_trade').sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
    if (!ownedEntries.length) return () => { cancelled = true; };
    Promise.all([catRepo.getPinsByIds(ownedEntries.map(entry => entry.pinId)), catRepo.getSetSummaries()]).then(([ownedPins, summaries]) => {
      if (cancelled) return;
      const pinMap = new Map(ownedPins.map(pin => [pin.id, pin]));
      const sets = new Map(summaries.map(summary => [summary.setName, summary]));
      const automaticSet = ownedEntries.map(entry => pinMap.get(entry.pinId)?.collection).filter((name): name is string => Boolean(name)).map(name => sets.get(name)).find((summary): summary is PinSetSummary => Boolean(summary));
      if (!automaticSet) return;
      setActiveSet(automaticSet); setActiveSetOwnerId(user.id); setActiveSetLoading(true);
      ensureCollections([automaticSet.setName]).catch(() => {}).finally(() => { if (!cancelled) setActiveSetLoading(false); });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [catRepo, user?.id, collection, ensureCollections]);

  const ownedCount = Object.values(collection).filter(entry => entry.status === 'owned' || entry.status === 'for_trade').length;
  const tradeCount = Object.values(collection).filter(entry => entry.status === 'for_trade').length;
  const isoCount = Object.values(collection).filter(entry => entry.status === 'wanted').length;
  const visibleSet = activeSetOwnerId === user?.id ? activeSet : null;
  const progress = useMemo(() => {
    if (!visibleSet) return null;
    const setPins = pins.filter(pin => pin.collection === visibleSet.setName);
    const owned = setPins.filter(pin => ['owned', 'for_trade'].includes(collection[pin.id]?.status ?? '')).length;
    return { owned, total: setPins.length };
  }, [visibleSet, pins, collection]);
  const forYou = [
    totalUnread ? { id: 'messages', icon: 'message-circle' as const, title: 'New messages', detail: `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`, action: () => router.push('/community/conversations'), tone: colors.homeCoral } : null,
    unseenCount ? { id: 'submissions', icon: 'bell' as const, title: 'Submission update', detail: `${unseenCount} unseen update${unseenCount === 1 ? '' : 's'}`, action: () => router.push('/my-submissions'), tone: colors.homeSandInk } : null,
  ].filter(Boolean) as Array<{ id: string; icon: React.ComponentProps<typeof Feather>['name']; title: string; detail: string; action: () => void; tone: string }>;

  if (!user) return <View style={[styles.root, { backgroundColor: colors.homeBackground }]} />;
  const translateOrbit = orbit.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const translateDrift = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });
  const openPost = (post: CommunityPost) => router.push({ pathname: '/community/post/[id]', params: { id: post.id } });

  return <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingTop: topPad + 12, paddingBottom: bottomPad }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Open profile" onPress={() => router.push('/profile')} style={styles.headerLeft}>
          <Avatar uri={profile?.avatarUrl ?? null} name={profile?.username ?? '?'} size={42} />
          <View><Text style={[styles.welcome, { color: colors.homeMuted }]}>{greeting()}</Text><Text style={[styles.name, { color: colors.homeInk }]}>{firstName ? `Hi, ${firstName}` : 'Hi there'}</Text></View>
        </TouchableOpacity>
        <View style={styles.tools}>
          <IconButton icon="message-square" count={totalUnread} onPress={() => router.push('/community/conversations')} colors={colors} label="Messages" />
          <IconButton icon="bell" count={unseenCount} onPress={() => router.push('/my-submissions')} colors={colors} label="Notifications" />
        </View>
      </View>
      <View style={[styles.stats, { borderColor: colors.homeLine }]}>
        <Stat value={ownedCount} label="pins" onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'boards' } })} colors={colors} />
        <Stat value={tradeCount} label="traders" onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'traders' } })} colors={colors} />
        <Stat value={isoCount} label="ISO" onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'iso' } })} colors={colors} last />
      </View>
      <TouchableOpacity accessibilityLabel="Find a Pin, scan or search the catalogue" onPress={() => router.push('/(tabs)/scan')} activeOpacity={0.9}>
        <LinearGradient colors={[colors.homeCoralDeep, colors.homeCoral, colors.homeSand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { shadowColor: colors.homeShadow }]}>
          <Animated.View pointerEvents="none" style={[styles.heroRing, { borderColor: colors.homeSand, transform: [{ translateX: translateOrbit }, { translateY: translateOrbit }] }]} />
          <Animated.View pointerEvents="none" style={[styles.heroOrbit, { borderColor: colors.homeSurface, transform: [{ translateX: translateDrift }, { rotate: '-20deg' }] }]} />
          <View><Text style={[styles.heroKicker, { color: colors.homeHeroMuted }]}>✦  START HERE</Text><Text style={[styles.heroTitle, { color: colors.homeHeroText }]}>Find a Pin</Text><Text style={[styles.heroSubtitle, { color: colors.homeHeroSubtitle }]}>Scan or search the catalogue</Text></View>
          <View style={[styles.heroIcon, { backgroundColor: colors.homeSurface }]}><Feather name="search" size={23} color={colors.homeCoralDeep} /></View>
        </LinearGradient>
      </TouchableOpacity>
      <View style={styles.shortcuts}>
        <Shortcut icon="heart" label={'My\nCollection'} tone={colors.homeCoralDeep} onPress={() => router.push({ pathname: '/(tabs)/collection', params: { tab: 'boards' } })} colors={colors} />
        <Shortcut icon="compass" label={'Find\nTrades'} tone={colors.homeSandInk} onPress={() => router.push('/(tabs)/trades')} colors={colors} />
        <Shortcut icon="users" label="Community" tone={colors.homeTealSoft} onPress={() => router.push('/(tabs)/community')} colors={colors} />
      </View>
      {(officialPost || forYou.length > 0) && <Section title="For You" colors={colors}>
        {officialPost && <TouchableOpacity onPress={() => openPost(officialPost)} activeOpacity={0.8} style={[styles.official, { backgroundColor: colors.homeWarmSurface, borderColor: colors.homeWarmLine }]}>
          <View style={[styles.cardIcon, { backgroundColor: colors.homeTeal }]}><Feather name="calendar" size={18} color={colors.homeSand} /></View><View style={styles.cardText}><Text style={[styles.officialKicker, { color: colors.homeCoralDeep }]}>PINHUNT UK · OFFICIAL</Text><Text numberOfLines={2} style={[styles.cardTitle, { color: colors.homeInk }]}>{officialPost.body}</Text><Text numberOfLines={1} style={[styles.cardDetail, { color: colors.homeMuted }]}>{officialPost.locationText || timeAgo(officialPost.createdAt)}</Text></View><Feather name="chevron-right" size={18} color={colors.homeMuted} />
        </TouchableOpacity>}
        {forYou.map(item => <TouchableOpacity key={item.id} onPress={item.action} activeOpacity={0.8} style={[styles.update, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}><View style={[styles.cardIcon, { backgroundColor: item.tone + '25' }]}><Feather name={item.icon} size={18} color={item.tone} /></View><View style={styles.cardText}><Text style={[styles.cardTitle, { color: colors.homeInk }]}>{item.title}</Text><Text style={[styles.cardDetail, { color: colors.homeMuted }]}>{item.detail}</Text></View><Feather name="chevron-right" size={18} color={colors.homeMuted} /></TouchableOpacity>)}
      </Section>}
      {pickupPosts.length > 0 && <Section title="What’s Happening" colors={colors}>{pickupPosts.map(post => <TouchableOpacity key={post.id} onPress={() => openPost(post)} activeOpacity={0.8} style={[styles.happening, { backgroundColor: colors.homeAqua, borderColor: colors.homeLine }]}><View style={[styles.bubble, { backgroundColor: colors.homeCoral }]}><Feather name="message-circle" size={17} color={colors.homeSurface} /></View><View style={styles.cardText}><Text numberOfLines={2} style={[styles.cardTitle, { color: colors.homeInk }]}>{post.body}</Text><Text numberOfLines={1} style={[styles.cardDetail, { color: colors.homeMuted }]}>{post.authorProfile?.displayName || post.authorProfile?.username || 'Unknown'} · {timeAgo(post.createdAt)}</Text></View></TouchableOpacity>)}</Section>}
      {visibleSet && !activeSetLoading && progress && progress.total > 0 && <Section title="Continue Collecting" colors={colors} action={() => router.push({ pathname: '/set/[collection]', params: { collection: visibleSet.setName } })}><TouchableOpacity onPress={() => router.push({ pathname: '/set/[collection]', params: { collection: visibleSet.setName } })} style={[styles.collect, { backgroundColor: colors.homeTeal }]}><View style={styles.cardText}><Text numberOfLines={1} style={[styles.collectTitle, { color: colors.homeCollectText }]}>{visibleSet.setName}</Text><Text style={[styles.collectDetail, { color: colors.homeAqua }]}>{progress.owned} of {progress.total} collected</Text><View style={[styles.progressTrack, { backgroundColor: colors.homeTealSoft }]}><View style={[styles.progressFill, { backgroundColor: colors.homeSand, width: `${Math.round(progress.owned / progress.total * 100)}%` }]} /></View></View><View style={[styles.percent, { borderColor: colors.homeSand }]}><Text style={[styles.percentText, { color: colors.homeCollectText }]}>{Math.round(progress.owned / progress.total * 100)}%</Text></View></TouchableOpacity></Section>}
    </ScrollView>
  </View>;
}

function IconButton({ icon, count, onPress, colors, label }: { icon: React.ComponentProps<typeof Feather>['name']; count: number; onPress: () => void; colors: ReturnType<typeof useColors>; label: string }) { return <TouchableOpacity accessibilityLabel={label} onPress={onPress} style={[styles.iconButton, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}><Feather name={icon} size={20} color={colors.homeInk} />{count > 0 && <View style={[styles.badge, { backgroundColor: colors.homeCoralDeep, borderColor: colors.homeBackground }]}><Text style={[styles.badgeText, { color: colors.homeSurface }]}>{count > 9 ? '9+' : count}</Text></View>}</TouchableOpacity>; }
function Stat({ value, label, onPress, colors, last }: { value: number; label: string; onPress: () => void; colors: ReturnType<typeof useColors>; last?: boolean }) { return <TouchableOpacity onPress={onPress} style={[styles.stat, !last && { borderRightColor: colors.homeLine, borderRightWidth: 1 }]}><Text style={[styles.statValue, { color: colors.homeCoralDeep }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.homeMuted }]}>{label}</Text></TouchableOpacity>; }
function Shortcut({ icon, label, tone, onPress, colors }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; tone: string; onPress: () => void; colors: ReturnType<typeof useColors> }) { return <TouchableOpacity onPress={onPress} style={[styles.shortcut, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}><Feather name={icon} size={19} color={tone} /><Text style={[styles.shortcutLabel, { color: colors.homeInk }]}>{label}</Text></TouchableOpacity>; }
function Section({ title, children, colors, action }: { title: string; children: React.ReactNode; colors: ReturnType<typeof useColors>; action?: () => void }) { return <View style={styles.section}><View style={styles.sectionHead}><Text style={[styles.sectionTitle, { color: colors.homeInk }]}>{title}</Text>{action && <TouchableOpacity onPress={action}><Text style={[styles.seeAll, { color: colors.homeCoralDeep }]}>View set</Text></TouchableOpacity>}</View><View style={styles.sectionContent}>{children}</View></View>; }

const styles = StyleSheet.create({
  root: { flex: 1 }, scroll: { paddingHorizontal: 16 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }, welcome: { fontSize: 11, fontFamily: 'Inter_600SemiBold' }, name: { fontSize: 20, lineHeight: 23, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 }, tools: { flexDirection: 'row', gap: 8 }, iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, badge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, badgeText: { fontSize: 9, fontFamily: 'Inter_700Bold' }, stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 10, marginBottom: 18 }, stat: { flex: 1, paddingHorizontal: 8 }, statValue: { fontSize: 17, lineHeight: 19, fontFamily: 'Inter_700Bold' }, statLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' }, hero: { minHeight: 139, borderRadius: 25, padding: 18, overflow: 'hidden', justifyContent: 'center', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 5 }, heroRing: { position: 'absolute', width: 145, height: 145, borderWidth: 24, borderRadius: 73, right: -52, bottom: -65, opacity: 0.45 }, heroOrbit: { position: 'absolute', width: 190, height: 70, borderWidth: 1, borderRadius: 100, right: -40, top: 22, opacity: 0.35, transform: [{ rotate: '-20deg' }] }, heroKicker: { fontSize: 11, letterSpacing: 1, fontFamily: 'Inter_700Bold' }, heroTitle: { fontSize: 28, lineHeight: 31, letterSpacing: -1.1, fontFamily: 'Inter_700Bold', marginTop: 6 }, heroSubtitle: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 3 }, heroIcon: { position: 'absolute', right: 20, bottom: 19, width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, shortcuts: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 2 }, shortcut: { flex: 1, minHeight: 78, borderWidth: 1, borderRadius: 18, padding: 10, justifyContent: 'space-between' }, shortcutLabel: { fontSize: 11, lineHeight: 13, fontFamily: 'Inter_700Bold' }, section: { marginTop: 20 }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 2, marginBottom: 9 }, sectionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 }, seeAll: { fontSize: 11, fontFamily: 'Inter_700Bold' }, sectionContent: { gap: 9 }, official: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 21, padding: 11 }, update: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 20, padding: 11 }, happening: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 20, padding: 11 }, cardIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, bubble: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, cardText: { flex: 1, minWidth: 0 }, officialKicker: { fontSize: 9, letterSpacing: 0.7, fontFamily: 'Inter_700Bold', marginBottom: 2 }, cardTitle: { fontSize: 12, lineHeight: 15, fontFamily: 'Inter_600SemiBold' }, cardDetail: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 3 }, collect: { minHeight: 100, flexDirection: 'row', alignItems: 'center', borderRadius: 22, padding: 14, gap: 12 }, collectTitle: { fontSize: 14, lineHeight: 17, fontFamily: 'Inter_700Bold' }, collectDetail: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 3 }, progressTrack: { height: 5, borderRadius: 3, marginTop: 8, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 3 }, percent: { width: 48, height: 48, borderRadius: 24, borderWidth: 4, alignItems: 'center', justifyContent: 'center' }, percentText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});