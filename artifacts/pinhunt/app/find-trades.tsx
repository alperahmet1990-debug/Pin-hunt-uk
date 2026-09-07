/**
 * Find Trades — "what could I trade for today?" A personalised discovery
 * screen, not a trader directory. Four sections, in priority order:
 * On Your ISO (direct, explicit signal) → Complete Your Sets → Potential
 * Trades (rare two-way matches) → Based on Your Collection (open-ended
 * discovery inferred from Boards/Owned pins). See utils/findTradesEngine.ts
 * and hooks/useFindTrades.ts for the calculations behind each section.
 */
import React from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ScreenContainer, SetProgressBar } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { radius, spacing } from '@/constants/theme';
import { PLACEHOLDER_IMAGE } from '@/utils/pinImage';
import { formatMatchSummary } from '@/utils/tradeMatch';
import { useFindTrades, type PotentialTradeCard, type SetOpportunity } from '@/hooks/useFindTrades';
import type { PinOpportunity, DiscoveryItem } from '@/utils/findTradesEngine';

function pinImageSource(imageUrl?: string) {
  return imageUrl ? { uri: imageUrl } : PLACEHOLDER_IMAGE;
}

export default function FindTradesScreen() {
  const colors = useColors();
  const router = useRouter();
  const {
    isoOpportunities,
    reciprocalTraderIds,
    potentialTrades,
    setOpportunities,
    discoveryItems,
    loading,
    error,
    refresh,
  } = useFindTrades();

  const goToTraders = (pinId: string) => router.push({ pathname: '/traders/[pinId]', params: { pinId } });
  const goToCollector = (username: string) => router.push({ pathname: '/collector/[username]', params: { username } });
  const goToSet = (collectionName: string) => router.push({ pathname: '/set/[collection]', params: { collection: collectionName } });

  const nothingAtAll =
    !loading && !error && isoOpportunities.length === 0 && potentialTrades.length === 0 &&
    setOpportunities.length === 0 && discoveryItems.length === 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Find Trades' }} />
      <ScreenContainer edges={{ top: false, bottom: false }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.homeCoral} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
              <TouchableOpacity onPress={refresh} style={{ padding: spacing.sm }}>
                <Text style={{ color: colors.homeCoral, fontFamily: 'Inter_500Medium' }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : nothingAtAll ? (
            <View style={styles.center}>
              <Feather name="compass" size={36} color={colors.homeMuted} />
              <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>Nothing to trade for yet</Text>
              <Text style={[styles.emptySub, { color: colors.homeMuted }]}>
                Add pins to your ISO and build up your Boards, and we'll start surfacing trades here.
              </Text>
            </View>
          ) : (
            <>
              {isoOpportunities.length > 0 && (
                <Section title="On your ISO" subtitle={`${isoOpportunities.length} pin${isoOpportunities.length === 1 ? '' : 's'} you're looking for ${isoOpportunities.length === 1 ? 'is' : 'are'} available`}>
                  <HScroll>
                    {isoOpportunities.map(op => (
                      <IsoCard
                        key={op.pinId}
                        opportunity={op}
                        hasMatch={op.collectors.some(c => reciprocalTraderIds.has(c.id))}
                        colors={colors}
                        onPress={() => goToTraders(op.pinId)}
                      />
                    ))}
                  </HScroll>
                </Section>
              )}

              {setOpportunities.length > 0 && (
                <Section title="Complete your sets">
                  <HScroll>
                    {setOpportunities.map(set => (
                      <SetCard key={set.setName} set={set} colors={colors} onPress={() => goToSet(set.setName)} />
                    ))}
                  </HScroll>
                </Section>
              )}

              {potentialTrades.length > 0 && (
                <Section title="Potential trades">
                  <HScroll>
                    {potentialTrades.map(card => (
                      <PotentialTradeHero
                        key={card.traderId}
                        card={card}
                        colors={colors}
                        onPress={() => card.profile && goToCollector(card.profile.username)}
                      />
                    ))}
                  </HScroll>
                </Section>
              )}

              {discoveryItems.length > 0 && (
                <Section title="Based on your collection">
                  <View style={styles.grid}>
                    {discoveryItems.map(item => (
                      <DiscoveryTile key={item.pinId} item={item} colors={colors} onPress={() => goToTraders(item.pinId)} />
                    ))}
                  </View>
                </Section>
              )}
            </>
          )}
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.sectionTitle, { color: colors.homeInk }]}>{title}</Text>
      {subtitle && <Text style={[styles.sectionSubtitle, { color: colors.homeMuted }]}>{subtitle}</Text>}
      {children}
    </View>
  );
}

function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
      {children}
    </ScrollView>
  );
}

// ─── On Your ISO ────────────────────────────────────────────────────────────

