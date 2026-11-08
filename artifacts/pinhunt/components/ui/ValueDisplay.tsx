import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CommunityPrice, PriceCurrency } from '@workspace/pin-repository';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';
import { MarketValueSection, ukEstimateOf, usePinMarketValue } from '@/components/MarketValueSection';
import { useCommunityPrice } from '@/hooks/useCommunityPrice';
import { usePriceCurrency } from '@/hooks/usePriceCurrency';
import {
  agreementLine,
  EVIDENCE_BARS,
  EVIDENCE_LABEL,
  formatEntries,
  formatPrice,
  formatPriceRange,
  type EvidenceStep,
} from '@/utils/priceFormat';

interface ValueDisplayProps {
  pinId: string;
  /** PinHunt's own catalogue estimate (GBP), if the trusted catalogue has one. */
  catalogueEstimateGBP?: number | null;
  /** The collector's own value for this pin, if they've set one. Not yet wired up anywhere in the app — reserved for when that data exists. */
  collectorValue?: { amountGBP: number } | null;
  /** The pin is in the collector's collection or For Trade, so they may price it (#511). */
  canPrice?: boolean;
  /** Opens "Your price" (CV-03). The "Add your price" action shows only with this and canPrice. */
  onAddPrice?: () => void;
  /** Shown under the tiles as "Your price · Edit" (CV-03). */
  yourPrice?: React.ReactNode;
}

/**
 * The pin's value card. With community prices available (migration 065,
 * #511) it shows the market price and the community price side by side, the
 * same size whatever the evidence behind them; otherwise it keeps the
 * earlier single-estimate layout.
 */
export function ValueDisplay(props: ValueDisplayProps) {
  const [currency] = usePriceCurrency();
  const community = useCommunityPrice(props.pinId, currency);
  if (community.status !== 'ready') return <LegacyValueDisplay {...props} />;
  return <TwoPriceCard {...props} currency={currency} community={community.price} />;
}

// ─── Two prices (#511) ────────────────────────────────────────────────────────

