/**
 * Collector Profile screen — public profile view.
 * Accessible from Find Collectors, Collectors Nearby, or any deep-link to /collector/:username.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useProfile } from '@/context/ProfileContext';
import { useMarketplace } from '@/hooks/useMarketplace';
import { Avatar } from '@/components/Avatar';
import { Chip } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import type { PotentialTradePin, PublicProfile } from '@workspace/pin-repository';

// ─── Potential trade row ──────────────────────────────────────────────────────

function PotentialTradeRow({
  pin,
}: {
  pin: PotentialTradePin;
}) {
  const colors = useColors();
  const isTheyHave = pin.direction === 'they_have_i_want';
  const tone = isTheyHave ? colors.wanted : colors.forTrade;
  return (
    <View
      style={[
        styles.tradePin,
        { backgroundColor: tone + '14', borderColor: tone + '40' },
      ]}
    >
      {pin.imageUrl ? (
        <Image source={{ uri: pin.imageUrl }} style={styles.tradePinThumb} />
      ) : (
        <View style={[styles.tradePinIcon, { backgroundColor: tone + '26' }]}>
          <Feather name={isTheyHave ? 'download' : 'upload'} size={12} color={tone} />
        </View>
      )}
      <Text style={[styles.tradePinTitle, { color: colors.homeInk }]} numberOfLines={2}>
        {pin.title}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CollectorProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { getPublicProfile } = useProfile();

  const { repo, userId } = useMarketplace();
  // currentUserId used for the Message button guard (don't show message button to yourself)
  const currentUserId = userId;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rating, setRating] = useState<{ positive: number; total: number } | null>(null);

  const [potentialTrades, setPotentialTrades] = useState<PotentialTradePin[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [startingTrade, setStartingTrade] = useState(false);

  // Load public profile
  useEffect(() => {
    if (!username) return;
    setLoading(true);
    getPublicProfile(username)
      .then(p => {
        if (!p) { setNotFound(true); return; }
        setProfile(p);
        if (repo) {
          repo.getTraderRating(p.id)
            .then(r => setRating(r))
            .catch(() => {});
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [username, getPublicProfile, repo]);

  // Load potential trades once we have both IDs
  const loadPotentialTrades = useCallback(async () => {
    if (!repo || !userId || !profile) return;
    setTradesLoading(true);
    try {
      const trades = await repo.getPotentialTrades({ viewerId: userId, collectorId: profile.id });
      setPotentialTrades(trades);
    } catch {
      // Non-critical — silently ignore
    } finally {
      setTradesLoading(false);
    }
  }, [repo, userId, profile]);

  useEffect(() => { loadPotentialTrades(); }, [loadPotentialTrades]);

  // Start a conversation (create trade + navigate to chat)
  const handleStartConversation = async () => {
    if (!repo || !userId || !profile || startingTrade) return;
    setStartingTrade(true);
    try {
      const trade = await repo.createTrade(userId, profile.id);
      router.push({ pathname: '/trade/[id]', params: { id: trade.id } });
    } catch {
      // silently ignore
    } finally {
      setStartingTrade(false);
    }
  };

  const theyHaveIWant = potentialTrades.filter(p => p.direction === 'they_have_i_want');
  const iHaveTheyWant = potentialTrades.filter(p => p.direction === 'i_have_they_want');
  const hasPotentialTrades = potentialTrades.length > 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: profile?.username ? `@${profile.username}` : 'Collector',
          headerBackTitle: 'Back',
        }}
      />
      <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
        {loading ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.homeCoral} />
          </View>
        ) : notFound || !profile ? (
          <View style={styles.centred}>
            <Feather name="user-x" size={40} color={colors.homeMuted} />
            <Text style={[styles.notFoundTitle, { color: colors.homeInk }]}>Profile Not Found</Text>
            <Text style={[styles.notFoundText, { color: colors.homeMuted }]}>
              This profile is private or doesn't exist.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}
          >
            {/* Avatar + identity */}
            <View style={[styles.hero, { backgroundColor: colors.homeSurface, borderBottomColor: colors.homeLine }]}>
              <Avatar uri={profile.avatarUrl} name={profile.username} size={88} style={styles.avatar} />
              <Text style={[styles.displayName, { color: colors.homeInk }]}>
                @{profile.username}
              </Text>

              {/* Location */}
              {(profile.town || profile.county) ? (
                <View style={styles.metaRow}>
                  <Feather name="map-pin" size={13} color={colors.homeMuted} />
                  <Text style={[styles.metaText, { color: colors.homeMuted }]}>
                    {[profile.town, profile.county].filter(Boolean).join(', ')}
                  </Text>
                </View>
              ) : profile.tradingRegion ? (
                <View style={styles.metaRow}>
                  <Feather name="map-pin" size={13} color={colors.homeMuted} />
                  <Text style={[styles.metaText, { color: colors.homeMuted }]}>{profile.tradingRegion}</Text>
                </View>
              ) : null}

              {/* Trade preference badges */}
              <View style={styles.badgeRow}>
                {profile.internationalTradingEnabled && (
                  <Chip icon="globe" label="Open to international trades" tone="coral" variant="soft" size="sm" />
                )}
                {profile.openToLocalTrades && (
                  <Chip icon="map-pin" label="Local trades" tone="coral" variant="soft" size="sm" />
                )}
                {profile.openToPostalTrades && (
                  <Chip icon="package" label="Postal trades" tone="neutral" variant="soft" size="sm" />
                )}
                {profile.happyToTravel && (
                  <Chip icon="navigation" label="Happy to travel" tone="neutral" variant="soft" size="sm" />
                )}
              </View>

              {/* Trade rating badge */}
              {rating !== null && rating.total > 0 && (() => {
                const pct = Math.round((rating.positive / rating.total) * 100);
                const color = pct >= 80 ? colors.owned : pct >= 50 ? colors.homeSandInk : colors.destructive;
                return (
                  <View style={[styles.ratingBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                    <Text style={{ fontSize: 12 }}>👍</Text>
                    <Text style={[styles.ratingBadgeText, { color }]}>
                      {rating.total} trade{rating.total !== 1 ? 's' : ''} · {pct}% positive
                    </Text>
                  </View>
                );
              })()}
              {rating !== null && rating.total === 0 && (
                <Chip label="No trade ratings yet" tone="neutral" variant="soft" size="sm" />
              )}

              {/* Message button — hidden when Potential Trade Match below already
                  surfaces Start Conversation as the primary way to reach out. */}
              {currentUserId && profile.id !== currentUserId && !hasPotentialTrades && (
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/community/start-conversation' as any,
                      params: { recipientId: profile.id, recipientName: profile.username },
                    })
                  }
                  activeOpacity={0.85}
                  style={[styles.messageBtn, { backgroundColor: colors.homeCoral, shadowColor: colors.homeShadow }]}
                >
                  <Feather name="mail" size={14} color={colors.homeSurface} />
                  <Text style={[styles.messageBtnLabel, { color: colors.homeSurface }]}>Message</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Bio */}
            {profile.bio ? (
              <View style={[styles.section, { marginHorizontal: spacing.lg, marginTop: spacing.xl }]}>
                <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>ABOUT</Text>
                <View style={[styles.bioCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                  <Text style={[styles.bioText, { color: colors.homeInk }]}>{profile.bio}</Text>
                </View>
              </View>
            ) : null}

            {/* ── Potential trades ── */}
            {(hasPotentialTrades || tradesLoading) && (
              <View style={[styles.section, { marginHorizontal: spacing.lg, marginTop: spacing.xl }]}>
                <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>POTENTIAL TRADE MATCH</Text>

                {tradesLoading ? (
                  <ActivityIndicator color={colors.homeCoral} style={{ marginTop: spacing.sm }} />
                ) : (
                  <View
                    style={[
                      styles.tradeMatchCard,
                      { backgroundColor: colors.homeSurface, borderColor: colors.homeLine },
                    ]}
                  >
                    {theyHaveIWant.length > 0 && (
                      <View style={styles.tradeGroup}>
                        <Chip
                          icon="download"
                          label={`${theyHaveIWant.length} pin${theyHaveIWant.length !== 1 ? 's' : ''} you want`}
                          tone="wanted"
                          variant="solid"
                        />
                        <View style={styles.tradePins}>
                          {theyHaveIWant.slice(0, 5).map(p => (
                            <PotentialTradeRow key={p.pinId} pin={p} />
                          ))}
                          {theyHaveIWant.length > 5 && (
                            <Text style={[styles.moreLabel, { color: colors.homeMuted }]}>
                              +{theyHaveIWant.length - 5} more
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                    {theyHaveIWant.length > 0 && iHaveTheyWant.length > 0 && (
                      <View style={[styles.tradeDivider, { backgroundColor: colors.homeLine }]} />
                    )}
                    {iHaveTheyWant.length > 0 && (
                      <View style={styles.tradeGroup}>
                        <Chip
                          icon="upload"
                          label={`${iHaveTheyWant.length} pin${iHaveTheyWant.length !== 1 ? 's' : ''} they want`}
                          tone="forTrade"
                          variant="solid"
                        />
                        <View style={styles.tradePins}>
                          {iHaveTheyWant.slice(0, 5).map(p => (
                            <PotentialTradeRow key={p.pinId} pin={p} />
                          ))}
                          {iHaveTheyWant.length > 5 && (
                            <Text style={[styles.moreLabel, { color: colors.homeMuted }]}>
                              +{iHaveTheyWant.length - 5} more
                            </Text>
                          )}
                        </View>
                      </View>
                    )}

                    {/* Safety note — compact, not the full guidance paragraph */}
                    <View style={styles.safetyNote}>
                      <Feather name="shield" size={11} color={colors.homeMuted} />
                      <Text style={[styles.safetyText, { color: colors.homeMuted }]}>Trading safely</Text>
                    </View>

                    {/* Start conversation button */}
                    <TouchableOpacity
                      onPress={handleStartConversation}
                      activeOpacity={0.85}
                      disabled={startingTrade}
                      style={[styles.convoBtn, { backgroundColor: colors.homeCoral, shadowColor: colors.homeShadow }]}
                    >
                      {startingTrade ? (
                        <ActivityIndicator color={colors.homeSurface} size="small" />
                      ) : (
                        <>
                          <Feather name="message-circle" size={16} color={colors.homeSurface} />
                          <Text style={[styles.convoBtnText, { color: colors.homeSurface }]}>Start Conversation</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  notFoundTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginTop: spacing.sm },
  notFoundText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: spacing.xxxl },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xxxl + spacing.xs,
    paddingBottom: spacing.xxl + spacing.xs,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { marginBottom: spacing.xs },
  displayName: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  ratingBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  section: { gap: spacing.sm },
  sectionLabel: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  bioCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  bioText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },

  messageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md - 2, marginTop: spacing.xs,
    borderRadius: radius.md,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  messageBtnLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Potential trades
  tradeMatchCard: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  tradeGroup: { padding: spacing.lg - 2, gap: spacing.sm },
  tradePins: { gap: spacing.xs + 2 },
  tradePin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm + 1,
  },
  tradePinIcon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  tradePinThumb: {
    width: 22, height: 22, borderRadius: 6,
  },
  tradePinTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  moreLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingLeft: spacing.xs },
  tradeDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.lg - 2 },
  safetyNote: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  safetyText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  convoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    margin: spacing.lg - 2,
    marginTop: spacing.xs,
    paddingVertical: spacing.md + 1,
    borderRadius: radius.md,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  convoBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