function IsoCard({ opportunity, hasMatch, colors, onPress }: {
  opportunity: PinOpportunity;
  hasMatch: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.isoCard,
        { backgroundColor: colors.homeSurface, borderColor: hasMatch ? colors.homeCoral : colors.homeLine, borderWidth: hasMatch ? 1.5 : 1 },
      ]}
    >
      <View style={{ position: 'relative' }}>
        <Image source={pinImageSource(opportunity.imageUrl)} style={styles.isoImage} resizeMode="contain" />
        {hasMatch && (
          <View style={[styles.matchBadge, { backgroundColor: colors.homeCoral }]}>
            <Feather name="repeat" size={9} color={colors.homeSurface} />
            <Text style={styles.matchBadgeText}>MATCH</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={[styles.isoTitle, { color: colors.homeInk }]}>{opportunity.title}</Text>
      <Text style={[styles.isoMeta, { color: colors.homeMuted }]}>
        For trade · {opportunity.collectors.length} collector{opportunity.collectors.length === 1 ? '' : 's'}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Complete Your Sets ─────────────────────────────────────────────────────

function SetCard({ set, colors, onPress }: { set: SetOpportunity; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  const pct = set.totalCount > 0 ? set.ownedCount / set.totalCount : 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.setCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      {set.available.length > 0 && (
        <View style={[styles.setBadge, { backgroundColor: colors.homeSand + '1c' }]}>
          <Text style={[styles.setBadgeText, { color: colors.homeSand }]}>
            {set.available.length} available
          </Text>
        </View>
      )}
      <Text numberOfLines={2} style={[styles.setTitle, { color: colors.homeInk }]}>{set.setName}</Text>
      <Text style={[styles.setSub, { color: colors.homeMuted }]}>{set.ownedCount} / {set.totalCount} collected</Text>
      <SetProgressBar progress={pct} trackColor={colors.homeLine} fillColor={colors.homeSand} />
    </TouchableOpacity>
  );
}

// ─── Potential Trades ───────────────────────────────────────────────────────

function PotentialTradeHero({ card, colors, onPress }: {
  card: PotentialTradeCard;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const summary = formatMatchSummary(card.theyHaveCount, card.iHaveCount);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.ptCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeCoral }]}
    >
      <View style={[styles.ptLabel, { backgroundColor: colors.homeCoral }]}>
        <Feather name="repeat" size={10} color={colors.homeSurface} />
        <Text style={styles.ptLabelText}>TWO-WAY MATCH</Text>
      </View>
      <View style={styles.ptRow}>
        <Avatar uri={card.profile?.avatarUrl} name={card.profile?.username ?? '?'} size={30} seaGlass />
        <View style={{ flex: 1 }}>
          <Text style={[styles.ptName, { color: colors.homeInk }]} numberOfLines={1}>
            {card.profile?.displayName || card.profile?.username || 'Collector'}
          </Text>
          {card.profile?.town ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="map-pin" size={10} color={colors.homeMuted} />
              <Text style={[styles.ptMeta, { color: colors.homeMuted }]}>{card.profile.town}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.ptThumbRow}>
        <View style={styles.ptStack}>
          {card.samplePins.map((p, i) => (
            <Image
              key={i}
              source={pinImageSource(p.imageUrl)}
              style={[styles.ptThumb, { backgroundColor: colors.homeAqua, marginLeft: i > 0 ? -14 : 0, borderColor: colors.homeSurface }]}
              resizeMode="contain"
            />
          ))}
        </View>
        {summary && <Text style={[styles.ptSummary, { color: colors.homeMuted }]}>{summary}</Text>}
      </View>
      <View style={[styles.ptCta, { backgroundColor: colors.homeCoral }]}>
        <Text style={[styles.ptCtaText, { color: colors.homeSurface }]}>View match</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Based on Your Collection ───────────────────────────────────────────────

function DiscoveryTile({ item, colors, onPress }: { item: DiscoveryItem; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.gcard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <Image source={pinImageSource(item.imageUrl)} style={styles.gImage} resizeMode="contain" />
      <View style={{ padding: spacing.sm }}>
        <Text numberOfLines={2} style={[styles.gTitle, { color: colors.homeInk }]}>{item.title}</Text>
        <Text style={[styles.gMeta, { color: colors.homeMuted }]}>
          For trade · {item.collectorCount} collector{item.collectorCount === 1 ? '' : 's'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  sectionSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: spacing.sm },
  hscroll: { gap: spacing.sm, paddingBottom: spacing.xs, paddingRight: spacing.lg },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  // ISO
  isoCard: { width: 118, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1 },
  isoImage: { width: '100%', height: 84, borderRadius: radius.sm - 2 },
  matchBadge: { position: 'absolute', top: 5, right: 5, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  matchBadgeText: { fontSize: 8.5, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.3 },
  isoTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', lineHeight: 15, marginTop: 6 },
  isoMeta: { fontSize: 10.5, fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Sets
  setCard: { width: 172, borderRadius: radius.md, padding: spacing.sm + 2, borderWidth: 1 },
  setBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginBottom: 6 },
  setBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  setTitle: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold', lineHeight: 16 },
  setSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1, marginBottom: 6 },

  // Potential trades
  ptCard: { width: 236, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1.5 },
  ptLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: spacing.sm },
  ptLabelText: { fontSize: 9.5, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.3 },
  ptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  ptName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  ptMeta: { fontSize: 10.5, fontFamily: 'Inter_400Regular' },
  ptThumbRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  ptStack: { flexDirection: 'row' },
  ptThumb: { width: 46, height: 46, borderRadius: 11, borderWidth: 2 },
  ptSummary: { fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 15 },
  ptCta: { paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  ptCtaText: { fontSize: 12.5, fontFamily: 'Inter_700Bold' },

  // Discovery grid
  gcard: { width: '48%', borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  gImage: { width: '100%', height: 100, backgroundColor: 'transparent' },
  gTitle: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold', lineHeight: 16 },
  gMeta: { fontSize: 10.5, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
