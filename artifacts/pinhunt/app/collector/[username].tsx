/**
 * Collector Profile screen — public profile view.
 * Accessible from Find Collectors, Collectors Nearby, or any deep-link to /collector/:username.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
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
import type { PotentialTradePin, PublicProfile } from '@workspace/pin-repository';

function initials(p: PublicProfile): string {
  const name = p.username;
  return name
    .split(' ')
    .map(n => n[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

// ─── Potential trade card ─────────────────────────────────────────────────────

function PotentialTradeCard({
  pin,
}: {
  pin: PotentialTradePin;
}) {
  const colors = useColors();
  const isTheyHave = pin.direction === 'they_have_i_want';
  return (
    <View
      style={[
        styles.tradePin,
        {
          backgroundColor: isTheyHave ? colors.wanted + '14' : colors.forTrade + '14',
          borderColor: isTheyHave ? colors.wanted + '40' : colors.forTrade + '40',
          borderRadius: 10,
        },
      ]}
    >
      <Feather
        name={isTheyHave ? 'download' : 'upload'}
        size={12}
        color={isTheyHave ? colors.wanted : colors.forTrade}
      />
      <Text style={[styles.tradePinTitle, { color: colors.foreground }]} numberOfLines={2}>
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
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {loading ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : notFound || !profile ? (
          <View style={styles.centred}>
            <Feather name="user-x" size={40} color={colors.mutedForeground} />
            <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Profile Not Found</Text>
            <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
              This profile is private or doesn't exist.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          >
            {/* Avatar + identity */}
            <View style={[styles.hero, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarText}>{initials(profile)}</Text>
              </View>
              <Text style={[styles.displayName, { color: colors.foreground }]}>
                @{profile.username}
              </Text>

              {/* Location */}
              {(profile.town || profile.county) ? (
                <View style={styles.metaRow}>
                  <Feather name="map-pin" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {[profile.town, profile.county].filter(Boolean).join(', ')}
                  </Text>
                </View>
              ) : profile.tradingRegion ? (
                <View style={styles.metaRow}>
                  <Feather name="map-pin" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{profile.tradingRegion}</Text>
                </View>
              ) : null}

              {/* Trade preference badges */}
              <View style={styles.badgeRow}>
                {profile.internationalTradingEnabled && (
                  <View style={[styles.badge, { backgroundColor: colors.primary + '22' }]}>
                    <Feather name="globe" size={12} color={colors.primary} />
                    <Text style={[styles.badgeText, { color: colors.primary }]}>Open to international trades</Text>
                  </View>
                )}
                {profile.openToLocalTrades && (
                  <View style={[styles.badge, { backgroundColor: colors.primary + '14' }]}>
                    <Feather name="map-pin" size={12} color={colors.primary} />
                    <Text style={[styles.badgeText, { color: colors.primary }]}>Local trades</Text>
                  </View>
                )}
                {profile.openToPostalTrades && (
                  <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                    <Feather name="package" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Postal trades</Text>
                  </View>
                )}
                {profile.happyToTravel && (
                  <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                    <Feather name="navigation" size={12} color={colors.mutedForeground} />
                    <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Happy to travel</Text>
                  </View>
                )}
              </View>

              {/* Trade rating badge */}
              {rating !== null && rating.total > 0 && (() => {
                const pct = Math.round((rating.positive / rating.total) * 100);
                const color = pct >= 80 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#EF4444';
                return (
                  <View style={[styles.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                    <Text style={{ fontSize: 12 }}>👍</Text>
                    <Text style={[styles.badgeText, { color }]}>
                      {rating.positive}/{rating.total} trades rated positive ({pct}%)
                    </Text>
                  </View>
                );
              })()}
              {rating !== null && rating.total === 0 && (
                <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>No trade ratings yet</Text>
                </View>
              )}
            </View>

            {/* Bio */}
            {profile.bio ? (
              <View style={[styles.section, { marginHorizontal: 16, marginTop: 20 }]}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ABOUT</Text>
                <View style={[styles.bioCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.bioText, { color: colors.foreground }]}>{profile.bio}</Text>
                </View>
              </View>
            ) : null}

            {/* ── Potential trades ── */}
            {(hasPotentialTrades || tradesLoading) && (
              <View style={[styles.section, { marginHorizontal: 16, marginTop: 20 }]}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>POTENTIAL TRADE MATCH</Text>

                {tradesLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
                ) : (
                  <View
                    style={[
                      styles.tradeMatchCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    {theyHaveIWant.length > 0 && (
                      <View style={styles.tradeGroup}>
                        <Text style={[styles.tradeGroupLabel, { color: colors.wanted }]}>
                          They have — you want ({theyHaveIWant.length})
                        </Text>
                        <View style={styles.tradePins}>
                          {theyHaveIWant.slice(0, 5).map(p => (
                            <PotentialTradeCard key={p.pinId} pin={p} />
                          ))}
                          {theyHaveIWant.length > 5 && (
                            <Text style={[styles.moreLabel, { color: colors.mutedForeground }]}>
                              +{theyHaveIWant.length - 5} more
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                    {theyHaveIWant.length > 0 && iHaveTheyWant.length > 0 && (
                      <View style={[styles.tradeDivider, { backgroundColor: colors.border }]} />
                    )}
                    {iHaveTheyWant.length > 0 && (
                      <View style={styles.tradeGroup}>
                        <Text style={[styles.tradeGroupLabel, { color: colors.forTrade }]}>
                          You have — they want ({iHaveTheyWant.length})
                        </Text>
                        <View style={styles.tradePins}>
                          {iHaveTheyWant.slice(0, 5).map(p => (
                            <PotentialTradeCard key={p.pinId} pin={p} />
                          ))}
                          {iHaveTheyWant.length > 5 && (
                            <Text style={[styles.moreLabel, { color: colors.mutedForeground }]}>
                              +{iHaveTheyWant.length - 5} more
                            </Text>
                          )}
                        </View>
                      </View>
                    )}

                    {/* Safety note */}
                    <View style={[styles.safetyNote, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                      <Feather name="shield" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.safetyText, { color: colors.mutedForeground }]}>
                        Always meet in a public place or use tracked postage. Never send cash — use PayPal Goods &amp; Services for financial protection.
                      </Text>
                    </View>

                    {/* Start conversation button */}
                    <TouchableOpacity
                      onPress={handleStartConversation}
                      activeOpacity={0.85}
                      disabled={startingTrade}
                      style={[styles.convoBtn, { backgroundColor: colors.primary }]}
                    >
                      {startingTrade ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Feather name="message-circle" size={16} color="#fff" />
                          <Text style={styles.convoBtnText}>Start Conversation</Text>
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
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  notFoundText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 32 },
  hero: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#fff' },
  displayName: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  bioCard: { borderWidth: 1, borderRadius: 14, padding: 16 },
  bioText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 },

  // Potential trades
  tradeMatchCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  tradeGroup: { padding: 14, gap: 8 },
  tradeGroupLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  tradePins: { gap: 6 },
  tradePin: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderWidth: 1,
    padding: 9,
  },
  tradePinTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  moreLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingLeft: 4 },
  tradeDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  safetyNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    margin: 14,
    padding: 10,
  },
  safetyText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  convoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 14,
    marginTop: 4,
    paddingVertical: 13,
    borderRadius: 10,
  },
  convoBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
