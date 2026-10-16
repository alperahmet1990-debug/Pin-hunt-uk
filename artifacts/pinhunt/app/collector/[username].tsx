/**
 * Collector Profile screen — public profile view.
 * Accessible from Find Collectors, Collectors Nearby, or any deep-link to /collector/:username.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
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
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { SkeletonHeader, SkeletonRows } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { toUserError, type UserError } from '@/utils/userError';
import { radius, spacing } from '@/constants/theme';
import type { PotentialTradePin, PublicProfile } from '@workspace/pin-repository';
import { PinImage } from '@/components/ui/PinImage';

// ─── Potential trade row ──────────────────────────────────────────────────────

/** Pin thumbnail size in the trade-match rows (B-P1-20, #46). */
const TRADE_THUMB = 56;

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
        <PinImage
          source={{ uri: pin.imageUrl }}
          style={[styles.tradePinThumb, { backgroundColor: colors.homeSurface }]}
          contentFit="contain"
          accessible={false}
          testID="trade-pin-thumb"
        />
      ) : (
        <View testID="trade-pin-thumb" style={[styles.tradePinThumb, styles.tradePinIcon, { backgroundColor: tone + '26' }]}>
          <Feather name={isTheyHave ? 'download' : 'upload'} size={20} color={tone} />
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
  const { username, entry } = useLocalSearchParams<{ username: string; entry?: string }>();
  // Arrived from Find Trades' Potential Trades shelf or a Find a Trade "View
  // Match" — PinHunt already told the collector this is a match, so lead
  // with why rather than a generic profile. Any other entry point (search,
  // Collectors Nearby, a deep link) keeps the normal profile-first layout.
  const isMatchEntry = entry === 'match';
  const { getPublicProfile } = useProfile();

  const { repo, userId } = useMarketplace();
  // currentUserId used for the Message button guard (don't show message button to yourself)
  const currentUserId = userId;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Couldn't load (offline, server…) is not the same as "not found" (UX-046).
  const [loadError, setLoadError] = useState<UserError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rating, setRating] = useState<{ positive: number; total: number } | null>(null);

  const [potentialTrades, setPotentialTrades] = useState<PotentialTradePin[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);

  // Load public profile
  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
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
      .catch(e => setLoadError(toUserError(e, 'collector')))
      .finally(() => setLoading(false));
  }, [username, getPublicProfile, repo, reloadKey]);

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

  const theyHaveIWant = potentialTrades.filter(p => p.direction === 'they_have_i_want');
  const iHaveTheyWant = potentialTrades.filter(p => p.direction === 'i_have_they_want');
  const hasPotentialTrades = potentialTrades.length > 0;

  // Start a plain conversation — this must never silently create a formal
  // Trade Request. The Potential Trade Match counts travel along as display
  // context only, so the compose screen can still explain why they matched.
  const startConversation = () => {
    if (!profile) return;
    router.push({
      pathname: '/community/start-conversation' as any,
      params: {
        recipientId: profile.id,
        recipientName: profile.username,
        matchTheyHave: String(theyHaveIWant.length),
        matchIHave: String(iHaveTheyWant.length),
      },
    });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { backgroundColor: colors.homeBackground }]}>
        <ScreenHeader title={profile?.username ? `@${profile.username}` : 'Collector'} />
        {loading ? (
          // Placeholder in the hero's place: compact row for a match entry,
          // the full centred hero otherwise (UX-045).
          isMatchEntry ? (
            <SkeletonHeader
              label="Loading collector"
              layout="inline"
              avatarSize={44}
              style={[styles.compactHero, { borderBottomColor: colors.homeLine }]}
            />
          ) : (
            <SkeletonHeader
              label="Loading collector"
              style={[styles.hero, { backgroundColor: colors.homeSurface, borderBottomColor: colors.homeLine }]}
            />
          )
        ) : loadError ? (
          <View style={styles.centred}>
            <ErrorState error={loadError} onRetry={() => setReloadKey(k => k + 1)} />
          </View>
        ) : notFound || !profile ? (
          <View style={styles.centred}>
            <Feather name="user-x" size={40} color={colors.homeMuted} />
            <Text style={[styles.notFoundTitle, { color: colors.homeInk }]}>Profile Not Found</Text>
            <Text style={[styles.notFoundText, { color: colors.homeMuted }]}>
              This profile is private or doesn't exist.
            </Text>
          </View>
        ) : (() => {
          // Computed once here (rather than inline below) so both the
          // match-first and normal orderings below can reuse the exact same
          // markup instead of duplicating it.
          const badgeRow = (profile.internationalTradingEnabled || profile.openToLocalTrades || profile.openToPostalTrades || profile.happyToTravel) ? (
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
          ) : null;

          const ratingRow = rating !== null ? (
            rating.total > 0 ? (() => {
              const pct = Math.round((rating.positive / rating.total) * 100);
              const color = pct >= 80 ? colors.owned : pct >= 50 ? colors.homeSandInk : colors.destructive;
              return (
                <View style={[styles.ratingBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <Feather name="thumbs-up" size={11} color={color} />
                  <Text style={[styles.ratingBadgeText, { color }]}>
                    {rating.total} trade{rating.total !== 1 ? 's' : ''} · {pct}% positive
                  </Text>
                </View>
              );
            })() : (
              <Chip label="No trade ratings yet" tone="neutral" variant="soft" size="sm" />
            )
          ) : null;

          const bioSection = profile.bio ? (
            <View style={[styles.section, { marginHorizontal: spacing.lg, marginTop: spacing.xl }]}>
              <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>ABOUT</Text>
              <View style={[styles.bioCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                <Text style={[styles.bioText, { color: colors.homeInk }]}>{profile.bio}</Text>
              </View>
            </View>
          ) : null;

          const tradeMatchCard = (
            <View style={[styles.tradeMatchCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
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

              {/* Opens the guide (#144); it used to look like a link and do nothing. */}
              <TouchableOpacity
                onPress={() => router.push('/trading-safely')}
                accessibilityRole="link"
                accessibilityLabel="Trading safely guide"
                hitSlop={{ top: 12, bottom: 12 }}
                style={styles.safetyNote}
              >
                <Feather name="shield" size={12} color={colors.homeCoral} />
                <Text style={[styles.safetyText, { color: colors.homeCoral }]}>Trading safely</Text>
                <Feather name="chevron-right" size={12} color={colors.homeCoral} />
              </TouchableOpacity>

              {/* Opens a normal chat; never silently creates a formal Trade Request. */}
              <Button label="Start Conversation" icon="message-circle" onPress={startConversation} style={styles.convoBtn} />
            </View>
          );

          return (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}
          >
            {isMatchEntry && hasPotentialTrades ? (
              <>
                {/* Compact identity — a small row, not the full profile hero,
                    since PinHunt already told the collector this is a match. */}
                <View style={[styles.compactHero, { borderBottomColor: colors.homeLine }]}>
                  <Avatar uri={profile.avatarUrl} name={profile.username} size={44} />
                  <View style={styles.compactIdentity}>
                    <Text style={[styles.compactName, { color: colors.homeInk }]}>@{profile.username}</Text>
                    {(profile.town || profile.county || profile.tradingRegion) ? (
                      <View style={styles.metaRow}>
                        <Feather name="map-pin" size={12} color={colors.homeMuted} />
                        <Text style={[styles.compactMeta, { color: colors.homeMuted }]}>
                          {[profile.town, profile.county].filter(Boolean).join(', ') || profile.tradingRegion}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
                  <Text style={[styles.matchHeadline, { color: colors.homeInk }]}>
                    You could trade with {profile.displayName || `@${profile.username}`}
                  </Text>
                </View>

                <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
                  {tradeMatchCard}
                </View>

                {bioSection}

                {/* Secondary — badges/rating, now that the match itself has
                    already been shown first. */}
                {(badgeRow || ratingRow) && (
                  <View style={[styles.section, { marginHorizontal: spacing.lg, marginTop: spacing.xl }]}>
                    <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>ABOUT {profile.username}</Text>
                    <View style={styles.secondaryStack}>
                      {badgeRow}
                      {ratingRow}
                    </View>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Avatar + identity — normal profile-first presentation */}
                <View style={[styles.hero, { backgroundColor: colors.homeSurface, borderBottomColor: colors.homeLine }]}>
                  <Avatar uri={profile.avatarUrl} name={profile.username} size={88} style={styles.avatar} />
                  <Text style={[styles.displayName, { color: colors.homeInk }]}>
                    @{profile.username}
                  </Text>

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

                  {badgeRow}
                  {ratingRow}

                  {/* Message button — hidden when Potential Trade Match below already
                      surfaces Start Conversation as the primary way to reach out. */}
                  {currentUserId && profile.id !== currentUserId && !hasPotentialTrades && (
                    <Button label="Message" icon="mail" size="compact" fullWidth={false} onPress={startConversation} style={styles.messageBtn} />
                  )}
                </View>

                {bioSection}

                {(hasPotentialTrades || tradesLoading) && (
                  <View style={[styles.section, { marginHorizontal: spacing.lg, marginTop: spacing.xl }]}>
                    <Text style={[styles.sectionLabel, { color: colors.homeMuted }]}>POTENTIAL TRADE MATCH</Text>
                    {tradesLoading ? (
                      <View style={[styles.tradeMatchCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                        <SkeletonRows label="Loading trade matches" count={3} thumb={TRADE_THUMB} style={styles.tradeGroup} />
                      </View>
                    ) : tradeMatchCard}
                  </View>
                )}
              </>
            )}
          </ScrollView>
          );
        })()}
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
  // Match-first entry — compact identity row instead of the full hero
  compactHero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingTop: spacing.xxl, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactIdentity: { flex: 1, gap: 2 },
  compactName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  compactMeta: { fontSize: 12.5, fontFamily: 'Inter_400Regular' },
  matchHeadline: { fontSize: 19, fontFamily: 'Inter_700Bold', lineHeight: 24 },
  secondaryStack: { gap: spacing.sm, alignItems: 'center' },
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

  messageBtn: { marginTop: spacing.xs },

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
  tradePinIcon: { alignItems: 'center', justifyContent: 'center' },
  // B-P1-20 (#46): big enough to recognise the pin (was 22 pt).
  tradePinThumb: { width: TRADE_THUMB, height: TRADE_THUMB, borderRadius: radius.sm },
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
  safetyText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  convoBtn: { margin: spacing.lg - 2, marginTop: spacing.xs },
});