function TwoPriceCard({
  pinId, catalogueEstimateGBP, canPrice, onAddPrice, yourPrice, currency, community,
}: ValueDisplayProps & { currency: PriceCurrency; community: CommunityPrice | null }) {
  const colors = useColors();
  const [, setCurrency] = usePriceCurrency();
  const market = usePinMarketValue(pinId);
  // Today's market figure is eBay UK asking prices (B-P1-19); US has none yet.
  const uk = currency === 'GBP' ? ukEstimateOf(market) : null;
  const marketStep: EvidenceStep | null = uk ? (uk.confidence === 'high' ? 'confident' : 'growing') : null;
  const marketMid = uk ? (uk.estimatedMid ?? (uk.estimatedLow + uk.estimatedHigh) / 2) : null;

  const agreement = uk && marketStep === 'confident' && community?.step === 'confident' && marketMid != null
    ? agreementLine(marketMid, community.median, currency)
    : null;
  const showAdd = Boolean(canPrice && onAddPrice);

  return (
    <View
      testID="two-price-card"
      style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
    >
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: colors.homeMuted }]}>VALUE</Text>
        <View accessibilityRole="radiogroup" style={[styles.switch, { backgroundColor: colors.homeAqua }]}>
          {(['GBP', 'USD'] as const).map(c => {
            const on = c === currency;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => setCurrency(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c === 'GBP' ? 'UK prices, pounds' : 'US prices, dollars'}
                hitSlop={6}
                style={[styles.switchOption, on && { backgroundColor: colors.homeSurface }]}
              >
                <Text style={[styles.switchLabel, { color: on ? colors.homeInk : colors.homeMuted }]}>
                  {c === 'GBP' ? 'UK £' : 'US $'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.pair}>
        {uk && marketStep ? (
          <PriceTile
            kind="market"
            label="Market price"
            amount={formatPrice(Math.round(marketMid!), uk.currency)}
            detail={formatPriceRange(uk.estimatedLow, uk.estimatedHigh, uk.currency)}
            step={marketStep}
            basis={`${uk.comparableCount} eBay UK ${uk.comparableCount === 1 ? 'listing' : 'listings'}, asking prices`}
          />
        ) : (
          <EmptyTile
            kind="market"
            title="No market price yet"
            body={currency === 'GBP'
              ? 'We show one once enough of this pin is listed on eBay UK.'
              : 'US market prices are coming.'}
          />
        )}
        {community ? (
          <PriceTile
            kind="community"
            label="Community price"
            amount={formatPrice(community.median, currency)}
            // One collector: the price is the entry, so it isn't repeated.
            detail={community.entries
              ? (community.entries.length > 1 ? formatEntries(community.entries, currency) : undefined)
              : formatPriceRange(community.low, community.high, currency)}
            step={community.step}
            basis={community.step === 'confident'
              ? `${community.collectorCount} collectors`
              : `priced by ${community.collectorCount} ${community.collectorCount === 1 ? 'collector' : 'collectors'}`}
          />
        ) : (
          <EmptyTile
            kind="community"
            title="No collector prices yet"
            body={canPrice ? 'Be the first to price this pin.' : 'Collectors who own it can price it.'}
          />
        )}
      </View>

      {agreement && (
        <Text style={[styles.agree, { color: colors.homeInk, backgroundColor: colors.homeAqua }]}>{agreement}</Text>
      )}
      {!uk && !community && (
        <Text style={[styles.note, { color: colors.homeMuted }]}>
          {canPrice ? 'This pin hasn’t been priced yet. Your price starts its community price.' : 'This pin hasn’t been priced yet.'}
        </Text>
      )}
      {currency === 'GBP' && catalogueEstimateGBP != null && (
        <Text style={[styles.note, { color: colors.homeMuted }]}>
          PinHunt catalogue estimate: {formatPrice(catalogueEstimateGBP, 'GBP')}
        </Text>
      )}

      {showAdd && (
        <TouchableOpacity
          onPress={onAddPrice}
          activeOpacity={0.85}
          accessibilityRole="button"
          style={[styles.cta, community
            ? { borderColor: colors.homeLine, borderWidth: 1 }
            : { backgroundColor: colors.homeCoral }]}
        >
          <Text style={[styles.ctaLabel, { color: community ? colors.homeCoralDeep : colors.homeSurface }]}>
            {community ? 'Own this pin? Add your price' : 'Add your price'}
          </Text>
        </TouchableOpacity>
      )}
      {yourPrice}

      {/* The asking-price explanation and listings, without repeating the price. */}
      {uk && <MarketValueSection pinId={pinId} embedded data={market} showHeadline={false} />}
    </View>
  );
}

function Meter({ step, kind }: { step: EvidenceStep; kind: 'market' | 'community' }) {
  const colors = useColors();
  const filled = EVIDENCE_BARS[step];
  const on = kind === 'market' ? colors.homeCoral : colors.homeSand;
  return (
    <View style={styles.meter} accessible={false}>
      {[1, 2, 3].map(i => (
        <View key={i} style={[styles.bar, { backgroundColor: i <= filled ? on : colors.homeLine }]} />
      ))}
    </View>
  );
}

function PriceTile({ kind, label, amount, detail, step, basis }: {
  kind: 'market' | 'community'; label: string; amount: string; detail?: string; step: EvidenceStep; basis: string;
}) {
  const colors = useColors();
  const tint = kind === 'market' ? colors.homeAqua : colors.homeWarmSurface;
  const ink = kind === 'market' ? colors.homeCoralDeep : colors.homeSandInk;
  const level = EVIDENCE_LABEL[step];
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${amount}.${detail ? ` ${detail}.` : ''} ${level}, ${basis}.`}
      testID={`${kind}-price-tile`}
      style={[styles.tile, { backgroundColor: tint }]}
    >
      <Text style={[styles.tileLabel, { color: colors.homeInk }]}>{label}</Text>
      {/* Same size at every step: only the label and evidence line change (#511). */}
      <Text style={[styles.amount, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>{amount}</Text>
      {detail ? <Text style={[styles.detail, { color: colors.homeMuted }]}>{detail}</Text> : null}
      <View style={styles.basis}>
        <Meter step={step} kind={kind} />
        <Text style={[styles.basisText, { color: colors.homeInk }]}>
          <Text style={styles.level}>{level}</Text> · {basis}
        </Text>
      </View>
    </View>
  );
}

function EmptyTile({ kind, title, body }: { kind: 'market' | 'community'; title: string; body: string }) {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      testID={`${kind}-price-empty`}
      style={[styles.tile, styles.emptyTile, { borderColor: kind === 'market' ? colors.homeLine : colors.homeWarmLine }]}
    >
      <Text style={[styles.emptyTitle, { color: colors.homeInk }]}>{title}</Text>
      <Text style={[styles.detail, { color: colors.homeMuted }]}>{body}</Text>
    </View>
  );
}

// ─── Earlier single-estimate layout (community prices not available) ─────────

/** One cohesive value card: PinHunt's own estimate headlines it, with a typical UK eBay asking-price range underneath when one is reliable — replaces the old "Market Valuation" + "Estimated Market Value" pair of competing cards. */
function LegacyValueDisplay({ pinId, catalogueEstimateGBP, collectorValue }: ValueDisplayProps) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}>
      <View style={styles.headline}>
        <Text style={[styles.kicker, { color: colors.homeMuted }]}>PINHUNT ESTIMATED VALUE</Text>
        {catalogueEstimateGBP != null ? (
          <Text style={[styles.legacyAmount, { color: colors.homeCoralDeep }]}>£{catalogueEstimateGBP.toFixed(2)}</Text>
        ) : (
          <Text style={[styles.amountEmpty, { color: colors.homeMuted }]}>No value yet</Text>
        )}
      </View>

      {collectorValue != null && (
        <View style={[styles.collectorRow, { backgroundColor: colors.homeAqua }]}>
          <Feather name="user" size={12} color={colors.homeInk} />
          <Text style={[styles.collectorText, { color: colors.homeInk }]}>
            Set by you: £{collectorValue.amountGBP.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Draws its own divider, and nothing at all without a confident UK price (B-P1-19). */}
      <MarketValueSection pinId={pinId} embedded />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headline: { alignItems: 'center', gap: 4 },
  kicker: { fontSize: 10.5, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  switch: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  switchOption: { minHeight: 32, minWidth: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  switchLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  pair: { flexDirection: 'row', gap: spacing.sm + 2 },
  tile: { flex: 1, minWidth: 0, borderRadius: radius.lg, padding: spacing.md, gap: 3 },
  emptyTile: { borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center' },
  tileLabel: { fontSize: 11.5, fontFamily: 'Inter_700Bold' },
  amount: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  detail: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  basis: { gap: 4, marginTop: 4 },
  basisText: { fontSize: 11.5, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  level: { fontFamily: 'Inter_600SemiBold' },
  meter: { flexDirection: 'row', gap: 3 },
  bar: { width: 14, height: 6, borderRadius: 3 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  agree: {
    alignSelf: 'center', textAlign: 'center', fontSize: 12.5, fontFamily: 'Inter_500Medium',
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, overflow: 'hidden',
  },
  note: { fontSize: 12.5, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  cta: { minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  ctaLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  legacyAmount: { fontSize: 34, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  amountEmpty: { fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 6 },
  collectorRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  collectorText: { fontSize: 11.5, fontFamily: 'Inter_600SemiBold' },
});
