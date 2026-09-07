/**
 * Find Trades — "what could I trade for today?" A personalised discovery
 * feed, not a trader directory. Four sections, in priority order:
 * On Your ISO (direct, explicit signal) → Potential Trades (rare two-way
 * matches — PinHunt's most differentiated result) → Complete Your Sets →
 * Based on Your Collection (open-ended discovery inferred from
 * Boards/Owned pins). See utils/findTradesEngine.ts and
 * hooks/useFindTrades.ts for the calculations behind each section — this
 * file is presentation only.
 *
 * Native layout note: each horizontal shelf below is a plain
 * `<ScrollView horizontal>` with NO explicit height/flexGrow override —
 * matching the proven working pattern already in this codebase (Pin
 * Detail's "MORE FROM THIS SET" shelf, app/pin/[id].tsx). That shelf's
 * children (CompactPinTile) are fully deterministic: fixed
 * width/height, no `flex`, no negative margins. An earlier version of
 * this screen fought native-only layout ambiguity by guessing explicit
 * ScrollView heights instead — that didn't hold up on a real device.
 * The actual cause was `flex: 1` (twice) and a negative-margin
 * thumbnail overlap inside the Potential Trades card, the one card that
 * didn't follow the deterministic-sizing pattern every other shelf
 * already used. Every card here now sizes purely from its own fixed
 * dimensions and text content, same as the proven reference.
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
import { ScreenContainer } from '@/components/ui';
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
  // Potential Trades only ever surfaces genuine two-way matches, so every tap
  // here already knows why — go straight to the match-first collector view.
  const goToMatch = (username: string) => router.push({ pathname: '/collector/[username]', params: { username, entry: 'match' } });
  const goToSet = (collectionName: string) => router.push({ pathname: '/set/[collection]', params: { collection: collectionName } });
  // Discovery is "this looks interesting", not "I want this" — land on Pin
  // Detail first so the collector can inspect before committing to ISO or a trade.
  const goToPin = (pinId: string) => router.push({ pathname: '/pin/[id]', params: { id: pinId } });

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
                <View style={styles.section}>
                  <SectionHeader icon="search" tint={colors.wanted} title="In your ISO" colors={colors} />
                  <Text style={[styles.sectionSubtitle, { color: colors.homeMuted }]}>
                    {isoOpportunities.length} pin{isoOpportunities.length === 1 ? '' : 's'} you're looking for {isoOpportunities.length === 1 ? 'is' : 'are'} available
                  </Text>
                  <Shelf>
                    {isoOpportunities.map(op => (
                      <IsoCard
                        key={op.pinId}
                        opportunity={op}
                        hasMatch={op.collectors.some(c => reciprocalTraderIds.has(c.id))}
                        colors={colors}
                        onPress={() => goToTraders(op.pinId)}
                      />
                    ))}
                  </Shelf>
                </View>
              )}

              {potentialTrades.length > 0 && (
                <View style={styles.section}>
                  <SectionHeader icon="repeat" tint={colors.homeCoral} title="Potential trades" colors={colors} />
                  <Text style={[styles.sectionSubtitle, { color: colors.homeMuted }]}>
                    Collectors who have pins you want — and want yours
                  </Text>
                  <Shelf>
                    {potentialTrades.map(card => (
                      <PotentialTradeHero
                        key={card.traderId}
                        card={card}
                        colors={colors}
                        onPress={() => card.profile && goToMatch(card.profile.username)}
                      />
                    ))}
                  </Shelf>
                </View>
              )}

              {setOpportunities.length > 0 && (
                <View style={styles.section}>
                  <SectionHeader icon="layers" tint={colors.homeSand} title="Complete your sets" colors={colors} />
                  <Shelf>
                    {setOpportunities.map(set => (
                      <SetCard
                        key={set.setName}
                        set={set}
                        colors={colors}
                        onPress={() => goToSet(set.setName)}
                        onPressAvailable={set.available[0] ? () => goToTraders(set.available[0].pinId) : undefined}
                      />
                    ))}
                  </Shelf>
                </View>
              )}

              <View style={styles.section}>
                <SectionHeader icon="compass" tint={colors.homeTealSoft} title="Based on your collection" colors={colors} />
                {discoveryItems.length > 0 ? (
                  <View style={styles.discoveryGrid}>
                    {discoveryItems.map(item => (
                      <DiscoveryTile key={item.pinId} item={item} colors={colors} onPress={() => goToPin(item.pinId)} />
                    ))}
                  </View>
                ) : (
                  <View style={[styles.discoveryEmpty, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
                    <Feather name="grid" size={20} color={colors.homeMuted} />
                    <Text style={[styles.discoveryEmptyText, { color: colors.homeMuted }]}>
                      Build a Board with a few pins of one character and we'll start recommending trades based on it.
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────
// A leading icon in a section-specific accent colour, reused consistently
// (ISO/wanted-orange, Potential Trades/coral, Sets/sand, Discovery/teal) —
// the same colour recurs on that section's badges elsewhere on the page, so
// it doubles as a wayfinding cue while scrolling.

function SectionHeader({ icon, tint, title, colors }: {
  icon: React.ComponentProps<typeof Feather>['name'];
  tint: string;
  title: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.sectionHeadRow}>
      <View style={[styles.sectionIconWrap, { backgroundColor: tint + '1c' }]}>
        <Feather name={icon} size={13} color={tint} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.homeInk }]}>{title}</Text>
    </View>
  );
}

// ─── Shelf ──────────────────────────────────────────────────────────────────
// A partially visible next card is its own affordance — how the App Store,
// Airbnb and Spotify all handle "there's more, swipe" in a horizontal shelf,
// with no extra decoration. A translucent overlay sitting on static content
// reads as a glitch more than a hint, so this is just a plain ScrollView.

function Shelf({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {children}
    </ScrollView>
  );
}

// ─── On Your ISO ────────────────────────────────────────────────────────────
// Deterministic sizing: fixed card width, fixed image height, numberOfLines-
// capped text. No flex, no negative margins — same shape as CompactPinTile.

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
      style={[styles.tileCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={[styles.tileImageWrap, { backgroundColor: colors.homeAqua }]}>
        <Image source={pinImageSource(opportunity.imageUrl)} style={styles.tileImage} resizeMode="contain" />
        {hasMatch && (
          <View style={[styles.matchDot, { backgroundColor: colors.homeCoral }]}>
            <Feather name="repeat" size={9} color={colors.homeSurface} />
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={[styles.tileTitle, { color: colors.homeInk }]}>{opportunity.title}</Text>
      <Text numberOfLines={1} style={[styles.tileMeta, { color: colors.homeMuted }]}>
        For trade · {opportunity.collectors.length} collector{opportunity.collectors.length === 1 ? '' : 's'}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Potential Trades (hero) ────────────────────────────────────────────────
// The one deliberate exception to the shared tile grammar: bigger, richer,
// built around the collector rather than a single pin — this is PinHunt's
// rarest, most differentiated result and should feel like it. The avatar
// sits next to the collector's name (not as an unexplained floating badge),
// two matched pins sit side by side below, and a real "View match" button
// makes the action obvious. Border/radius still match the rest of the page
// so it reads as special content on a calm page, not a different app.

function PotentialTradeHero({ card, colors, onPress }: {
  card: PotentialTradeCard;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const summary = formatMatchSummary(card.theyHaveCount, card.iHaveCount);
  const [firstPin, secondPin] = card.samplePins;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.ptCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={[styles.ptLabel, { backgroundColor: colors.homeCoral }]}>
        <Feather name="repeat" size={9} color={colors.homeSurface} />
        <Text style={styles.ptLabelText}>TWO-WAY MATCH</Text>
      </View>
      <View style={styles.ptPersonRow}>
        <Avatar uri={card.profile?.avatarUrl} name={card.profile?.username ?? '?'} size={30} seaGlass />
        <View style={styles.ptPersonCol}>
          <Text numberOfLines={1} style={[styles.ptName, { color: colors.homeInk }]}>
            {card.profile?.displayName || card.profile?.username || 'Collector'}
          </Text>
          {card.profile?.town ? (
            <Text numberOfLines={1} style={[styles.ptTown, { color: colors.homeMuted }]}>{card.profile.town}</Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.ptImageWrap, { backgroundColor: colors.homeAqua }]}>
        <View style={styles.ptImageHalf}>
          {firstPin && <Image source={pinImageSource(firstPin.imageUrl)} style={styles.ptImage} resizeMode="contain" />}
        </View>
        <View style={styles.ptImageHalf}>
          {secondPin && <Image source={pinImageSource(secondPin.imageUrl)} style={styles.ptImage} resizeMode="contain" />}
        </View>
      </View>
      <Text numberOfLines={2} style={[styles.ptMeta, { color: colors.homeMuted }]}>{summary}</Text>
      <View style={[styles.ptCta, { backgroundColor: colors.homeCoral }]}>
        <Text style={[styles.ptCtaText, { color: colors.homeSurface }]}>View match</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Complete Your Sets ─────────────────────────────────────────────────────
// Same tile grammar too: the image is a pin that's actually missing from
// this set and currently for trade — not just any pin from it — so the
// tile itself explains why the set surfaced. Progress is a thin strip along
// the image's bottom edge rather than a separate row, keeping the tile the
// same height as ISO/Discovery.

function SetCard({ set, colors, onPress, onPressAvailable }: {
  set: SetOpportunity;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  onPressAvailable?: () => void;
}) {
  const pct = set.totalCount > 0 ? set.ownedCount / set.totalCount : 0;
  const representative = set.available[0];
  const image = (
    <>
      <Image source={pinImageSource(representative?.imageUrl)} style={styles.tileImage} resizeMode="contain" />
      <View style={styles.setProgressTrack}>
        <View style={[styles.setProgressFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: colors.homeSand }]} />
      </View>
    </>
  );
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.setCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      {/* Two distinct intents on one card: tapping the available missing pin
          jumps straight to Find a Trade for it; tapping the rest (title/progress
          label) opens Set Detail — same nested-touchable pattern PinCard already
          uses for its quick-add button. */}
      {onPressAvailable ? (
        <TouchableOpacity
          onPress={onPressAvailable}
          activeOpacity={0.85}
          style={[styles.tileImageWrap, { backgroundColor: colors.homeAqua }]}
        >
          {image}
        </TouchableOpacity>
      ) : (
        <View style={[styles.tileImageWrap, { backgroundColor: colors.homeAqua }]}>{image}</View>
      )}
      <Text numberOfLines={2} style={[styles.tileTitle, { color: colors.homeInk }]}>{set.setName}</Text>
      <Text numberOfLines={1} style={[styles.tileMeta, { color: colors.homeMuted }]}>
        {set.ownedCount}/{set.totalCount}
        {set.available.length > 0 ? <Text style={{ color: colors.homeSand, fontFamily: 'Inter_600SemiBold' }}> · {set.available.length} available</Text> : null}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Based on Your Collection ───────────────────────────────────────────────
// Deliberately the exact same tile as On Your ISO (same size, image
// treatment, typography) — this pool can grow much larger than ISO's, so it
// wraps into a grid rather than scrolling as one more shelf.

function DiscoveryTile({ item, colors, onPress }: { item: DiscoveryItem; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.tileCard, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={[styles.tileImageWrap, { backgroundColor: colors.homeAqua }]}>
        <Image source={pinImageSource(item.imageUrl)} style={styles.tileImage} resizeMode="contain" />
      </View>
      <Text numberOfLines={2} style={[styles.tileTitle, { color: colors.homeInk }]}>{item.title}</Text>
      <Text numberOfLines={1} style={[styles.tileMeta, { color: colors.homeMuted }]}>
        For trade · {item.collectorCount} collector{item.collectorCount === 1 ? '' : 's'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  section: { marginBottom: spacing.xl + 2 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2, marginBottom: 2 },
  sectionIconWrap: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15.5, fontFamily: 'Inter_700Bold' },
  sectionSubtitle: { fontSize: 11.5, fontFamily: 'Inter_400Regular', marginBottom: spacing.sm - 2, marginLeft: 32 },
  // Plain contentContainerStyle only — no `style`/height on the ScrollView
  // itself. Matches app/pin/[id].tsx's proven "MORE FROM THIS SET" shelf.
  shelf: { paddingBottom: 2, paddingRight: spacing.lg },

  // ─── Shared tile grammar — used identically by On Your ISO, Complete Your
  // Sets (image portion) and Based on Your Collection: image mat → title →
  // meta. marginRight spaces cards within a horizontal shelf; marginBottom
  // spaces rows when the same tile wraps into Based on Your Collection's grid.
  tileCard: { width: 102, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, marginRight: spacing.sm, marginBottom: spacing.sm },
  tileImageWrap: { width: 86, height: 86, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', padding: 6 },
  tileImage: { width: '100%', height: '100%' },
  matchDot: { position: 'absolute', top: 4, right: 4, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', lineHeight: 13.5, marginTop: 5 },
  tileMeta: { fontSize: 9.5, fontFamily: 'Inter_400Regular', marginTop: 1 },

  // Potential trades — hero: bigger card, collector identity up front,
  // two matched pins side by side, a real CTA. Border/radius still match
  // the rest of the page so it reads as special content, not a different app.
  ptCard: { width: 214, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, marginRight: spacing.sm },
  ptLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6, marginBottom: spacing.sm },
  ptLabelText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.3 },
  ptPersonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2, marginBottom: spacing.sm },
  ptPersonCol: { width: 160 },
  ptName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  ptTown: { fontSize: 10.5, fontFamily: 'Inter_400Regular', marginTop: 1 },
  ptImageWrap: { flexDirection: 'row', gap: 4, width: '100%', height: 92, borderRadius: radius.sm, padding: 6 },
  ptImageHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ptImage: { width: '100%', height: '100%' },
  ptMeta: { fontSize: 10.5, fontFamily: 'Inter_400Regular', marginTop: spacing.sm - 2, marginBottom: spacing.sm - 2, lineHeight: 14 },
  ptCta: { paddingVertical: spacing.sm - 1, borderRadius: radius.sm, alignItems: 'center' },
  ptCtaText: { fontSize: 12.5, fontFamily: 'Inter_700Bold' },

  // Complete your sets — same grammar as the shared tile, card just a touch
  // wider to fit the "X/Y · N available" meta line comfortably.
  setCard: { width: 140, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, marginRight: spacing.sm },
  setProgressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.12)' },
  setProgressFill: { height: '100%' },

  // Based on Your Collection — the shared tile, wrapped into a grid (no
  // shelf) since this pool can grow much larger than a single row.
  discoveryGrid: { flexDirection: 'row', flexWrap: 'wrap' },

  discoveryEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  discoveryEmptyText: { flex: 1, fontSize: 12.5, fontFamily: 'Inter_400Regular', lineHeight: 17 },
});
